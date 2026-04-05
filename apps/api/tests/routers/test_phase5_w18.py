"""W18 — GPS tracking router tests."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient


def _make_pin(
    pin_id: str,
    lat: float,
    lng: float,
    visited: bool = False,
) -> MagicMock:
    p = MagicMock()
    p.id = pin_id
    p.lat = lat
    p.lng = lng
    p.visited_at = datetime.now(UTC) if visited else None
    return p


def _make_trip(pins: list | None = None) -> MagicMock:
    t = MagicMock()
    t.pins = pins or []
    t.visited_path = []
    t.updated_at = datetime.now(UTC)
    t.save = AsyncMock()
    return t


class TestRecordLocation:
    async def test_appends_breadcrumb(self, client: AsyncClient) -> None:
        trip = _make_trip()

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post(
                "/api/trips/trip1/location",
                json={"lat": 35.681, "lng": 139.767},
            )

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["path_length"] == 1
        assert data["auto_visited_pins"] == []
        trip.save.assert_called_once()

    async def test_auto_visits_nearby_pin(self, client: AsyncClient) -> None:
        # Pin is 50m away — within 200m threshold
        pin = _make_pin("pin_near", lat=35.6815, lng=139.7675)
        trip = _make_trip(pins=[pin])

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post(
                "/api/trips/trip1/location",
                json={"lat": 35.681, "lng": 139.767},
            )

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "pin_near" in data["auto_visited_pins"]
        assert pin.visited_at is not None

    async def test_does_not_revisit_already_visited_pin(self, client: AsyncClient) -> None:
        pin = _make_pin("pin_done", lat=35.6815, lng=139.7675, visited=True)
        original_visited_at = pin.visited_at
        trip = _make_trip(pins=[pin])

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post(
                "/api/trips/trip1/location",
                json={"lat": 35.681, "lng": 139.767},
            )

        assert resp.status_code == 200
        assert resp.json()["data"]["auto_visited_pins"] == []
        assert pin.visited_at == original_visited_at

    async def test_far_pin_not_auto_visited(self, client: AsyncClient) -> None:
        # Pin is >200m away
        pin = _make_pin("pin_far", lat=35.70, lng=139.80)
        trip = _make_trip(pins=[pin])

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post(
                "/api/trips/trip1/location",
                json={"lat": 35.681, "lng": 139.767},
            )

        assert resp.status_code == 200
        assert resp.json()["data"]["auto_visited_pins"] == []
        assert pin.visited_at is None

    async def test_caps_path_at_10000_points(self, client: AsyncClient) -> None:
        from app.routers.gps import _MAX_PATH_POINTS

        trip = _make_trip()
        # Pre-fill path to the cap
        trip.visited_path = [
            MagicMock(lat=0.0, lng=0.0, recorded_at=datetime.now(UTC))
            for _ in range(_MAX_PATH_POINTS)
        ]

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            await client.post(
                "/api/trips/trip1/location",
                json={"lat": 35.681, "lng": 139.767},
            )

        assert len(trip.visited_path) == _MAX_PATH_POINTS


class TestGetPath:
    async def test_returns_path_points(self, client: AsyncClient) -> None:
        trip = _make_trip()
        trip.visited_path = [
            MagicMock(lat=35.0 + i * 0.001, lng=139.0, recorded_at=datetime.now(UTC))
            for i in range(5)
        ]

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get("/api/trips/trip1/path")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["path"]) == 5
        assert data["total_points"] == 5

    async def test_last_n_limits_response(self, client: AsyncClient) -> None:
        trip = _make_trip()
        trip.visited_path = [
            MagicMock(lat=float(i), lng=0.0, recorded_at=datetime.now(UTC)) for i in range(100)
        ]

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get("/api/trips/trip1/path?last_n=10")

        data = resp.json()["data"]
        assert len(data["path"]) == 10
        assert data["total_points"] == 100


class TestClearPath:
    async def test_clears_path(self, client: AsyncClient) -> None:
        trip = _make_trip()
        trip.visited_path = [MagicMock() for _ in range(50)]

        with patch("app.routers.gps.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.delete("/api/trips/trip1/path")

        assert resp.status_code == 200
        assert trip.visited_path == []
        trip.save.assert_called_once()


class TestHaversine:
    def test_same_point_is_zero(self) -> None:
        from app.routers.gps import _haversine_m

        assert _haversine_m(35.0, 139.0, 35.0, 139.0) == 0.0

    def test_known_distance(self) -> None:
        from app.routers.gps import _haversine_m

        # Tokyo Station → ~1km north
        dist = _haversine_m(35.681, 139.767, 35.690, 139.767)
        assert 900 < dist < 1100
