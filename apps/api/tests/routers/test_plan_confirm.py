"""
Router-level tests for POST /trips/plan/confirm (Phase 4).

Uses FastAPI's TestClient (via httpx) with the TripBuilderService mocked
so no real MongoDB connection is required.

Covers:
  - 201 success with correct response body
  - 422 for Pydantic validation failures (missing fields, wrong types)
  - 409 for business-logic validation (no stops)
  - 503 for database errors
  - 500 for unexpected errors
  - Response body shape (trip_id, pin_count, day_count)
  - PlanConfirmRequest validators (duplicate days, no stops)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers.plan import router
from app.services.plan.trip_builder import (
    BuildResult,
    TripBuildDatabaseError,
    TripBuildValidationError,
)

# ---------------------------------------------------------------------------
# App fixture
# ---------------------------------------------------------------------------

app = FastAPI()
app.include_router(router)
client = TestClient(app, raise_server_exceptions=False)

CONFIRM_URL = "/trips/plan/confirm"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def confirm_body(**overrides) -> dict:
    """Build a minimal valid confirm request body."""
    base = {
        "starting_point": "Austin, TX",
        "destination": "New Orleans, LA",
        "days": 2,
        "travel_mode": "driving",
        "preferences": ["food", "history"],
        "days_plan": [
            {
                "day": 1,
                "activity_stops": [
                    {
                        "name": "French Quarter",
                        "lat": 29.9584,
                        "lng": -90.0644,
                        "place_id": "place-fq",
                        "address": "French Quarter, New Orleans",
                        "famous_for": "Jazz music",
                        "best_time": "Evening",
                        "local_tip": "Go on weeknights",
                    }
                ],
                "food_stops": [
                    {
                        "name": "Cafe Du Monde",
                        "lat": 29.9575,
                        "lng": -90.0614,
                        "place_id": "place-cdm",
                        "address": "800 Decatur St",
                        "known_for": "Beignets",
                        "meal": "breakfast",
                    }
                ],
            }
        ],
    }
    base.update(overrides)
    return base


def mock_builder_success(
    trip_id: str = "trip-abc123",
    pin_count: int = 2,
    day_count: int = 1,
):
    result = BuildResult(trip_id=trip_id, pin_count=pin_count, day_count=day_count)
    return patch(
        "apps.api.routers.plan.TripBuilderService.build_from_plan",
        new=AsyncMock(return_value=result),
    )


# ---------------------------------------------------------------------------
# Success cases
# ---------------------------------------------------------------------------


class TestConfirmPlanSuccess:
    def test_returns_201(self):
        with mock_builder_success():
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert resp.status_code == 201

    def test_response_contains_trip_id(self):
        with mock_builder_success(trip_id="trip-xyz"):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert resp.json()["trip_id"] == "trip-xyz"

    def test_response_contains_pin_count(self):
        with mock_builder_success(pin_count=5):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert resp.json()["pin_count"] == 5

    def test_response_contains_day_count(self):
        with mock_builder_success(day_count=3):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert resp.json()["day_count"] == 3

    def test_response_contains_message(self):
        with mock_builder_success():
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert "message" in resp.json()

    def test_only_food_stops_still_valid(self):
        """A day with only food stops (no activities) is a valid edge case."""
        body = confirm_body()
        body["days_plan"][0]["activity_stops"] = []
        body["days_plan"][0]["food_stops"] = [
            {
                "name": "Cafe Du Monde",
                "lat": 29.9575,
                "lng": -90.0614,
                "meal": "breakfast",
                "known_for": "Beignets",
            }
        ]
        with mock_builder_success():
            resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 201


# ---------------------------------------------------------------------------
# Pydantic validation failures → 422
# ---------------------------------------------------------------------------


class TestConfirmPlanPydanticValidation:
    def test_missing_starting_point_returns_422(self):
        body = confirm_body()
        del body["starting_point"]
        resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 422

    def test_missing_destination_returns_422(self):
        body = confirm_body()
        del body["destination"]
        resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 422

    def test_days_zero_returns_422(self):
        resp = client.post(CONFIRM_URL, json=confirm_body(days=0))
        assert resp.status_code == 422

    def test_days_above_14_returns_422(self):
        resp = client.post(CONFIRM_URL, json=confirm_body(days=15))
        assert resp.status_code == 422

    def test_invalid_travel_mode_returns_422(self):
        resp = client.post(CONFIRM_URL, json=confirm_body(travel_mode="teleport"))
        assert resp.status_code == 422

    def test_invalid_preference_returns_422(self):
        resp = client.post(CONFIRM_URL, json=confirm_body(preferences=["skydiving"]))
        assert resp.status_code == 422

    def test_empty_days_plan_returns_422(self):
        """Empty days_plan fails the must_have_at_least_one_stop validator."""
        resp = client.post(CONFIRM_URL, json=confirm_body(days_plan=[]))
        assert resp.status_code == 422

    def test_days_plan_with_all_empty_stops_returns_422(self):
        body = confirm_body(days_plan=[{"day": 1, "activity_stops": [], "food_stops": []}])
        resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 422

    def test_duplicate_day_numbers_returns_422(self):
        body = confirm_body()
        body["days_plan"] = [
            {
                "day": 1,
                "activity_stops": [{"name": "A", "lat": 1.0, "lng": 1.0}],
                "food_stops": [],
            },
            {
                "day": 1,  # duplicate
                "activity_stops": [{"name": "B", "lat": 2.0, "lng": 2.0}],
                "food_stops": [],
            },
        ]
        resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 422

    def test_invalid_meal_value_returns_422(self):
        body = confirm_body()
        body["days_plan"][0]["food_stops"][0]["meal"] = "brunch"  # not in enum
        resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 422

    def test_activity_stop_missing_name_returns_422(self):
        body = confirm_body()
        del body["days_plan"][0]["activity_stops"][0]["name"]
        resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 422

    def test_activity_stop_missing_lat_returns_422(self):
        body = confirm_body()
        del body["days_plan"][0]["activity_stops"][0]["lat"]
        resp = client.post(CONFIRM_URL, json=body)
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Business-logic errors → 409
# ---------------------------------------------------------------------------


class TestConfirmPlanBusinessErrors:
    def test_builder_validation_error_returns_409(self):
        with patch(
            "apps.api.routers.plan.TripBuilderService.build_from_plan",
            new=AsyncMock(side_effect=TripBuildValidationError("No usable stops")),
        ):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert resp.status_code == 409

    def test_409_body_contains_detail(self):
        with patch(
            "apps.api.routers.plan.TripBuilderService.build_from_plan",
            new=AsyncMock(side_effect=TripBuildValidationError("No usable stops")),
        ):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert "detail" in resp.json()


# ---------------------------------------------------------------------------
# Database errors → 503
# ---------------------------------------------------------------------------


class TestConfirmPlanDatabaseErrors:
    def test_db_error_returns_503(self):
        with patch(
            "apps.api.routers.plan.TripBuilderService.build_from_plan",
            new=AsyncMock(side_effect=TripBuildDatabaseError("Connection refused")),
        ):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert resp.status_code == 503

    def test_503_body_suggests_retry(self):
        with patch(
            "apps.api.routers.plan.TripBuilderService.build_from_plan",
            new=AsyncMock(side_effect=TripBuildDatabaseError("Timeout")),
        ):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert "try again" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Unexpected errors → 500
# ---------------------------------------------------------------------------


class TestConfirmPlanUnexpectedErrors:
    def test_unexpected_exception_returns_500(self):
        with patch(
            "apps.api.routers.plan.TripBuilderService.build_from_plan",
            new=AsyncMock(side_effect=RuntimeError("Completely unexpected")),
        ):
            resp = client.post(CONFIRM_URL, json=confirm_body())
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Schema validator unit tests
# ---------------------------------------------------------------------------


class TestPlanConfirmRequestValidators:
    def test_valid_request_passes(self):
        from app.schemas.plan import PlanConfirmRequest, ConfirmDayPlan, ConfirmActivityStop

        req = PlanConfirmRequest(
            starting_point="Austin, TX",
            destination="New Orleans, LA",
            days=2,
            days_plan=[
                ConfirmDayPlan(
                    day=1,
                    activity_stops=[
                        ConfirmActivityStop(name="French Quarter", lat=29.958, lng=-90.064)
                    ],
                    food_stops=[],
                )
            ],
        )
        assert req.destination == "New Orleans, LA"

    def test_no_stops_raises(self):
        from pydantic import ValidationError
        from app.schemas.plan import PlanConfirmRequest, ConfirmDayPlan

        with pytest.raises(ValidationError, match="at least one stop"):
            PlanConfirmRequest(
                starting_point="Austin, TX",
                destination="New Orleans, LA",
                days=1,
                days_plan=[ConfirmDayPlan(day=1, activity_stops=[], food_stops=[])],
            )

    def test_duplicate_days_raises(self):
        from pydantic import ValidationError
        from app.schemas.plan import PlanConfirmRequest, ConfirmDayPlan, ConfirmActivityStop

        stop = ConfirmActivityStop(name="X", lat=1.0, lng=1.0)
        with pytest.raises(ValidationError, match="Duplicate day"):
            PlanConfirmRequest(
                starting_point="Austin, TX",
                destination="New Orleans, LA",
                days=2,
                days_plan=[
                    ConfirmDayPlan(day=1, activity_stops=[stop], food_stops=[]),
                    ConfirmDayPlan(day=1, activity_stops=[stop], food_stops=[]),
                ],
            )
