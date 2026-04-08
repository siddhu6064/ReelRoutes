"""
Trip Builder Service  (Phase 4 — production implementation)
============================================================
Converts a user-confirmed PlanConfirmRequest into a persisted TripDocument
with embedded PinDocuments — the same Beanie document schema used by
video-imported trips.

Phase 4 improvements over the Phase 1 stub
-------------------------------------------
1. Full field mapping — all Phase 3 enrichment fields (opening_hours,
   website, phone, rating, price_level) are written to each PinDocument.

2. Typed error handling — DatabaseError and validation failures produce
   distinct exceptions that the router translates to specific HTTP codes
   rather than a catch-all 500.

3. Explicit ordering — activity and food stops are interleaved in the
   correct day order (activity stops first within each day, food stops
   after, matching the sequence the user curated in the UI).

4. Metadata summary — returns a BuildResult dataclass so the router can
   populate the response with pin_count and day_count without a second
   DB query.

5. Idempotent title generation — destination + days, e.g.
   "New Orleans, LA — 4 days".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from app.models.documents import PinDocument, TripDocument
from app.schemas.plan import PlanConfirmRequest

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class BuildResult:
    trip_id: str
    pin_count: int
    day_count: int


# ---------------------------------------------------------------------------
# Custom exceptions
# ---------------------------------------------------------------------------


class TripBuildValidationError(ValueError):
    """Raised when the confirm request fails business-logic validation."""


class TripBuildDatabaseError(RuntimeError):
    """Raised when the Beanie insert operation fails."""


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class TripBuilderService:
    """
    Persists a curated plan draft as a TripDocument.

    The resulting document is indistinguishable from a video-imported trip
    in terms of schema — only the `source` field differs ("scratch" vs "video").
    This means all existing trip APIs (GET /trips/:id, map view, chat assistant)
    work without modification.
    """

    async def build_from_plan(self, req: PlanConfirmRequest) -> BuildResult:
        """
        Build and insert a TripDocument from the confirmed plan.

        Raises
        ------
        TripBuildValidationError  if the request has no usable stops.
        TripBuildDatabaseError    if the Beanie insert fails.
        """
        pins = self._build_pins(req)

        if not pins:
            raise TripBuildValidationError(
                "Cannot save a trip with no pins. At least one stop is required."
            )

        trip = TripDocument(
            title=self._build_title(req),
            source="scratch",
            starting_point=req.starting_point,
            destination=req.destination,
            days=req.days,
            travel_mode=req.travel_mode.value,
            preferences=[p.value for p in req.preferences],
            pins=pins,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )

        try:
            await trip.insert()
        except Exception as exc:
            logger.error(
                "Database insert failed for planned trip to '%s': %s",
                req.destination,
                exc,
                exc_info=True,
            )
            raise TripBuildDatabaseError(f"Failed to persist trip to database: {exc}") from exc

        trip_id = str(trip.id)
        logger.info(
            "Saved scratch trip %s → '%s' (%d pins across %d days)",
            trip_id,
            trip.title,
            len(pins),
            len(req.days_plan),
        )
        return BuildResult(
            trip_id=trip_id,
            pin_count=len(pins),
            day_count=len(req.days_plan),
        )

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_pins(self, req: PlanConfirmRequest) -> list[PinDocument]:
        """
        Convert all confirmed stops across all days into PinDocument objects.

        Ordering within each day:
            - Activity stops first (in the user-curated order)
            - Food stops after  (in the user-curated order)

        Global `order` field increments monotonically across all days so
        the map view can reconstruct the full chronological sequence.
        """
        pins: list[PinDocument] = []
        order = 0

        # Sort days by day number for deterministic ordering
        sorted_days = sorted(req.days_plan, key=lambda d: d.day)

        for day_plan in sorted_days:
            # Activity stops
            for stop in day_plan.activity_stops:
                pins.append(
                    PinDocument(
                        name=stop.name,
                        lat=stop.lat,
                        lng=stop.lng,
                        place_id=stop.place_id or "",
                        address=stop.address or "",
                        day=day_plan.day,
                        order=order,
                        pin_type="activity",
                        # GPT-4o / Places enrichment
                        famous_for=stop.famous_for or "",
                        best_time=stop.best_time,
                        local_tip=stop.local_tip,
                        photo_url=stop.photo_url,
                        # Phase 3 Places Details enrichment
                        opening_hours=getattr(stop, "opening_hours", None),
                        website=getattr(stop, "website", None),
                        phone=getattr(stop, "phone", None),
                        rating=getattr(stop, "rating", None),
                        price_level=getattr(stop, "price_level", None),
                    )
                )
                order += 1

            # Food stops
            for food in day_plan.food_stops:
                pins.append(
                    PinDocument(
                        name=food.name,
                        lat=food.lat,
                        lng=food.lng,
                        place_id=food.place_id or "",
                        address=food.address or "",
                        day=day_plan.day,
                        order=order,
                        pin_type="food",
                        meal=food.meal,
                        famous_for=food.known_for or "",
                        photo_url=getattr(food, "photo_url", None),
                        rating=getattr(food, "rating", None),
                        price_level=getattr(food, "price_level", None),
                    )
                )
                order += 1

        return pins

    @staticmethod
    def _build_title(req: PlanConfirmRequest) -> str:
        """
        Generate a human-readable trip title.
        e.g. "New Orleans, LA — 4 days"
        """
        day_label = "day" if req.days == 1 else "days"
        return f"{req.destination} — {req.days} {day_label}"
