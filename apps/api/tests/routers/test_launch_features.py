"""Tests for launch-phase features: unresolved places, trending cache, push notifications."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient


def _make_trip(pins: list | None = None, job_id: str | None = None) -> MagicMock:
    t = MagicMock()
    t.id = "trip123"
    t.title = "Tokyo Adventure"
    t.user_id = "user_abc"
    t.pins = pins or []
    t.job_id = job_id
    t.save = AsyncMock()
    return t


def _make_pin(visited: bool = False) -> MagicMock:
    p = MagicMock()
    p.id = "pin1"
    p.place_name = "Shibuya"
    p.lat = 35.658
    p.lng = 139.701
    from datetime import UTC, datetime

    p.visited_at = datetime.now(UTC) if visited else None
    p.category = MagicMock(value="landmark")
    p.diary_entry = None
    return p


# ── GET /api/trips/:id/unresolved ────────────────────────────────────


class TestGetUnresolvedPlaces:
    async def test_returns_unresolved_from_job(self, client: AsyncClient) -> None:
        trip = _make_trip(job_id="job_xyz")
        job = MagicMock()
        job.unresolved_places = [
            {
                "place_name": "Yanaka Ginza",
                "context_quote": "we visited Yanaka Ginza",
                "confidence": 0.6,
            },
            {
                "place_name": "Hidden Temple",
                "context_quote": "some hidden temple nearby",
                "confidence": 0.5,
            },
        ]

        with (
            patch("app.routers.trips.TripService.get", AsyncMock(return_value=trip)),
            patch("app.models.documents.JobDocument.get", AsyncMock(return_value=job)),
        ):
            resp = await client.get("/api/trips/trip123/unresolved?user_id=user_abc")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["count"] == 2
        assert data["unresolved"][0]["place_name"] == "Yanaka Ginza"
        assert "hint" in data

    async def test_returns_empty_when_no_job(self, client: AsyncClient) -> None:
        trip = _make_trip(job_id=None)

        with patch("app.routers.trips.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get("/api/trips/trip123/unresolved?user_id=user_abc")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["count"] == 0
        assert data["unresolved"] == []

    async def test_returns_empty_when_job_has_no_unresolved(self, client: AsyncClient) -> None:
        trip = _make_trip(job_id="job_xyz")
        job = MagicMock()
        job.unresolved_places = []

        with (
            patch("app.routers.trips.TripService.get", AsyncMock(return_value=trip)),
            patch("app.models.documents.JobDocument.get", AsyncMock(return_value=job)),
        ):
            resp = await client.get("/api/trips/trip123/unresolved?user_id=user_abc")

        data = resp.json()["data"]
        assert data["count"] == 0


# ── GET /api/explore/trending — cache behaviour ───────────────────────


class TestTrendingCache:
    async def test_trending_returns_results(self, client: AsyncClient) -> None:
        trip = MagicMock()
        trip.id = "t1"
        trip.title = "Popular Tokyo Trip"
        trip.platform = "youtube"
        trip.pins = []
        trip.view_count = 500
        trip.share_count = 20
        trip.video_creator = None
        trip.video_channel = None
        trip.created_at = MagicMock()
        trip.created_at.isoformat.return_value = "2024-01-01T00:00:00"

        with patch("app.routers.explore.TripDocument.find") as mock_find:
            chain = MagicMock()
            chain.sort.return_value = chain
            chain.limit.return_value = chain
            chain.to_list = AsyncMock(return_value=[trip])
            mock_find.return_value = chain

            resp = await client.get("/api/explore/trending")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data["trips"]) == 1
        assert data["trips"][0]["view_count"] == 500

    async def test_cache_serves_second_request_without_db(self, client: AsyncClient) -> None:
        from app.routers.explore import _trending_cache

        # Prime the cache with fake data
        _trending_cache["data"] = {"trips": [{"id": "cached", "title": "Cached Trip"}]}
        _trending_cache["at"] = time.monotonic()  # fresh cache

        with patch("app.routers.explore.TripDocument.find") as mock_find:
            resp = await client.get("/api/explore/trending")
            mock_find.assert_not_called()  # DB not hit

        assert resp.status_code == 200
        assert resp.json()["data"]["trips"][0]["id"] == "cached"

        # Reset cache for other tests
        _trending_cache["data"] = None
        _trending_cache["at"] = 0.0

    async def test_cache_expires_after_ttl(self, client: AsyncClient) -> None:
        from app.routers.explore import _TRENDING_TTL, _trending_cache

        # Set cache as expired
        _trending_cache["data"] = {"trips": [{"id": "stale"}]}
        _trending_cache["at"] = time.monotonic() - _TRENDING_TTL - 1  # expired

        with patch("app.routers.explore.TripDocument.find") as mock_find:
            chain = MagicMock()
            chain.sort.return_value = chain
            chain.limit.return_value = chain
            chain.to_list = AsyncMock(return_value=[])
            mock_find.return_value = chain

            await client.get("/api/explore/trending")
            mock_find.assert_called_once()  # DB was hit since cache expired

        # Reset
        _trending_cache["data"] = None
        _trending_cache["at"] = 0.0


# ── push_notifications ────────────────────────────────────────────────


class TestSendTripCompleteNotification:
    async def test_sends_notification_when_token_exists(self) -> None:
        from app.services.push_notifications import send_trip_complete_notification

        with (
            patch(
                "app.services.push_notifications._get_push_token",
                AsyncMock(return_value="ExponentPushToken[abc123]"),
            ),
            patch(
                "app.services.push_notifications._send",
                AsyncMock(return_value=True),
            ) as mock_send,
        ):
            result = await send_trip_complete_notification(
                user_id="user_abc",
                trip_title="Tokyo Trip",
                trip_id="trip123",
                stop_count=12,
            )

        assert result is True
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert "complete" in call_kwargs["title"].lower() or "🎉" in call_kwargs["title"]
        assert "12" in call_kwargs["body"]

    async def test_skips_when_no_push_token(self) -> None:
        from app.services.push_notifications import send_trip_complete_notification

        with (
            patch(
                "app.services.push_notifications._get_push_token",
                AsyncMock(return_value=None),
            ),
            patch(
                "app.services.push_notifications._send",
                AsyncMock(return_value=True),
            ) as mock_send,
        ):
            result = await send_trip_complete_notification(
                user_id="user_abc",
                trip_title="Tokyo Trip",
                trip_id="trip123",
                stop_count=5,
            )

        assert result is False
        mock_send.assert_not_called()


# ── GET /api/trips/:id/wrapped — push notification trigger ────────────


class TestWrappedPushNotification:
    async def test_fires_push_when_all_visited(self, client: AsyncClient) -> None:
        pins = [_make_pin(visited=True), _make_pin(visited=True)]
        trip = _make_trip(pins=pins)
        trip.user_id = "user_abc"
        trip.title = "Tokyo Trip"

        with (
            patch("app.routers.wrapped.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.routers.wrapped.send_trip_complete_notification",
                AsyncMock(return_value=True),
            ) as mock_notify,
        ):
            resp = await client.get("/api/trips/trip123/wrapped?user_id=user_abc")

        assert resp.status_code == 200
        mock_notify.assert_called_once_with(
            user_id="user_abc",
            trip_title="Tokyo Trip",
            trip_id="trip123",
            stop_count=2,
        )

    async def test_no_push_when_not_all_visited(self, client: AsyncClient) -> None:
        pins = [_make_pin(visited=True), _make_pin(visited=False)]
        trip = _make_trip(pins=pins)

        with (
            patch("app.routers.wrapped.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.routers.wrapped.send_trip_complete_notification",
                AsyncMock(return_value=True),
            ) as mock_notify,
        ):
            await client.get("/api/trips/trip123/wrapped?user_id=user_abc")

        mock_notify.assert_not_called()

    async def test_no_push_when_no_user_id(self, client: AsyncClient) -> None:
        pins = [_make_pin(visited=True)]
        trip = _make_trip(pins=pins)

        with (
            patch("app.routers.wrapped.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.routers.wrapped.send_trip_complete_notification",
                AsyncMock(return_value=True),
            ) as mock_notify,
        ):
            await client.get("/api/trips/trip123/wrapped")

        mock_notify.assert_not_called()
