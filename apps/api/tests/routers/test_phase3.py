"""
tests/routers/test_phase3.py

Tests for Phase 3 endpoints:
  W9  — PATCH/DELETE /api/trips/{trip_id}/pins/{pin_id}/visit
  W10 — GET  /api/trips/{trip_id}/wrapped
  W11 — POST /api/trips/{trip_id}/suggest-spots

TripService is mocked so no real DB is required.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

if TYPE_CHECKING:
    from httpx import AsyncClient


# ── Helpers ────────────────────────────────────────────────────


def _make_pin(
    pin_id: str = "pin-001",
    place_name: str = "Eiffel Tower",
    lat: float = 48.8584,
    lng: float = 2.2945,
    category: str = "landmark",
    visited_at: datetime | None = None,
    diary_entry: str | None = None,
) -> MagicMock:
    pin = MagicMock()
    pin.id = pin_id
    pin.place_name = place_name
    pin.lat = lat
    pin.lng = lng
    pin.address = None
    pin.category = MagicMock()
    pin.category.value = category
    pin.visited_at = visited_at
    pin.diary_entry = diary_entry
    pin.updated_at = datetime.now(UTC)
    return pin


def _make_trip(
    trip_id: str = "trip-abc",
    title: str = "Paris Trip",
    pins: list | None = None,
) -> MagicMock:
    trip = MagicMock()
    trip.id = trip_id
    trip.title = title
    trip.pins = pins if pins is not None else []
    trip.created_at = datetime(2024, 1, 1, tzinfo=UTC)
    trip.updated_at = datetime.now(UTC)
    trip.save = AsyncMock()
    return trip


def _patch_trip_service(trip: MagicMock):
    return patch(
        "app.services.trip_service.TripService.get",
        new_callable=AsyncMock,
        return_value=trip,
    )


def _patch_trip_not_found():
    from app.middleware.error_handler import NotFoundError
    return patch(
        "app.services.trip_service.TripService.get",
        new_callable=AsyncMock,
        side_effect=NotFoundError("Trip", "bad-id"),
    )


# ══════════════════════════════════════════════════════════════
# W9 — Pin Visit
# ══════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestMarkPinVisited:
    async def test_returns_200(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1"},
            )
        assert resp.status_code == 200

    async def test_response_ok_true(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1"},
            )
        assert resp.json()["ok"] is True

    async def test_response_contains_visited_at(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1"},
            )
        assert "visitedAt" in resp.json()["data"]

    async def test_response_pin_id_matches(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1"},
            )
        assert resp.json()["data"]["pinId"] == "pin-001"

    async def test_diary_entry_stored(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1", "diary_entry": "Amazing view! 🗼"},
            )
        assert resp.json()["data"]["diaryEntry"] == "Amazing view! 🗼"

    async def test_no_diary_entry_returns_null(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1"},
            )
        assert resp.json()["data"]["diaryEntry"] is None

    async def test_diary_max_length_2000_accepted(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1", "diary_entry": "x" * 2000},
            )
        assert resp.status_code == 200

    async def test_diary_over_max_length_rejected(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1", "diary_entry": "x" * 2001},
            )
        assert resp.status_code == 422

    async def test_pin_not_found_returns_404(self, client: AsyncClient) -> None:
        trip = _make_trip(pins=[])  # no pins
        with _patch_trip_service(trip):
            resp = await client.patch(
                "/api/trips/trip-abc/pins/missing-pin/visit",
                json={"user_id": "user-1"},
            )
        assert resp.status_code == 404

    async def test_trip_not_found_returns_404(self, client: AsyncClient) -> None:
        with _patch_trip_not_found():
            resp = await client.patch(
                "/api/trips/bad-id/pins/pin-001/visit",
                json={"user_id": "user-1"},
            )
        assert resp.status_code == 404

    async def test_trip_save_called(self, client: AsyncClient) -> None:
        pin = _make_pin()
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            await client.patch(
                "/api/trips/trip-abc/pins/pin-001/visit",
                json={"user_id": "user-1"},
            )
        trip.save.assert_awaited_once()


@pytest.mark.asyncio
class TestUnmarkPinVisited:
    async def test_returns_200(self, client: AsyncClient) -> None:
        pin = _make_pin(visited_at=datetime.now(UTC), diary_entry="Great!")
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.delete(
                "/api/trips/trip-abc/pins/pin-001/visit?user_id=user-1"
            )
        assert resp.status_code == 200

    async def test_response_unvisited_true(self, client: AsyncClient) -> None:
        pin = _make_pin(visited_at=datetime.now(UTC))
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.delete(
                "/api/trips/trip-abc/pins/pin-001/visit?user_id=user-1"
            )
        assert resp.json()["data"]["unvisited"] is True

    async def test_idempotent_on_unvisited_pin(self, client: AsyncClient) -> None:
        pin = _make_pin(visited_at=None)
        trip = _make_trip(pins=[pin])
        with _patch_trip_service(trip):
            resp = await client.delete(
                "/api/trips/trip-abc/pins/pin-001/visit?user_id=user-1"
            )
        assert resp.status_code == 200

    async def test_pin_not_found_returns_404(self, client: AsyncClient) -> None:
        trip = _make_trip(pins=[])
        with _patch_trip_service(trip):
            resp = await client.delete(
                "/api/trips/trip-abc/pins/ghost/visit?user_id=user-1"
            )
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════
# W10 — Trip Wrapped
# ══════════════════════════════════════════════════════════════


@pytest.mark.asyncio
class TestTripWrapped:
    async def test_returns_200(self, client: AsyncClient) -> None:
        trip = _make_trip(pins=[])
        with _patch_trip_service(trip):
            resp = await client.get("/api/trips/trip-abc/wrapped")
        assert resp.status_code == 200

    async def test_response_ok_true(self, client: AsyncClient) -> None:
        trip = _make_trip(pins=[])
        with _patch_trip_service(trip):
            resp = await client.get("/api/trips/trip-abc/wrapped")
        assert resp.json()["ok"] is True

    async def test_zero_pins(self, client: AsyncClient) -> None:
        trip = _make_trip(pins=[])
        with _patch_trip_service(trip):
            data = (await client.get("/api/trips/trip-abc/wrapped")).json()["data"]
        assert data["totalPins"] == 0
        assert data["visitedPins"] == 0
        assert data["visitRate"] == 0.0
        assert data["distanceKm"] == 0.0
        assert data["daysActive"] == 0

    async def test_all_visited_visit_rate_one(self, client: AsyncClient) -> None:
        pins = [
            _make_pin("p1", visited_at=datetime(2024, 3, 1, tzinfo=UTC)),
            _make_pin("p2", visited_at=datetime(2024, 3, 3, tzinfo=UTC)),
        ]
        trip = _make_trip(pins=pins)
        with _patch_trip_service(trip):
            data = (await client.get("/api/trips/trip-abc/wrapped")).json()["data"]
        assert data["visitRate"] == 1.0
        assert data["visitedPins"] == 2

    async def test_partial_visit_rate(self, client: AsyncClient) -> None:
        pins = [
            _make_pin("p1", visited_at=datetime(2024, 3, 1, tzinfo=UTC)),
            _make_pin("p2"),  # not visited
        ]
        trip = _make_trip(pins=pins)
        with _patch_trip_service(trip):
            data = (await client.get("/api/trips/trip-abc/wrapped")).json()["data"]
        assert data["visitRate"] == 0.5

    async def test_days_active_counted(self, client: AsyncClient) -> None:
        pins = [
            _make_pin("p1", visited_at=datetime(2024, 3, 1, tzinfo=UTC)),
            _make_pin("p2", visited_at=datetime(2024, 3, 5, tzinfo=UTC)),
        ]
        trip = _make_trip(pins=pins)
        with _patch_trip_service(trip):
            data = (await client.get("/api/trips/trip-abc/wrapped")).json()["data"]
        assert data["daysActive"] == 5

    async def test_diary_count(self, client: AsyncClient) -> None:
        pins = [
            _make_pin("p1", visited_at=datetime.now(UTC), diary_entry="Note!"),
            _make_pin("p2", visited_at=datetime.now(UTC)),  # no diary
        ]
        trip = _make_trip(pins=pins)
        with _patch_trip_service(trip):
            data = (await client.get("/api/trips/trip-abc/wrapped")).json()["data"]
        assert data["diaryCount"] == 1

    async def test_title_returned(self, client: AsyncClient) -> None:
        trip = _make_trip(title="My Tokyo Trip", pins=[])
        with _patch_trip_service(trip):
            data = (await client.get("/api/trips/trip-abc/wrapped")).json()["data"]
        assert data["title"] == "My Tokyo Trip"

    async def test_trip_not_found(self, client: AsyncClient) -> None:
        with _patch_trip_not_found():
            resp = await client.get("/api/trips/bad-id/wrapped")
        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════
# W11 — AI Spot Suggestions
# ══════════════════════════════════════════════════════════════

_MOCK_SPOTS = [
    {
        "name": "Café de Flore",
        "address": "172 Bd Saint-Germain, Paris",
        "lat": 48.854,
        "lng": 2.332,
        "category": "cafe",
        "reason": "Iconic literary café steps from the existing stops.",
    },
    {
        "name": "Musée d'Orsay",
        "address": "1 Rue de la Légion d'Honneur, Paris",
        "lat": 48.860,
        "lng": 2.326,
        "category": "museum",
        "reason": "World-class Impressionist collection near the Louvre.",
    },
    {
        "name": "Luxembourg Gardens",
        "address": "Jardin du Luxembourg, Paris",
        "lat": 48.846,
        "lng": 2.337,
        "category": "park",
        "reason": "Perfect afternoon stroll between gallery visits.",
    },
    {
        "name": "Marché d'Aligre",
        "address": "Place d'Aligre, Paris",
        "lat": 48.849,
        "lng": 2.373,
        "category": "market",
        "reason": "Lively neighbourhood market loved by locals.",
    },
    {
        "name": "Palais Royal",
        "address": "Place du Palais-Royal, Paris",
        "lat": 48.863,
        "lng": 2.337,
        "category": "landmark",
        "reason": "Hidden gem garden and arcades near the Louvre.",
    },
]


def _patch_suggest_spots(result=None, error=None):
    if error:
        return patch(
            "app.routers.suggestions.suggest_spots",
            new_callable=AsyncMock,
            side_effect=error,
        )
    return patch(
        "app.routers.suggestions.suggest_spots",
        new_callable=AsyncMock,
        return_value=result if result is not None else _MOCK_SPOTS,
    )


@pytest.mark.asyncio
class TestSuggestSpots:
    async def test_returns_200(self, client: AsyncClient) -> None:
        trip = _make_trip()
        with _patch_trip_service(trip), _patch_suggest_spots():
            resp = await client.post("/api/trips/trip-abc/suggest-spots")
        assert resp.status_code == 200

    async def test_response_ok_true(self, client: AsyncClient) -> None:
        trip = _make_trip()
        with _patch_trip_service(trip), _patch_suggest_spots():
            resp = await client.post("/api/trips/trip-abc/suggest-spots")
        assert resp.json()["ok"] is True

    async def test_returns_suggestions_array(self, client: AsyncClient) -> None:
        trip = _make_trip()
        with _patch_trip_service(trip), _patch_suggest_spots():
            data = (await client.post("/api/trips/trip-abc/suggest-spots")).json()["data"]
        assert isinstance(data["suggestions"], list)
        assert len(data["suggestions"]) == 5

    async def test_suggestion_shape(self, client: AsyncClient) -> None:
        trip = _make_trip()
        with _patch_trip_service(trip), _patch_suggest_spots():
            data = (await client.post("/api/trips/trip-abc/suggest-spots")).json()["data"]
        s = data["suggestions"][0]
        assert "name" in s
        assert "address" in s
        assert "lat" in s
        assert "lng" in s
        assert "category" in s
        assert "reason" in s

    async def test_trip_id_in_response(self, client: AsyncClient) -> None:
        trip = _make_trip(trip_id="trip-abc")
        with _patch_trip_service(trip), _patch_suggest_spots():
            data = (await client.post("/api/trips/trip-abc/suggest-spots")).json()["data"]
        assert data["tripId"] == "trip-abc"

    async def test_empty_suggestions_returned(self, client: AsyncClient) -> None:
        trip = _make_trip()
        with _patch_trip_service(trip), _patch_suggest_spots(result=[]):
            data = (await client.post("/api/trips/trip-abc/suggest-spots")).json()["data"]
        assert data["suggestions"] == []

    async def test_upstream_error_returns_502(self, client: AsyncClient) -> None:
        from app.services.spot_suggester import SpotSuggesterError

        trip = _make_trip()
        with _patch_trip_service(trip), _patch_suggest_spots(error=SpotSuggesterError("timeout")):
            resp = await client.post("/api/trips/trip-abc/suggest-spots")
        assert resp.status_code == 502

    async def test_trip_not_found_returns_404(self, client: AsyncClient) -> None:
        with _patch_trip_not_found():
            resp = await client.post("/api/trips/bad-id/suggest-spots")
        assert resp.status_code == 404


# ── Spot suggester unit tests (no HTTP) ───────────────────────


class TestSpotSuggesterHelpers:
    def test_parse_suggestions_valid(self) -> None:
        import json

        from app.services.spot_suggester import _parse_suggestions

        raw = json.dumps({"suggestions": _MOCK_SPOTS})
        items = _parse_suggestions(raw)
        assert len(items) == 5
        assert items[0]["name"] == "Café de Flore"

    def test_parse_suggestions_bad_json(self) -> None:
        from app.services.spot_suggester import SpotSuggesterError, _parse_suggestions

        with pytest.raises(SpotSuggesterError, match="Invalid JSON"):
            _parse_suggestions("not-json")

    def test_parse_suggestions_missing_key(self) -> None:
        import json

        from app.services.spot_suggester import SpotSuggesterError, _parse_suggestions

        with pytest.raises(SpotSuggesterError, match="missing"):
            _parse_suggestions(json.dumps({"wrong": []}))

    def test_centroid_two_pins(self) -> None:
        from app.services.spot_suggester import _centroid

        trip = MagicMock()
        p1, p2 = MagicMock(), MagicMock()
        p1.lat, p1.lng = 10.0, 20.0
        p2.lat, p2.lng = 20.0, 40.0
        trip.pins = [p1, p2]
        lat, lng = _centroid(trip)
        assert lat == pytest.approx(15.0)
        assert lng == pytest.approx(30.0)

    def test_centroid_empty_trip(self) -> None:
        from app.services.spot_suggester import _centroid

        trip = MagicMock()
        trip.pins = []
        assert _centroid(trip) == (0.0, 0.0)
