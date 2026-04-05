"""
app/routers/wrapped.py  —  W10: Trip Wrapped viral stats

GET /api/trips/{trip_id}/wrapped
"""

from __future__ import annotations

import math
from collections import Counter
from datetime import UTC

from fastapi import APIRouter, Query

from app.middleware.error_handler import NotFoundError
from app.services.trip_service import TripService

router = APIRouter(prefix="/api/trips", tags=["wrapped"])


# ── Helpers ────────────────────────────────────────────────────


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two coordinate pairs in kilometres."""
    R = 6_371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ── Endpoint ───────────────────────────────────────────────────


@router.get("/{trip_id}/wrapped", summary="Trip Wrapped shareable stats")
async def get_trip_wrapped(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """Return aggregated stats for the 'Trip Wrapped' shareable card."""
    trip = await TripService.get(trip_id, user_id=user_id)

    pins = trip.pins

    # Visited pins in chronological order
    visited = sorted(
        (p for p in pins if p.visited_at is not None),
        key=lambda p: (
            p.visited_at.replace(tzinfo=UTC) if p.visited_at.tzinfo is None else p.visited_at
        ),
    )

    # Cumulative Haversine distance between consecutive visited pins
    distance_km = sum(
        _haversine_km(visited[i - 1].lat, visited[i - 1].lng, visited[i].lat, visited[i].lng)
        for i in range(1, len(visited))
    )

    # Category breakdown (top 5)
    cat_counter: Counter[str] = Counter(
        str(p.category.value if hasattr(p.category, "value") else p.category)
        for p in pins
        if p.category
    )
    top_categories = [{"category": cat, "count": cnt} for cat, cnt in cat_counter.most_common(5)]

    # Date range
    first_visit = visited[0].visited_at if visited else None
    last_visit = visited[-1].visited_at if visited else None
    days_active = 0
    if first_visit and last_visit:
        days_active = (last_visit.date() - first_visit.date()).days + 1

    visit_rate = round(len(visited) / len(pins), 4) if pins else 0.0
    diary_count = sum(1 for p in pins if p.diary_entry)

    return {
        "ok": True,
        "data": {
            "tripId": trip_id,
            "title": trip.title,
            "totalPins": len(pins),
            "visitedPins": len(visited),
            "visitRate": visit_rate,
            "diaryCount": diary_count,
            "distanceKm": round(distance_km, 2),
            "daysActive": days_active,
            "topCategories": top_categories,
            "firstVisit": first_visit.isoformat() if first_visit else None,
            "lastVisit": last_visit.isoformat() if last_visit else None,
            "createdAt": trip.created_at.isoformat()
            if hasattr(trip, "created_at") and trip.created_at
            else None,
        },
    }
