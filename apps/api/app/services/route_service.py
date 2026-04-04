"""
app/services/route_service.py

Feature 3 — Route optimisation (shortest path).

Solves the Travelling Salesman Problem for a trip's pins using a
greedy nearest-neighbour heuristic. O(n²) — fast and good enough
for the typical trip size of 5–30 stops.

Roamy's biggest complaint in reviews: "it had us zig-zagging all over."
This fixes that with one API call.

Optional start_location: if the user provides a lat/lng starting point
(e.g. their hotel or the airport), the route begins from the pin closest
to that location rather than pin[0].
"""
from __future__ import annotations

import math
from datetime import UTC, datetime

from app.config.logging import get_logger
from app.middleware.error_handler import AppError, NotFoundError
from app.models.documents import TripDocument

logger = get_logger(__name__)


async def optimise_route(
    trip: TripDocument,
    start_lat: float | None = None,
    start_lng: float | None = None,
) -> tuple[TripDocument, float, float]:
    """
    Reorder trip.pins for the shortest path using nearest-neighbour TSP.

    Args:
        trip: The trip to optimise.
        start_lat/start_lng: Optional starting location (hotel, airport).
            If provided, the route starts from the closest pin to this point.

    Returns:
        (updated_trip, original_distance_km, optimised_distance_km)
    """
    if len(trip.pins) < 2:
        raise AppError("Need at least 2 stops to optimise a route.", status_code=422)

    original_order = sorted(trip.pins, key=lambda p: p.order)
    original_dist = _total_distance(original_order)

    # Determine starting pin
    if start_lat is not None and start_lng is not None:
        start_idx = _nearest_to(original_order, start_lat, start_lng)
    else:
        start_idx = 0

    # Nearest-neighbour TSP
    optimised = _nearest_neighbour(original_order, start_idx)
    optimised_dist = _total_distance(optimised)

    # Reassign order values
    for i, pin in enumerate(optimised):
        pin.order = i

    # Rebuild pins list in new order
    pin_map = {p.id: p for p in trip.pins}
    trip.pins = [pin_map[p.id] for p in optimised]
    trip.updated_at = datetime.now(UTC)
    await trip.save()

    logger.info(
        "route_optimised",
        trip_id=str(trip.id),
        pin_count=len(trip.pins),
        original_km=round(original_dist, 1),
        optimised_km=round(optimised_dist, 1),
        saving_pct=round((1 - optimised_dist / original_dist) * 100, 1) if original_dist else 0,
    )

    return trip, original_dist, optimised_dist


def _nearest_neighbour(pins: list, start_idx: int) -> list:
    """
    Greedy nearest-neighbour TSP.
    Starting from start_idx, repeatedly visit the closest unvisited pin.
    """
    visited = [False] * len(pins)
    result = []
    current = start_idx

    for _ in range(len(pins)):
        visited[current] = True
        result.append(pins[current])

        best_dist = float("inf")
        best_next = -1
        for j, p in enumerate(pins):
            if not visited[j]:
                d = _haversine(pins[current].lat, pins[current].lng, p.lat, p.lng)
                if d < best_dist:
                    best_dist = d
                    best_next = j

        if best_next == -1:
            break
        current = best_next

    return result


def _nearest_to(pins: list, lat: float, lng: float) -> int:
    """Return index of the pin closest to a given lat/lng."""
    return min(
        range(len(pins)),
        key=lambda i: _haversine(pins[i].lat, pins[i].lng, lat, lng),
    )


def _total_distance(pins: list) -> float:
    """Total path distance in km (sum of consecutive haversine distances)."""
    return sum(
        _haversine(pins[i].lat, pins[i].lng, pins[i + 1].lat, pins[i + 1].lng)
        for i in range(len(pins) - 1)
    )


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
