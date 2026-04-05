"""W18 — Live GPS tracking endpoints."""

from __future__ import annotations

import math
from datetime import UTC, datetime

from fastapi import APIRouter, Body, Query
from pydantic import BaseModel

from app.models.documents import LocationPoint
from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["gps"])

# Auto-visit threshold: mark a pin visited when within this many metres
_AUTO_VISIT_RADIUS_M = 200
# Cap breadcrumb trail at 10,000 points (~28 hours at 10-second intervals)
_MAX_PATH_POINTS = 10_000


class LocationBody(BaseModel):
    lat: float
    lng: float
    accuracy_meters: float | None = None


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance in metres between two lat/lng points."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.post("/trips/{trip_id}/location")
async def record_location(
    trip_id: str,
    user_id: str | None = Query(None),
    body: LocationBody = Body(...),
) -> dict:
    """Append a GPS breadcrumb and auto-visit pins within 200 m.

    Called by the mobile app on significant-change location events.
    Returns a list of pin IDs that were auto-marked as visited this call.
    """
    trip = await TripService.get(trip_id, user_id=user_id)

    point = LocationPoint(
        lat=body.lat,
        lng=body.lng,
        recorded_at=datetime.now(UTC),
        accuracy_meters=body.accuracy_meters,
    )
    trip.visited_path.append(point)

    # Keep trail bounded
    if len(trip.visited_path) > _MAX_PATH_POINTS:
        trip.visited_path = trip.visited_path[-_MAX_PATH_POINTS:]

    # Auto-visit nearby unvisited pins
    auto_visited: list[str] = []
    for pin in trip.pins:
        if pin.visited_at is not None:
            continue
        dist = _haversine_m(body.lat, body.lng, pin.lat, pin.lng)
        if dist <= _AUTO_VISIT_RADIUS_M:
            pin.visited_at = datetime.now(UTC)
            auto_visited.append(pin.id)

    trip.updated_at = datetime.now(UTC)
    await trip.save()

    return {
        "ok": True,
        "data": {
            "recorded_at": point.recorded_at.isoformat(),
            "path_length": len(trip.visited_path),
            "auto_visited_pins": auto_visited,
        },
    }


@router.get("/trips/{trip_id}/path")
async def get_path(
    trip_id: str,
    user_id: str | None = Query(None),
    last_n: int = Query(500, ge=1, le=10_000),
) -> dict:
    """Return the recorded GPS breadcrumb trail for map display.

    `last_n` limits the points returned (default 500) so the client
    doesn't receive the full 10K-point history every poll.
    """
    trip = await TripService.get(trip_id, user_id=user_id)
    path = trip.visited_path[-last_n:]

    return {
        "ok": True,
        "data": {
            "path": [
                {
                    "lat": p.lat,
                    "lng": p.lng,
                    "recorded_at": p.recorded_at.isoformat(),
                }
                for p in path
            ],
            "total_points": len(trip.visited_path),
        },
    }


@router.delete("/trips/{trip_id}/path")
async def clear_path(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """Clear the GPS breadcrumb trail (e.g. after trip ends)."""
    trip = await TripService.get(trip_id, user_id=user_id)
    trip.visited_path = []
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return {"ok": True, "data": None}
