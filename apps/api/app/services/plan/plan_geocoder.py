"""
Plan Geocoder
Geocodes a list of RawPlace objects using the existing Google Places
geocoding service already present in the codebase.

Applies the same pattern used in the video import pipeline:
  - geocode each place by name + area + destination query
  - attach lat/lng, place_id, address, photo_url
  - skip places that cannot be geocoded
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

import httpx

from app.services.plan.ai_planner import RawPlace

logger = logging.getLogger(__name__)

PLACES_API_URL = "https://maps.googleapis.com/maps/api/place"
MAX_CONCURRENT_GEOCODE = 5          # Stay within Places API rate limits
GEOCODE_TIMEOUT_S = 8.0


@dataclass
class GeocodedPlace:
    """A RawPlace enriched with coordinates and Places metadata."""
    name: str
    lat: float
    lng: float
    place_id: str
    address: str
    famous_for: str
    best_time: str | None
    local_tip: str | None
    category: str                   # "activity" | "food"
    photo_url: str | None = None
    area: str = ""
    raw_query: str = ""


class PlanGeocoderService:
    """
    Geocodes RawPlace objects against the Google Places Text Search API.
    Reuses the same API key and HTTP patterns as the existing geocoding service.
    """

    def __init__(self, api_key: str, http_client: httpx.AsyncClient | None = None) -> None:
        self._api_key = api_key
        self._http = http_client or httpx.AsyncClient(timeout=GEOCODE_TIMEOUT_S)

    async def geocode_places(
        self, places: list[RawPlace], destination: str
    ) -> list[GeocodedPlace]:
        """
        Geocode all places concurrently (up to MAX_CONCURRENT_GEOCODE at once).
        Places that fail geocoding are silently skipped with a warning log.
        """
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_GEOCODE)
        tasks = [
            self._geocode_one(place, destination, semaphore) for place in places
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        geocoded: list[GeocodedPlace] = []
        for place, result in zip(places, results, strict=False):
            if isinstance(result, Exception):
                logger.warning(
                    "Failed to geocode '%s': %s", place.name, result
                )
            elif result is not None:
                geocoded.append(result)

        logger.info(
            "Geocoded %d / %d places successfully", len(geocoded), len(places)
        )
        return geocoded

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    async def _geocode_one(
        self,
        place: RawPlace,
        destination: str,
        semaphore: asyncio.Semaphore,
    ) -> GeocodedPlace | None:
        """Geocode a single place using Google Places Text Search."""
        query = place.geocode_query(destination)

        async with semaphore:
            try:
                response = await self._http.get(
                    f"{PLACES_API_URL}/textsearch/json",
                    params={
                        "query": query,
                        "key": self._api_key,
                        "fields": "place_id,name,geometry,formatted_address,photos",
                    },
                )
                response.raise_for_status()
                data = response.json()
            except Exception as exc:
                raise RuntimeError(f"Places API request failed for '{query}'") from exc

        candidates = data.get("results", [])
        if not candidates:
            logger.warning("No geocoding results for query: '%s'", query)
            return None

        best = candidates[0]
        location = best.get("geometry", {}).get("location", {})
        lat = location.get("lat")
        lng = location.get("lng")

        if lat is None or lng is None:
            logger.warning("Missing coordinates for '%s'", query)
            return None

        photo_url = self._extract_photo_url(best)

        return GeocodedPlace(
            name=best.get("name", place.name),
            lat=float(lat),
            lng=float(lng),
            place_id=best.get("place_id", ""),
            address=best.get("formatted_address", ""),
            famous_for=place.famous_for,
            best_time=place.best_time,
            local_tip=place.local_tip,
            category=place.category,
            photo_url=photo_url,
            area=place.area,
            raw_query=query,
        )

    def _extract_photo_url(self, place_result: dict) -> str | None:
        """Build a Places Photo URL from the first photo reference, if available."""
        photos = place_result.get("photos", [])
        if not photos:
            return None
        ref = photos[0].get("photo_reference")
        if not ref:
            return None
        return (
            f"{PLACES_API_URL}/photo"
            f"?maxwidth=800"
            f"&photo_reference={ref}"
            f"&key={self._api_key}"
        )

    async def aclose(self) -> None:
        await self._http.aclose()
