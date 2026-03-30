"""
tests/integration/test_trip_document.py

Integration tests for TripDocument and embedded PinDocument.
Covers insert, read, pin operations, and sharing lifecycle.
"""
from __future__ import annotations

import secrets
import uuid

import pytest

from app.models.documents import Platform, PinDocument, TripDocument
from app.utils.seed import SeedFactory, make_pin, make_pins


@pytest.mark.asyncio
class TestTripDocumentInsertAndRead:
    async def test_insert_returns_document_with_id(self) -> None:
        trip = await SeedFactory.trip()
        assert trip.id is not None

    async def test_trip_saved_with_embedded_pins(self) -> None:
        trip = await SeedFactory.trip(pin_count=3)
        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert len(reloaded.pins) == 3

    async def test_pin_fields_persisted_correctly(self) -> None:
        pin = make_pin(order=0)
        trip = await SeedFactory.trip(pins=[pin])
        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        saved_pin = reloaded.pins[0]
        assert saved_pin.place_name == pin.place_name
        assert saved_pin.lat == pin.lat
        assert saved_pin.lng == pin.lng
        assert saved_pin.confidence == pin.confidence
        assert saved_pin.context_quote == pin.context_quote

    async def test_trip_with_no_pins(self) -> None:
        trip = await SeedFactory.trip(pins=[])
        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.pins == []

    async def test_all_trip_fields_persisted(self) -> None:
        trip = await SeedFactory.trip(
            title="Epic Japan Road Trip",
            platform=Platform.INSTAGRAM,
            video_duration=432.5,
        )
        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.title == "Epic Japan Road Trip"
        assert reloaded.platform == Platform.INSTAGRAM
        assert reloaded.video_duration == 432.5

    async def test_user_id_stored_as_clerk_id_string(self) -> None:
        trip = await SeedFactory.trip(user_id="clerk_abc123")
        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.user_id == "clerk_abc123"

    async def test_guest_trip_has_null_user_id(self) -> None:
        trip = await SeedFactory.guest_trip()
        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.user_id is None

    async def test_is_shared_defaults_false(self) -> None:
        trip = await SeedFactory.trip()
        assert trip.is_shared is False
        assert trip.share_token is None


@pytest.mark.asyncio
class TestTripQueryPatterns:
    async def test_find_trips_by_user_id(self) -> None:
        user_id = "clerk_querytest"
        await SeedFactory.trip(user_id=user_id, title="Trip A")
        await SeedFactory.trip(user_id=user_id, title="Trip B")
        await SeedFactory.trip(user_id="clerk_other", title="Other user trip")

        user_trips = await TripDocument.find(
            TripDocument.user_id == user_id
        ).to_list()
        assert len(user_trips) == 2
        titles = {t.title for t in user_trips}
        assert "Trip A" in titles
        assert "Trip B" in titles

    async def test_find_trips_sorted_newest_first(self) -> None:
        from datetime import timedelta
        from datetime import UTC
        from datetime import datetime

        uid = "clerk_sort"
        now = datetime.now(UTC)

        # Insert in chronological order
        t1 = await SeedFactory.trip(user_id=uid, title="Oldest")
        t1.created_at = now - timedelta(days=2)
        await t1.save()

        t2 = await SeedFactory.trip(user_id=uid, title="Middle")
        t2.created_at = now - timedelta(days=1)
        await t2.save()

        t3 = await SeedFactory.trip(user_id=uid, title="Newest")
        t3.created_at = now
        await t3.save()

        trips = await TripDocument.find(
            TripDocument.user_id == uid
        ).sort(-TripDocument.created_at).to_list()

        assert trips[0].title == "Newest"
        assert trips[-1].title == "Oldest"

    async def test_find_by_share_token(self) -> None:
        token = secrets.token_urlsafe(16)
        shared = await SeedFactory.shared_trip(share_token=token)

        found = await TripDocument.find_one(TripDocument.share_token == token)
        assert found is not None
        assert str(found.id) == str(shared.id)

    async def test_count_by_user_id(self) -> None:
        uid = "clerk_count"
        await SeedFactory.trip(user_id=uid)
        await SeedFactory.trip(user_id=uid)
        count = await TripDocument.find(TripDocument.user_id == uid).count()
        assert count == 2


@pytest.mark.asyncio
class TestPinOperations:
    async def test_add_pin_to_trip(self) -> None:
        trip = await SeedFactory.trip(pins=[])
        new_pin = make_pin(order=0, place_name="New Place")
        trip.pins.append(new_pin)
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert len(reloaded.pins) == 1
        assert reloaded.pins[0].place_name == "New Place"

    async def test_update_pin_notes(self) -> None:
        trip = await SeedFactory.trip(pin_count=1)
        trip.pins[0].notes = "Must visit at sunrise!"
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.pins[0].notes == "Must visit at sunrise!"

    async def test_update_pin_tags(self) -> None:
        trip = await SeedFactory.trip(pin_count=1)
        trip.pins[0].tags = ["must-visit", "food", "temples"]
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert "must-visit" in reloaded.pins[0].tags
        assert len(reloaded.pins[0].tags) == 3

    async def test_delete_pin_from_trip(self) -> None:
        pins = make_pins(3)
        trip = await SeedFactory.trip(pins=pins)

        # Remove the second pin
        trip.pins = [p for p in trip.pins if p.order != 1]
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert len(reloaded.pins) == 2

    async def test_reorder_pins(self) -> None:
        pins = make_pins(3)
        trip = await SeedFactory.trip(pins=pins)

        # Reverse the order
        for i, pin in enumerate(reversed(trip.pins)):
            pin.order = i
        trip.pins.sort(key=lambda p: p.order)
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        orders = [p.order for p in reloaded.pins]
        assert orders == sorted(orders)

    async def test_manually_added_pin(self) -> None:
        trip = await SeedFactory.trip(pins=[])
        manual_pin = make_pin(
            order=0,
            place_name="Hidden Gem",
            manually_added=True,
            confidence=1.0,
            context_quote=None,
        )
        trip.pins.append(manual_pin)
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.pins[0].manually_added is True
        assert reloaded.pins[0].context_quote is None

    async def test_pin_preserves_uuid_id(self) -> None:
        """Pin IDs must be stable across saves — they're client-generated UUIDs."""
        pin = make_pin(order=0)
        original_id = pin.id
        trip = await SeedFactory.trip(pins=[pin])
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.pins[0].id == original_id

    async def test_low_confidence_pin_stored(self) -> None:
        """Pins with confidence < 0.5 trigger the suggestion UI — must store correctly."""
        low_confidence_pin = make_pin(order=0, confidence=0.35)
        trip = await SeedFactory.trip(pins=[low_confidence_pin])

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.pins[0].confidence == 0.35


@pytest.mark.asyncio
class TestTripSharingLifecycle:
    async def test_share_trip_sets_token_and_flag(self) -> None:
        trip = await SeedFactory.trip()
        assert trip.is_shared is False

        trip.share_token = secrets.token_urlsafe(16)
        trip.is_shared = True
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.is_shared is True
        assert reloaded.share_token is not None

    async def test_unshare_trip_clears_token(self) -> None:
        trip = await SeedFactory.shared_trip()
        assert trip.is_shared is True

        trip.is_shared = False
        trip.share_token = None
        await trip.save()

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        assert reloaded.is_shared is False
        assert reloaded.share_token is None


@pytest.mark.asyncio
class TestTripDelete:
    async def test_delete_trip(self) -> None:
        trip = await SeedFactory.trip()
        trip_id = trip.id
        await trip.delete()
        found = await TripDocument.get(trip_id)
        assert found is None

    async def test_delete_one_trip_does_not_affect_others(self) -> None:
        uid = "clerk_deletetest"
        t1 = await SeedFactory.trip(user_id=uid)
        t2 = await SeedFactory.trip(user_id=uid)
        await t1.delete()

        remaining = await TripDocument.find(TripDocument.user_id == uid).to_list()
        assert len(remaining) == 1
        assert str(remaining[0].id) == str(t2.id)
