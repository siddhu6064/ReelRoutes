"""W17 — Google Routes API directions service."""

from __future__ import annotations

import logging
import os
from typing import Literal

import httpx

log = logging.getLogger(__name__)

TravelMode = Literal["driving", "transit", "walking"]

_ROUTES_API = "https://routes.googleapis.com/directions/v2:computeRoutes"
_FIELD_MASK = (
    "routes.duration,routes.distanceMeters,"
    "routes.legs.duration,routes.legs.distanceMeters,"
    "routes.legs.steps.navigationInstruction,"
    "routes.legs.steps.distanceMeters"
)

_MODE_MAP: dict[TravelMode, str] = {
    "driving": "DRIVE",
    "transit": "TRANSIT",
    "walking": "WALK",
}


async def get_directions(
    waypoints: list[tuple[float, float]],
    mode: TravelMode = "driving",
) -> dict:
    """Compute directions between ordered waypoints via Google Routes API.

    Args:
        waypoints: List of (lat, lng) tuples in visit order.
        mode:      Travel mode — driving | transit | walking.

    Returns dict with keys:
        total_duration_seconds, total_distance_meters, legs: [{duration_s, distance_m}]
    """
    if len(waypoints) < 2:
        return {"total_duration_seconds": 0, "total_distance_meters": 0, "legs": []}

    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "")
    if not api_key:
        log.warning("GOOGLE_PLACES_API_KEY not set — returning stub directions")
        return _stub_directions(waypoints)

    origin = waypoints[0]
    destination = waypoints[-1]
    intermediates = waypoints[1:-1]

    body: dict = {
        "origin": {"location": {"latLng": {"latitude": origin[0], "longitude": origin[1]}}},
        "destination": {
            "location": {"latLng": {"latitude": destination[0], "longitude": destination[1]}}
        },
        "travelMode": _MODE_MAP[mode],
        "computeAlternativeRoutes": False,
        "routeModifiers": {"avoidTolls": False},
    }

    if intermediates:
        body["intermediates"] = [
            {"location": {"latLng": {"latitude": lat, "longitude": lng}}}
            for lat, lng in intermediates
        ]

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": _FIELD_MASK,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(_ROUTES_API, json=body, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        log.error("Google Routes API error: %s", exc)
        return _stub_directions(waypoints)

    routes = data.get("routes", [])
    if not routes:
        return _stub_directions(waypoints)

    route = routes[0]
    legs = route.get("legs", [])

    def _parse_duration(s: str) -> int:
        """'123s' → 123"""
        return int(s.rstrip("s")) if s else 0

    return {
        "total_duration_seconds": _parse_duration(route.get("duration", "0s")),
        "total_distance_meters": route.get("distanceMeters", 0),
        "legs": [
            {
                "duration_seconds": _parse_duration(leg.get("duration", "0s")),
                "distance_meters": leg.get("distanceMeters", 0),
            }
            for leg in legs
        ],
    }


def _stub_directions(waypoints: list[tuple[float, float]]) -> dict:
    """Return zero-filled stub when API key is absent (dev/test environments)."""
    n_legs = max(0, len(waypoints) - 1)
    return {
        "total_duration_seconds": 0,
        "total_distance_meters": 0,
        "legs": [{"duration_seconds": 0, "distance_meters": 0} for _ in range(n_legs)],
    }
