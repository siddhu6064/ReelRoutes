"""W17 — GET /api/trips/:id/directions — travel time between pins."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.services.directions_service import TravelMode, get_directions
from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["directions"])


@router.get("/trips/{trip_id}/directions")
async def compute_directions(
    trip_id: str,
    user_id: str | None = Query(None),
    mode: TravelMode = Query("driving"),
) -> dict:
    """Return travel time + distance between consecutive pins in visit order.

    Uses Google Routes API. Falls back to zeros if key is absent.
    Response includes per-leg breakdown so the UI can show travel time
    between each stop in the stop list.
    """
    trip = await TripService.get(trip_id, user_id=user_id)

    if len(trip.pins) < 2:
        return {
            "ok": True,
            "data": {
                "mode": mode,
                "total_duration_seconds": 0,
                "total_distance_meters": 0,
                "legs": [],
                "stop_labels": [],
            },
        }

    # Sort pins by order, extract (lat, lng) waypoints
    ordered = sorted(trip.pins, key=lambda p: p.order)
    waypoints = [(p.lat, p.lng) for p in ordered]
    stop_labels = [p.place_name for p in ordered]

    result = await get_directions(waypoints, mode=mode)

    # Annotate each leg with origin/destination stop names
    legs = []
    for i, leg in enumerate(result.get("legs", [])):
        legs.append(
            {
                "from": stop_labels[i],
                "to": stop_labels[i + 1],
                "duration_seconds": leg["duration_seconds"],
                "distance_meters": leg["distance_meters"],
                "duration_label": _fmt_duration(leg["duration_seconds"]),
                "distance_label": _fmt_distance(leg["distance_meters"]),
            }
        )

    return {
        "ok": True,
        "data": {
            "mode": mode,
            "total_duration_seconds": result["total_duration_seconds"],
            "total_distance_meters": result["total_distance_meters"],
            "total_duration_label": _fmt_duration(result["total_duration_seconds"]),
            "total_distance_label": _fmt_distance(result["total_distance_meters"]),
            "legs": legs,
            "stop_count": len(ordered),
        },
    }


def _fmt_duration(seconds: int) -> str:
    if seconds <= 0:
        return "—"
    if seconds < 3600:
        return f"{seconds // 60} min"
    h, m = divmod(seconds // 60, 60)
    return f"{h}h {m}m" if m else f"{h}h"


def _fmt_distance(meters: int) -> str:
    if meters <= 0:
        return "—"
    if meters < 1000:
        return f"{meters} m"
    return f"{meters / 1000:.1f} km"
