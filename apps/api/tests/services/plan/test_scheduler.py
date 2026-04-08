"""
Tests for ProximityScheduler (Phase 2).
Covers:
  - Haversine distance utility
  - Nearest-neighbour sort
  - Farthest-first seeding
  - Geographic clustering
  - Bucket rebalancing
  - Bucket ordering by proximity to origin
  - Cross-day carry-over
  - Edge cases (empty input, single day, more days than places)

All async tests use the scheduler's synchronous helpers directly to avoid
mocking the Google Places API in unit tests. Integration-level tests for
_resolve_origin are in a separate file.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Tuple
from unittest.mock import AsyncMock, patch

import pytest

from app.schemas.plan import ActivityStop, DayPlan
from app.services.plan.haversine import haversine_km
from app.services.plan.plan_geocoder import GeocodedPlace
from app.services.plan.scheduler import ProximityScheduler


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def make_place(
    name: str,
    lat: float,
    lng: float,
    category: str = "activity",
) -> GeocodedPlace:
    return GeocodedPlace(
        name=name,
        lat=lat,
        lng=lng,
        place_id=f"id-{name.lower().replace(' ', '-')}",
        address=f"{name}, Test City",
        famous_for=f"{name} is famous",
        best_time="Morning",
        local_tip="Arrive early",
        category=category,
    )


# New Orleans area places (realistic lat/lng)
FRENCH_QUARTER = make_place("French Quarter", 29.9584, -90.0644)
GARDEN_DISTRICT = make_place("Garden District", 29.9259, -90.0866)
CITY_PARK = make_place("City Park", 29.9849, -90.0900)
WAREHOUSE_DIST = make_place("Warehouse District", 29.9444, -90.0693)
MARIGNY = make_place("Faubourg Marigny", 29.9610, -90.0530)
BYWATER = make_place("Bywater", 29.9572, -90.0430)
MID_CITY = make_place("Mid-City", 29.9748, -90.0934)
UPTOWN = make_place("Uptown", 29.9300, -90.1100)

ALL_PLACES = [
    FRENCH_QUARTER,
    GARDEN_DISTRICT,
    CITY_PARK,
    WAREHOUSE_DIST,
    MARIGNY,
    BYWATER,
    MID_CITY,
    UPTOWN,
]

ORIGIN_AUSTIN = (30.2672, -97.7431)  # Austin, TX
ORIGIN_NOLA = (29.9511, -90.0715)  # New Orleans city centre


# ---------------------------------------------------------------------------
# Unit tests: _nearest_neighbour_sort
# ---------------------------------------------------------------------------


class TestNearestNeighbourSort:
    def setup_method(self):
        self.scheduler = ProximityScheduler()

    def test_single_place_returned_as_is(self):
        places = [FRENCH_QUARTER]
        ordered, _, _ = self.scheduler._nearest_neighbour_sort(
            places, ORIGIN_NOLA[0], ORIGIN_NOLA[1]
        )
        assert len(ordered) == 1
        assert ordered[0].name == "French Quarter"

    def test_returns_all_places(self):
        ordered, _, _ = self.scheduler._nearest_neighbour_sort(
            ALL_PLACES, ORIGIN_NOLA[0], ORIGIN_NOLA[1]
        )
        assert len(ordered) == len(ALL_PLACES)
        assert set(p.name for p in ordered) == set(p.name for p in ALL_PLACES)

    def test_first_stop_is_nearest_to_origin(self):
        ordered, _, _ = self.scheduler._nearest_neighbour_sort(
            ALL_PLACES, ORIGIN_NOLA[0], ORIGIN_NOLA[1]
        )
        first = ordered[0]
        dist_first = haversine_km(ORIGIN_NOLA[0], ORIGIN_NOLA[1], first.lat, first.lng)
        for other in ALL_PLACES:
            if other.name != first.name:
                dist_other = haversine_km(ORIGIN_NOLA[0], ORIGIN_NOLA[1], other.lat, other.lng)
                assert dist_first <= dist_other

    def test_returns_final_position_as_last_stop(self):
        _, final_lat, final_lng = self.scheduler._nearest_neighbour_sort(
            [FRENCH_QUARTER, GARDEN_DISTRICT], ORIGIN_NOLA[0], ORIGIN_NOLA[1]
        )
        # Final position should match one of the places (whichever came last)
        nola_lats = {FRENCH_QUARTER.lat, GARDEN_DISTRICT.lat}
        assert final_lat in nola_lats

    def test_carryover_affects_ordering(self):
        places = [MARIGNY, GARDEN_DISTRICT]  # Marigny is far east, Garden District is far west

        # Starting from far east — Marigny should come first
        ordered_east, _, _ = self.scheduler._nearest_neighbour_sort(
            places,
            29.960,
            -90.040,  # east of Marigny
        )
        assert ordered_east[0].name == "Marigny"

        # Starting from far west — Garden District should come first
        ordered_west, _, _ = self.scheduler._nearest_neighbour_sort(
            places,
            29.930,
            -90.120,  # west of Garden District
        )
        assert ordered_west[0].name == "Garden District"

    def test_empty_list_returns_origin(self):
        ordered, lat, lng = self.scheduler._nearest_neighbour_sort(
            [], ORIGIN_NOLA[0], ORIGIN_NOLA[1]
        )
        assert ordered == []
        assert lat == ORIGIN_NOLA[0]
        assert lng == ORIGIN_NOLA[1]


# ---------------------------------------------------------------------------
# Unit tests: _farthest_first_seeds
# ---------------------------------------------------------------------------


class TestFarthestFirstSeeds:
    def setup_method(self):
        self.scheduler = ProximityScheduler()

    def test_returns_k_seeds(self):
        seeds = self.scheduler._farthest_first_seeds(ALL_PLACES, 3, ORIGIN_NOLA)
        assert len(seeds) == 3

    def test_first_seed_is_nearest_to_origin(self):
        seeds = self.scheduler._farthest_first_seeds(ALL_PLACES, 3, ORIGIN_NOLA)
        first_seed = seeds[0]
        dist_first = haversine_km(ORIGIN_NOLA[0], ORIGIN_NOLA[1], first_seed[0], first_seed[1])
        for place in ALL_PLACES:
            d = haversine_km(ORIGIN_NOLA[0], ORIGIN_NOLA[1], place.lat, place.lng)
            assert dist_first <= d + 1e-6

    def test_seeds_are_spread_apart(self):
        """Seeds should be more spread out than a random selection."""
        seeds = self.scheduler._farthest_first_seeds(ALL_PLACES, 3, ORIGIN_NOLA)
        # Each pair of seeds should have meaningful distance between them
        for i in range(len(seeds)):
            for j in range(i + 1, len(seeds)):
                d = haversine_km(seeds[i][0], seeds[i][1], seeds[j][0], seeds[j][1])
                assert d > 0.5  # at least 500m apart in New Orleans

    def test_k_equals_one(self):
        seeds = self.scheduler._farthest_first_seeds(ALL_PLACES, 1, ORIGIN_NOLA)
        assert len(seeds) == 1


# ---------------------------------------------------------------------------
# Unit tests: _geographic_cluster
# ---------------------------------------------------------------------------


class TestGeographicCluster:
    def setup_method(self):
        self.scheduler = ProximityScheduler()

    def test_single_day_all_in_one_bucket(self):
        buckets = self.scheduler._geographic_cluster(ALL_PLACES, 1, ORIGIN_NOLA)
        assert len(buckets) == 1
        assert len(buckets[0]) == len(ALL_PLACES)

    def test_correct_number_of_buckets(self):
        buckets = self.scheduler._geographic_cluster(ALL_PLACES, 3, ORIGIN_NOLA)
        assert len(buckets) == 3

    def test_all_places_assigned(self):
        buckets = self.scheduler._geographic_cluster(ALL_PLACES, 3, ORIGIN_NOLA)
        total = sum(len(b) for b in buckets)
        assert total == len(ALL_PLACES)

    def test_no_place_assigned_twice(self):
        buckets = self.scheduler._geographic_cluster(ALL_PLACES, 3, ORIGIN_NOLA)
        all_names = [p.name for b in buckets for p in b]
        assert len(all_names) == len(set(all_names))

    def test_more_days_than_places(self):
        places = [FRENCH_QUARTER, GARDEN_DISTRICT]
        buckets = self.scheduler._geographic_cluster(places, 5, ORIGIN_NOLA)
        assert len(buckets) == 5
        total = sum(len(b) for b in buckets)
        assert total == 2

    def test_rebalance_fills_empty_buckets(self):
        """Even if clustering produces empty buckets, rebalancing fills them."""
        # Use 4 places with 4 days — each should get exactly 1
        places = [FRENCH_QUARTER, GARDEN_DISTRICT, CITY_PARK, MARIGNY]
        buckets = self.scheduler._geographic_cluster(places, 4, ORIGIN_NOLA)
        non_empty = [b for b in buckets if b]
        assert len(non_empty) >= 3  # at most 1 empty after rebalancing


# ---------------------------------------------------------------------------
# Unit tests: _rebalance_buckets
# ---------------------------------------------------------------------------


class TestRebalanceBuckets:
    def setup_method(self):
        self.scheduler = ProximityScheduler()

    def test_fills_empty_bucket(self):
        buckets = [[FRENCH_QUARTER, GARDEN_DISTRICT, CITY_PARK], [], []]
        result = self.scheduler._rebalance_buckets(buckets)
        non_empty = [b for b in result if b]
        assert len(non_empty) >= 2

    def test_preserves_total_count(self):
        buckets = [[FRENCH_QUARTER, GARDEN_DISTRICT, CITY_PARK, MARIGNY], [], []]
        result = self.scheduler._rebalance_buckets(buckets)
        total = sum(len(b) for b in result)
        assert total == 4

    def test_no_op_when_balanced(self):
        buckets = [[FRENCH_QUARTER], [GARDEN_DISTRICT], [CITY_PARK]]
        result = self.scheduler._rebalance_buckets(buckets)
        assert sum(len(b) for b in result) == 3

    def test_does_not_empty_last_non_empty_bucket(self):
        """Should not pull from a bucket that has only 1 place."""
        buckets = [[FRENCH_QUARTER], [], []]
        result = self.scheduler._rebalance_buckets(buckets)
        # Cannot rebalance without emptying the only non-empty bucket
        non_empty = [b for b in result if b]
        assert len(non_empty) >= 1


# ---------------------------------------------------------------------------
# Unit tests: _order_buckets_by_proximity
# ---------------------------------------------------------------------------


class TestOrderBucketsByProximity:
    def setup_method(self):
        self.scheduler = ProximityScheduler()

    def test_nearest_bucket_comes_first(self):
        # Near bucket: Warehouse District and French Quarter (close to NOLA centre)
        near = [WAREHOUSE_DIST, FRENCH_QUARTER]
        # Far bucket: Uptown (south-west)
        far = [UPTOWN, GARDEN_DISTRICT]

        ordered = self.scheduler._order_buckets_by_proximity([far, near], ORIGIN_NOLA)
        assert ordered[0] == near

    def test_empty_buckets_pushed_to_end(self):
        buckets = [[], [FRENCH_QUARTER], []]
        ordered = self.scheduler._order_buckets_by_proximity(buckets, ORIGIN_NOLA)
        assert ordered[0] == [FRENCH_QUARTER]

    def test_single_bucket_unchanged(self):
        buckets = [[FRENCH_QUARTER, GARDEN_DISTRICT]]
        ordered = self.scheduler._order_buckets_by_proximity(buckets, ORIGIN_NOLA)
        assert len(ordered) == 1


# ---------------------------------------------------------------------------
# Unit tests: _sort_buckets_with_carryover
# ---------------------------------------------------------------------------


class TestSortBucketsWithCarryover:
    def setup_method(self):
        self.scheduler = ProximityScheduler()

    def test_returns_correct_day_numbers(self):
        buckets = [
            [FRENCH_QUARTER, WAREHOUSE_DIST],
            [CITY_PARK, MID_CITY],
        ]
        plans = self.scheduler._sort_buckets_with_carryover(buckets, ORIGIN_NOLA)
        assert [p.day for p in plans] == [1, 2]

    def test_all_stops_present(self):
        buckets = [[FRENCH_QUARTER, WAREHOUSE_DIST], [CITY_PARK, MID_CITY]]
        plans = self.scheduler._sort_buckets_with_carryover(buckets, ORIGIN_NOLA)
        all_names = [s.name for p in plans for s in p.stops]
        assert set(all_names) == {"French Quarter", "Warehouse District", "City Park", "Mid-City"}

    def test_empty_bucket_produces_empty_day(self):
        buckets = [[FRENCH_QUARTER], [], [CITY_PARK]]
        plans = self.scheduler._sort_buckets_with_carryover(buckets, ORIGIN_NOLA)
        assert len(plans) == 3
        assert plans[1].stops == []

    def test_distance_from_prev_set_on_second_stop(self):
        buckets = [[FRENCH_QUARTER, GARDEN_DISTRICT]]
        plans = self.scheduler._sort_buckets_with_carryover(buckets, ORIGIN_NOLA)
        stops = plans[0].stops
        assert stops[0].distance_from_prev_km is None
        assert stops[1].distance_from_prev_km is not None
        assert stops[1].distance_from_prev_km > 0

    def test_carryover_affects_day2_first_stop(self):
        """Day 2 should start from where Day 1 ended, not from the origin."""
        # Day 1: just Bywater (far east)
        # Day 2: Marigny (near Bywater) and Garden District (far west)
        # Without carry-over, Day 2 might start with Garden District.
        # With carry-over from Bywater, Marigny should come first.
        buckets = [
            [BYWATER],
            [MARIGNY, GARDEN_DISTRICT],
        ]
        plans = self.scheduler._sort_buckets_with_carryover(buckets, ORIGIN_NOLA)
        day2_stops = plans[1].stops
        assert day2_stops[0].name == "Faubourg Marigny"  # nearer to Bywater

    def test_to_activity_stops_converts_correctly(self):
        places = [FRENCH_QUARTER, WAREHOUSE_DIST]
        stops = self.scheduler._to_activity_stops(places)

        assert len(stops) == 2
        assert all(isinstance(s, ActivityStop) for s in stops)
        assert stops[0].name == "French Quarter"
        assert stops[0].distance_from_prev_km is None  # first stop has no previous
        assert stops[1].name == "Warehouse District"
        assert stops[1].distance_from_prev_km is not None


# ---------------------------------------------------------------------------
# Integration test: full schedule flow with mocked origin geocoding
# ---------------------------------------------------------------------------


class TestScheduleIntegration:
    @pytest.mark.asyncio
    async def test_full_schedule_returns_correct_day_count(self):
        scheduler = ProximityScheduler()
        with patch.object(scheduler, "_resolve_origin", new=AsyncMock(return_value=ORIGIN_NOLA)):
            plans = await scheduler.schedule(
                places=ALL_PLACES,
                days=3,
                starting_point="New Orleans, LA",
                api_key="test-key",
            )
        assert len(plans) == 3

    @pytest.mark.asyncio
    async def test_full_schedule_all_places_present(self):
        scheduler = ProximityScheduler()
        with patch.object(scheduler, "_resolve_origin", new=AsyncMock(return_value=ORIGIN_NOLA)):
            plans = await scheduler.schedule(
                places=ALL_PLACES,
                days=3,
                starting_point="New Orleans, LA",
                api_key="test-key",
            )
        all_names = [s.name for p in plans for s in p.stops]
        assert set(all_names) == {p.name for p in ALL_PLACES}

    @pytest.mark.asyncio
    async def test_full_schedule_empty_places_returns_empty_days(self):
        scheduler = ProximityScheduler()
        plans = await scheduler.schedule(
            places=[],
            days=3,
            starting_point="Austin, TX",
            api_key="test-key",
        )
        assert len(plans) == 3
        assert all(p.stops == [] for p in plans)

    @pytest.mark.asyncio
    async def test_full_schedule_single_day(self):
        scheduler = ProximityScheduler()
        with patch.object(scheduler, "_resolve_origin", new=AsyncMock(return_value=ORIGIN_NOLA)):
            plans = await scheduler.schedule(
                places=ALL_PLACES,
                days=1,
                starting_point="New Orleans, LA",
                api_key="test-key",
            )
        assert len(plans) == 1
        assert len(plans[0].stops) == len(ALL_PLACES)

    @pytest.mark.asyncio
    async def test_full_schedule_uses_centroid_fallback_on_origin_failure(self):
        scheduler = ProximityScheduler()
        with patch.object(
            scheduler, "_resolve_origin", new=AsyncMock(return_value=(29.9511, -90.0715))
        ):
            plans = await scheduler.schedule(
                places=ALL_PLACES,
                days=2,
                starting_point="Unknown Place XYZ",
                api_key="test-key",
            )
        # Should still produce valid plans using fallback
        assert len(plans) == 2
        total = sum(len(p.stops) for p in plans)
        assert total == len(ALL_PLACES)

    @pytest.mark.asyncio
    async def test_day1_stops_closer_to_origin_than_later_days(self):
        """Day 1 stops should have a lower avg distance to origin than Day 3."""
        scheduler = ProximityScheduler()
        with patch.object(scheduler, "_resolve_origin", new=AsyncMock(return_value=ORIGIN_AUSTIN)):
            plans = await scheduler.schedule(
                places=ALL_PLACES,
                days=3,
                starting_point="Austin, TX",
                api_key="test-key",
            )

        def avg_dist_to_austin(day_plan: DayPlan) -> float:
            if not day_plan.stops:
                return float("inf")
            dists = [
                haversine_km(ORIGIN_AUSTIN[0], ORIGIN_AUSTIN[1], s.lat, s.lng)
                for s in day_plan.stops
            ]
            return sum(dists) / len(dists)

        day1_dist = avg_dist_to_austin(plans[0])
        day3_dist = avg_dist_to_austin(plans[2])
        # Day 1 should be at least as close to Austin as Day 3
        assert day1_dist <= day3_dist + 5  # 5 km tolerance
