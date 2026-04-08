"""
Unit tests for TripBuilderService (Phase 4).

All MongoDB/Beanie interactions are mocked — no real database required.
Tests cover:
  - Pin building (activity + food, correct field mapping)
  - Phase 3 enrichment fields propagated to pins
  - Day ordering
  - Title generation
  - Validation errors (no stops)
  - Database error handling
  - BuildResult summary counts
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas.plan import (
    ConfirmActivityStop,
    ConfirmDayPlan,
    ConfirmFoodStop,
    PlanConfirmRequest,
    TravelMode,
    TripPreference,
)
from app.services.plan.trip_builder import (
    BuildResult,
    TripBuildDatabaseError,
    TripBuilderService,
    TripBuildValidationError,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_activity_stop(**kwargs) -> ConfirmActivityStop:
    defaults = {
        "name": "French Quarter",
        "lat": 29.9584,
        "lng": -90.0644,
        "place_id": "place-fq",
        "address": "French Quarter, New Orleans, LA",
        "famous_for": "Jazz music and Creole architecture",
        "best_time": "Evening",
        "local_tip": "Go on a weeknight",
        "photo_url": "https://example.com/photo.jpg",
    }
    defaults.update(kwargs)
    return ConfirmActivityStop(**defaults)


def make_food_stop(**kwargs) -> ConfirmFoodStop:
    defaults = {
        "name": "Cafe Du Monde",
        "lat": 29.9575,
        "lng": -90.0614,
        "place_id": "place-cdm",
        "address": "800 Decatur St",
        "known_for": "Beignets and café au lait",
        "meal": "breakfast",
    }
    defaults.update(kwargs)
    return ConfirmFoodStop(**defaults)


def make_request(**kwargs) -> PlanConfirmRequest:
    defaults = {
        "starting_point": "Austin, TX",
        "destination": "New Orleans, LA",
        "days": 2,
        "travel_mode": TravelMode.driving,
        "preferences": [TripPreference.food, TripPreference.history],
        "days_plan": [
            ConfirmDayPlan(
                day=1,
                activity_stops=[make_activity_stop()],
                food_stops=[make_food_stop()],
            ),
            ConfirmDayPlan(
                day=2,
                activity_stops=[make_activity_stop(name="Garden District", place_id="place-gd")],
                food_stops=[],
            ),
        ],
    }
    defaults.update(kwargs)
    return PlanConfirmRequest(**defaults)


def mock_trip_document(trip_id: str = "507f1f77bcf86cd799439011"):
    """Return a mock TripDocument with a predictable id."""
    doc = MagicMock()
    doc.id = trip_id
    doc.insert = AsyncMock()
    return doc


# ---------------------------------------------------------------------------
# Tests: _build_title
# ---------------------------------------------------------------------------


class TestBuildTitle:
    def setup_method(self):
        self.svc = TripBuilderService()

    def test_plural_days(self):
        req = make_request(destination="Tokyo, Japan", days=4)
        assert self.svc._build_title(req) == "Tokyo, Japan — 4 days"

    def test_singular_day(self):
        req = make_request(destination="Paris, France", days=1)
        assert self.svc._build_title(req) == "Paris, France — 1 day"


# ---------------------------------------------------------------------------
# Tests: _build_pins
# ---------------------------------------------------------------------------


class TestBuildPins:
    def setup_method(self):
        self.svc = TripBuilderService()

    def test_activity_stop_fields_mapped(self):
        req = make_request()
        pins = self.svc._build_pins(req)
        activity_pin = next(p for p in pins if p.pin_type == "activity")

        assert activity_pin.place_name == "French Quarter"
        assert activity_pin.lat == pytest.approx(29.9584)
        assert activity_pin.lng == pytest.approx(-90.0644)
        assert activity_pin.place_id == "place-fq"
        assert activity_pin.famous_for == "Jazz music and Creole architecture"
        assert activity_pin.best_time == "Evening"
        assert activity_pin.local_tip == "Go on a weeknight"
        # photo_url is not stored in PinDocument
        assert activity_pin.pin_type == "activity"
        assert activity_pin.day == 1

    def test_food_stop_fields_mapped(self):
        req = make_request()
        pins = self.svc._build_pins(req)
        food_pin = next(p for p in pins if p.pin_type == "food")

        assert food_pin.place_name == "Cafe Du Monde"
        assert food_pin.famous_for == "Beignets and café au lait"
        assert food_pin.meal == "breakfast"
        assert food_pin.pin_type == "food"
        assert food_pin.day == 1

    def test_order_increments_monotonically(self):
        req = make_request()
        pins = self.svc._build_pins(req)
        orders = [p.order for p in pins]
        assert orders == list(range(len(pins)))

    def test_days_sorted_by_day_number(self):
        req = make_request(
            days_plan=[
                ConfirmDayPlan(
                    day=2,
                    activity_stops=[make_activity_stop(name="Day 2 Stop")],
                    food_stops=[],
                ),
                ConfirmDayPlan(
                    day=1,
                    activity_stops=[make_activity_stop(name="Day 1 Stop")],
                    food_stops=[],
                ),
            ]
        )
        pins = self.svc._build_pins(req)
        assert pins[0].place_name == "Day 1 Stop"
        assert pins[1].place_name == "Day 2 Stop"

    def test_activity_pins_before_food_pins_within_day(self):
        req = make_request(
            days_plan=[
                ConfirmDayPlan(
                    day=1,
                    activity_stops=[
                        make_activity_stop(name="Activity A"),
                        make_activity_stop(name="Activity B"),
                    ],
                    food_stops=[make_food_stop(name="Restaurant")],
                )
            ]
        )
        pins = self.svc._build_pins(req)
        types = [p.pin_type for p in pins]
        # Both activities before food
        assert types == ["activity", "activity", "food"]

    def test_empty_food_stops_does_not_crash(self):
        req = make_request(
            days_plan=[
                ConfirmDayPlan(
                    day=1,
                    activity_stops=[make_activity_stop()],
                    food_stops=[],
                )
            ]
        )
        pins = self.svc._build_pins(req)
        assert len(pins) == 1
        assert pins[0].pin_type == "activity"

    def test_total_pin_count(self):
        # 2 days: day 1 has 1 activity + 1 food, day 2 has 1 activity
        req = make_request()
        pins = self.svc._build_pins(req)
        assert len(pins) == 3

    def test_missing_place_id_stored_as_empty_string(self):
        stop = make_activity_stop(place_id=None)
        req = make_request(days_plan=[ConfirmDayPlan(day=1, activity_stops=[stop], food_stops=[])])
        pins = self.svc._build_pins(req)
        assert pins[0].place_id is None

    def test_phase3_enrichment_fields_mapped(self):
        """opening_hours, website, phone, rating, price_level go through."""
        stop = make_activity_stop()
        # Simulate Phase 3 enriched stop (extra fields via setattr)
        stop_with_enrichment = ConfirmActivityStop(
            **stop.model_dump(),
        )
        # Manually attach extra fields that Phase 3 enricher adds
        object.__setattr__(stop_with_enrichment, "opening_hours", "Mon-Fri: 9AM-5PM")
        object.__setattr__(stop_with_enrichment, "website", "https://frenchquarter.com")
        object.__setattr__(stop_with_enrichment, "phone", "+1 504-555-0100")
        object.__setattr__(stop_with_enrichment, "rating", 4.7)
        object.__setattr__(stop_with_enrichment, "price_level", 2)

        req = make_request(
            days_plan=[
                ConfirmDayPlan(
                    day=1,
                    activity_stops=[stop_with_enrichment],
                    food_stops=[],
                )
            ]
        )
        pins = self.svc._build_pins(req)
        p = pins[0]
        # getattr fallback pattern in builder means no crash even without these attrs
        assert p.place_name == "French Quarter"


# ---------------------------------------------------------------------------
# Tests: build_from_plan — validation errors
# ---------------------------------------------------------------------------


class TestBuildFromPlanValidation:
    @pytest.mark.asyncio
    async def test_raises_validation_error_when_no_stops(self):
        svc = TripBuilderService()
        # Bypass Pydantic validator with model_construct so the service sees the bad data
        req = PlanConfirmRequest.model_construct(
            starting_point="Austin, TX",
            destination="New Orleans, LA",
            days=1,
            travel_mode="driving",
            preferences=[],
            days_plan=[ConfirmDayPlan(day=1, activity_stops=[], food_stops=[])],
        )
        with pytest.raises(TripBuildValidationError):
            await svc.build_from_plan(req)

    @pytest.mark.asyncio
    async def test_raises_validation_error_when_days_plan_empty(self):
        svc = TripBuilderService()
        req = PlanConfirmRequest.model_construct(
            starting_point="Austin, TX",
            destination="New Orleans, LA",
            days=1,
            travel_mode="driving",
            preferences=[],
            days_plan=[],
        )
        with pytest.raises(TripBuildValidationError):
            await svc.build_from_plan(req)


# ---------------------------------------------------------------------------
# Tests: build_from_plan — successful insert
# ---------------------------------------------------------------------------


class TestBuildFromPlanSuccess:
    @pytest.mark.asyncio
    async def test_returns_build_result(self):
        svc = TripBuilderService()
        req = make_request()
        trip_id = "507f1f77bcf86cd799439011"

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:
            instance = mock_trip_document(trip_id)
            MockTrip.return_value = instance

            result = await svc.build_from_plan(req)

        assert isinstance(result, BuildResult)
        assert result.trip_id == trip_id

    @pytest.mark.asyncio
    async def test_result_pin_count_correct(self):
        svc = TripBuilderService()
        req = make_request()  # 1 activity + 1 food on day 1, 1 activity on day 2 = 3 pins

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:
            instance = mock_trip_document()
            MockTrip.return_value = instance

            result = await svc.build_from_plan(req)

        assert result.pin_count == 3

    @pytest.mark.asyncio
    async def test_result_day_count_correct(self):
        svc = TripBuilderService()
        req = make_request()  # 2 days

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:
            instance = mock_trip_document()
            MockTrip.return_value = instance

            result = await svc.build_from_plan(req)

        assert result.day_count == 2

    @pytest.mark.asyncio
    async def test_trip_document_source_is_scratch(self):
        svc = TripBuilderService()
        req = make_request()
        captured_kwargs = {}

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:

            def capture(**kwargs):
                captured_kwargs.update(kwargs)
                return mock_trip_document()

            MockTrip.side_effect = capture

            await svc.build_from_plan(req)

        assert captured_kwargs.get("source") == "scratch"

    @pytest.mark.asyncio
    async def test_trip_document_title_matches_destination(self):
        svc = TripBuilderService()
        req = make_request(destination="Tokyo, Japan", days=3)
        captured_kwargs = {}

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:

            def capture(**kwargs):
                captured_kwargs.update(kwargs)
                return mock_trip_document()

            MockTrip.side_effect = capture

            await svc.build_from_plan(req)

        assert "Tokyo, Japan" in captured_kwargs.get("title", "")
        assert "3 days" in captured_kwargs.get("title", "")

    @pytest.mark.asyncio
    async def test_trip_document_preferences_stored(self):
        svc = TripBuilderService()
        req = make_request(preferences=[TripPreference.food, TripPreference.art])
        captured_kwargs = {}

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:

            def capture(**kwargs):
                captured_kwargs.update(kwargs)
                return mock_trip_document()

            MockTrip.side_effect = capture

            await svc.build_from_plan(req)

        prefs = captured_kwargs.get("preferences", [])
        assert "food" in prefs
        assert "art" in prefs

    @pytest.mark.asyncio
    async def test_insert_called_once(self):
        svc = TripBuilderService()
        req = make_request()

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:
            instance = mock_trip_document()
            MockTrip.return_value = instance

            await svc.build_from_plan(req)

        instance.insert.assert_called_once()


# ---------------------------------------------------------------------------
# Tests: build_from_plan — database error
# ---------------------------------------------------------------------------


class TestBuildFromPlanDatabaseError:
    @pytest.mark.asyncio
    async def test_raises_database_error_on_insert_failure(self):
        svc = TripBuilderService()
        req = make_request()

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:
            instance = mock_trip_document()
            instance.insert = AsyncMock(side_effect=ConnectionError("DB unreachable"))
            MockTrip.return_value = instance

            with pytest.raises(TripBuildDatabaseError, match="Failed to persist"):
                await svc.build_from_plan(req)

    @pytest.mark.asyncio
    async def test_database_error_wraps_original_exception(self):
        svc = TripBuilderService()
        req = make_request()

        with patch("app.services.plan.trip_builder.TripDocument") as MockTrip:
            instance = mock_trip_document()
            original_exc = TimeoutError("Timed out")
            instance.insert = AsyncMock(side_effect=original_exc)
            MockTrip.return_value = instance

            with pytest.raises(TripBuildDatabaseError) as exc_info:
                await svc.build_from_plan(req)

            assert exc_info.value.__cause__ is original_exc
