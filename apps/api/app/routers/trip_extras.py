"""
app/routers/trip_extras.py

Additional trip feature endpoints:
  Expenses  — POST/GET/PUT/DELETE /api/trips/:id/expenses
  Budget    — POST /api/trips/:id/budget
  Summary   — GET  /api/trips/:id/expenses/summary
  Settlement— GET  /api/trips/:id/expenses/settlement
  Settle    — POST /api/trips/:id/expenses/:eid/settle
  Invite    — POST /api/trips/:id/invite
  Join      — GET  /api/trips/:id/join?token=xxx
  Collab    — DELETE /api/trips/:id/collaborators/:cid
  Export    — GET  /api/trips/:id/export/:format
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from app.middleware.error_handler import AppError, ForbiddenError
from app.models.documents import TripDocument
from app.services.expense_service import (
    accept_invite,
    add_expense,
    check_can_edit,
    compute_summary,
    delete_expense,
    invite_collaborator,
    mark_settled,
    remove_collaborator,
    set_budget,
    update_expense,
)
from app.services.map_export_service import export_trip
from app.services.trip_service import TripService

router = APIRouter(prefix="/api/trips", tags=["trip-extras"])

# ── Request schemas ────────────────────────────────────────────


class AddExpenseRequest(BaseModel):
    user_id: str | None = None
    title: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    paid_by_name: str = Field(..., min_length=1, max_length=100)
    category: str = "other"
    currency: str | None = None
    split_type: str = "equal"
    split_with: list[dict] = Field(default_factory=list)
    notes: str | None = Field(None, max_length=500)
    pin_id: str | None = None


class UpdateExpenseRequest(BaseModel):
    user_id: str | None = None
    title: str | None = Field(None, min_length=1, max_length=200)
    amount: float | None = Field(None, gt=0)
    category: str | None = None
    notes: str | None = None
    split_with: list[dict] | None = None
    pin_id: str | None = None


class SetBudgetRequest(BaseModel):
    user_id: str | None = None
    budget: float = Field(..., gt=0)
    currency: str = "USD"


class InviteRequest(BaseModel):
    user_id: str
    name: str = Field(..., min_length=1, max_length=100)
    role: str = "viewer"
    email: str | None = None


# ── Expense endpoints ──────────────────────────────────────────


@router.post("/{trip_id}/expenses", summary="Add an expense", status_code=201)
async def create_expense(trip_id: str, body: AddExpenseRequest) -> dict:
    """
    Add an expense to a trip.

    Solo mode (split_with=[]): personal budget tracking, no splitting.
    Split mode (split_with=[{"member_name": "Alice"}, ...]): tracks who owes what.
    """
    trip = await _get_trip_with_edit_check(trip_id, body.user_id)
    expense = await add_expense(
        trip=trip,
        title=body.title,
        amount=body.amount,
        paid_by_name=body.paid_by_name,
        category=body.category,
        currency=body.currency,
        split_type=body.split_type,
        split_with=body.split_with,
        notes=body.notes,
        pin_id=body.pin_id,
    )
    return {"ok": True, "data": _expense_dict(expense)}


@router.get("/{trip_id}/expenses", summary="List all expenses")
async def list_expenses(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    trip = await TripService.get(trip_id, user_id=user_id)
    return {
        "ok": True,
        "data": {
            "expenses": [_expense_dict(e) for e in trip.expenses],
            "budget": trip.expense_budget,
            "currency": trip.expense_currency,
        },
    }


@router.put("/{trip_id}/expenses/{expense_id}", summary="Update an expense")
async def update_expense_endpoint(
    trip_id: str,
    expense_id: str,
    body: UpdateExpenseRequest,
) -> dict:
    trip = await _get_trip_with_edit_check(trip_id, body.user_id)
    expense = await update_expense(trip, expense_id, **body.model_dump(exclude_none=True))
    return {"ok": True, "data": _expense_dict(expense)}


@router.delete("/{trip_id}/expenses/{expense_id}", summary="Delete an expense")
async def delete_expense_endpoint(
    trip_id: str,
    expense_id: str,
    user_id: str | None = Query(None),
) -> dict:
    trip = await _get_trip_with_edit_check(trip_id, user_id)
    await delete_expense(trip, expense_id)
    return {"ok": True, "data": {"deleted": True}}


@router.post("/{trip_id}/expenses/{expense_id}/settle", summary="Mark a member as settled")
async def settle_expense(
    trip_id: str,
    expense_id: str,
    member_name: str,
    user_id: str | None = None,
) -> dict:
    trip = await _get_trip_with_edit_check(trip_id, user_id)
    expense = await mark_settled(trip, expense_id, member_name)
    return {"ok": True, "data": _expense_dict(expense)}


@router.get("/{trip_id}/expenses/summary", summary="Get expense summary + settlement plan")
async def expense_summary(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """
    Returns:
    - Total spent, by category
    - Per-person: how much each paid vs owes
    - Settlement transfers: who pays whom to settle all debts
    - Budget vs actual (if budget is set)
    """
    trip = await TripService.get(trip_id, user_id=user_id)
    summary = compute_summary(trip)
    remaining = None
    if trip.expense_budget:
        remaining = round(trip.expense_budget - summary.total_spent, 2)

    return {
        "ok": True,
        "data": {
            "totalSpent": summary.total_spent,
            "currency": summary.currency,
            "budget": trip.expense_budget,
            "remaining": remaining,
            "budgetUsedPercent": round(summary.total_spent / trip.expense_budget * 100, 1)
            if trip.expense_budget
            else None,
            "expenseCount": summary.expense_count,
            "byCategory": summary.by_category,
            "perPersonPaid": summary.per_person,
            "perPersonOwes": summary.per_person_owes,
            "netBalances": summary.net_balances,
            "settlements": [
                {
                    "from": s.from_name,
                    "to": s.to_name,
                    "amount": s.amount,
                    "currency": s.currency,
                    "label": f"{s.from_name} → {s.to_name}: {s.currency} {s.amount:.2f}",
                }
                for s in summary.settlements
            ],
        },
    }


@router.post("/{trip_id}/budget", summary="Set a trip budget")
async def set_trip_budget(trip_id: str, body: SetBudgetRequest) -> dict:
    trip = await _get_trip_with_edit_check(trip_id, body.user_id)
    trip = await set_budget(trip, body.budget, body.currency)
    return {"ok": True, "data": {"budget": trip.expense_budget, "currency": trip.expense_currency}}


# ── Collaborator endpoints ─────────────────────────────────────


@router.post("/{trip_id}/invite", summary="Invite a collaborator to the trip")
async def invite_to_trip(trip_id: str, body: InviteRequest) -> dict:
    """
    Invite someone to view or edit this trip.
    Returns an invite_token for building the invite link:
    https://reelroutes.app/trips/:trip_id/join?token=<invite_token>

    They don't need a ReelRoutes account to be added — just a name.
    They'll be asked to sign in when they click the link.
    """
    trip = await TripService.get(trip_id, user_id=body.user_id)
    if trip.user_id != body.user_id:
        raise ForbiddenError("Only the trip owner can invite collaborators.")

    collaborator = await invite_collaborator(
        trip=trip,
        name=body.name,
        role=body.role,
        email=body.email,
    )
    invite_url = f"https://reelroutes.app/trips/{trip_id}/join?token={collaborator.invite_token}"

    return {
        "ok": True,
        "data": {
            "collaborator": _collaborator_dict(collaborator),
            "inviteUrl": invite_url,
            "inviteToken": collaborator.invite_token,
            "message": f"Share this link with {collaborator.name}: {invite_url}",
        },
    }


@router.get("/{trip_id}/join", summary="Accept a trip invite")
async def join_trip(
    trip_id: str,
    token: str,
    user_id: str | None = Query(None),
) -> dict:
    """
    Called when a collaborator opens the invite link and is signed in.
    Links their Clerk account to the collaborator entry.
    """
    if not user_id:
        raise AppError("Sign in to accept this trip invite.", status_code=401)

    trip = await TripService.get(trip_id)
    collaborator = await accept_invite(trip, token, user_id)

    return {
        "ok": True,
        "data": {
            "tripId": trip_id,
            "role": collaborator.role,
            "message": f'You now have {collaborator.role} access to "{trip.title}"',
        },
    }


@router.get("/{trip_id}/collaborators", summary="List collaborators")
async def list_collaborators(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    trip = await TripService.get(trip_id, user_id=user_id)
    return {
        "ok": True,
        "data": [_collaborator_dict(c) for c in trip.collaborators],
    }


@router.delete("/{trip_id}/collaborators/{collaborator_id}", summary="Remove a collaborator")
async def remove_collab(
    trip_id: str,
    collaborator_id: str,
    user_id: str,
) -> dict:
    trip = await TripService.get(trip_id, user_id=user_id)
    await remove_collaborator(trip, collaborator_id, user_id)
    return {"ok": True, "data": {"removed": True}}


# ── Map export endpoints ───────────────────────────────────────


@router.get("/{trip_id}/export/google-maps", summary="Export to Google Maps")
async def export_google_maps(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """
    Returns a Google Maps URL with all stops as ordered waypoints.
    Open in any browser or the Google Maps app.
    """
    trip = await TripService.get(trip_id, user_id=user_id)
    result = export_trip(trip, "google_maps")
    return {"ok": True, "data": result}


@router.get("/{trip_id}/export/apple-maps", summary="Export to Apple Maps (GPX)")
async def export_apple_maps(
    trip_id: str,
    user_id: str | None = Query(None),
    include_pin_links: bool = Query(True),
) -> dict:
    """
    Returns a .gpx file that Apple Maps imports natively.

    iOS: Download → tap → 'Open in Maps' → all pins appear
    macOS: Download → double-click → Maps opens automatically
    Also works in Garmin, Komoot, OsmAnd, and any GPX-compatible app.

    Also returns individual Apple Maps links per pin for direct tapping.
    """
    trip = await TripService.get(trip_id, user_id=user_id)
    result = export_trip(trip, "apple_maps")
    if not include_pin_links:
        result.pop("pin_links", None)
    return {"ok": True, "data": result}


@router.get("/{trip_id}/export/apple-maps/download", summary="Download GPX file for Apple Maps")
async def download_apple_maps_gpx(
    trip_id: str,
    user_id: str | None = Query(None),
) -> PlainTextResponse:
    """Download the raw GPX file — triggers native file download in browser."""
    trip = await TripService.get(trip_id, user_id=user_id)
    result = export_trip(trip, "gpx")
    return PlainTextResponse(
        content=result["content"],
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'},
    )


@router.get("/{trip_id}/export/kml", summary="Export as KML (Google My Maps)")
async def export_kml(
    trip_id: str,
    user_id: str | None = Query(None),
) -> PlainTextResponse:
    """Download a KML file. Import at mymaps.google.com → Create → Import."""
    trip = await TripService.get(trip_id, user_id=user_id)
    result = export_trip(trip, "kml")
    return PlainTextResponse(
        content=result["content"],
        media_type="application/vnd.google-earth.kml+xml",
        headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'},
    )


@router.get("/{trip_id}/export/geojson", summary="Export as GeoJSON")
async def export_geojson(
    trip_id: str,
    user_id: str | None = Query(None),
) -> PlainTextResponse:
    """Download a GeoJSON file for developers and GIS tools."""
    trip = await TripService.get(trip_id, user_id=user_id)
    result = export_trip(trip, "geojson")
    return PlainTextResponse(
        content=result["content"],
        media_type="application/geo+json",
        headers={"Content-Disposition": f'attachment; filename="{result["filename"]}"'},
    )


# ── Serialisation helpers ──────────────────────────────────────


def _expense_dict(e) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "amount": e.amount,
        "currency": e.currency,
        "category": e.category,
        "paidByName": e.paid_by_name,
        "paidById": e.paid_by_id,
        "splitType": e.split_type,
        "isSolo": e.is_solo,
        "splitWith": [
            {
                "memberName": s.member_name,
                "memberId": s.member_id,
                "amount": s.amount,
                "percentage": s.percentage,
                "settled": s.settled,
            }
            for s in e.split_with
        ],
        "notes": e.notes,
        "pinId": e.pin_id,
        "date": e.date.isoformat(),
    }


def _collaborator_dict(c) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "clerkId": c.clerk_id,
        "role": c.role,
        "status": c.status,
        "invitedAt": c.invited_at.isoformat(),
        "joinedAt": c.joined_at.isoformat() if c.joined_at else None,
    }


async def _get_trip_with_edit_check(trip_id: str, user_id: str | None) -> TripDocument:
    """Get trip and verify the user can edit it (owner or active editor)."""
    trip = await TripService.get(trip_id)
    if not check_can_edit(trip, user_id):
        raise ForbiddenError("You don't have permission to edit this trip.")
    return trip
