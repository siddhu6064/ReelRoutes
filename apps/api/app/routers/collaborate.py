"""W14 — Collaborative Group Trips.

NOTE: The following endpoints already exist in trip_extras.py and are NOT
duplicated here:
  POST /api/trips/:id/invite            -> trip_extras.invite_to_trip
  GET  /api/trips/:id/join?token=xxx    -> trip_extras.join_trip
  GET  /api/trips/:id/collaborators     -> trip_extras.list_collaborators
  DELETE /api/trips/:id/collaborators/:id -> trip_extras.remove_collaborator

This router adds only the genuinely new Phase 4 endpoints:
  GET  /api/invite/:token/accept        -> token-based accept (alt path)
  PATCH /api/trips/:id/collaborators/:id/role -> update a collaborator's role
  GET  /api/trips/:id/can-edit          -> quick permission check for the UI
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.middleware.error_handler import NotFoundError
from app.models.documents import CollaboratorRole, TripCollaborator, TripDocument
from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["collaborate"])


# ── Permission helpers ───────────────────────────────────────────────


def _is_owner(trip: TripDocument, user_id: str | None) -> bool:
    return trip.user_id is not None and trip.user_id == user_id


def _get_collab(trip: TripDocument, user_id: str | None) -> TripCollaborator | None:
    if not user_id:
        return None
    return next(
        (c for c in trip.collaborators if c.clerk_id == user_id and c.status == "active"),
        None,
    )


def _can_write(trip: TripDocument, user_id: str | None) -> bool:
    if _is_owner(trip, user_id):
        return True
    collab = _get_collab(trip, user_id)
    return collab is not None and collab.role == CollaboratorRole.EDITOR


def _can_read(trip: TripDocument, user_id: str | None) -> bool:
    if trip.is_public or _is_owner(trip, user_id):
        return True
    return _get_collab(trip, user_id) is not None


# ── Endpoints ────────────────────────────────────────────────────────


@router.get("/invite/{token}/accept")
async def accept_invite_by_token(
    token: str,
    user_id: str | None = Query(None),
) -> dict:
    """Accept an invite by token in the URL path (alternative to join?token= flow)."""
    trip = await TripDocument.find_one({"collaborators": {"$elemMatch": {"invite_token": token}}})
    if not trip:
        raise NotFoundError("Invite", token)

    accepted_role: CollaboratorRole = CollaboratorRole.VIEWER
    for collab in trip.collaborators:
        if collab.invite_token == token:
            if collab.status == "active":
                return {"ok": False, "data": {"message": "Invite already used."}}
            collab.clerk_id = user_id
            collab.status = "active"
            collab.joined_at = datetime.now(UTC)
            accepted_role = collab.role
            break

    trip.updated_at = datetime.now(UTC)
    await trip.save()

    return {
        "ok": True,
        "data": {
            "trip_id": str(trip.id),
            "trip_title": trip.title,
            "role": accepted_role,
        },
    }


@router.patch("/trips/{trip_id}/collaborators/{collab_id}/role")
async def update_collaborator_role(
    trip_id: str,
    collab_id: str,
    user_id: str | None = Query(None),
    role: CollaboratorRole = Query(...),
) -> dict:
    """Change a collaborator's role. Owner only."""
    trip = await TripService.get(trip_id, user_id=user_id)

    for collab in trip.collaborators:
        if collab.id == collab_id:
            collab.role = role
            break
    else:
        raise NotFoundError("Collaborator", collab_id)

    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return {"ok": True, "data": {"collab_id": collab_id, "role": role}}


@router.get("/trips/{trip_id}/can-edit")
async def check_edit_permission(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """Quick permission check — used by the frontend before showing edit UI."""
    trip = await TripDocument.get(trip_id)
    if not trip:
        raise NotFoundError("Trip", trip_id)

    return {
        "ok": True,
        "data": {
            "can_read": _can_read(trip, user_id),
            "can_write": _can_write(trip, user_id),
            "is_owner": _is_owner(trip, user_id),
        },
    }
