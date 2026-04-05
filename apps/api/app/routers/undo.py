"""W15 — Undo / Edit History."""

from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.models.documents import EditSnapshot, PinDocument, TripDocument
from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["undo"])

MAX_HISTORY = 20


# ── Public helper ────────────────────────────────────────────────────
# Call push_snapshot(trip) BEFORE any mutation that should be undoable.
# Pattern:
#   trip = await TripService.get(trip_id, user_id=user_id)
#   await push_snapshot(trip)
#   trip.pins.append(new_pin)
#   trip.updated_at = datetime.now(UTC)
#   await trip.save()


async def push_snapshot(trip: TripDocument) -> None:
    """Append the current pins state to trip_edit_history (max 20 kept)."""
    snapshot = EditSnapshot(
        snapshot_at=datetime.now(UTC),
        pins_json=json.dumps([p.model_dump(mode="json") for p in trip.pins]),
    )
    trip.trip_edit_history.append(snapshot)
    if len(trip.trip_edit_history) > MAX_HISTORY:
        trip.trip_edit_history = trip.trip_edit_history[-MAX_HISTORY:]


# ── Endpoints ────────────────────────────────────────────────────────


@router.post("/trips/{trip_id}/undo")
async def undo_trip(
    trip_id: str,
    user_id: str = Query(...),
) -> dict:
    """Restore trip pins to the most recent snapshot."""
    trip = await TripService.get(trip_id, user_id=user_id)

    if not trip.trip_edit_history:
        return {
            "ok": True,
            "data": {
                "message": "Nothing to undo — history is empty.",
                "pin_count": len(trip.pins),
            },
        }

    snapshot = trip.trip_edit_history.pop()
    pins_data: list[dict] = json.loads(snapshot.pins_json)
    trip.pins = [PinDocument(**p) for p in pins_data]
    trip.updated_at = datetime.now(UTC)
    await trip.save()

    return {
        "ok": True,
        "data": {
            "restored_at": snapshot.snapshot_at.isoformat(),
            "pin_count": len(trip.pins),
            "snapshots_remaining": len(trip.trip_edit_history),
        },
    }


@router.get("/trips/{trip_id}/history")
async def get_history(
    trip_id: str,
    user_id: str = Query(...),
) -> dict:
    """Return snapshot timestamps (not full pin data) for undo UI display."""
    trip = await TripService.get(trip_id, user_id=user_id)
    return {
        "ok": True,
        "data": {
            "snapshots": [
                {
                    "snapshot_at": s.snapshot_at.isoformat(),
                    "index": i,
                }
                for i, s in enumerate(reversed(trip.trip_edit_history))
            ],
            "max_history": MAX_HISTORY,
        },
    }


@router.delete("/trips/{trip_id}/history")
async def clear_history(
    trip_id: str,
    user_id: str = Query(...),
) -> dict:
    """Clear undo history (e.g. after a deliberate 'save checkpoint')."""
    trip = await TripService.get(trip_id, user_id=user_id)
    trip.trip_edit_history = []
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return {"ok": True, "data": None}
