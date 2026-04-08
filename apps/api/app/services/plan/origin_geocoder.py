"""
Origin Geocoder
Resolves a free-text starting_point string (e.g. "Austin, TX") to a
lat/lng coordinate using Google Places Text Search.

Used by the ProximityScheduler to establish the real Day 1 origin
instead of falling back to a centroid estimate.
"""

from __future__ import annotations

import logging
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
TIMEOUT_S = 8.0


class OriginGeocoderService:
    """
    Single-purpose geocoder for resolving the trip's starting point.
    Returns (lat, lng) or None if the query yields no results.
    """

    def __init__(
        self,
        api_key: str,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self._api_key = api_key
        self._http = http_client or httpx.AsyncClient(timeout=TIMEOUT_S)

    async def resolve(self, starting_point: str) -> Optional[Tuple[float, float]]:
        """
        Geocode `starting_point` and return (lat, lng).
        Returns None on failure — callers should fall back to centroid.
        """
        try:
            response = await self._http.get(
                PLACES_TEXT_SEARCH_URL,
                params={"query": starting_point, "key": self._api_key},
            )
            response.raise_for_status()
            data = response.json()
        except Exception as exc:
            logger.warning(
                "Origin geocoding failed for '%s': %s", starting_point, exc
            )
            return None

        results = data.get("results", [])
        if not results:
            logger.warning(
                "No geocoding results for starting point '%s'", starting_point
            )
            return None

        location = results[0].get("geometry", {}).get("location", {})
        lat = location.get("lat")
        lng = location.get("lng")

        if lat is None or lng is None:
            logger.warning("Missing coordinates for starting point '%s'", starting_point)
            return None

        logger.info(
            "Resolved starting point '%s' → (%.4f, %.4f)", starting_point, lat, lng
        )
        return float(lat), float(lng)

    async def aclose(self) -> None:
        await self._http.aclose()
