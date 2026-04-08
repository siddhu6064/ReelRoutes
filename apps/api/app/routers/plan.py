"""
Plan Router
Handles the "Plan from Scratch" trip creation flow.

POST /trips/plan         — AI generates a draft itinerary (not saved)
POST /trips/plan/confirm — User confirms curated draft → saved as TripDocument
"""

from __future__ import annotations

import logging
import os
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from openai import AsyncOpenAI

from app.schemas.plan import (
    DraftItinerary,
    PlanConfirmRequest,
    PlanConfirmResponse,
    PlanRequest,
)
from app.services.plan.activity_enricher import ActivityEnricherService
from app.services.plan.ai_planner import AIPlannerService
from app.services.plan.food_injector import FoodInjectorService
from app.services.plan.plan_geocoder import PlanGeocoderService
from app.services.plan.scheduler import ProximityScheduler
from app.services.plan.trip_builder import (
    TripBuildDatabaseError,
    TripBuilderService,
    TripBuildValidationError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/trips", tags=["plan"])


# ---------------------------------------------------------------------------
# Dependency factories
# ---------------------------------------------------------------------------

def get_openai_client() -> AsyncOpenAI:
    api_key = os.environ.get("OPENAI_API_KEY", "")
    return AsyncOpenAI(api_key=api_key)


def get_google_api_key() -> str:
    key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    if not key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Maps API key not configured",
        )
    return key


# ---------------------------------------------------------------------------
# POST /trips/plan
# ---------------------------------------------------------------------------

@router.post(
    "/plan",
    response_model=DraftItinerary,
    status_code=status.HTTP_200_OK,
    summary="Generate a draft itinerary from user inputs (not saved)",
)
async def plan_trip(
    req: PlanRequest,
    openai_client: Annotated[AsyncOpenAI, Depends(get_openai_client)],
    google_api_key: Annotated[str, Depends(get_google_api_key)],
) -> DraftItinerary:
    """
    Pipeline:
    1. GPT-4o generates a flat list of recommended places
    2. Geocode all places via Google Places API
    3. Nearest-neighbour sort per day (proximity scheduling)
    4. Inject food stops (breakfast / lunch / dinner) per day
    5. Return structured draft — nothing is persisted yet
    """

    # ── Step 1: AI place generation ──────────────────────────────────────
    ai_service = AIPlannerService(client=openai_client)
    try:
        raw_places = await ai_service.generate_places(req)
    except ValueError as exc:
        logger.error("AI place generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI planning failed: {exc}",
        )

    # ── Step 2: Geocode ──────────────────────────────────────────────────
    geocoder = PlanGeocoderService(api_key=google_api_key)
    try:
        geocoded = await geocoder.geocode_places(
            places=[p for p in raw_places if p.category == "activity"],
            destination=req.destination,
        )
    finally:
        await geocoder.aclose()

    if not geocoded:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not geocode any places for this destination",
        )

    # ── Step 3: Proximity scheduling ─────────────────────────────────────
    scheduler = ProximityScheduler()
    scheduled_days = await scheduler.schedule(
        places=geocoded,
        days=req.days,
        starting_point=req.starting_point,
        api_key=google_api_key,
    )

    # ── Step 3b: Enrich activity stops with Places Details ────────────────
    all_activity_stops = [
        stop
        for day in scheduled_days
        for stop in day.stops
        if hasattr(stop, "place_id")
    ]
    enricher = ActivityEnricherService(api_key=google_api_key)
    try:
        enriched_stops = await enricher.enrich(all_activity_stops)
    finally:
        await enricher.aclose()

    # Rebuild day plans with enriched stops (food stops not yet added)
    stop_iter = iter(enriched_stops)
    from app.schemas.plan import DayPlan as _DayPlan
    scheduled_days = [
        _DayPlan(
            day=day.day,
            stops=[next(stop_iter) for _ in day.stops],
        )
        for day in scheduled_days
    ]

    # ── Step 4: Food injection ────────────────────────────────────────────
    food_service = FoodInjectorService(api_key=google_api_key)
    try:
        days_with_food = await food_service.inject(
            days=scheduled_days,
            destination=req.destination,
        )
    finally:
        await food_service.aclose()

    # ── Step 5: Build response ────────────────────────────────────────────
    return DraftItinerary(
        starting_point=req.starting_point,
        destination=req.destination,
        days=req.days,
        travel_mode=req.travel_mode,
        days_plan=days_with_food,
    )


# ---------------------------------------------------------------------------
# POST /trips/plan/confirm
# ---------------------------------------------------------------------------

@router.post(
    "/plan/confirm",
    response_model=PlanConfirmResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a curated draft itinerary as a Trip",
)
async def confirm_plan(req: PlanConfirmRequest) -> PlanConfirmResponse:
    """
    Accepts the user-curated draft and persists it as a TripDocument
    with embedded PinDocuments. Same schema as video-imported trips.

    Returns the new trip ID and summary counts for the client to use
    when redirecting to the map view.

    Error responses:
        422 — request fails Pydantic or business-logic validation
        409 — no usable stops in the submitted plan
        503 — database write failed
    """
    builder = TripBuilderService()

    try:
        result = await builder.build_from_plan(req)

    except TripBuildValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )

    except TripBuildDatabaseError as exc:
        logger.error("DB error saving planned trip: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not save trip — database unavailable. Please try again.",
        )

    except Exception as exc:
        logger.error("Unexpected error in confirm_plan: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred while saving your trip.",
        )

    return PlanConfirmResponse(
        trip_id=result.trip_id,
        pin_count=result.pin_count,
        day_count=result.day_count,
    )
