"""
app/routers/trips.py — with input validation (schemas.py) and auth guards (Task 4+6)
"""
from __future__ import annotations

from fastapi import APIRouter

from app.middleware.error_handler import AppError, ForbiddenError
from app.models.documents import Platform, TripDocument
from app.services.expense_service import check_can_edit
from app.routers.schemas import (
    AddPinRequest, ChatRequest, CreateTripRequest, ReorderPinsRequest,
    UpdatePinRequest, UpdateTripRequest,
)
from app.services.chat_service import SUGGESTION_CHIPS, chat
from app.services.trip_service import TripService

from pydantic import BaseModel, Field

class GenerateItineraryRequest(BaseModel):
    user_id: str | None = None
    trip_length_days: int = Field(..., ge=1, le=30)

class OptimiseRouteRequest(BaseModel):
    user_id: str | None = None
    start_lat: float | None = Field(None, ge=-90.0, le=90.0)
    start_lng: float | None = Field(None, ge=-180.0, le=180.0)

router = APIRouter(prefix="/api/trips", tags=["trips"])


# ── Task 4 — explicit user_id validation guard ─────────────────

def _require_user_id(user_id: str | None, action: str = "modify") -> str:
    """Raise 401 with a clear message if user_id is missing or blank."""
    if not user_id or not user_id.strip():
        raise AppError(
            f"Authentication required to {action} this trip",
            code="AUTHENTICATION_REQUIRED",
            status_code=401,
        )
    return user_id.strip()


# ── Serialisation ──────────────────────────────────────────────

def _trip_response(trip: TripDocument) -> dict:
    return {
        "id": str(trip.id),
        "userId": trip.user_id,
        "title": trip.title,
        "sourceUrl": trip.source_url,
        "platform": trip.platform,
        "thumbnailUrl": trip.thumbnail_url,
        "videoDuration": trip.video_duration,
        "videoCreator": trip.video_creator,
        "videoChannel": trip.video_channel,
        "jobId": trip.job_id,
        "pinCount": len(trip.pins),
        "pins": [
            {
                "id": p.id,
                "order": p.order,
                "placeName": p.place_name,
                "placeId": p.place_id,
                "lat": p.lat,
                "lng": p.lng,
                "address": p.address,
                "countryCode": p.country_code,
                "city": p.city,
                "contextQuote": p.context_quote,
                "timestampHint": p.timestamp_hint,
                "videoDeepLink": _video_deep_link(trip.source_url, trip.platform, p.timestamp_hint),
                "confidence": p.confidence,
                "manuallyAdded": p.manually_added,
                "notes": p.notes,
                "tags": p.tags,
                # Week 2 — Places enrichment
                "rating": p.rating,
                "userRatingsTotal": p.user_ratings_total,
                "openNow": p.open_now,
                "openingHoursText": p.opening_hours_text,
                "website": p.website,
                "phoneNumber": p.phone_number,
                # Week 3 — city grouping
                "cityGroup": p.city_group,
            }
            for p in sorted(trip.pins, key=lambda p: p.order)
        ],
        "itinerary": [
            {
                "dayNumber": d.day_number,
                "label": d.label,
                "pinIds": d.pin_ids,
                "notes": d.notes,
            }
            for d in trip.itinerary
        ],
        "collaborators": [
            {
                "id": c.id,
                "name": c.name,
                "role": c.role,
                "status": c.status,
            }
            for c in trip.collaborators
        ],
        "shareToken": trip.share_token,
        "isShared": trip.is_shared,
        "createdAt": trip.created_at.isoformat(),
        "updatedAt": trip.updated_at.isoformat(),
    }


def _video_deep_link(source_url: str, platform: str, timestamp: float | None) -> str | None:
    """Build a deep link to the source video at the exact timestamp."""
    if not source_url or timestamp is None:
        return source_url or None
    t = int(timestamp)
    p = str(platform).lower()
    if "youtube" in p or "youtu.be" in source_url:
        sep = "&" if "?" in source_url else "?"
        return f"{source_url}{sep}t={t}s"
    if "tiktok" in p:
        return source_url  # TikTok has no public timestamp URL scheme
    if "instagram" in p:
        return source_url  # Instagram has no public timestamp URL scheme
    return source_url


# ── Trip CRUD ──────────────────────────────────────────────────

@router.post("", summary="Create trip", status_code=201)
async def create_trip(body: CreateTripRequest) -> dict:
    trip = await TripService.create(
        title=body.title,
        source_url=body.source_url,
        platform=Platform(body.platform) if body.platform else Platform.UNKNOWN,
        user_id=body.user_id,
        thumbnail_url=body.thumbnail_url,
        video_duration=body.video_duration,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.get("/share/{share_token}", summary="Get shared trip (public)")
async def get_shared_trip(share_token: str) -> dict:
    trip = await TripService.get_by_share_token(share_token)
    return {"ok": True, "data": _trip_response(trip)}


@router.get("/{trip_id}", summary="Get trip by ID")
async def get_trip(trip_id: str, user_id: str | None = None) -> dict:
    trip = await TripService.get(trip_id, user_id=user_id)
    return {"ok": True, "data": _trip_response(trip)}


@router.put("/{trip_id}", summary="Update trip metadata")
async def update_trip(trip_id: str, body: UpdateTripRequest) -> dict:
    uid = _require_user_id(body.user_id, "edit")
    trip = await TripService.update(trip_id=trip_id, user_id=uid, title=body.title)
    return {"ok": True, "data": _trip_response(trip)}


@router.delete("/{trip_id}", summary="Delete trip", status_code=204, response_model=None)
async def delete_trip(trip_id: str, user_id: str) -> None:
    uid = _require_user_id(user_id, "delete")
    await TripService.delete(trip_id=trip_id, user_id=uid)


# ── Sharing ────────────────────────────────────────────────────

@router.post("/{trip_id}/share", summary="Generate share link")
async def share_trip(trip_id: str, user_id: str) -> dict:
    uid = _require_user_id(user_id, "share")
    trip = await TripService.share(trip_id=trip_id, user_id=uid)
    from app.config.analytics import track_trip_shared
    track_trip_shared(uid, trip_id)
    return {"ok": True, "data": {"shareToken": trip.share_token, "isShared": trip.is_shared}}


@router.delete("/{trip_id}/share", summary="Remove share link")
async def unshare_trip(trip_id: str, user_id: str) -> dict:
    uid = _require_user_id(user_id, "unshare")
    trip = await TripService.unshare(trip_id=trip_id, user_id=uid)
    return {"ok": True, "data": {"isShared": trip.is_shared}}


# ── Pin operations ─────────────────────────────────────────────

async def _pin_edit_guard(trip_id: str, user_id: str | None) -> tuple[str, "TripDocument"]:
    """Require auth + editor/owner rights. Returns (uid, trip)."""
    uid = _require_user_id(user_id, "edit pins in")
    trip = await TripService.get(trip_id)
    if not check_can_edit(trip, uid):
        raise ForbiddenError("You don't have permission to edit pins in this trip.")
    return uid, trip


@router.post("/{trip_id}/pins", summary="Add pin manually", status_code=201)
async def add_pin(trip_id: str, body: AddPinRequest) -> dict:
    uid, _ = await _pin_edit_guard(trip_id, body.user_id)
    trip = await TripService.add_pin(
        trip_id=trip_id, user_id=uid,
        place_name=body.place_name, lat=body.lat, lng=body.lng,
        address=body.address, notes=body.notes, tags=body.tags,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.put("/{trip_id}/pins/{pin_id}", summary="Update pin")
async def update_pin(trip_id: str, pin_id: str, body: UpdatePinRequest) -> dict:
    uid, _ = await _pin_edit_guard(trip_id, body.user_id)
    trip = await TripService.update_pin(
        trip_id=trip_id, pin_id=pin_id, user_id=uid,
        place_name=body.place_name, notes=body.notes, tags=body.tags,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.delete("/{trip_id}/pins/{pin_id}", summary="Delete pin")
async def delete_pin(trip_id: str, pin_id: str, user_id: str) -> dict:
    uid, _ = await _pin_edit_guard(trip_id, user_id)
    trip = await TripService.delete_pin(trip_id=trip_id, pin_id=pin_id, user_id=uid)
    return {"ok": True, "data": _trip_response(trip)}


@router.post("/{trip_id}/pins/reorder", summary="Reorder pins")
async def reorder_pins(trip_id: str, body: ReorderPinsRequest) -> dict:
    uid, _ = await _pin_edit_guard(trip_id, body.user_id)
    trip = await TripService.reorder_pins(
        trip_id=trip_id, user_id=uid, pin_ids=body.pin_ids,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.post("/{trip_id}/merge/{source_trip_id}", summary="Merge pins from another trip")
async def merge_trips(trip_id: str, source_trip_id: str, user_id: str) -> dict:
    uid, _ = await _pin_edit_guard(trip_id, user_id)
    trip = await TripService.merge_pins(
        target_trip_id=trip_id, source_trip_id=source_trip_id, user_id=uid,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.post("/{trip_id}/itinerary", summary="Generate day-by-day itinerary")
async def generate_itinerary(trip_id: str, body: GenerateItineraryRequest) -> dict:
    """
    Feature 2 — Groups pins into N days using geographic clustering + GPT-4o labels.
    Saves the itinerary on the trip and returns it.
    """
    from app.services.itinerary_service import generate_itinerary as _generate
    trip = await TripService.get(trip_id, user_id=body.user_id)
    days = await _generate(trip, body.trip_length_days)
    trip.itinerary = days
    from datetime import UTC, datetime
    trip.updated_at = datetime.now(UTC)
    await trip.save()
    return {
        "ok": True,
        "data": {
            "tripLengthDays": body.trip_length_days,
            "days": [
                {
                    "dayNumber": d.day_number,
                    "label": d.label,
                    "pinIds": d.pin_ids,
                    "notes": d.notes,
                }
                for d in days
            ],
        },
    }


@router.post("/{trip_id}/optimise-route", summary="Reorder pins for shortest path")
async def optimise_route(trip_id: str, body: OptimiseRouteRequest) -> dict:
    """
    Feature 3 — Nearest-neighbour TSP reorders pins for minimum travel distance.
    Accepts an optional start location (hotel/airport lat,lng).
    Returns before/after distance comparison and the updated pin order.
    """
    from app.services.route_service import optimise_route as _optimise
    trip = await TripService.get(trip_id, user_id=body.user_id)
    trip, original_km, optimised_km = await _optimise(
        trip,
        start_lat=body.start_lat,
        start_lng=body.start_lng,
    )
    saving_pct = round((1 - optimised_km / original_km) * 100, 1) if original_km else 0
    return {
        "ok": True,
        "data": {
            "originalDistanceKm": round(original_km, 1),
            "optimisedDistanceKm": round(optimised_km, 1),
            "savingPercent": saving_pct,
            "pins": _trip_response(trip)["pins"],
        },
    }


# ── AI Chat ────────────────────────────────────────────────────

@router.post("/{trip_id}/chat", summary="AI travel assistant chat")
async def chat_with_trip(trip_id: str, body: ChatRequest) -> dict:
    trip = await TripService.get(trip_id, user_id=body.user_id)
    from app.config.analytics import track_chat_message_sent
    track_chat_message_sent(body.user_id, trip_id)
    reply = await chat(
        trip=trip,
        message=body.message,
        history=[{"role": m.role, "content": m.content} for m in body.history],
    )
    return {"ok": True, "data": {"reply": reply, "suggestionChips": SUGGESTION_CHIPS}}
