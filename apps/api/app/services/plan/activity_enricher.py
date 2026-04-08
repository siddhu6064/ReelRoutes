"""
Activity Enricher Service  (Phase 3 — task t12)
================================================
Enriches geocoded activity stops with additional metadata from the
Google Places Details API:

  - opening_hours      (human-readable periods, e.g. "Mon–Fri 9am–5pm")
  - website            (official URL if available)
  - phone              (formatted phone number)
  - editorial_summary  (Google's short editorial description, if available)
                       Used to augment or override the GPT-4o famous_for field
                       when a richer description is available.
  - price_level        (0–4)
  - rating             (float)

The enricher runs AFTER geocoding and scheduling, so it receives
ActivityStop objects rather than raw GeocodedPlace objects.
It mutates a copy of each stop and returns the enriched list.

Design decisions
----------------
- Enrichment is best-effort: stops that fail Places Details lookup are
  returned unchanged (not dropped).
- Only stops WITH a place_id are enriched; stale/missing IDs are skipped.
- Concurrency is capped at MAX_CONCURRENT to avoid hammering the API.
- The enricher is optional in the pipeline — omitting it returns valid
  (but less detailed) itineraries.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

from app.schemas.plan import ActivityStop

logger = logging.getLogger(__name__)

PLACES_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"

DETAILS_FIELDS = ",".join(
    [
        "editorial_summary",
        "opening_hours",
        "formatted_phone_number",
        "website",
        "price_level",
        "rating",
    ]
)

MAX_CONCURRENT = 5
TIMEOUT_S = 10.0


class ActivityEnricherService:
    """
    Fetches Places Details for each activity stop and attaches extra metadata.
    """

    def __init__(
        self,
        api_key: str,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self._api_key = api_key
        self._http = http_client or httpx.AsyncClient(timeout=TIMEOUT_S)

    async def enrich(self, stops: list[ActivityStop]) -> list[ActivityStop]:
        """
        Enrich all activity stops concurrently.
        Returns a new list — original stops are not mutated.
        """
        semaphore = asyncio.Semaphore(MAX_CONCURRENT)
        results = await asyncio.gather(
            *[self._enrich_one(stop, semaphore) for stop in stops],
            return_exceptions=True,
        )

        enriched: list[ActivityStop] = []
        for stop, result in zip(stops, results, strict=False):
            if isinstance(result, ActivityStop):
                enriched.append(result)
            else:
                logger.warning("Enrichment failed for '%s': %s", stop.name, result)
                enriched.append(stop)  # Return original on failure

        return enriched

    async def aclose(self) -> None:
        await self._http.aclose()

    # ------------------------------------------------------------------
    # Private
    # ------------------------------------------------------------------

    async def _enrich_one(self, stop: ActivityStop, semaphore: asyncio.Semaphore) -> ActivityStop:
        if not stop.place_id:
            return stop

        async with semaphore:
            try:
                response = await self._http.get(
                    PLACES_DETAILS_URL,
                    params={
                        "place_id": stop.place_id,
                        "fields": DETAILS_FIELDS,
                        "key": self._api_key,
                    },
                )
                response.raise_for_status()
                data = response.json()
            except Exception as exc:
                raise RuntimeError(
                    f"Places Details request failed for place_id={stop.place_id}"
                ) from exc

        result = data.get("result", {})
        if not result:
            return stop

        return self._apply_details(stop, result)

    def _apply_details(self, stop: ActivityStop, details: dict) -> ActivityStop:
        """
        Build an enriched copy of the ActivityStop with Places Details applied.
        GPT-4o's famous_for is preserved; editorial_summary augments it if richer.
        """
        editorial = details.get("editorial_summary", {}).get("overview")

        # Use editorial summary as famous_for if it's richer than the GPT-4o text
        famous_for = stop.famous_for
        if editorial and len(editorial) > len(famous_for or ""):
            famous_for = editorial

        opening_hours_text = self._format_opening_hours(details.get("opening_hours", {}))

        return ActivityStop(
            # Core fields — unchanged
            name=stop.name,
            address=stop.address,
            lat=stop.lat,
            lng=stop.lng,
            place_id=stop.place_id,
            photo_url=stop.photo_url,
            distance_from_prev_km=stop.distance_from_prev_km,
            best_time=stop.best_time,
            local_tip=stop.local_tip,
            # Enriched fields
            famous_for=famous_for,
            opening_hours=opening_hours_text,
            website=details.get("website"),
            phone=details.get("formatted_phone_number"),
            price_level=details.get("price_level"),
            rating=details.get("rating"),
        )

    @staticmethod
    def _format_opening_hours(hours_data: dict) -> str | None:
        """
        Convert Places opening_hours into a compact human-readable string.
        e.g. "Mon–Fri: 9:00 AM – 5:00 PM | Sat–Sun: 10:00 AM – 4:00 PM"
        Falls back to the weekday_text list joined by " | " if available.
        """
        weekday_text = hours_data.get("weekday_text", [])
        if not weekday_text:
            return None
        # Google returns ["Monday: 9:00 AM – 5:00 PM", ...]
        # Join into one line for compact display in the UI
        return " | ".join(weekday_text)
