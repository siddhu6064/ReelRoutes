"""W20 — Physical travel book generation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.services.book_service import build_book_layout
from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["book"])


@router.post("/trips/{trip_id}/book")
async def generate_book(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """Generate a structured travel book layout for a trip.

    Returns a JSON layout suitable for:
      - Preview in the web UI (TravelBookCTA component)
      - Passing to a print-on-demand API (Lulu, Blurb, Printful)
      - Future: server-side PDF rendering

    The layout includes title page, per-day stops, map overview,
    and print specifications.
    """
    trip = await TripService.get(trip_id, user_id=user_id)
    layout = build_book_layout(trip)

    return {
        "ok": True,
        "data": {
            "layout": layout,
            "page_count": layout["page_count"],
            "title": layout["title"],
            "print_specs": layout["print_specs"],
            "preview_url": f"/trips/{trip_id}/book/preview",
        },
    }


@router.get("/trips/{trip_id}/book/layout")
async def get_book_layout(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """GET version of the book layout — same data, cached-friendly."""
    trip = await TripService.get(trip_id, user_id=user_id)
    layout = build_book_layout(trip)
    return {"ok": True, "data": layout}
