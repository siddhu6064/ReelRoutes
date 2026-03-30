"""
app/services/trip_service.py

Service layer for Trip and Pin operations.
All trip and pin business logic lives here — never call Beanie ODM from routers.
"""
from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime

from app.config.logging import get_logger
from app.middleware.error_handler import ForbiddenError, NotFoundError
from app.models.documents import PinDocument, Platform, TripDocument
from app.utils.seed import make_pin

logger = get_logger(__name__)


# ── Trip CRUD ──────────────────────────────────────────────────

class TripService:
    @staticmethod
    async def create(
        title: str,
        source_url: str,
        platform: Platform,
        user_id: str | None = None,
        thumbnail_url: str | None = None,
        video_duration: float | None = None,
        job_id: str | None = None,
        pins: list[PinDocument] | None = None,
    ) -> TripDocument:
        trip = TripDocument(
            user_id=user_id,
            title=title,
            source_url=source_url,
            platform=platform,
            thumbnail_url=thumbnail_url,
            video_duration=video_duration,
            job_id=job_id,
            pins=pins or [],
        )
        await trip.insert()
        logger.info("trip_created", trip_id=str(trip.id), user_id=user_id, pin_count=len(trip.pins))
        return trip

    @staticmethod
    async def get(trip_id: str, user_id: str | None = None) -> TripDocument:
        trip = await TripDocument.get(trip_id)
        if not trip:
            raise NotFoundError("Trip", trip_id)
        if user_id and trip.user_id and trip.user_id != user_id:
            raise ForbiddenError("You do not have access to this trip")
        return trip

    @staticmethod
    async def get_by_share_token(share_token: str) -> TripDocument:
        trip = await TripDocument.find_one(TripDocument.share_token == share_token)
        if not trip:
            raise NotFoundError("Trip")
        return trip

    @staticmethod
    async def list_for_user(
        user_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[TripDocument], int]:
        skip = (page - 1) * page_size
        query = TripDocument.find(TripDocument.user_id == user_id)
        total = await query.count()
        trips = await query.sort(-TripDocument.created_at).skip(skip).limit(page_size).to_list()
        return trips, total

    @staticmethod
    async def update(
        trip_id: str,
        user_id: str,
        title: str | None = None,
        thumbnail_url: str | None = None,
    ) -> TripDocument:
        trip = await TripService.get(trip_id, user_id=user_id)
        if title is not None:
            trip.title = title
        if thumbnail_url is not None:
            trip.thumbnail_url = thumbnail_url
        trip.updated_at = datetime.now(UTC)
        await trip.save()
        return trip

    @staticmethod
    async def delete(trip_id: str, user_id: str) -> None:
        trip = await TripService.get(trip_id, user_id=user_id)
        await trip.delete()
        logger.info("trip_deleted", trip_id=trip_id, user_id=user_id)

    @staticmethod
    async def share(trip_id: str, user_id: str) -> TripDocument:
        trip = await TripService.get(trip_id, user_id=user_id)
        if not trip.is_shared:
            trip.share_token = secrets.token_urlsafe(16)
            trip.is_shared = True
            trip.updated_at = datetime.now(UTC)
            await trip.save()
        return trip

    @staticmethod
    async def unshare(trip_id: str, user_id: str) -> TripDocument:
        trip = await TripService.get(trip_id, user_id=user_id)
        trip.is_shared = False
        trip.share_token = None
        trip.updated_at = datetime.now(UTC)
        await trip.save()
        return trip

    # ── Pin operations ─────────────────────────────────────────

    @staticmethod
    async def add_pin(
        trip_id: str,
        user_id: str,
        place_name: str,
        lat: float,
        lng: float,
        place_id: str | None = None,
        address: str | None = None,
        country_code: str | None = None,
        city: str | None = None,
        notes: str | None = None,
        tags: list[str] | None = None,
    ) -> TripDocument:
        trip = await TripService.get(trip_id, user_id=user_id)
        new_order = max((p.order for p in trip.pins), default=-1) + 1
        pin = PinDocument(
            id=str(uuid.uuid4()),
            order=new_order,
            place_name=place_name,
            place_id=place_id,
            lat=lat,
            lng=lng,
            address=address,
            country_code=country_code,
            city=city,
            confidence=1.0,
            manually_added=True,
            notes=notes,
            tags=tags or [],
        )
        trip.pins.append(pin)
        trip.updated_at = datetime.now(UTC)
        await trip.save()
        return trip

    @staticmethod
    async def update_pin(
        trip_id: str,
        pin_id: str,
        user_id: str,
        place_name: str | None = None,
        notes: str | None = None,
        tags: list[str] | None = None,
    ) -> TripDocument:
        trip = await TripService.get(trip_id, user_id=user_id)
        pin = next((p for p in trip.pins if p.id == pin_id), None)
        if not pin:
            raise NotFoundError("Pin", pin_id)
        if place_name is not None:
            pin.place_name = place_name
        if notes is not None:
            pin.notes = notes
        if tags is not None:
            pin.tags = tags
        pin.updated_at = datetime.now(UTC)
        trip.updated_at = datetime.now(UTC)
        await trip.save()
        return trip

    @staticmethod
    async def delete_pin(trip_id: str, pin_id: str, user_id: str) -> TripDocument:
        trip = await TripService.get(trip_id, user_id=user_id)
        original_count = len(trip.pins)
        trip.pins = [p for p in trip.pins if p.id != pin_id]
        if len(trip.pins) == original_count:
            raise NotFoundError("Pin", pin_id)
        # Re-number orders after deletion
        for i, pin in enumerate(sorted(trip.pins, key=lambda p: p.order)):
            pin.order = i
        trip.updated_at = datetime.now(UTC)
        await trip.save()
        return trip

    @staticmethod
    async def reorder_pins(
        trip_id: str,
        user_id: str,
        pin_ids: list[str],
    ) -> TripDocument:
        trip = await TripService.get(trip_id, user_id=user_id)
        pin_map = {p.id: p for p in trip.pins}
        # Validate all IDs exist
        missing = [pid for pid in pin_ids if pid not in pin_map]
        if missing:
            raise NotFoundError("Pin", missing[0])
        # Apply new ordering
        for i, pid in enumerate(pin_ids):
            pin_map[pid].order = i
        trip.pins = [pin_map[pid] for pid in pin_ids]
        trip.updated_at = datetime.now(UTC)
        await trip.save()
        return trip

    @staticmethod
    async def merge_pins(
        target_trip_id: str,
        source_trip_id: str,
        user_id: str,
    ) -> TripDocument:
        """Append all pins from source_trip into target_trip ("Add to existing trip")."""
        target = await TripService.get(target_trip_id, user_id=user_id)
        source = await TripService.get(source_trip_id, user_id=user_id)
        next_order = max((p.order for p in target.pins), default=-1) + 1
        for pin in sorted(source.pins, key=lambda p: p.order):
            pin.order = next_order
            pin.id = str(uuid.uuid4())  # new ID to avoid collision
            next_order += 1
            target.pins.append(pin)
        target.updated_at = datetime.now(UTC)
        await target.save()
        return target
