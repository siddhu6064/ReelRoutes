"""W13 — Community Trip Discovery Feed."""

from __future__ import annotations

import time as _time
import uuid
from copy import deepcopy
from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.models.documents import TripDocument
from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["explore"])

# ── Simple in-process trending cache (5-minute TTL) ──────────────────
# Trending is sorted by view/share count — expensive on large collections.
# A short cache prevents hammering MongoDB on every page load.
# In production with Redis available, swap for redis.set/get with EX=300.
_trending_cache: dict = {"data": None, "at": 0.0}
_TRENDING_TTL = 300.0  # 5 minutes


# ── Helpers ─────────────────────────────────────────────────────────


def _trip_card(trip: TripDocument) -> dict:
    return {
        "id": str(trip.id),
        "title": trip.title,
        "platform": trip.platform,
        "pin_count": len(trip.pins),
        "view_count": trip.view_count,
        "share_count": trip.share_count,
        "video_creator": trip.video_creator,
        "video_channel": trip.video_channel,
        "created_at": trip.created_at.isoformat(),
    }


# ── Endpoints ───────────────────────────────────────────────────────


@router.get("/explore")
async def get_explore(
    destination: str | None = Query(None, description="Fuzzy match against trip title"),
    platform: str | None = Query(None, description="youtube|instagram|tiktok|facebook|twitter"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
) -> dict:
    """Paginated public trip discovery feed."""
    filters: dict = {"is_public": True}
    if platform:
        filters["platform"] = platform

    trips = (
        await TripDocument.find(filters)
        .sort("-created_at")
        .skip((page - 1) * limit)
        .limit(limit)
        .to_list()
    )

    if destination:
        dest_lower = destination.lower()
        trips = [t for t in trips if dest_lower in (t.title or "").lower()]

    return {
        "ok": True,
        "data": {
            "trips": [_trip_card(t) for t in trips],
            "page": page,
            "limit": limit,
        },
    }


@router.get("/explore/trending")
async def get_trending(
    limit: int = Query(20, ge=1, le=50),
) -> dict:
    """Public trips sorted by view_count + share_count — cached for 5 minutes."""
    now = _time.monotonic()
    cached = _trending_cache.get("data")
    if cached is not None and (now - _trending_cache["at"]) < _TRENDING_TTL:
        return {"ok": True, "data": cached}

    trips = (
        await TripDocument.find({"is_public": True})
        .sort(["-view_count", "-share_count"])
        .limit(limit)
        .to_list()
    )
    result = {"trips": [_trip_card(t) for t in trips]}
    _trending_cache["data"] = result
    _trending_cache["at"] = now
    return {"ok": True, "data": result}


@router.post("/trips/{trip_id}/view")
async def increment_view(trip_id: str) -> dict:
    """Increment view_count — no auth required (public trips)."""
    trip = await TripDocument.get(trip_id)
    if trip and trip.is_public:
        trip.view_count += 1
        await trip.save()
    return {"ok": True, "data": None}


@router.post("/trips/{trip_id}/duplicate")
async def duplicate_trip(
    trip_id: str,
    user_id: str = Query(...),
) -> dict:
    """Copy a public (or own) trip into a new private trip for user_id."""
    source = await TripService.get(trip_id)

    new_pins = deepcopy(source.pins)
    for pin in new_pins:
        pin.id = str(uuid.uuid4())
        pin.visited_at = None
        pin.diary_entry = None

    new_trip = TripDocument(
        user_id=user_id,
        title=f"Copy of {source.title}",
        platform=source.platform,
        source_url=source.source_url,
        pins=new_pins,
        is_public=False,
        view_count=0,
        share_count=0,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    await new_trip.insert()

    return {
        "ok": True,
        "data": {
            "trip_id": str(new_trip.id),
            "title": new_trip.title,
            "pin_count": len(new_trip.pins),
        },
    }


@router.patch("/trips/{trip_id}/visibility")
async def set_visibility(
    trip_id: str,
    user_id: str = Query(...),
    is_public: bool = Query(...),
) -> dict:
    """Toggle a trip's public visibility (owner only)."""
    trip = await TripService.get(trip_id, user_id=user_id)
    trip.is_public = is_public
    if is_public:
        trip.share_count += 1
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return {"ok": True, "data": {"is_public": trip.is_public}}
