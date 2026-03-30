"""
app/routers/trips.py

REST API for trips, pins, sharing, and the AI chat assistant.

POST   /api/trips
GET    /api/trips/:id
PUT    /api/trips/:id
DELETE /api/trips/:id
GET    /api/trips/:share_token/share
POST   /api/trips/:id/share
DELETE /api/trips/:id/share
GET    /api/trips/:id/pins
POST   /api/trips/:id/pins
PUT    /api/trips/:id/pins/:pin_id
DELETE /api/trips/:id/pins/:pin_id
POST   /api/trips/:id/pins/reorder
POST   /api/trips/:id/merge/:source_id
POST   /api/trips/:id/chat
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.models.documents import Platform, TripDocument
from app.services.chat_service import SUGGESTION_CHIPS, chat
from app.services.trip_service import TripService

router = APIRouter(prefix="/api/trips", tags=["trips"])


# ── Pydantic request shapes ────────────────────────────────────

class CreateTripBody(BaseModel):
    title: str
    source_url: str
    platform: Platform = Platform.UNKNOWN
    user_id: str | None = None
    thumbnail_url: str | None = None
    video_duration: float | None = None
    job_id: str | None = None


class UpdateTripBody(BaseModel):
    title: str | None = None
    thumbnail_url: str | None = None
    user_id: str  # required to verify ownership


class AddPinBody(BaseModel):
    user_id: str
    place_name: str
    lat: float
    lng: float
    place_id: str | None = None
    address: str | None = None
    country_code: str | None = None
    city: str | None = None
    notes: str | None = None
    tags: list[str] = []


class UpdatePinBody(BaseModel):
    user_id: str
    place_name: str | None = None
    notes: str | None = None
    tags: list[str] | None = None


class ReorderPinsBody(BaseModel):
    user_id: str
    pin_ids: list[str]


class ChatBody(BaseModel):
    user_id: str | None = None
    message: str
    history: list[dict] = []


# ── Serialization helper ───────────────────────────────────────

def _trip_response(trip: TripDocument) -> dict:
    return {
        "id": str(trip.id),
        "userId": trip.user_id,
        "title": trip.title,
        "sourceUrl": trip.source_url,
        "platform": trip.platform,
        "thumbnailUrl": trip.thumbnail_url,
        "videoDuration": trip.video_duration,
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
                "confidence": p.confidence,
                "manuallyAdded": p.manually_added,
                "notes": p.notes,
                "tags": p.tags,
            }
            for p in sorted(trip.pins, key=lambda p: p.order)
        ],
        "shareToken": trip.share_token,
        "isShared": trip.is_shared,
        "createdAt": trip.created_at.isoformat(),
        "updatedAt": trip.updated_at.isoformat(),
    }


# ── Trip CRUD ──────────────────────────────────────────────────

@router.post("", summary="Create trip", status_code=201)
async def create_trip(body: CreateTripBody) -> dict:
    trip = await TripService.create(
        title=body.title,
        source_url=body.source_url,
        platform=body.platform,
        user_id=body.user_id,
        thumbnail_url=body.thumbnail_url,
        video_duration=body.video_duration,
        job_id=body.job_id,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.get("/{trip_id}", summary="Get trip by ID")
async def get_trip(trip_id: str, user_id: str | None = None) -> dict:
    trip = await TripService.get(trip_id, user_id=user_id)
    return {"ok": True, "data": _trip_response(trip)}


@router.put("/{trip_id}", summary="Update trip metadata")
async def update_trip(trip_id: str, body: UpdateTripBody) -> dict:
    trip = await TripService.update(
        trip_id=trip_id,
        user_id=body.user_id,
        title=body.title,
        thumbnail_url=body.thumbnail_url,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.delete("/{trip_id}", summary="Delete trip", status_code=204, response_model=None)
async def delete_trip(trip_id: str, user_id: str) -> None:
    await TripService.delete(trip_id=trip_id, user_id=user_id)


# ── Sharing ────────────────────────────────────────────────────

@router.get("/share/{share_token}", summary="Get shared trip (public)")
async def get_shared_trip(share_token: str) -> dict:
    trip = await TripService.get_by_share_token(share_token)
    return {"ok": True, "data": _trip_response(trip)}


@router.post("/{trip_id}/share", summary="Generate share link")
async def share_trip(trip_id: str, user_id: str) -> dict:
    trip = await TripService.share(trip_id=trip_id, user_id=user_id)
    return {"ok": True, "data": {"shareToken": trip.share_token, "isShared": trip.is_shared}}


@router.delete("/{trip_id}/share", summary="Remove share link")
async def unshare_trip(trip_id: str, user_id: str) -> dict:
    trip = await TripService.unshare(trip_id=trip_id, user_id=user_id)
    return {"ok": True, "data": {"isShared": trip.is_shared}}


# ── Pin operations ─────────────────────────────────────────────

@router.post("/{trip_id}/pins", summary="Add pin manually", status_code=201)
async def add_pin(trip_id: str, body: AddPinBody) -> dict:
    trip = await TripService.add_pin(
        trip_id=trip_id,
        user_id=body.user_id,
        place_name=body.place_name,
        lat=body.lat,
        lng=body.lng,
        place_id=body.place_id,
        address=body.address,
        country_code=body.country_code,
        city=body.city,
        notes=body.notes,
        tags=body.tags,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.put("/{trip_id}/pins/{pin_id}", summary="Update pin")
async def update_pin(trip_id: str, pin_id: str, body: UpdatePinBody) -> dict:
    trip = await TripService.update_pin(
        trip_id=trip_id,
        pin_id=pin_id,
        user_id=body.user_id,
        place_name=body.place_name,
        notes=body.notes,
        tags=body.tags,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.delete("/{trip_id}/pins/{pin_id}", summary="Delete pin")
async def delete_pin(trip_id: str, pin_id: str, user_id: str) -> dict:
    trip = await TripService.delete_pin(trip_id=trip_id, pin_id=pin_id, user_id=user_id)
    return {"ok": True, "data": _trip_response(trip)}


@router.post("/{trip_id}/pins/reorder", summary="Reorder pins")
async def reorder_pins(trip_id: str, body: ReorderPinsBody) -> dict:
    trip = await TripService.reorder_pins(
        trip_id=trip_id,
        user_id=body.user_id,
        pin_ids=body.pin_ids,
    )
    return {"ok": True, "data": _trip_response(trip)}


@router.post("/{trip_id}/merge/{source_trip_id}", summary="Merge pins from another trip")
async def merge_trips(trip_id: str, source_trip_id: str, user_id: str) -> dict:
    trip = await TripService.merge_pins(
        target_trip_id=trip_id,
        source_trip_id=source_trip_id,
        user_id=user_id,
    )
    return {"ok": True, "data": _trip_response(trip)}


# ── AI Chat ────────────────────────────────────────────────────

@router.post("/{trip_id}/chat", summary="AI travel assistant chat")
async def chat_with_trip(trip_id: str, body: ChatBody) -> dict:
    """
    Send a message to the AI travel assistant for this trip.
    The assistant receives the full trip context (title, all stops with
    names, addresses, and context quotes) in its system prompt.

    Returns the assistant reply + updated suggestion chips.
    """
    trip = await TripService.get(trip_id, user_id=body.user_id)
    reply = await chat(
        trip=trip,
        message=body.message,
        history=body.history,
    )
    return {
        "ok": True,
        "data": {
            "reply": reply,
            "suggestionChips": SUGGESTION_CHIPS,
        },
    }
