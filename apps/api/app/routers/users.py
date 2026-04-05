"""
app/routers/users.py

User-facing authenticated routes:
  GET  /api/users/me           — current user profile
  GET  /api/users/me/trips     — paginated saved trips
  POST /api/trips/:id/claim    — claim a guest trip after sign-up

These complement the existing trips router with auth-gated operations.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from app.auth.authorization import claim_guest_trip
from app.auth.clerk import RequiredUser
from app.models.documents import UserDocument
from app.services.trip_service import TripService

router = APIRouter(prefix="/api/users", tags=["users"])
trips_router = APIRouter(prefix="/api/trips", tags=["trips"])

# ── Current user ───────────────────────────────────────────────


@router.get("/me", summary="Get current user profile")
async def get_me(clerk_id: RequiredUser) -> dict:
    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if not user:
        # User exists in Clerk but not yet synced to our DB (webhook lag)
        return {
            "ok": True,
            "data": {
                "clerkId": clerk_id,
                "email": None,
                "name": None,
                "synced": False,
            },
        }
    return {
        "ok": True,
        "data": {
            "id": str(user.id),
            "clerkId": user.clerk_id,
            "email": user.email,
            "name": user.name,
            "avatarUrl": user.avatar_url,
            "createdAt": user.created_at.isoformat(),
            "synced": True,
        },
    }


# ── Task 3 — My trips with pagination ─────────────────────────


@router.get("/me/trips", summary="List my saved trips")
async def list_my_trips(
    clerk_id: RequiredUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict:
    """
    Returns the authenticated user's trips, newest first, paginated.
    """
    trips, total = await TripService.list_for_user(
        user_id=clerk_id,
        page=page,
        page_size=page_size,
    )

    return {
        "ok": True,
        "data": {
            "items": [_trip_summary(t) for t in trips],
            "total": total,
            "page": page,
            "pageSize": page_size,
            "hasNextPage": (page * page_size) < total,
        },
    }


# ── Guest trip claim ───────────────────────────────────────────


@trips_router.post("/{trip_id}/claim", summary="Claim a guest trip after sign-up")
async def claim_trip(trip_id: str, clerk_id: RequiredUser) -> dict:
    trip = await claim_guest_trip(trip_id, clerk_id)
    return {"ok": True, "data": {"id": str(trip.id), "userId": trip.user_id}}


# ── Push token registration (Fix 3) ────────────────────────────


class PushTokenRequest(BaseModel):
    token: str


@router.post("/me/push-token", summary="Register Expo push notification token")
async def register_push_token(body: PushTokenRequest, clerk_id: RequiredUser) -> dict:
    """
    Mobile app calls this on startup after notification permissions are granted.
    Stores the Expo push token so the API can notify the user when their
    trip finishes processing.
    """
    from app.services.push_notifications import register_push_token as _register

    await _register(clerk_id, body.token)
    return {"ok": True, "data": {"registered": True}}


# ── Clerk webhook — sync user to MongoDB ──────────────────────

clerk_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@clerk_router.post("/clerk", summary="Clerk user sync webhook")
async def clerk_webhook(request: Request) -> dict:
    """
    Receives Clerk user.created and user.updated webhooks.
    Upserts the UserDocument so our DB stays in sync with Clerk.

    In production: verify the svix signature using CLERK_WEBHOOK_SECRET.
    """
    from datetime import UTC, datetime

    body = await request.json()
    event_type = body.get("type")
    data = body.get("data", {})

    if event_type not in ("user.created", "user.updated"):
        return {"ok": True, "data": {"ignored": True}}

    clerk_id = data.get("id")
    email = next(
        (
            e["email_address"]
            for e in data.get("email_addresses", [])
            if e.get("id") == data.get("primary_email_address_id")
        ),
        None,
    )
    name = (
        " ".join(
            filter(
                None,
                [
                    data.get("first_name", ""),
                    data.get("last_name", ""),
                ],
            )
        ).strip()
        or "ReelRoutes User"
    )

    avatar_url = data.get("image_url") or data.get("profile_image_url")
    google_id = next(
        (
            a["provider_user_id"]
            for a in data.get("external_accounts", [])
            if a.get("provider") == "google"
        ),
        None,
    )

    existing = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if existing:
        existing.email = email or existing.email
        existing.name = name or existing.name
        existing.avatar_url = avatar_url or existing.avatar_url
        existing.google_id = google_id or existing.google_id
        existing.updated_at = datetime.now(UTC)
        await existing.save()
    else:
        user = UserDocument(
            clerk_id=clerk_id,
            email=email or f"{clerk_id}@placeholder.reelroutes.io",
            name=name,
            avatar_url=avatar_url,
            google_id=google_id,
        )
        await user.insert()

    return {"ok": True, "data": {"synced": True, "clerkId": clerk_id}}


# ── Helper ─────────────────────────────────────────────────────


def _trip_summary(trip) -> dict:
    return {
        "id": str(trip.id),
        "title": trip.title,
        "sourceUrl": trip.source_url,
        "platform": trip.platform,
        "thumbnailUrl": trip.thumbnail_url,
        "pinCount": len(trip.pins),
        "isShared": trip.is_shared,
        "createdAt": trip.created_at.isoformat(),
        "updatedAt": trip.updated_at.isoformat(),
    }
