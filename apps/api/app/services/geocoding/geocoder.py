"""
app/services/geocoding/geocoder.py

Resolves extracted place name strings to canonical Google Places data:
lat/lng, place_id, formatted_address, country_code, city.

Strategy per place name:
  1. Call Places Text Search API with place_name + country hint if available
  2. If single result → GeocodedLocation (confident match)
  3. If multiple results → store as candidates, pick best by relevance score
  4. If zero results → mark as unresolved (pin still created, editable)

Rate limiting: Places Text Search costs 1 request per call.
Free tier: 200 USD/month credit ≈ ~4,000 calls/day at $0.032/call.
For 20-pin trips: ~20 calls per import. Very safe budget.

Task 6 — Analytics: signal_type, platform, and extracted_at are stored
on the Job document alongside geocoded results for debugging.
"""

from __future__ import annotations

import asyncio
import math
from dataclasses import dataclass, field

import httpx

from app.config.logging import get_logger
from app.config.settings import get_settings
from app.services.extraction.parser import ExtractedLocation

logger = get_logger(__name__)

PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"
PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

# Max concurrent geocoding requests (respect Places API rate limits)
MAX_CONCURRENT = 5

# Distance threshold for deduplication (Task 5)
DEDUP_DISTANCE_METRES = 200


@dataclass
class GeocodedLocation:
    """A fully resolved location with coordinates and Google Places metadata."""

    # Source extraction fields
    place_name: str  # canonical name from Google Places
    raw_name: str  # original AI-extracted name
    context_quote: str
    confidence: float
    order: int
    timestamp_hint: float | None = None

    # Geocoding result
    place_id: str | None = None
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    country_code: str | None = None
    city: str | None = None

    # Resolution status
    geocoded: bool = False
    unresolved: bool = False  # True when zero Places results found
    ambiguous: bool = False  # True when multiple candidates existed

    # Candidates stored when ambiguous (Task 4)
    candidates: list[dict] = field(default_factory=list)

    # Week 7 — place types for category classification
    place_types: list[str] = field(default_factory=list)

    # Google Places enrichment (Week 2)
    rating: float | None = None
    user_ratings_total: int | None = None
    open_now: bool | None = None
    opening_hours_text: list[str] = field(default_factory=list)
    website: str | None = None
    phone_number: str | None = None


@dataclass
class GeocodingResult:
    """Full output of one geocoding run."""

    locations: list[GeocodedLocation] = field(default_factory=list)
    geocoded_count: int = 0
    unresolved_count: int = 0
    ambiguous_count: int = 0
    dedup_removed: int = 0


async def geocode_locations(
    extracted: list[ExtractedLocation],
    country_hint: str | None = None,
) -> GeocodingResult:
    """
    Geocode a list of ExtractedLocation objects in parallel (max MAX_CONCURRENT).

    country_hint: ISO 3166-1 alpha-2 country code to bias results
                  (inferred from location_tag or first geocoded result).
    """
    if not extracted:
        return GeocodingResult()

    settings = get_settings()

    if not settings.google_places_api_key:
        logger.warning("google_places_api_key_missing_using_mock_geocoding")
        return _mock_geocoding(extracted)

    semaphore = asyncio.Semaphore(MAX_CONCURRENT)

    async def _geocode_one(loc: ExtractedLocation) -> GeocodedLocation:
        async with semaphore:
            return await _resolve_place(loc, settings.google_places_api_key, country_hint)

    geocoded = await asyncio.gather(*[_geocode_one(loc) for loc in extracted])
    locations = list(geocoded)

    # Task 5 — deduplicate by distance and exact name
    locations, removed = _deduplicate_locations(locations)

    result = GeocodingResult(
        locations=locations,
        geocoded_count=sum(1 for loc in locations if loc.geocoded),
        unresolved_count=sum(1 for loc in locations if loc.unresolved),
        ambiguous_count=sum(1 for loc in locations if loc.ambiguous),
        dedup_removed=removed,
    )

    logger.info(
        "geocoding_complete",
        total=len(extracted),
        geocoded=result.geocoded_count,
        unresolved=result.unresolved_count,
        ambiguous=result.ambiguous_count,
        dedup_removed=removed,
    )
    return result


# ── Places API calls ───────────────────────────────────────────


async def _resolve_place(
    loc: ExtractedLocation,
    api_key: str,
    country_hint: str | None,
) -> GeocodedLocation:
    base = GeocodedLocation(
        place_name=loc.place_name,
        raw_name=loc.place_name,
        context_quote=loc.context_quote,
        confidence=loc.confidence,
        order=loc.order,
        timestamp_hint=loc.timestamp_hint,
    )

    query = loc.place_name
    if country_hint:
        query = f"{loc.place_name} {country_hint}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                PLACES_TEXT_SEARCH_URL,
                params={
                    "query": query,
                    "key": api_key,
                    "fields": "place_id,name,geometry,formatted_address,address_components,rating,user_ratings_total,opening_hours,types",
                },
            )
            resp.raise_for_status()
            data = resp.json()

        status = data.get("status")
        results = data.get("results", [])

        if status == "ZERO_RESULTS" or not results:
            base.unresolved = True
            logger.info("geocoding_zero_results", place_name=loc.place_name)
            return base

        if status != "OK":
            base.unresolved = True
            logger.warning("geocoding_api_error", status=status, place=loc.place_name)
            return base

        # Populate from best result
        best = results[0]
        _populate_from_result(base, best)

        # Task 4 — store candidates if ambiguous (>1 result)
        if len(results) > 1:
            base.ambiguous = True
            base.candidates = [
                {
                    "place_id": r.get("place_id"),
                    "name": r.get("name"),
                    "address": r.get("formatted_address"),
                    "lat": r.get("geometry", {}).get("location", {}).get("lat"),
                    "lng": r.get("geometry", {}).get("location", {}).get("lng"),
                }
                for r in results[:5]  # cap at 5 candidates
            ]
            logger.info(
                "geocoding_ambiguous",
                place_name=loc.place_name,
                candidates=len(base.candidates),
            )

        # Week 2 — fetch website + phone via Place Details (non-blocking)
        if base.place_id:
            await _enrich_with_details(base, base.place_id, api_key, client)

    except httpx.TimeoutException:
        base.unresolved = True
        logger.warning("geocoding_timeout", place_name=loc.place_name)
    except Exception as exc:
        base.unresolved = True
        logger.error("geocoding_error", place_name=loc.place_name, error=str(exc))

    return base


def _populate_from_result(loc: GeocodedLocation, result: dict) -> None:
    geometry = result.get("geometry", {}).get("location", {})
    loc.place_id = result.get("place_id")
    loc.lat = geometry.get("lat")
    loc.lng = geometry.get("lng")
    loc.address = result.get("formatted_address")
    loc.place_name = result.get("name", loc.raw_name)  # canonical name

    for component in result.get("address_components", []):
        types = component.get("types", [])
        if "country" in types:
            loc.country_code = component.get("short_name")
        if ("locality" in types or "administrative_area_level_2" in types) and not loc.city:
            loc.city = component.get("long_name")

    # Week 7 — store raw place types for category classification
    loc.place_types = result.get("types", [])

    # Week 2 — enrichment from text search response
    if "rating" in result:
        loc.rating = float(result["rating"])
    if "user_ratings_total" in result:
        loc.user_ratings_total = int(result["user_ratings_total"])
    oh = result.get("opening_hours")
    if oh is not None:
        loc.open_now = oh.get("open_now")
        loc.opening_hours_text = oh.get("weekday_text", [])

    if loc.lat is not None and loc.lng is not None:
        loc.geocoded = True


async def _enrich_with_details(
    loc: GeocodedLocation,
    place_id: str,
    api_key: str,
    client: httpx.AsyncClient,
) -> None:
    """Fetch website + phone from Place Details API (Week 2). Fails silently."""
    try:
        resp = await client.get(
            PLACES_DETAILS_URL,
            params={
                "place_id": place_id,
                "key": api_key,
                "fields": "website,formatted_phone_number,opening_hours",
            },
            timeout=5.0,
        )
        resp.raise_for_status()
        data = resp.json()
        result = data.get("result", {})
        if result.get("website"):
            loc.website = result["website"]
        if result.get("formatted_phone_number"):
            loc.phone_number = result["formatted_phone_number"]
        # Prefer full hours from Details over partial hours from Text Search
        oh = result.get("opening_hours")
        if oh:
            if loc.open_now is None:
                loc.open_now = oh.get("open_now")
            full_text = oh.get("weekday_text", [])
            if full_text:
                loc.opening_hours_text = full_text
    except Exception as exc:
        logger.debug("place_details_fetch_failed", place_id=place_id, error=str(exc))


# ── Task 5 — Distance-based deduplication ─────────────────────


def haversine_metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate distance in metres between two lat/lng points."""
    R = 6_371_000  # Earth radius in metres
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lng2 - lng1)
    a = math.sin(Δφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(Δλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalise_name(name: str) -> str:
    import re

    return re.sub(r"[^\w]", "", name.lower())


def _deduplicate_locations(
    locations: list[GeocodedLocation],
) -> tuple[list[GeocodedLocation], int]:
    """
    Merge locations that are:
      a) within DEDUP_DISTANCE_METRES of each other (coordinate-based), OR
      b) exact normalised name matches

    When merging, keep the higher-confidence entry.
    Returns (deduped_list, removed_count).
    """
    if len(locations) <= 1:
        return locations, 0

    kept: list[GeocodedLocation] = []
    removed = 0

    for loc in locations:
        is_duplicate = False

        for existing in kept:
            # Name-based dedup
            if _normalise_name(loc.place_name) == _normalise_name(existing.place_name):
                is_duplicate = True
                if loc.confidence > existing.confidence:
                    kept[kept.index(existing)] = loc
                break

            # Distance-based dedup (only for geocoded locations)
            if (
                loc.geocoded
                and existing.geocoded
                and loc.lat is not None
                and loc.lng is not None
                and existing.lat is not None
                and existing.lng is not None
            ):
                dist = haversine_metres(loc.lat, loc.lng, existing.lat, existing.lng)
                if dist <= DEDUP_DISTANCE_METRES:
                    is_duplicate = True
                    if loc.confidence > existing.confidence:
                        kept[kept.index(existing)] = loc
                    logger.info(
                        "geocoding_dedup_by_distance",
                        kept=existing.place_name,
                        removed=loc.place_name,
                        distance_m=round(dist, 1),
                    )
                    break

        if not is_duplicate:
            kept.append(loc)
        else:
            removed += 1

    # Re-index order
    for i, loc in enumerate(kept):
        loc.order = i

    return kept, removed


# ── Mock geocoding for local dev ───────────────────────────────


def _mock_geocoding(extracted: list[ExtractedLocation]) -> GeocodingResult:
    """Deterministic mock geocoding — assigns plausible coords based on keywords."""
    KNOWN_COORDS: dict[str, tuple[float, float, str, str]] = {
        "tokyo": (35.6762, 139.6503, "JP", "Tokyo"),
        "kyoto": (35.0116, 135.7681, "JP", "Kyoto"),
        "osaka": (34.6937, 135.5023, "JP", "Osaka"),
        "bali": (-8.4095, 115.1889, "ID", "Bali"),
        "paris": (48.8566, 2.3522, "FR", "Paris"),
        "london": (51.5074, -0.1278, "GB", "London"),
        "new york": (40.7128, -74.0060, "US", "New York"),
        "marrakech": (31.6295, -7.9811, "MA", "Marrakech"),
        "lisbon": (38.7169, -9.1395, "PT", "Lisbon"),
        "iceland": (64.9631, -19.0208, "IS", "Reykjavik"),
    }

    locations = []
    for loc in extracted:
        name_lower = loc.place_name.lower()
        coords = next(
            (v for k, v in KNOWN_COORDS.items() if k in name_lower),
            None,
        )
        city_name = coords[3] if coords else loc.place_name
        cc = coords[2] if coords else "XX"
        geo = GeocodedLocation(
            place_name=loc.place_name,
            raw_name=loc.place_name,
            context_quote=loc.context_quote,
            confidence=loc.confidence,
            order=loc.order,
            timestamp_hint=loc.timestamp_hint,
            place_id=f"mock_place_{loc.order}",
            lat=coords[0] if coords else 35.0 + loc.order * 0.1,
            lng=coords[1] if coords else 135.0 + loc.order * 0.1,
            address=f"{loc.place_name}, {cc}",
            country_code=cc,
            city=city_name,
            geocoded=True,
            # Week 2 — mock enrichment
            rating=4.5,
            user_ratings_total=1234,
            open_now=True,
            opening_hours_text=[
                "Monday: 9:00 AM – 10:00 PM",
                "Tuesday: 9:00 AM – 10:00 PM",
                "Wednesday: 9:00 AM – 10:00 PM",
                "Thursday: 9:00 AM – 10:00 PM",
                "Friday: 9:00 AM – 11:00 PM",
                "Saturday: 10:00 AM – 11:00 PM",
                "Sunday: 10:00 AM – 9:00 PM",
            ],
            website=f"https://example.com/{loc.place_name.lower().replace(' ', '-')}",
            phone_number="+1 555-000-0000",
        )
        locations.append(geo)

    deduped, removed = _deduplicate_locations(locations)
    logger.warning("mock_geocoding_used", locations=len(deduped))
    return GeocodingResult(
        locations=deduped,
        geocoded_count=len(deduped),
        dedup_removed=removed,
    )
