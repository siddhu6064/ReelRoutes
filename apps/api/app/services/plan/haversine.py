"""
Haversine distance utility.
Extracted as a standalone module so it can be reused by the scheduler,
food injector, deduplication logic, and tests without circular imports.
"""

from __future__ import annotations

import math

_EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Straight-line (great-circle) distance between two lat/lng points
    in kilometres using the Haversine formula.
    """
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    )
    return _EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def centroid(points: list[tuple[float, float]]) -> tuple[float, float]:
    """
    Return the geographic centroid (average lat/lng) of a list of (lat, lng) tuples.
    Raises ValueError if the list is empty.
    """
    if not points:
        raise ValueError("Cannot compute centroid of empty point list")
    avg_lat = sum(p[0] for p in points) / len(points)
    avg_lng = sum(p[1] for p in points) / len(points)
    return avg_lat, avg_lng


def nearest(
    origin_lat: float,
    origin_lng: float,
    candidates: list[tuple[float, float]],
) -> int:
    """
    Return the index of the candidate point nearest to the origin.
    Raises ValueError if candidates is empty.
    """
    if not candidates:
        raise ValueError("Candidate list is empty")
    return min(
        range(len(candidates)),
        key=lambda i: haversine_km(origin_lat, origin_lng, candidates[i][0], candidates[i][1]),
    )
