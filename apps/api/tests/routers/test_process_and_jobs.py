"""
tests/routers/test_process_and_jobs.py

Integration tests for:
  POST /api/process  — platform detection, deduplication, job creation
  GET  /api/jobs/:id — polling endpoint
  Rate limiting middleware
  Platform detection logic
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, patch

import pytest

from app.models.documents import Platform
from app.services.job_service import JobService
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401

if TYPE_CHECKING:
    from httpx import AsyncClient

# ── Platform detection ─────────────────────────────────────────


class TestPlatformDetection:
    def test_youtube_com_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://youtube.com/watch?v=abc") == Platform.YOUTUBE

    def test_youtu_be_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://youtu.be/abc123") == Platform.YOUTUBE

    def test_instagram_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://www.instagram.com/reel/abc123/") == Platform.INSTAGRAM

    def test_tiktok_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://www.tiktok.com/@user/video/123") == Platform.TIKTOK

    def test_facebook_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://www.facebook.com/watch/?v=123") == Platform.FACEBOOK

    def test_fb_watch_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://fb.watch/abc") == Platform.FACEBOOK

    def test_twitter_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://twitter.com/user/status/123") == Platform.TWITTER

    def test_x_com_detected(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://x.com/user/status/123") == Platform.TWITTER

    def test_unknown_platform(self) -> None:
        from app.routers.process import detect_platform

        assert detect_platform("https://vimeo.com/123456789") == Platform.UNKNOWN

    def test_all_platforms_detectable(self) -> None:
        from app.routers.process import detect_platform

        urls = {
            "https://youtube.com/watch?v=x": Platform.YOUTUBE,
            "https://instagram.com/reel/x": Platform.INSTAGRAM,
            "https://tiktok.com/@u/video/x": Platform.TIKTOK,
            "https://facebook.com/watch?v=x": Platform.FACEBOOK,
            "https://twitter.com/u/status/x": Platform.TWITTER,
        }
        for url, expected in urls.items():
            assert detect_platform(url) == expected, f"Failed for {url}"


# ── Process endpoint ───────────────────────────────────────────


@pytest.mark.asyncio
class TestProcessEndpoint:
    async def test_returns_202_with_job_id(self, client: AsyncClient, beanie_init) -> None:
        with (
            patch("app.routers.process.check_rate_limit", new=AsyncMock(return_value=None)),
            patch("arq.create_pool", side_effect=Exception("no redis")),
        ):
            r = await client.post("/api/process", json={"url": "https://youtube.com/watch?v=abc"})
        assert r.status_code == 202
        data = r.json()
        assert data["ok"] is True
        assert "jobId" in data["data"]
        assert data["data"]["deduplicated"] is False

    async def test_deduplication_returns_existing_job(
        self, client: AsyncClient, beanie_init
    ) -> None:
        url = "https://youtube.com/watch?v=dedup_test_proc"
        # Create a queued job directly
        job = await JobService.create(url, Platform.YOUTUBE)

        with patch("app.routers.process.check_rate_limit", new=AsyncMock(return_value=None)):
            r = await client.post("/api/process", json={"url": url})

        assert r.status_code == 202
        data = r.json()
        assert data["data"]["deduplicated"] is True
        assert data["data"]["jobId"] == str(job.id)

    async def test_rate_limit_returns_429(self, client: AsyncClient, beanie_init) -> None:
        from fastapi.responses import JSONResponse

        mock_429 = JSONResponse(
            status_code=429,
            content={
                "ok": False,
                "error": {"code": "RATE_LIMITED", "message": "Too many requests"},
            },
        )
        with patch("app.routers.process.check_rate_limit", new=AsyncMock(return_value=mock_429)):
            r = await client.post("/api/process", json={"url": "https://youtube.com/watch?v=abc"})
        assert r.status_code == 429

    async def test_creates_job_with_correct_platform(
        self, client: AsyncClient, beanie_init
    ) -> None:
        with (
            patch("app.routers.process.check_rate_limit", new=AsyncMock(return_value=None)),
            patch("arq.create_pool", side_effect=Exception("no redis")),
        ):
            r = await client.post("/api/process", json={"url": "https://instagram.com/reel/abc"})

        data = r.json()
        job = await JobService.get(data["data"]["jobId"])
        assert job.platform == Platform.INSTAGRAM


# ── Jobs endpoint ──────────────────────────────────────────────


@pytest.mark.asyncio
class TestJobsEndpoint:
    async def test_get_job_returns_status(self, client: AsyncClient, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        r = await client.get(f"/api/jobs/{job.id}")
        assert r.status_code == 200
        data = r.json()
        assert data["ok"] is True
        assert data["data"]["status"] == "queued"
        assert data["data"]["progress"] == 0

    async def test_get_nonexistent_job_returns_404(self, client: AsyncClient, beanie_init) -> None:
        from bson import ObjectId

        r = await client.get(f"/api/jobs/{ObjectId()}")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "NOT_FOUND"

    async def test_get_completed_job(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        job = await SeedFactory.completed_job()
        r = await client.get(f"/api/jobs/{job.id}")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["status"] == "completed"
        assert data["progress"] == 100
        assert data["completedAt"] is not None

    async def test_get_failed_job_includes_error(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        job = await SeedFactory.failed_job()
        r = await client.get(f"/api/jobs/{job.id}")
        data = r.json()["data"]
        assert data["status"] == "failed"
        assert data["error"] is not None
        assert data["errorCode"] == "TRANSCRIPT_FAILED"

    async def test_job_payload_contains_all_expected_fields(
        self, client: AsyncClient, beanie_init
    ) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        data = (await client.get(f"/api/jobs/{job.id}")).json()["data"]
        required_fields = {
            "jobId",
            "status",
            "progress",
            "currentStep",
            "progressMessage",
            "error",
            "errorCode",
            "completedAt",
        }
        for field in required_fields:
            assert field in data, f"Missing field: {field}"


# ── Trips endpoints ────────────────────────────────────────────


@pytest.mark.asyncio
class TestTripsEndpoint:
    async def test_create_trip(self, client: AsyncClient, beanie_init) -> None:
        r = await client.post(
            "/api/trips",
            json={
                "title": "Japan Adventure",
                "source_url": "https://youtube.com/watch?v=abc",
                "platform": "youtube",
                "user_id": "clerk_test",
            },
        )
        assert r.status_code == 201
        data = r.json()
        assert data["ok"] is True
        assert data["data"]["title"] == "Japan Adventure"
        assert data["data"]["pinCount"] == 0

    async def test_get_trip(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(user_id="clerk_get", pin_count=3)
        r = await client.get(f"/api/trips/{trip.id}?user_id=clerk_get")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["pinCount"] == 3
        assert len(data["pins"]) == 3

    async def test_get_trip_wrong_user_returns_403(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(user_id="clerk_owner")
        r = await client.get(f"/api/trips/{trip.id}?user_id=clerk_intruder")
        assert r.status_code == 403

    async def test_update_trip_title(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(user_id="clerk_upd", title="Old")
        r = await client.put(
            f"/api/trips/{trip.id}", json={"user_id": "clerk_upd", "title": "New Title"}
        )
        assert r.status_code == 200
        assert r.json()["data"]["title"] == "New Title"

    async def test_delete_trip(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(user_id="clerk_del")
        r = await client.delete(f"/api/trips/{trip.id}?user_id=clerk_del")
        assert r.status_code == 204

    async def test_share_trip(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(user_id="clerk_share")
        r = await client.post(f"/api/trips/{trip.id}/share?user_id=clerk_share")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["isShared"] is True
        assert data["shareToken"] is not None

    async def test_add_pin_to_trip(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(user_id="clerk_pin", pins=[])
        r = await client.post(
            f"/api/trips/{trip.id}/pins",
            json={
                "user_id": "clerk_pin",
                "place_name": "Shibuya Crossing",
                "lat": 35.6595,
                "lng": 139.7004,
                "address": "Shibuya, Tokyo, Japan",
            },
        )
        assert r.status_code == 201
        data = r.json()["data"]
        assert data["pinCount"] == 1
        assert data["pins"][0]["placeName"] == "Shibuya Crossing"
        assert data["pins"][0]["manuallyAdded"] is True

    async def test_reorder_pins(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory, make_pins

        pins = make_pins(3)
        trip = await SeedFactory.trip(user_id="clerk_reorder", pins=pins)
        original_ids = [p.id for p in sorted(pins, key=lambda p: p.order)]
        reversed_ids = list(reversed(original_ids))

        r = await client.post(
            f"/api/trips/{trip.id}/pins/reorder",
            json={
                "user_id": "clerk_reorder",
                "pin_ids": reversed_ids,
            },
        )
        assert r.status_code == 200
        result_pins = sorted(r.json()["data"]["pins"], key=lambda p: p["order"])
        assert result_pins[0]["id"] == reversed_ids[0]


# ── Chat endpoint ──────────────────────────────────────────────


@pytest.mark.asyncio
class TestChatEndpoint:
    async def test_chat_returns_reply(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(pin_count=3)

        r = await client.post(
            f"/api/trips/{trip.id}/chat",
            json={
                "message": "Build a day-by-day itinerary",
                "history": [],
            },
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert "reply" in data
        assert isinstance(data["reply"], str)
        assert len(data["reply"]) > 0

    async def test_chat_returns_suggestion_chips(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(pin_count=2)
        r = await client.post(
            f"/api/trips/{trip.id}/chat",
            json={
                "message": "What should I pack?",
                "history": [],
            },
        )
        data = r.json()["data"]
        assert "suggestionChips" in data
        assert isinstance(data["suggestionChips"], list)
        assert len(data["suggestionChips"]) > 0

    async def test_chat_with_history(self, client: AsyncClient, beanie_init) -> None:
        from app.utils.seed import SeedFactory

        trip = await SeedFactory.trip(pin_count=2)
        history = [
            {"role": "user", "content": "How long should I spend there?"},
            {"role": "assistant", "content": "I recommend 2-3 hours per stop."},
        ]
        r = await client.post(
            f"/api/trips/{trip.id}/chat",
            json={
                "message": "What about the first stop specifically?",
                "history": history,
            },
        )
        assert r.status_code == 200
        assert len(r.json()["data"]["reply"]) > 0
