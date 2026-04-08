"""
Tests for haversine utility functions.
"""

from __future__ import annotations

import pytest

from app.services.plan.haversine import centroid, haversine_km, nearest


class TestHaversineKm:
    def test_same_point_is_zero(self):
        assert haversine_km(0, 0, 0, 0) == pytest.approx(0.0)

    def test_known_distance_london_paris(self):
        # London: 51.5074, -0.1278 | Paris: 48.8566, 2.3522
        # Known distance ~341 km
        dist = haversine_km(51.5074, -0.1278, 48.8566, 2.3522)
        assert dist == pytest.approx(341, abs=5)

    def test_known_distance_nyc_la(self):
        # NYC: 40.7128, -74.0060 | LA: 34.0522, -118.2437
        # Known distance ~3940 km
        dist = haversine_km(40.7128, -74.0060, 34.0522, -118.2437)
        assert dist == pytest.approx(3940, abs=20)

    def test_symmetry(self):
        d1 = haversine_km(10.0, 20.0, 30.0, 40.0)
        d2 = haversine_km(30.0, 40.0, 10.0, 20.0)
        assert d1 == pytest.approx(d2)

    def test_returns_float(self):
        result = haversine_km(0.0, 0.0, 1.0, 1.0)
        assert isinstance(result, float)

    def test_short_distance_is_positive(self):
        dist = haversine_km(29.9584, -90.0644, 29.9600, -90.0650)
        assert dist > 0
        assert dist < 1  # less than 1 km


class TestCentroid:
    def test_single_point(self):
        lat, lng = centroid([(10.0, 20.0)])
        assert lat == pytest.approx(10.0)
        assert lng == pytest.approx(20.0)

    def test_two_points(self):
        lat, lng = centroid([(0.0, 0.0), (10.0, 20.0)])
        assert lat == pytest.approx(5.0)
        assert lng == pytest.approx(10.0)

    def test_four_corners(self):
        points = [(0.0, 0.0), (0.0, 10.0), (10.0, 0.0), (10.0, 10.0)]
        lat, lng = centroid(points)
        assert lat == pytest.approx(5.0)
        assert lng == pytest.approx(5.0)

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            centroid([])


class TestNearest:
    def test_finds_nearest(self):
        candidates = [(0.0, 0.0), (10.0, 10.0), (50.0, 50.0)]
        idx = nearest(1.0, 1.0, candidates)
        assert idx == 0  # (0,0) is nearest to (1,1)

    def test_finds_second_nearest(self):
        candidates = [(0.0, 0.0), (10.0, 10.0), (50.0, 50.0)]
        idx = nearest(9.0, 9.0, candidates)
        assert idx == 1  # (10,10) is nearest to (9,9)

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            nearest(0.0, 0.0, [])

    def test_single_candidate(self):
        idx = nearest(0.0, 0.0, [(5.0, 5.0)])
        assert idx == 0
