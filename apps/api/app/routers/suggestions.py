"""
app/routers/suggestions.py  —  W11: AI Spot Suggestions

POST /api/trips/{trip_id}/suggest-spots
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Query

from app.middleware.error_handler import AppError
from app.services.spot_suggester import SpotSuggesterError, suggest_spots
from app.services.trip_service import TripService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/trips", tags=["suggestions"])


@router.post("/{trip_id}/suggest-spots", summary="AI-powered nearby spot suggestions")
async def suggest_spots_for_trip(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """Ask GPT-4o to suggest up to 5 nearby spots not already in the trip."""
    trip = await TripService.get(trip_id, user_id=user_id)

    try:
        suggestions = await suggest_spots(trip)
    except SpotSuggesterError as exc:
        logger.error("suggest_spots failed for trip %s: %s", trip_id, exc)
        raise AppError(
            "AI suggestions temporarily unavailable. Please try again.",
            code="SUGGESTIONS_UNAVAILABLE",
            status_code=502,
        ) from exc

    return {"ok": True, "data": {"tripId": trip_id, "suggestions": suggestions}}
