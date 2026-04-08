"""
Tests for PlanRequest and related Pydantic schemas.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.plan import (
    PlanConfirmRequest,
    PlanRequest,
    TravelMode,
    TripPreference,
)


class TestPlanRequest:
    def _make(self, **kwargs) -> PlanRequest:
        defaults = dict(
            starting_point="Austin, TX",
            destination="New Orleans, LA",
            days=4,
            preferences=["food", "history"],
            travel_mode="driving",
        )
        defaults.update(kwargs)
        return PlanRequest(**defaults)

    def test_valid_request(self):
        req = self._make()
        assert req.starting_point == "Austin, TX"
        assert req.days == 4
        assert req.travel_mode == TravelMode.driving

    def test_days_minimum(self):
        req = self._make(days=1)
        assert req.days == 1

    def test_days_maximum(self):
        req = self._make(days=14)
        assert req.days == 14

    def test_days_below_minimum_raises(self):
        with pytest.raises(ValidationError):
            self._make(days=0)

    def test_days_above_maximum_raises(self):
        with pytest.raises(ValidationError):
            self._make(days=15)

    def test_empty_starting_point_raises(self):
        with pytest.raises(ValidationError):
            self._make(starting_point="")

    def test_empty_destination_raises(self):
        with pytest.raises(ValidationError):
            self._make(destination="")

    def test_preferences_deduplicated(self):
        req = self._make(preferences=["food", "food", "history"])
        assert len(req.preferences) == 2
        assert TripPreference.food in req.preferences
        assert TripPreference.history in req.preferences

    def test_empty_preferences_allowed(self):
        req = self._make(preferences=[])
        assert req.preferences == []

    def test_invalid_preference_raises(self):
        with pytest.raises(ValidationError):
            self._make(preferences=["skydiving"])

    def test_all_travel_modes_valid(self):
        for mode in TravelMode:
            req = self._make(travel_mode=mode.value)
            assert req.travel_mode == mode

    def test_invalid_travel_mode_raises(self):
        with pytest.raises(ValidationError):
            self._make(travel_mode="teleport")

    def test_default_travel_mode_is_driving(self):
        req = PlanRequest(
            starting_point="Austin, TX",
            destination="New Orleans, LA",
            days=3,
        )
        assert req.travel_mode == TravelMode.driving
