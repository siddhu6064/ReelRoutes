"""
tests/services/test_phase2_features.py

Phase 2 — Core Planning Features tests:
  Week 5: Route optimisation (backend already built — test API response shape)
  Week 6: Itinerary generation response structure
  Week 7: PinCategory enum + auto-classification from place types
  Week 8: Offline/cache tests are frontend-only (IndexedDB / AsyncStorage)
"""

from __future__ import annotations

import pytest

from app.models.documents import PinCategory
from app.services.geocoding.geocoder import GeocodedLocation
from app.services.geocoding.storage import classify_category, geocoded_locations_to_pins
from app.services.route_service import _nearest_neighbour, _total_distance, optimise_route
from app.utils.seed import SeedFactory, make_pin
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401

# ── Week 5: Route optimisation response shape ─────────────────


@pytest.mark.asyncio
class TestOptimiseRoute:
    async def test_optimise_returns_updated_trip(self, beanie_init) -> None:
        trip = await SeedFactory.trip(pin_count=4)
        updated_trip, original_km, optimised_km = await optimise_route(trip)
        assert updated_trip is not None
        assert len(updated_trip.pins) == 4

    async def test_optimise_returns_distances(self, beanie_init) -> None:
        trip = await SeedFactory.trip(pin_count=4)
        _, original_km, optimised_km = await optimise_route(trip)
        assert original_km >= 0
        assert optimised_km >= 0

    async def test_optimised_not_worse_than_original(self, beanie_init) -> None:
        trip = await SeedFactory.trip(pin_count=5)
        _, original_km, optimised_km = await optimise_route(trip)
        # Nearest-neighbour never makes it worse than original
        assert optimised_km <= original_km + 0.1  # floating point tolerance

    async def test_single_pin_raises_error(self, beanie_init) -> None:
        """Route optimisation requires at least 2 stops."""
        from app.middleware.error_handler import AppError

        trip = await SeedFactory.trip(pin_count=1)
        with pytest.raises(AppError):
            await optimise_route(trip)

    async def test_optimise_preserves_all_pins(self, beanie_init) -> None:
        trip = await SeedFactory.trip(pin_count=6)
        original_ids = {p.id for p in trip.pins}
        updated, _, _ = await optimise_route(trip)
        assert {p.id for p in updated.pins} == original_ids

    def test_nearest_neighbour_all_pins_visited(self) -> None:
        pins = [make_pin(order=i) for i in range(5)]
        result = _nearest_neighbour(pins, start_idx=0)
        assert len(result) == 5
        assert {p.id for p in result} == {p.id for p in pins}

    def test_total_distance_empty(self) -> None:
        assert _total_distance([]) == 0.0

    def test_total_distance_single(self) -> None:
        assert _total_distance([make_pin(order=0)]) == 0.0


# ── Week 6: Itinerary structure ───────────────────────────────


@pytest.mark.asyncio
class TestItineraryStructure:
    async def test_generate_itinerary_returns_correct_day_count(self, beanie_init) -> None:
        from app.services.itinerary_service import generate_itinerary

        trip = await SeedFactory.trip(pin_count=6)
        days = await generate_itinerary(trip, trip_length_days=3)
        assert len(days) == 3

    async def test_all_pins_assigned_to_days(self, beanie_init) -> None:
        from app.services.itinerary_service import generate_itinerary

        trip = await SeedFactory.trip(pin_count=6)
        days = await generate_itinerary(trip, trip_length_days=2)
        all_pin_ids = {pid for day in days for pid in day.pin_ids}
        trip_pin_ids = {p.id for p in trip.pins}
        assert all_pin_ids == trip_pin_ids

    async def test_day_numbers_are_sequential(self, beanie_init) -> None:
        from app.services.itinerary_service import generate_itinerary

        trip = await SeedFactory.trip(pin_count=4)
        days = await generate_itinerary(trip, trip_length_days=2)
        numbers = [d.day_number for d in days]
        assert numbers == list(range(1, len(days) + 1))

    async def test_itinerary_saved_to_trip_response(self, beanie_init) -> None:
        from app.models.documents import TripDay
        from app.routers.trips import _trip_response

        trip = await SeedFactory.trip(pin_count=4)
        trip.itinerary = [
            TripDay(day_number=1, label="Day 1", pin_ids=[trip.pins[0].id, trip.pins[1].id]),
            TripDay(day_number=2, label="Day 2", pin_ids=[trip.pins[2].id, trip.pins[3].id]),
        ]
        await trip.save()
        data = _trip_response(trip)
        assert len(data["itinerary"]) == 2
        assert data["itinerary"][0]["label"] == "Day 1"
        assert len(data["itinerary"][0]["pinIds"]) == 2


# ── Week 7: PinCategory + auto-classification ─────────────────


class TestPinCategoryEnum:
    def test_all_categories_exist(self) -> None:
        cats = {c.value for c in PinCategory}
        assert "restaurant" in cats
        assert "landmark" in cats
        assert "accommodation" in cats
        assert "nature" in cats
        assert "shopping" in cats
        assert "transport" in cats
        assert "entertainment" in cats
        assert "other" in cats

    def test_default_category_is_other(self) -> None:
        pin = make_pin(order=0)
        assert pin.category == PinCategory.OTHER


class TestCategoryClassification:
    def test_restaurant_types(self) -> None:
        assert (
            classify_category(["restaurant", "food", "point_of_interest"]) == PinCategory.RESTAURANT
        )

    def test_cafe_is_restaurant(self) -> None:
        assert classify_category(["cafe", "establishment"]) == PinCategory.RESTAURANT

    def test_bar_is_restaurant(self) -> None:
        assert classify_category(["bar", "night_club"]) == PinCategory.RESTAURANT

    def test_lodging_is_accommodation(self) -> None:
        assert classify_category(["lodging", "establishment"]) == PinCategory.ACCOMMODATION

    def test_museum_is_landmark(self) -> None:
        assert classify_category(["museum", "tourist_attraction"]) == PinCategory.LANDMARK

    def test_church_is_landmark(self) -> None:
        assert classify_category(["church", "place_of_worship"]) == PinCategory.LANDMARK

    def test_park_is_nature(self) -> None:
        assert classify_category(["park", "establishment"]) == PinCategory.NATURE

    def test_beach_is_nature(self) -> None:
        assert classify_category(["beach"]) == PinCategory.NATURE

    def test_shopping_mall_is_shopping(self) -> None:
        assert classify_category(["shopping_mall", "establishment"]) == PinCategory.SHOPPING

    def test_transit_station_is_transport(self) -> None:
        assert classify_category(["transit_station", "subway_station"]) == PinCategory.TRANSPORT

    def test_amusement_park_is_entertainment(self) -> None:
        assert (
            classify_category(["amusement_park", "tourist_attraction"]) == PinCategory.ENTERTAINMENT
        )

    def test_unknown_types_return_other(self) -> None:
        assert classify_category(["establishment"]) == PinCategory.OTHER

    def test_empty_types_return_other(self) -> None:
        assert classify_category([]) == PinCategory.OTHER

    def test_category_stored_on_pin_from_geocoder(self) -> None:
        locs = [
            GeocodedLocation(
                place_name="Senso-ji Temple",
                raw_name="Senso-ji",
                context_quote="ancient temple",
                confidence=0.9,
                order=0,
                lat=35.71,
                lng=139.79,
                geocoded=True,
                place_types=["tourist_attraction", "place_of_worship", "establishment"],
            )
        ]
        pins = geocoded_locations_to_pins(locs)
        assert pins[0].category == PinCategory.LANDMARK

    def test_restaurant_pin_from_geocoder(self) -> None:
        locs = [
            GeocodedLocation(
                place_name="Ichiran Ramen",
                raw_name="Ichiran",
                context_quote="best ramen",
                confidence=0.9,
                order=0,
                lat=35.66,
                lng=139.70,
                geocoded=True,
                place_types=["restaurant", "food", "establishment"],
            )
        ]
        pins = geocoded_locations_to_pins(locs)
        assert pins[0].category == PinCategory.RESTAURANT

    def test_category_in_trip_serializer(self) -> None:
        """category appears in API response as a string value."""
        pin = make_pin(order=0)
        pin.category = PinCategory.NATURE
        assert pin.category.value == "nature"

    def test_priority_order_restaurant_beats_landmark(self) -> None:
        """When multiple types match, first rule wins (restaurant before landmark)."""
        result = classify_category(["restaurant", "tourist_attraction"])
        assert result == PinCategory.RESTAURANT


# ── Week 7: category in trip response ────────────────────────


@pytest.mark.asyncio
class TestCategoryInTripResponse:
    async def test_category_serialised_in_pins(self, beanie_init) -> None:
        from app.routers.trips import _trip_response

        trip = await SeedFactory.trip(pin_count=2)
        trip.pins[0].category = PinCategory.RESTAURANT
        trip.pins[1].category = PinCategory.LANDMARK
        await trip.save()
        data = _trip_response(trip)
        categories = [p["category"] for p in data["pins"]]
        assert PinCategory.RESTAURANT in categories
        assert PinCategory.LANDMARK in categories

    async def test_default_category_other_serialised(self, beanie_init) -> None:
        from app.routers.trips import _trip_response

        trip = await SeedFactory.trip(pin_count=1)
        data = _trip_response(trip)
        assert data["pins"][0]["category"] == PinCategory.OTHER
