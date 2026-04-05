"""
app/services/geocoding/storage.py

Persists geocoding results to the Job document and converts
GeocodedLocation objects into PinDocument instances ready for
embedding in a TripDocument.

Task 4: place_resolution_candidates stored for ambiguous matches
Task 6: signal_type, platform, extracted_at tracked for analytics
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.config.logging import get_logger
from app.models.documents import JobDocument, PinDocument
from app.services.geocoding.geocoder import GeocodedLocation, GeocodingResult
from app.services.extraction.service import ExtractionResult

logger = get_logger(__name__)


async def persist_geocoding_to_job(
    job: JobDocument,
    geocoding_result: GeocodingResult,
    extraction_result: ExtractionResult,
) -> None:
    """
    Task 4 + 6 — Save full geocoding output and analytics to the Job document.

    Stores:
      - geocoded_places: resolved locations with coordinates
      - place_resolution_candidates: ambiguous match options for manual resolution
      - signal_type_used, platform: for analytics dashboards
      - geocoded_at: timestamp
    """
    geocoded_places = []
    candidates_map = {}

    for loc in geocoding_result.locations:
        geocoded_places.append({
            "place_name": loc.place_name,
            "raw_name": loc.raw_name,
            "place_id": loc.place_id,
            "lat": loc.lat,
            "lng": loc.lng,
            "address": loc.address,
            "country_code": loc.country_code,
            "city": loc.city,
            "context_quote": loc.context_quote,
            "timestamp_hint": loc.timestamp_hint,
            "confidence": loc.confidence,
            "order": loc.order,
            "geocoded": loc.geocoded,
            "unresolved": loc.unresolved,
            "ambiguous": loc.ambiguous,
            # Task 6 — signal provenance
            "signal_type": extraction_result.signal_type,
        })

        # Task 4 — store candidates for ambiguous results
        if loc.ambiguous and loc.candidates:
            candidates_map[loc.raw_name] = loc.candidates

    # Write to Job document
    job.geocoded_places = geocoded_places  # type: ignore[attr-defined]
    job.place_resolution_candidates = candidates_map  # type: ignore[attr-defined]
    job.geocoded_at = datetime.now(UTC)  # type: ignore[attr-defined]

    # Store unresolved locations separately for the 'Did we miss anything?' UI
    from app.services.geocoding.storage import get_unresolved_locations
    job.unresolved_places = get_unresolved_locations(geocoding_result.locations)  # type: ignore[attr-defined]

    # Task 6 — analytics
    job.signal_type_used = str(extraction_result.signal_type)  # type: ignore[attr-defined]
    job.geocoding_stats = {  # type: ignore[attr-defined]
        "total": len(geocoding_result.locations),
        "geocoded": geocoding_result.geocoded_count,
        "unresolved": geocoding_result.unresolved_count,
        "ambiguous": geocoding_result.ambiguous_count,
        "dedup_removed": geocoding_result.dedup_removed,
    }

    await job.save()

    logger.info(
        "geocoding_persisted_to_job",
        job_id=str(job.id),
        geocoded=geocoding_result.geocoded_count,
        unresolved=geocoding_result.unresolved_count,
        candidates=len(candidates_map),
    )


def geocoded_locations_to_pins(locations: list[GeocodedLocation]) -> list[PinDocument]:
    """
    Convert GeocodedLocation objects into PinDocument instances.

    Fix: Unresolved locations (no coordinates) are EXCLUDED from the map
    entirely rather than placed at (0, 0) off the coast of Africa.
    They are stored in job.geocoded_places with unresolved=True so the
    UI can surface them in the "Did we miss anything?" panel.
    """
    pins: list[PinDocument] = []

    for loc in locations:
        # Skip completely unresolved locations — don't create a (0,0) pin
        if loc.unresolved and (loc.lat is None or loc.lat == 0.0):
            continue

        # Only create pins for locations with real coordinates
        if loc.lat is None or loc.lng is None:
            continue

        # Week 3 — city_group: canonical "City, CC" string for grouping
        city_group: str | None = None
        if loc.city and loc.country_code:
            city_group = f"{loc.city}, {loc.country_code}"
        elif loc.city:
            city_group = loc.city

        pin = PinDocument(
            id=str(uuid.uuid4()),
            order=len(pins),           # sequential order among geocoded pins only
            place_name=loc.place_name,
            place_id=loc.place_id,
            lat=loc.lat,
            lng=loc.lng,
            address=loc.address,
            country_code=loc.country_code,
            city=loc.city,
            city_group=city_group,
            context_quote=loc.context_quote,
            timestamp_hint=loc.timestamp_hint,
            confidence=loc.confidence,
            manually_added=False,
            tags=[],
            # Week 2 — Places enrichment
            rating=loc.rating,
            user_ratings_total=loc.user_ratings_total,
            open_now=loc.open_now,
            opening_hours_text=loc.opening_hours_text,
            website=loc.website,
            phone_number=loc.phone_number,
        )
        pins.append(pin)

    return pins


def get_unresolved_locations(locations: list[GeocodedLocation]) -> list[dict]:
    """
    Returns locations that couldn't be geocoded — surfaced in the
    'Did we miss anything?' panel so users can add them manually.
    """
    return [
        {
            "place_name": loc.place_name,
            "context_quote": loc.context_quote,
            "confidence": loc.confidence,
            "reason": "unresolved" if loc.unresolved else "ambiguous",
            "candidates": loc.candidates,
        }
        for loc in locations
        if loc.unresolved or (loc.ambiguous and not loc.geocoded)
    ]
