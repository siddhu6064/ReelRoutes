"""W17 — Directions router tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient


def _make_pin(order: int, lat: float, lng: float, name: str = "Place") -> MagicMock:
    p = MagicMock()
    p.order = order
    p.lat = lat
    p.lng = lng
    p.place_name = name
    return p


def _make_trip(pins: list) -> MagicMock:
    t = MagicMock()
    t.pins = pins
    t.save = AsyncMock()
    return t


class TestDirections:
    async def test_returns_directions_for_trip(self, client: AsyncClient) -> None:
        pins = [
            _make_pin(1, 35.681, 139.767, "Tokyo Station"),
            _make_pin(2, 35.710, 139.811, "Asakusa"),
            _make_pin(3, 35.658, 139.745, "Shinjuku"),
        ]
        trip = _make_trip(pins)

        directions_result = {
            "total_duration_seconds": 3600,
            "total_distance_meters": 25000,
            "legs": [
                {"duration_seconds": 1200, "distance_meters": 8000},
                {"duration_seconds": 2400, "distance_meters": 17000},
            ],
        }

        with (
            patch("app.routers.directions.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.routers.directions.get_directions",
                AsyncMock(return_value=directions_result),
            ),
        ):
            resp = await client.get("/api/trips/abc123/directions?mode=driving")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["mode"] == "driving"
        assert data["total_duration_seconds"] == 3600
        assert data["total_distance_label"] == "25.0 km"
        assert data["total_duration_label"] == "1h"
        assert len(data["legs"]) == 2
        assert data["legs"][0]["from"] == "Tokyo Station"
        assert data["legs"][0]["to"] == "Asakusa"
        assert data["legs"][0]["duration_label"] == "20 min"

    async def test_returns_empty_for_single_pin(self, client: AsyncClient) -> None:
        trip = _make_trip([_make_pin(1, 35.0, 139.0)])

        with patch("app.routers.directions.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get("/api/trips/abc123/directions")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["legs"] == []
        assert data["total_duration_seconds"] == 0

    async def test_transit_mode(self, client: AsyncClient) -> None:
        pins = [_make_pin(1, 35.0, 139.0, "A"), _make_pin(2, 35.1, 139.1, "B")]
        trip = _make_trip(pins)

        directions_result = {
            "total_duration_seconds": 900,
            "total_distance_meters": 5000,
            "legs": [{"duration_seconds": 900, "distance_meters": 5000}],
        }

        with (
            patch("app.routers.directions.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.routers.directions.get_directions",
                AsyncMock(return_value=directions_result),
            ) as mock_get,
        ):
            resp = await client.get("/api/trips/abc123/directions?mode=transit")

        assert resp.status_code == 200
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert call_args.kwargs["mode"] == "transit"

    async def test_duration_formatting(self) -> None:
        from app.routers.directions import _fmt_duration

        assert _fmt_duration(0) == "—"
        assert _fmt_duration(30) == "0 min"
        assert _fmt_duration(600) == "10 min"
        assert _fmt_duration(3600) == "1h"
        assert _fmt_duration(5400) == "1h 30m"

    async def test_distance_formatting(self) -> None:
        from app.routers.directions import _fmt_distance

        assert _fmt_distance(0) == "—"
        assert _fmt_distance(500) == "500 m"
        assert _fmt_distance(1500) == "1.5 km"
        assert _fmt_distance(25000) == "25.0 km"
