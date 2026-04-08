"""
Tests for FoodInjectorService (Phase 3).
Covers:
  - Anchor selection (breakfast/lunch/dinner positions)
  - True geographic midpoint for lunch anchor
  - Deduplication of identical anchors
  - Places API param correctness (rankby vs radius)
  - Radius expansion fallback
  - known_for enrichment
  - Interleave ordering
  - Graceful degradation on API failure
  - Edge cases: 1 stop, 2 stops, empty day
"""

from __future__ import annotations

import json
from typing import List, Optional
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import respx

from app.schemas.plan import ActivityStop, DayPlan, FoodStop, RestaurantOption
from app.services.plan.food_injector import (
    FoodInjectorService,
    MealAnchor,
    INITIAL_RADIUS_M,
    MAX_FOOD_OPTIONS,
)

NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_stop(name: str, lat: float, lng: float) -> ActivityStop:
    return ActivityStop(
        name=name,
        lat=lat,
        lng=lng,
        place_id=f"id-{name}",
        address=f"{name} St",
        famous_for=f"{name} is great",
    )


def nearby_response(count: int = 3, has_editorial: bool = False) -> dict:
    results = []
    for i in range(count):
        r: dict = {
            "name": f"Restaurant {i+1}",
            "place_id": f"place-{i+1}",
            "vicinity": f"{i+1} Food St",
            "geometry": {"location": {"lat": 29.95 + i * 0.001, "lng": -90.06}},
            "rating": 4.0 + i * 0.1,
            "price_level": 2,
            "photos": [{"photo_reference": f"ref{i+1}"}],
            "types": ["restaurant", "food"],
        }
        if has_editorial:
            r["editorial_summary"] = {"overview": f"Famous for dish {i+1}"}
        results.append(r)
    return {"results": results, "status": "OK"}


STOPS_4 = [
    make_stop("A", 29.958, -90.064),
    make_stop("B", 29.960, -90.060),
    make_stop("C", 29.925, -90.086),
    make_stop("D", 29.930, -90.090),
]

STOPS_1 = [make_stop("Solo", 29.958, -90.064)]
STOPS_2 = [make_stop("X", 29.958, -90.064), make_stop("Y", 29.930, -90.086)]


# ---------------------------------------------------------------------------
# Unit tests: _build_meal_anchors
# ---------------------------------------------------------------------------


class TestBuildMealAnchors:
    def setup_method(self):
        self.svc = FoodInjectorService(api_key="test-key")

    def test_returns_three_anchors(self):
        anchors = self.svc._build_meal_anchors(STOPS_4)
        assert len(anchors) == 3
        meals = {a.meal for a in anchors}
        assert meals == {"breakfast", "lunch", "dinner"}

    def test_breakfast_anchor_is_first_stop(self):
        anchors = self.svc._build_meal_anchors(STOPS_4)
        bfast = next(a for a in anchors if a.meal == "breakfast")
        assert bfast.lat == pytest.approx(STOPS_4[0].lat)
        assert bfast.lng == pytest.approx(STOPS_4[0].lng)

    def test_dinner_anchor_is_last_stop(self):
        anchors = self.svc._build_meal_anchors(STOPS_4)
        dinner = next(a for a in anchors if a.meal == "dinner")
        assert dinner.lat == pytest.approx(STOPS_4[-1].lat)
        assert dinner.lng == pytest.approx(STOPS_4[-1].lng)

    def test_lunch_anchor_is_true_midpoint(self):
        """Lunch should be the geographic midpoint between stops at split-1 and split."""
        anchors = self.svc._build_meal_anchors(STOPS_4)
        lunch = next(a for a in anchors if a.meal == "lunch")
        n = len(STOPS_4)
        split = max(1, n // 2)
        expected_lat = (STOPS_4[split - 1].lat + STOPS_4[split].lat) / 2
        expected_lng = (STOPS_4[split - 1].lng + STOPS_4[split].lng) / 2
        assert lunch.lat == pytest.approx(expected_lat)
        assert lunch.lng == pytest.approx(expected_lng)

    def test_single_stop_all_anchors_same_coords(self):
        anchors = self.svc._build_meal_anchors(STOPS_1)
        lats = {a.lat for a in anchors}
        lngs = {a.lng for a in anchors}
        assert len(lats) == 1
        assert len(lngs) == 1

    def test_two_stops_lunch_is_midpoint(self):
        anchors = self.svc._build_meal_anchors(STOPS_2)
        lunch = next(a for a in anchors if a.meal == "lunch")
        expected_lat = (STOPS_2[0].lat + STOPS_2[1].lat) / 2
        assert lunch.lat == pytest.approx(expected_lat)


# ---------------------------------------------------------------------------
# Unit tests: _deduplicate_anchors
# ---------------------------------------------------------------------------


class TestDeduplicateAnchors:
    def setup_method(self):
        self.svc = FoodInjectorService(api_key="test-key")

    def test_deduplicates_identical_coords(self):
        anchors = [
            MealAnchor(meal="breakfast", lat=1.0, lng=2.0, anchor_key="1.0,2.0"),
            MealAnchor(meal="lunch", lat=1.0, lng=2.0, anchor_key="1.0,2.0"),
            MealAnchor(meal="dinner", lat=3.0, lng=4.0, anchor_key="3.0,4.0"),
        ]
        unique = self.svc._deduplicate_anchors(anchors)
        assert len(unique) == 2

    def test_keeps_all_distinct_coords(self):
        anchors = [
            MealAnchor(meal="breakfast", lat=1.0, lng=2.0, anchor_key="1.0,2.0"),
            MealAnchor(meal="lunch", lat=3.0, lng=4.0, anchor_key="3.0,4.0"),
            MealAnchor(meal="dinner", lat=5.0, lng=6.0, anchor_key="5.0,6.0"),
        ]
        unique = self.svc._deduplicate_anchors(anchors)
        assert len(unique) == 3

    def test_preserves_first_occurrence(self):
        anchors = [
            MealAnchor(meal="breakfast", lat=1.0, lng=2.0, anchor_key="1.0,2.0"),
            MealAnchor(meal="lunch", lat=1.0, lng=2.0, anchor_key="1.0,2.0"),
        ]
        unique = self.svc._deduplicate_anchors(anchors)
        assert unique[0].meal == "breakfast"


# ---------------------------------------------------------------------------
# Unit tests: _coord_key
# ---------------------------------------------------------------------------


class TestCoordKey:
    def test_rounds_to_3_decimal_places(self):
        key = FoodInjectorService._coord_key(29.95849, -90.06441)
        assert key == "29.958,-90.064"

    def test_same_rounded_coords_produce_same_key(self):
        k1 = FoodInjectorService._coord_key(29.9584, -90.0644)
        k2 = FoodInjectorService._coord_key(29.9585, -90.0644)
        assert k1 == k2  # round to 3 dp → same


# ---------------------------------------------------------------------------
# Unit tests: _interleave
# ---------------------------------------------------------------------------


class TestInterleave:
    def setup_method(self):
        self.svc = FoodInjectorService(api_key="test-key")

    def _make_food(self, meal: str) -> FoodStop:
        return FoodStop(meal=meal, options=[])  # type: ignore[arg-type]

    def test_full_three_meal_interleave(self):
        stops = STOPS_4
        food = {
            "breakfast": self._make_food("breakfast"),
            "lunch": self._make_food("lunch"),
            "dinner": self._make_food("dinner"),
        }
        result = self.svc._interleave(stops, food)
        types = [s.type if isinstance(s, ActivityStop) else s.type for s in result]
        # breakfast, activity, activity, lunch, activity, activity, dinner
        assert result[0].type == "food"  # breakfast
        assert result[-1].type == "food"  # dinner
        food_indices = [i for i, s in enumerate(result) if s.type == "food"]
        assert len(food_indices) == 3

    def test_lunch_is_between_morning_and_afternoon_stops(self):
        stops = STOPS_4  # 4 stops, split=2
        food = {"lunch": self._make_food("lunch")}
        result = self.svc._interleave(stops, food)
        lunch_idx = next(i for i, s in enumerate(result) if s.type == "food")
        # Lunch should be at index 2 (after 2 morning stops)
        assert lunch_idx == 2

    def test_missing_meals_are_skipped(self):
        stops = STOPS_4
        result = self.svc._interleave(stops, {})
        assert all(isinstance(s, ActivityStop) for s in result)
        assert len(result) == len(stops)

    def test_single_stop_interleave(self):
        food = {
            "breakfast": self._make_food("breakfast"),
            "lunch": self._make_food("lunch"),
            "dinner": self._make_food("dinner"),
        }
        result = self.svc._interleave(STOPS_1, food)
        food_count = sum(1 for s in result if s.type == "food")
        assert food_count == 3
        activity_count = sum(1 for s in result if isinstance(s, ActivityStop))
        assert activity_count == 1


# ---------------------------------------------------------------------------
# Unit tests: _to_restaurant_option
# ---------------------------------------------------------------------------


class TestToRestaurantOption:
    def setup_method(self):
        self.svc = FoodInjectorService(api_key="test-key")

    def _raw(self, **overrides) -> dict:
        base = {
            "name": "Cafe Du Monde",
            "place_id": "place-123",
            "vicinity": "800 Decatur St",
            "geometry": {"location": {"lat": 29.9575, "lng": -90.0614}},
            "rating": 4.5,
            "price_level": 1,
            "photos": [{"photo_reference": "ref-abc"}],
            "types": ["cafe", "food"],
        }
        base.update(overrides)
        return base

    def test_basic_mapping(self):
        opt = self.svc._to_restaurant_option(self._raw())
        assert opt.name == "Cafe Du Monde"
        assert opt.place_id == "place-123"
        assert opt.rating == pytest.approx(4.5)
        assert opt.price_level == 1

    def test_photo_url_built_from_reference(self):
        opt = self.svc._to_restaurant_option(self._raw())
        assert opt.photo_url is not None
        assert "ref-abc" in opt.photo_url
        assert "test-key" in opt.photo_url

    def test_no_photo_returns_none(self):
        raw = self._raw()
        raw.pop("photos")
        opt = self.svc._to_restaurant_option(raw)
        assert opt.photo_url is None

    def test_editorial_summary_used_as_known_for(self):
        raw = self._raw()
        raw["editorial_summary"] = {"overview": "Famous for beignets and café au lait"}
        opt = self.svc._to_restaurant_option(raw)
        assert opt.known_for == "Famous for beignets and café au lait"

    def test_type_fallback_when_no_editorial(self):
        opt = self.svc._to_restaurant_option(self._raw())
        # types[0] = "cafe" → title case "Cafe"
        assert opt.known_for == "Cafe"

    def test_coords_parsed_as_floats(self):
        opt = self.svc._to_restaurant_option(self._raw())
        assert isinstance(opt.lat, float)
        assert isinstance(opt.lng, float)


# ---------------------------------------------------------------------------
# Integration tests: _search_nearby Places API params
# ---------------------------------------------------------------------------


class TestSearchNearbyParams:
    @pytest.mark.asyncio
    @respx.mock
    async def test_initial_search_uses_rankby_distance_no_radius(self):
        captured_params = {}

        def capture(request):
            captured_params.update(dict(request.url.params))
            return httpx.Response(200, json=nearby_response())

        respx.get(NEARBY_URL).mock(side_effect=capture)
        svc = FoodInjectorService(api_key="test-key")
        semaphore = __import__("asyncio").Semaphore(5)
        await svc._search_nearby(29.95, -90.06, "breakfast", INITIAL_RADIUS_M, semaphore)
        await svc.aclose()

        assert captured_params.get("rankby") == "distance"
        assert "radius" not in captured_params

    @pytest.mark.asyncio
    @respx.mock
    async def test_expanded_search_uses_radius_no_rankby(self):
        captured_params = {}

        def capture(request):
            captured_params.update(dict(request.url.params))
            return httpx.Response(200, json=nearby_response())

        respx.get(NEARBY_URL).mock(side_effect=capture)
        svc = FoodInjectorService(api_key="test-key")
        semaphore = __import__("asyncio").Semaphore(5)
        await svc._search_nearby(29.95, -90.06, "lunch", 2000, semaphore)  # non-initial radius
        await svc.aclose()

        assert "rankby" not in captured_params
        assert captured_params.get("radius") == "2000"

    @pytest.mark.asyncio
    @respx.mock
    async def test_returns_max_food_options(self):
        respx.get(NEARBY_URL).mock(return_value=httpx.Response(200, json=nearby_response(5)))
        svc = FoodInjectorService(api_key="test-key")
        semaphore = __import__("asyncio").Semaphore(5)
        options = await svc._search_nearby(29.95, -90.06, "dinner", INITIAL_RADIUS_M, semaphore)
        await svc.aclose()
        assert len(options) == MAX_FOOD_OPTIONS


# ---------------------------------------------------------------------------
# Integration tests: _fetch_with_fallback radius expansion
# ---------------------------------------------------------------------------


class TestFetchWithFallback:
    @pytest.mark.asyncio
    @respx.mock
    async def test_no_expansion_when_results_found(self):
        call_count = 0

        def handler(request):
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json=nearby_response(3))

        respx.get(NEARBY_URL).mock(side_effect=handler)
        svc = FoodInjectorService(api_key="test-key")
        semaphore = __import__("asyncio").Semaphore(5)
        result = await svc._fetch_with_fallback(29.95, -90.06, "breakfast", semaphore)
        await svc.aclose()

        assert call_count == 1
        assert isinstance(result, FoodStop)
        assert len(result.options) == 3

    @pytest.mark.asyncio
    @respx.mock
    async def test_expands_radius_when_empty_results(self):
        call_count = 0

        def handler(request):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return httpx.Response(200, json=nearby_response(0))
            return httpx.Response(200, json=nearby_response(2))

        respx.get(NEARBY_URL).mock(side_effect=handler)
        svc = FoodInjectorService(api_key="test-key")
        semaphore = __import__("asyncio").Semaphore(5)
        result = await svc._fetch_with_fallback(29.95, -90.06, "lunch", semaphore)
        await svc.aclose()

        assert call_count == 2  # initial + one expansion
        assert len(result.options) == 2

    @pytest.mark.asyncio
    @respx.mock
    async def test_returns_best_available_after_max_retries(self):
        respx.get(NEARBY_URL).mock(return_value=httpx.Response(200, json=nearby_response(0)))
        svc = FoodInjectorService(api_key="test-key")
        semaphore = __import__("asyncio").Semaphore(5)
        result = await svc._fetch_with_fallback(29.95, -90.06, "dinner", semaphore)
        await svc.aclose()

        assert isinstance(result, FoodStop)
        assert result.options == []


# ---------------------------------------------------------------------------
# Integration tests: full inject
# ---------------------------------------------------------------------------


class TestInjectFull:
    @pytest.mark.asyncio
    @respx.mock
    async def test_inject_adds_three_food_stops_per_day(self):
        respx.get(NEARBY_URL).mock(return_value=httpx.Response(200, json=nearby_response()))
        svc = FoodInjectorService(api_key="test-key")
        day = DayPlan(day=1, stops=list(STOPS_4))
        result = await svc.inject([day], "New Orleans, LA")
        await svc.aclose()

        food_stops = [s for s in result[0].stops if s.type == "food"]
        assert len(food_stops) == 3

    @pytest.mark.asyncio
    @respx.mock
    async def test_inject_preserves_all_activity_stops(self):
        respx.get(NEARBY_URL).mock(return_value=httpx.Response(200, json=nearby_response()))
        svc = FoodInjectorService(api_key="test-key")
        day = DayPlan(day=1, stops=list(STOPS_4))
        result = await svc.inject([day], "New Orleans, LA")
        await svc.aclose()

        activity_names = [s.name for s in result[0].stops if isinstance(s, ActivityStop)]
        assert set(activity_names) == {s.name for s in STOPS_4}

    @pytest.mark.asyncio
    async def test_inject_empty_day_returns_unchanged(self):
        svc = FoodInjectorService(api_key="test-key")
        empty_day = DayPlan(day=1, stops=[])
        result = await svc.inject([empty_day], "New Orleans, LA")
        await svc.aclose()
        assert result[0].stops == []

    @pytest.mark.asyncio
    @respx.mock
    async def test_inject_single_stop_deduplicates_searches(self):
        call_count = 0

        def handler(request):
            nonlocal call_count
            call_count += 1
            return httpx.Response(200, json=nearby_response())

        respx.get(NEARBY_URL).mock(side_effect=handler)
        svc = FoodInjectorService(api_key="test-key")
        day = DayPlan(day=1, stops=list(STOPS_1))
        await svc.inject([day], "New Orleans, LA")
        await svc.aclose()

        # 1 stop → breakfast/lunch/dinner all same anchor key → only 1 API call
        assert call_count == 1

    @pytest.mark.asyncio
    @respx.mock
    async def test_inject_continues_on_api_failure(self):
        """A Places API failure on one day should not crash the other days."""
        call_count = 0

        def handler(request):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise httpx.ConnectError("Connection refused")
            return httpx.Response(200, json=nearby_response())

        respx.get(NEARBY_URL).mock(side_effect=handler)
        svc = FoodInjectorService(api_key="test-key")
        day1 = DayPlan(day=1, stops=list(STOPS_4))
        day2 = DayPlan(day=2, stops=list(STOPS_2))
        result = await svc.inject([day1, day2], "New Orleans, LA")
        await svc.aclose()

        # Both days should be present
        assert len(result) == 2
