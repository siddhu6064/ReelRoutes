"""
tests/services/test_gap_features.py

Tests for the three high-priority competitor gap features:
  1. Video deep link generation (timestamp URL builder)
  2. Day-by-day itinerary generation (geo sort + day splitting)
  3. Route optimisation (nearest-neighbour TSP)
"""
from __future__ import annotations

import math
import pytest

from app.routers.trips import _video_deep_link
from app.services.itinerary_service import (
    _fallback_split,
    _geo_sort_pins,
    _haversine,
    generate_itinerary,
)
from app.services.route_service import (
    _nearest_neighbour,
    _total_distance,
    optimise_route,
)
from app.utils.seed import SeedFactory, make_pin
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401


# ── Feature 1: Video deep links ───────────────────────────────

class TestVideoDeepLink:
    def test_youtube_adds_timestamp(self):
        url = "https://www.youtube.com/watch?v=abc123"
        result = _video_deep_link(url, "youtube", 125.0)
        assert "t=125s" in result

    def test_youtube_short_url(self):
        url = "https://youtu.be/abc123"
        result = _video_deep_link(url, "youtube", 60.0)
        assert "t=60s" in result

    def test_youtube_no_timestamp_returns_base_url(self):
        url = "https://www.youtube.com/watch?v=abc123"
        result = _video_deep_link(url, "youtube", None)
        assert result == url

    def test_tiktok_returns_base_url(self):
        url = "https://www.tiktok.com/@user/video/123"
        result = _video_deep_link(url, "tiktok", 45.0)
        assert result == url  # TikTok has no public timestamp scheme

    def test_instagram_returns_base_url(self):
        url = "https://www.instagram.com/reel/abc/"
        result = _video_deep_link(url, "instagram", 30.0)
        assert result == url

    def test_none_source_url_returns_none(self):
        result = _video_deep_link(None, "youtube", 10.0)
        assert result is None

    def test_timestamp_truncated_to_int(self):
        url = "https://www.youtube.com/watch?v=abc"
        result = _video_deep_link(url, "youtube", 125.9)
        assert "t=125s" in result  # floored not rounded

    def test_existing_query_string_uses_ampersand(self):
        url = "https://www.youtube.com/watch?v=abc&list=PL123"
        result = _video_deep_link(url, "youtube", 30.0)
        assert "&t=30s" in result


# ── Feature 2: Itinerary generation ───────────────────────────

class TestHaversine:
    def test_same_point_zero(self):
        assert _haversine(51.5, -0.1, 51.5, -0.1) == pytest.approx(0.0)

    def test_london_to_paris_approx(self):
        dist = _haversine(51.5074, -0.1278, 48.8566, 2.3522)
        assert 340 < dist < 345  # ~342 km

    def test_symmetrical(self):
        d1 = _haversine(35.6762, 139.6503, 48.8566, 2.3522)
        d2 = _haversine(48.8566, 2.3522, 35.6762, 139.6503)
        assert d1 == pytest.approx(d2)


class TestGeoSort:
    def test_sorts_to_shorter_path(self):
        """Geo-sorted path should be shorter than original random order."""
        pins = [
            make_pin(order=0, lat=48.8566, lng=2.3522),   # Paris
            make_pin(order=1, lat=35.6762, lng=139.6503),  # Tokyo
            make_pin(order=2, lat=48.1351, lng=11.5820),   # Munich
            make_pin(order=3, lat=51.5074, lng=-0.1278),   # London
        ]

        class FakeTrip:
            def __init__(self): self.pins = pins

        sorted_pins = _geo_sort_pins(FakeTrip())
        original_dist = _total_distance(pins)
        sorted_dist = _total_distance(sorted_pins)
        # Sorted path should be shorter or equal to the random order
        assert sorted_dist <= original_dist

    def test_single_pin_unchanged(self):
        pins = [make_pin(order=0, lat=51.5, lng=-0.1)]

        class FakeTrip:
            def __init__(self): self.pins = pins

        result = _geo_sort_pins(FakeTrip())
        assert len(result) == 1


class TestFallbackSplit:
    def test_splits_evenly(self):
        pins = [make_pin(order=i) for i in range(6)]
        days = _fallback_split(pins, 3)
        assert len(days) == 3
        assert all(len(d.pin_ids) == 2 for d in days)

    def test_one_day_all_pins(self):
        pins = [make_pin(order=i) for i in range(5)]
        days = _fallback_split(pins, 1)
        assert len(days) == 1
        assert len(days[0].pin_ids) == 5

    def test_more_days_than_pins(self):
        pins = [make_pin(order=i) for i in range(2)]
        days = _fallback_split(pins, 5)
        assert len(days) == 2  # Only creates days that have pins

    def test_day_numbers_sequential(self):
        pins = [make_pin(order=i) for i in range(4)]
        days = _fallback_split(pins, 2)
        assert [d.day_number for d in days] == [1, 2]


@pytest.mark.asyncio
class TestGenerateItinerary:
    async def test_basic_itinerary_test_mode(self, beanie_init):
        """In test mode (no OpenAI key) falls back to deterministic split."""
        pins = [make_pin(order=i, lat=35.0 + i * 0.1, lng=139.0) for i in range(6)]
        trip = await SeedFactory.trip(pins=pins)
        days = await generate_itinerary(trip, 3)
        assert len(days) == 3
        total_pin_ids = [pid for d in days for pid in d.pin_ids]
        assert len(total_pin_ids) == 6

    async def test_raises_on_empty_trip(self, beanie_init):
        trip = await SeedFactory.trip(pins=[])
        with pytest.raises(Exception) as exc_info:
            await generate_itinerary(trip, 3)
        assert "no pins" in str(exc_info.value).lower()

    async def test_raises_on_invalid_days(self, beanie_init):
        trip = await SeedFactory.trip(pins=[make_pin(order=0)])
        with pytest.raises(Exception):
            await generate_itinerary(trip, 0)

    async def test_all_pins_assigned(self, beanie_init):
        pins = [make_pin(order=i) for i in range(9)]
        trip = await SeedFactory.trip(pins=pins)
        days = await generate_itinerary(trip, 3)
        all_assigned = [pid for d in days for pid in d.pin_ids]
        original_ids = {p.id for p in pins}
        assert set(all_assigned) == original_ids


# ── Feature 3: Route optimisation ─────────────────────────────

class TestTotalDistance:
    def test_single_pair(self):
        pins = [
            make_pin(order=0, lat=51.5074, lng=-0.1278),  # London
            make_pin(order=1, lat=48.8566, lng=2.3522),   # Paris
        ]
        dist = _total_distance(pins)
        assert 340 < dist < 345

    def test_two_pairs_sum(self):
        pins = [
            make_pin(order=0, lat=51.5074, lng=-0.1278),  # London
            make_pin(order=1, lat=48.8566, lng=2.3522),   # Paris
            make_pin(order=2, lat=48.1351, lng=11.5820),  # Munich
        ]
        d_total = _total_distance(pins)
        d_lp = _haversine(51.5074, -0.1278, 48.8566, 2.3522)
        d_pm = _haversine(48.8566, 2.3522, 48.1351, 11.5820)
        assert d_total == pytest.approx(d_lp + d_pm, rel=1e-5)


class TestNearestNeighbour:
    def test_european_cities_better_than_random(self):
        """
        Random order: London → Tokyo → Paris → Munich  (crosses the world)
        Optimised: should cluster European cities together.
        """
        pins = [
            make_pin(order=0, lat=51.5074, lng=-0.1278),   # London
            make_pin(order=1, lat=35.6762, lng=139.6503),  # Tokyo
            make_pin(order=2, lat=48.8566, lng=2.3522),    # Paris
            make_pin(order=3, lat=48.1351, lng=11.5820),   # Munich
        ]
        original_dist = _total_distance(pins)
        optimised = _nearest_neighbour(pins, start_idx=0)
        optimised_dist = _total_distance(optimised)
        assert optimised_dist < original_dist

    def test_already_optimal_unchanged_distance(self):
        """Sequential close pins: nearest-neighbour should find same/similar distance."""
        pins = [
            make_pin(order=i, lat=48.0 + i * 0.1, lng=2.3)
            for i in range(5)
        ]
        original_dist = _total_distance(pins)
        optimised = _nearest_neighbour(pins, start_idx=0)
        optimised_dist = _total_distance(optimised)
        # Should not be worse than original
        assert optimised_dist <= original_dist * 1.05  # 5% tolerance

    def test_all_pins_visited(self):
        pins = [make_pin(order=i, lat=float(i), lng=0.0) for i in range(10)]
        result = _nearest_neighbour(pins, start_idx=0)
        assert len(result) == 10
        assert {p.id for p in result} == {p.id for p in pins}


@pytest.mark.asyncio
class TestOptimiseRoute:
    async def test_reduces_distance(self, beanie_init):
        """Zig-zag order should be improved by optimisation."""
        pins = [
            make_pin(order=0, lat=51.5074, lng=-0.1278),   # London
            make_pin(order=1, lat=35.6762, lng=139.6503),  # Tokyo
            make_pin(order=2, lat=48.8566, lng=2.3522),    # Paris
            make_pin(order=3, lat=48.1351, lng=11.5820),   # Munich
        ]
        trip = await SeedFactory.trip(pins=pins)
        _, original_km, optimised_km = await optimise_route(trip)
        assert optimised_km < original_km

    async def test_all_pins_preserved(self, beanie_init):
        pins = [make_pin(order=i) for i in range(5)]
        trip = await SeedFactory.trip(pins=pins)
        updated_trip, _, _ = await optimise_route(trip)
        assert len(updated_trip.pins) == 5

    async def test_orders_reassigned_sequentially(self, beanie_init):
        pins = [make_pin(order=i, lat=float(i), lng=0.0) for i in range(4)]
        trip = await SeedFactory.trip(pins=pins)
        updated_trip, _, _ = await optimise_route(trip)
        orders = sorted(p.order for p in updated_trip.pins)
        assert orders == [0, 1, 2, 3]

    async def test_raises_on_single_pin(self, beanie_init):
        trip = await SeedFactory.trip(pins=[make_pin(order=0)])
        with pytest.raises(Exception) as exc_info:
            await optimise_route(trip)
        assert "2" in str(exc_info.value)

    async def test_start_location_affects_first_pin(self, beanie_init):
        """Starting near Munich (lat=48, lng=11.5) should make the Munich-coordinate pin first."""
        pins = [
            make_pin(order=0, lat=51.5074, lng=-0.1278),   # London coords
            make_pin(order=1, lat=48.1351, lng=11.5820),   # Munich coords
            make_pin(order=2, lat=48.8566, lng=2.3522),    # Paris coords
        ]
        trip = await SeedFactory.trip(pins=pins)
        # Start very close to Munich coordinates
        updated_trip, _, _ = await optimise_route(
            trip, start_lat=48.0, start_lng=11.5
        )
        first_pin = min(updated_trip.pins, key=lambda p: p.order)
        # The first pin should be the one with Munich coordinates (48.1351, 11.582)
        assert abs(first_pin.lat - 48.1351) < 0.01 and abs(first_pin.lng - 11.582) < 0.01

    async def test_returns_distance_comparison(self, beanie_init):
        pins = [
            make_pin(order=0, lat=51.5074, lng=-0.1278),
            make_pin(order=1, lat=35.6762, lng=139.6503),
            make_pin(order=2, lat=48.8566, lng=2.3522),
        ]
        trip = await SeedFactory.trip(pins=pins)
        _, original_km, optimised_km = await optimise_route(trip)
        assert original_km > 0
        assert optimised_km > 0
        assert isinstance(original_km, float)
