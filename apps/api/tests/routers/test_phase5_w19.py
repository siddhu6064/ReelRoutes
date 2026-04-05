"""W19 — Flyover router tests."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient


def _make_pin(order: int, lat: float = 35.0, lng: float = 139.0, name: str = "Place") -> MagicMock:
    p = MagicMock()
    p.order = order
    p.lat = lat
    p.lng = lng
    p.place_name = name
    return p


def _make_trip(pins: list, is_public: bool = False) -> MagicMock:
    t = MagicMock()
    t.title = "Tokyo Trip"
    t.pins = pins
    t.is_public = is_public
    t.share_count = 0
    t.save = AsyncMock()
    return t


class TestGenerateFlyover:
    async def test_no_pins_returns_null_url(self, client: AsyncClient) -> None:
        trip = _make_trip([])

        with patch("app.routers.flyover.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post("/api/trips/trip1/flyover")

        assert resp.status_code == 200
        assert resp.json()["data"]["flyover_url"] is None

    async def test_no_token_returns_placeholder(self, client: AsyncClient) -> None:
        trip = _make_trip([_make_pin(1), _make_pin(2)])

        with (
            patch("app.routers.flyover.TripService.get", AsyncMock(return_value=trip)),
            patch.dict("os.environ", {"MAPBOX_TOKEN": ""}, clear=False),
        ):
            resp = await client.post("/api/trips/trip1/flyover")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["type"] == "placeholder"
        assert data["flyover_url"] is not None

    async def test_with_token_returns_mapbox_url(self, client: AsyncClient) -> None:
        pins = [
            _make_pin(1, 35.681, 139.767, "Tokyo Station"),
            _make_pin(2, 35.71, 139.81, "Asakusa"),
        ]
        trip = _make_trip(pins)

        with (
            patch("app.routers.flyover.TripService.get", AsyncMock(return_value=trip)),
            patch.dict("os.environ", {"MAPBOX_TOKEN": "pk.test_token"}, clear=False),
        ):
            resp = await client.post("/api/trips/trip1/flyover")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["type"] == "mapbox_static"
        assert "mapbox.com" in data["flyover_url"]
        assert "pk.test_token" in data["flyover_url"]
        assert data["pin_count"] == 2

    async def test_increments_share_count_for_public_trip(self, client: AsyncClient) -> None:
        pins = [_make_pin(1), _make_pin(2)]
        trip = _make_trip(pins, is_public=True)

        with (
            patch("app.routers.flyover.TripService.get", AsyncMock(return_value=trip)),
            patch.dict("os.environ", {"MAPBOX_TOKEN": "pk.test_token"}, clear=False),
        ):
            await client.post("/api/trips/trip1/flyover")

        assert trip.share_count == 1
        trip.save.assert_called_once()

    async def test_private_trip_does_not_increment_share_count(self, client: AsyncClient) -> None:
        pins = [_make_pin(1), _make_pin(2)]
        trip = _make_trip(pins, is_public=False)

        with (
            patch("app.routers.flyover.TripService.get", AsyncMock(return_value=trip)),
            patch.dict("os.environ", {"MAPBOX_TOKEN": "pk.test_token"}, clear=False),
        ):
            await client.post("/api/trips/trip1/flyover")

        assert trip.share_count == 0
        trip.save.assert_not_called()


class TestBboxCenter:
    def test_single_cluster(self) -> None:
        from app.routers.flyover import _bbox_center

        pins = [
            MagicMock(lat=35.681, lng=139.767),
            MagicMock(lat=35.710, lng=139.811),
        ]
        clng, clat, zoom = _bbox_center(pins)
        assert abs(clat - 35.6955) < 0.01
        assert abs(clng - 139.789) < 0.01
        assert 5 <= zoom <= 14
