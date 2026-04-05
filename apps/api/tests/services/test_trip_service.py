"""
tests/services/test_trip_service.py

Tests for TripService covering trip CRUD, pin operations,
sharing lifecycle, and the "Add to existing trip" merge feature.
"""

from __future__ import annotations

import pytest

from app.middleware.error_handler import ForbiddenError, NotFoundError
from app.models.documents import Platform
from app.services.trip_service import TripService
from app.utils.seed import SeedFactory, make_pin, make_pins
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401


@pytest.mark.asyncio
class TestTripServiceCreate:
    async def test_create_returns_trip(self, beanie_init) -> None:
        trip = await TripService.create(
            title="Japan Adventure",
            source_url="https://youtube.com/watch?v=abc",
            platform=Platform.YOUTUBE,
        )
        assert trip.id is not None
        assert trip.title == "Japan Adventure"
        assert trip.pins == []

    async def test_create_with_pins(self, beanie_init) -> None:
        pins = make_pins(3)
        trip = await TripService.create(
            title="Test",
            source_url="https://youtube.com/watch?v=abc",
            platform=Platform.YOUTUBE,
            pins=pins,
        )
        assert len(trip.pins) == 3

    async def test_create_guest_trip(self, beanie_init) -> None:
        trip = await TripService.create(
            title="Guest Trip",
            source_url="https://youtube.com/watch?v=abc",
            platform=Platform.YOUTUBE,
            user_id=None,
        )
        assert trip.user_id is None


@pytest.mark.asyncio
class TestTripServiceGet:
    async def test_get_returns_trip(self, beanie_init) -> None:
        created = await SeedFactory.trip()
        fetched = await TripService.get(str(created.id))
        assert str(fetched.id) == str(created.id)

    async def test_get_with_correct_user_ok(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        fetched = await TripService.get(str(trip.id), user_id="clerk_owner")
        assert fetched is not None

    async def test_get_with_wrong_user_raises_forbidden(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        with pytest.raises(ForbiddenError):
            await TripService.get(str(trip.id), user_id="clerk_intruder")

    async def test_get_nonexistent_raises_not_found(self, beanie_init) -> None:
        from bson import ObjectId

        with pytest.raises(NotFoundError):
            await TripService.get(str(ObjectId()))

    async def test_guest_trip_accessible_without_user_id(self, beanie_init) -> None:
        trip = await SeedFactory.guest_trip()
        fetched = await TripService.get(str(trip.id))
        assert fetched.user_id is None


@pytest.mark.asyncio
class TestTripServiceUpdate:
    async def test_update_title(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_u1", title="Old Title")
        updated = await TripService.update(str(trip.id), "clerk_u1", title="New Title")
        assert updated.title == "New Title"

    async def test_update_wrong_user_raises_forbidden(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        with pytest.raises(ForbiddenError):
            await TripService.update(str(trip.id), "clerk_wrong", title="Hack")


@pytest.mark.asyncio
class TestTripServiceDelete:
    async def test_delete_removes_trip(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_d1")
        await TripService.delete(str(trip.id), "clerk_d1")
        with pytest.raises(NotFoundError):
            await TripService.get(str(trip.id))

    async def test_delete_wrong_user_raises(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        with pytest.raises(ForbiddenError):
            await TripService.delete(str(trip.id), "clerk_wrong")


@pytest.mark.asyncio
class TestTripServiceSharing:
    async def test_share_generates_token(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_s1")
        assert not trip.is_shared
        shared = await TripService.share(str(trip.id), "clerk_s1")
        assert shared.is_shared is True
        assert shared.share_token is not None

    async def test_share_idempotent(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_s2")
        t1 = await TripService.share(str(trip.id), "clerk_s2")
        t2 = await TripService.share(str(trip.id), "clerk_s2")
        assert t1.share_token == t2.share_token  # same token, not regenerated

    async def test_unshare_clears_token(self, beanie_init) -> None:
        trip = await SeedFactory.shared_trip(user_id="clerk_s3")
        unshared = await TripService.unshare(str(trip.id), "clerk_s3")
        assert unshared.is_shared is False
        assert unshared.share_token is None

    async def test_get_by_share_token(self, beanie_init) -> None:
        trip = await SeedFactory.shared_trip(user_id="clerk_s4", share_token="testtoken123")
        found = await TripService.get_by_share_token("testtoken123")
        assert str(found.id) == str(trip.id)

    async def test_get_by_invalid_token_raises(self, beanie_init) -> None:
        with pytest.raises(NotFoundError):
            await TripService.get_by_share_token("nonexistent_token")


@pytest.mark.asyncio
class TestPinService:
    async def test_add_pin_appends_to_trip(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_p1", pins=[])
        updated = await TripService.add_pin(
            str(trip.id), "clerk_p1", place_name="Shibuya Crossing", lat=35.6595, lng=139.7004
        )
        assert len(updated.pins) == 1
        assert updated.pins[0].place_name == "Shibuya Crossing"
        assert updated.pins[0].manually_added is True

    async def test_add_multiple_pins_sequential_order(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_p2", pins=[])
        await TripService.add_pin(str(trip.id), "clerk_p2", "Place A", 0.0, 0.0)
        updated = await TripService.add_pin(str(trip.id), "clerk_p2", "Place B", 1.0, 1.0)
        assert updated.pins[1].order == 1

    async def test_update_pin_notes_and_tags(self, beanie_init) -> None:
        pin = make_pin(order=0)
        trip = await SeedFactory.trip(user_id="clerk_p3", pins=[pin])
        updated = await TripService.update_pin(
            str(trip.id), pin.id, "clerk_p3", notes="Great spot!", tags=["must-visit"]
        )
        saved = next(p for p in updated.pins if p.id == pin.id)
        assert saved.notes == "Great spot!"
        assert "must-visit" in saved.tags

    async def test_delete_pin_removes_it(self, beanie_init) -> None:
        pins = make_pins(3)
        trip = await SeedFactory.trip(user_id="clerk_p4", pins=pins)
        target_id = pins[1].id
        updated = await TripService.delete_pin(str(trip.id), target_id, "clerk_p4")
        remaining_ids = [p.id for p in updated.pins]
        assert target_id not in remaining_ids
        assert len(updated.pins) == 2

    async def test_delete_pin_renumbers_orders(self, beanie_init) -> None:
        pins = make_pins(3)
        trip = await SeedFactory.trip(user_id="clerk_p5", pins=pins)
        updated = await TripService.delete_pin(str(trip.id), pins[0].id, "clerk_p5")
        orders = sorted(p.order for p in updated.pins)
        assert orders == [0, 1]

    async def test_reorder_pins_applies_new_order(self, beanie_init) -> None:
        pins = make_pins(3)
        trip = await SeedFactory.trip(user_id="clerk_p6", pins=pins)
        reversed_ids = [p.id for p in sorted(pins, key=lambda p: p.order, reverse=True)]
        updated = await TripService.reorder_pins(str(trip.id), "clerk_p6", reversed_ids)
        ordered = sorted(updated.pins, key=lambda p: p.order)
        assert ordered[0].id == reversed_ids[0]

    async def test_delete_nonexistent_pin_raises(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_p7", pins=[])
        with pytest.raises(NotFoundError):
            await TripService.delete_pin(str(trip.id), "nonexistent-id", "clerk_p7")


@pytest.mark.asyncio
class TestTripMerge:
    async def test_merge_appends_source_pins(self, beanie_init) -> None:
        uid = "clerk_merge"
        target = await SeedFactory.trip(user_id=uid, pin_count=2)
        source = await SeedFactory.trip(user_id=uid, pin_count=3)

        merged = await TripService.merge_pins(str(target.id), str(source.id), uid)
        assert len(merged.pins) == 5

    async def test_merge_pins_have_sequential_orders(self, beanie_init) -> None:
        uid = "clerk_merge2"
        target = await SeedFactory.trip(user_id=uid, pin_count=2)
        source = await SeedFactory.trip(user_id=uid, pin_count=2)
        merged = await TripService.merge_pins(str(target.id), str(source.id), uid)
        orders = sorted(p.order for p in merged.pins)
        assert orders == list(range(4))

    async def test_merge_pins_get_new_unique_ids(self, beanie_init) -> None:
        uid = "clerk_merge3"
        target = await SeedFactory.trip(user_id=uid, pin_count=1)
        source = await SeedFactory.trip(user_id=uid, pin_count=1)
        merged = await TripService.merge_pins(str(target.id), str(source.id), uid)
        ids = [p.id for p in merged.pins]
        assert len(ids) == len(set(ids))
