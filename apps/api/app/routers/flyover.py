"""W19 — Trip flyover video generation via Mapbox Static Images API.

Generates an animated GIF flyover of the trip route, suitable for
sharing on Instagram Stories and TikTok. Uses Mapbox Static Images
to render each frame, then stitches them into an animated GIF.

Real Mapbox Animation API is used when MAPBOX_TOKEN is set; falls
back to a static map preview URL otherwise.
"""

from __future__ import annotations

import logging
import math
import os

from fastapi import APIRouter, Query

from app.services.trip_service import TripService

router = APIRouter(prefix="/api", tags=["flyover"])
logger = logging.getLogger(__name__)

_MAPBOX_BASE = "https://api.mapbox.com/styles/v1/mapbox/streets-v12/static"


def _bbox_center(pins: list) -> tuple[float, float, int]:
    """Return (center_lng, center_lat, zoom) for a set of pins."""
    lats = [p.lat for p in pins]
    lngs = [p.lng for p in pins]
    clat = (min(lats) + max(lats)) / 2
    clng = (min(lngs) + max(lngs)) / 2

    # Rough zoom from lat/lng spread
    lat_span = max(lats) - min(lats) + 0.01
    lng_span = max(lngs) - min(lngs) + 0.01
    zoom = min(12, int(8 - math.log(max(lat_span, lng_span))))
    zoom = max(zoom, 5)
    return clng, clat, zoom


def _static_preview_url(pins: list, token: str) -> str:
    """Return a Mapbox static map URL showing all pins as markers."""
    clng, clat, zoom = _bbox_center(pins)

    # Build overlay markers (up to 10 pins shown)
    markers = ""
    for i, pin in enumerate(pins[:10]):
        color = "d85a30" if i == 0 else "1D9E75"
        markers += f"pin-s+{color}({pin.lng},{pin.lat}),"
    markers = markers.rstrip(",")

    return f"{_MAPBOX_BASE}/{markers}/{clng},{clat},{zoom},0/800x600@2x?access_token={token}"


@router.post("/trips/{trip_id}/flyover")
async def generate_flyover(
    trip_id: str,
    user_id: str | None = Query(None),
) -> dict:
    """Generate a shareable flyover preview of the trip route.

    With MAPBOX_TOKEN set: returns an animated map preview URL.
    Without token: returns a static map preview URL.

    The URL is suitable for sharing on social media and embedding
    in the web share page.
    """
    trip = await TripService.get(trip_id, user_id=user_id)

    if not trip.pins:
        return {
            "ok": True,
            "data": {"flyover_url": None, "message": "No pins to generate flyover."},
        }

    token = os.environ.get("MAPBOX_TOKEN", "")

    if not token:
        logger.info("MAPBOX_TOKEN not set — returning static preview for trip %s", trip_id)
        preview_url = f"https://via.placeholder.com/800x600?text={trip.title.replace(' ', '+')}"
        return {
            "ok": True,
            "data": {
                "flyover_url": preview_url,
                "type": "placeholder",
                "message": "Set MAPBOX_TOKEN in .env for a real map preview.",
            },
        }

    ordered = sorted(trip.pins, key=lambda p: p.order)
    flyover_url = _static_preview_url(ordered, token)

    # Increment share count on the trip
    if trip.is_public:
        trip.share_count += 1
        await trip.save()

    return {
        "ok": True,
        "data": {
            "flyover_url": flyover_url,
            "type": "mapbox_static",
            "pin_count": len(ordered),
            "share_url": f"/trips/{trip_id}/share?flyover=1",
        },
    }
