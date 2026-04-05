"""
app/routers/pin_visit.py  —  W9: Mark as Visited + Trip Diary

PATCH  /api/trips/{trip_id}/pins/{pin_id}/visit   — mark visited, optional diary
DELETE /api/trips/{trip_id}/pins/{pin_id}/visit   — clear visited status
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field

from app.middleware.error_handler import NotFoundError
from app.services.trip_service import TripService

router = APIRouter(prefix="/api/trips", tags=["pin-visit"])


# ── Request schema ─────────────────────────────────────────────


class VisitPinRequest(BaseModel):
    user_id: str | None = None
    diary_entry: str | None = Field(
        None,
        max_length=2000,
        description="Optional diary note for this visited location",
    )


# ── Endpoints ──────────────────────────────────────────────────


@router.patch("/{trip_id}/pins/{pin_id}/visit", summary="Mark pin as visited")
async def mark_pin_visited(
    trip_id: str,
    pin_id: str,
    body: VisitPinRequest,
) -> dict:
    """Mark a pin as visited. Optionally attach or update a diary entry.

    Sending ``{}`` (no diary_entry key) preserves any existing diary entry.
    """
    trip = await TripService.get(trip_id, user_id=body.user_id)

    pin = next((p for p in trip.pins if p.id == pin_id), None)
    if not pin:
        raise NotFoundError("Pin", pin_id)

    now = datetime.now(UTC)
    pin.visited_at = now
    if body.diary_entry is not None:
        pin.diary_entry = body.diary_entry
    pin.updated_at = now
    trip.updated_at = now
    await trip.save()

    return {
        "ok": True,
        "data": {
            "pinId": pin_id,
            "visitedAt": pin.visited_at.isoformat(),
            "diaryEntry": pin.diary_entry,
        },
    }


@router.delete("/{trip_id}/pins/{pin_id}/visit", summary="Clear visited status")
async def unmark_pin_visited(
    trip_id: str,
    pin_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """Clear visited_at and diary_entry for a pin. Idempotent."""
    trip = await TripService.get(trip_id, user_id=user_id)

    pin = next((p for p in trip.pins if p.id == pin_id), None)
    if not pin:
        raise NotFoundError("Pin", pin_id)

    now = datetime.now(UTC)
    pin.visited_at = None
    pin.diary_entry = None
    pin.updated_at = now
    trip.updated_at = now
    await trip.save()

    return {"ok": True, "data": {"pinId": pin_id, "unvisited": True}}
