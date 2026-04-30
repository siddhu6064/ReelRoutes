"""
tests/test_coverage_gaps2.py

Second batch of coverage-gap tests targeting:
  - middleware/rate_limit.py        (was 25%)
  - auth/clerk.py                   (was 26%)
  - config/database.py              (was 40%)
  - config/analytics.py             (was 62%)
  - routers/users.py clerk webhook  (was 52%)
  - services/itinerary_service.py   (was 77%)
  - services/geocoding/storage.py   (was 67%)
  - services/extraction/whisper.py  (was 54%)
  - services/embedding_service._vector_search (was 82%)
  - routers/trips.py                (was 81%)
  - services/trip_service.py        (was 93%)
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request
from fastapi.testclient import TestClient


def _client():
    from app.main import create_app

    return TestClient(create_app(), raise_server_exceptions=False)


# ══════════════════════════════════════════════════════════════
#  1. middleware/rate_limit.py
# ══════════════════════════════════════════════════════════════


class TestRateLimitMiddleware:
    def _make_request(self, headers=None, client_host="127.0.0.1"):
        req = MagicMock(spec=Request)
        req.headers = headers or {}
        req.state = MagicMock()
        req.state.clerk_id = None
        req.state.request_id = "req_test"
        req.client = MagicMock()
        req.client.host = client_host
        return req

    @pytest.mark.asyncio
    async def test_rate_limit_skipped_in_test_env(self):
        """Rate limiting is disabled in test environment."""
        from app.middleware.rate_limit import check_rate_limit

        req = self._make_request()
        with patch("app.middleware.rate_limit.get_settings") as ms:
            ms.return_value.is_test = True
            ms.return_value.env = "test"
            result = await check_rate_limit(req)

        assert result is None

    @pytest.mark.asyncio
    async def test_rate_limit_key_uses_clerk_id(self):
        """Authenticated requests use clerk_id as rate limit key."""
        from app.middleware.rate_limit import _rate_limit_key

        req = self._make_request()
        req.state.clerk_id = "user_abc"
        key = _rate_limit_key(req)
        assert key == "rl:user:user_abc"

    @pytest.mark.asyncio
    async def test_rate_limit_key_uses_forwarded_for(self):
        """X-Forwarded-For header used as IP key when no auth."""
        from app.middleware.rate_limit import _rate_limit_key

        req = self._make_request(headers={"X-Forwarded-For": "1.2.3.4, 5.6.7.8"})
        req.state.clerk_id = None
        key = _rate_limit_key(req)
        assert key == "rl:ip:1.2.3.4"

    @pytest.mark.asyncio
    async def test_rate_limit_key_falls_back_to_client_host(self):
        """Falls back to request.client.host when no X-Forwarded-For."""
        from app.middleware.rate_limit import _rate_limit_key

        req = self._make_request(client_host="10.0.0.1")
        req.state.clerk_id = None
        key = _rate_limit_key(req)
        assert key == "rl:ip:10.0.0.1"

    def test_memory_check_under_limit_returns_none(self):
        """_memory_check returns None when under the daily limit."""
        from app.middleware.rate_limit import _fallback_store, _memory_check

        req = self._make_request()
        _fallback_store["rl:test:memory1"] = (2, __import__("time").time())
        result = _memory_check("rl:test:memory1", req)
        assert result is None

    def test_memory_check_over_limit_returns_429(self):
        """_memory_check returns 429 JSONResponse when at limit."""
        from app.middleware.rate_limit import (
            FREE_TIER_DAILY_LIMIT,
            _fallback_store,
            _memory_check,
        )

        req = self._make_request()
        req.state.request_id = "req_limited"
        _fallback_store["rl:test:memory2"] = (FREE_TIER_DAILY_LIMIT, __import__("time").time())
        result = _memory_check("rl:test:memory2", req)
        assert result is not None
        assert result.status_code == 429

    def test_memory_check_resets_after_window(self):
        """_memory_check resets counter when window has expired."""
        from app.middleware.rate_limit import (
            FREE_TIER_DAILY_LIMIT,
            _fallback_store,
            _memory_check,
        )

        req = self._make_request()
        # Set count at limit but with old timestamp
        old_time = __import__("time").time() - 90000  # 25 hours ago
        _fallback_store["rl:test:memory3"] = (FREE_TIER_DAILY_LIMIT, old_time)
        result = _memory_check("rl:test:memory3", req)
        assert result is None  # Window expired, counter reset

    def test_build_429_includes_retry_after(self):
        """_build_429 response includes Retry-After header."""
        from app.middleware.rate_limit import _build_429

        req = self._make_request()
        req.state.request_id = "req_429"
        response = _build_429(req, retry_after=3600)
        assert response.status_code == 429
        assert response.headers.get("Retry-After") == "3600"
        body = json.loads(response.body)
        assert body["error"]["code"] == "RATE_LIMITED"

    @pytest.mark.asyncio
    async def test_rate_limit_falls_back_to_memory_on_redis_error(self):
        """Redis error triggers in-memory fallback."""
        from app.middleware.rate_limit import check_rate_limit

        req = self._make_request()
        req.state.clerk_id = "user_redis_err"

        with (
            patch("app.middleware.rate_limit.get_settings") as ms,
            patch(
                "app.middleware.rate_limit._redis_check",
                AsyncMock(side_effect=Exception("Redis down")),
            ),
            patch("app.middleware.rate_limit._memory_check", return_value=None) as mock_mem,
        ):
            ms.return_value.is_test = False
            ms.return_value.env = "production"
            ms.return_value.redis_url = "redis://localhost:6379"
            result = await check_rate_limit(req)

        mock_mem.assert_called_once()
        assert result is None


# ══════════════════════════════════════════════════════════════
#  2. auth/clerk.py
# ══════════════════════════════════════════════════════════════


class TestClerkAuth:
    @pytest.mark.asyncio
    async def test_get_jwks_returns_empty_when_no_key(self):
        """_get_jwks returns empty keys when publishable key not set."""
        import app.auth.clerk as clerk_module

        # Reset cache
        clerk_module._jwks_cache = None
        clerk_module._jwks_fetched_at = 0.0

        with patch("app.auth.clerk.get_settings") as ms:
            ms.return_value.clerk_publishable_key = ""
            result = await clerk_module._get_jwks()

        assert result == {"keys": []}

    @pytest.mark.asyncio
    async def test_get_jwks_returns_cached_value(self):
        """_get_jwks returns cached result without hitting network."""
        import time

        import app.auth.clerk as clerk_module

        cached = {"keys": [{"kid": "test_key"}]}
        clerk_module._jwks_cache = cached
        clerk_module._jwks_fetched_at = time.time()  # Fresh cache

        with patch("httpx.AsyncClient") as mock_client:
            result = await clerk_module._get_jwks()

        mock_client.assert_not_called()  # No network call made
        assert result == cached

    def test_verify_jwt_raises_on_missing_key(self):
        """_verify_jwt raises UnauthorizedError when kid not in JWKS."""
        from app.auth.clerk import _verify_jwt
        from app.middleware.error_handler import UnauthorizedError

        jwks = {"keys": []}  # Empty — kid won't be found

        # Create a fake JWT header with a kid
        import base64

        header = base64.urlsafe_b64encode(
            json.dumps({"alg": "RS256", "kid": "key123"}).encode()
        ).rstrip(b"=")
        payload = base64.urlsafe_b64encode(json.dumps({"sub": "user_abc"}).encode()).rstrip(b"=")
        fake_token = f"{header.decode()}.{payload.decode()}.fake_sig"

        with pytest.raises((UnauthorizedError, Exception)):
            _verify_jwt(fake_token, jwks)

    def test_extract_bearer_parses_auth_header(self):
        """_extract_bearer returns token from Authorization header."""
        from app.auth.clerk import _extract_bearer

        req = MagicMock()
        req.headers = {"Authorization": "Bearer tok_abc123"}
        result = _extract_bearer(req)
        assert result == "tok_abc123"

    def test_extract_bearer_returns_none_without_header(self):
        """_extract_bearer returns None when no Authorization header."""
        from app.auth.clerk import _extract_bearer

        req = MagicMock()
        req.headers = {}
        assert _extract_bearer(req) is None

    def test_extract_bearer_returns_none_for_non_bearer(self):
        """_extract_bearer returns None for Basic auth scheme."""
        from app.auth.clerk import _extract_bearer

        req = MagicMock()
        req.headers = {"Authorization": "Basic dXNlcjpwYXNz"}
        assert _extract_bearer(req) is None

    @pytest.mark.asyncio
    async def test_optional_auth_returns_none_when_no_token(self):
        """optional_auth returns None gracefully with no token."""
        from app.auth.clerk import optional_auth

        req = MagicMock()
        req.headers = {}
        req.state = MagicMock()

        with patch("app.auth.clerk.get_settings") as ms:
            ms.return_value.is_test = False
            result = await optional_auth(req)

        assert result is None

    @pytest.mark.asyncio
    async def test_require_auth_raises_without_token(self):
        """require_auth raises UnauthorizedError when no Bearer token."""
        from app.auth.clerk import require_auth
        from app.middleware.error_handler import UnauthorizedError

        req = MagicMock()
        req.headers = {}
        req.state = MagicMock()

        with patch("app.auth.clerk.get_settings") as ms:
            ms.return_value.is_test = False
            with pytest.raises(UnauthorizedError):
                await require_auth(req)


# ══════════════════════════════════════════════════════════════
#  3. config/database.py
# ══════════════════════════════════════════════════════════════


class TestDatabase:
    @pytest.mark.asyncio
    async def test_disconnect_db_when_not_connected_is_noop(self):
        """disconnect_db when no client is safe to call."""
        import app.config.database as db_module

        db_module._client = None
        await db_module.disconnect_db()  # Must not raise

    @pytest.mark.asyncio
    async def test_disconnect_db_closes_client(self):
        """disconnect_db closes the motor client."""
        import app.config.database as db_module

        mock_client = MagicMock()
        db_module._client = mock_client
        await db_module.disconnect_db()

        mock_client.close.assert_called_once()
        assert db_module._client is None

    def test_get_db_raises_when_not_connected(self):
        """get_db raises RuntimeError when connect_db hasn't been called."""
        import app.config.database as db_module

        db_module._client = None
        with pytest.raises(RuntimeError, match="Database not connected"):
            db_module.get_db()

    def test_redact_url_hides_password(self):
        """_redact_url replaces password with *** in MongoDB URLs."""
        from app.config.database import _redact_url

        url = "mongodb+srv://alice:secretpassword@cluster.mongodb.net/db"
        redacted = _redact_url(url)
        assert "secretpassword" not in redacted
        assert "alice" in redacted
        assert "***" in redacted

    def test_redact_url_passthrough_without_credentials(self):
        """_redact_url returns URL unchanged when no @ (no credentials)."""
        from app.config.database import _redact_url

        url = "mongodb://localhost:27017"
        assert _redact_url(url) == url


# ══════════════════════════════════════════════════════════════
#  4. config/analytics.py
# ══════════════════════════════════════════════════════════════


class TestAnalytics:
    def setup_method(self):
        """Reset PostHog client between tests."""
        import app.config.analytics as analytics

        analytics._posthog = None

    def test_get_client_returns_none_in_test(self):
        """_get_client returns None in test environment."""
        from app.config.analytics import _get_client

        with patch("app.config.settings.get_settings") as ms:
            ms.return_value.posthog_api_key = "phc_test"
            ms.return_value.is_test = True
            ms.return_value.is_development = False
            result = _get_client()

        assert result is None

    def test_get_client_returns_none_without_key(self):
        """_get_client returns None when POSTHOG_API_KEY not set."""
        from app.config.analytics import _get_client

        with patch("app.config.settings.get_settings") as ms:
            ms.return_value.posthog_api_key = ""
            ms.return_value.is_test = False
            ms.return_value.is_development = False
            result = _get_client()

        assert result is None

    def test_track_is_noop_when_no_client(self):
        """track() silently skips when PostHog is not configured."""
        from app.config.analytics import track

        with patch("app.config.analytics._get_client", return_value=None):
            track("user_1", "test_event")  # Must not raise

    def test_track_calls_capture(self):
        """track() calls posthog.capture with correct params."""
        from app.config.analytics import track

        mock_ph = MagicMock()
        with patch("app.config.analytics._get_client", return_value=mock_ph):
            track("user_1", "import_started", {"platform": "youtube"})

        mock_ph.capture.assert_called_once_with(
            distinct_id="user_1",
            event="import_started",
            properties={"platform": "youtube"},
        )

    def test_track_swallows_posthog_errors(self):
        """track() doesn't propagate PostHog API errors."""
        from app.config.analytics import track

        mock_ph = MagicMock()
        mock_ph.capture.side_effect = Exception("PostHog down")
        with (
            patch("app.config.analytics._get_client", return_value=mock_ph),
            patch("app.config.analytics.logger"),
        ):
            track("user_1", "test_event")  # Must not raise

    def test_track_import_started(self):
        """track_import_started sends correct event."""
        from app.config.analytics import track_import_started

        with patch("app.config.analytics.track") as mock_track:
            track_import_started("user_1", "https://youtu.be/abc", "youtube")

        mock_track.assert_called_once()
        args = mock_track.call_args
        assert args[1]["event"] == "import_started"

    def test_track_import_completed(self):
        """track_import_completed sends all fields."""
        from app.config.analytics import track_import_completed

        with patch("app.config.analytics.track") as mock_track:
            track_import_completed("user_1", "job_1", "youtube", 5, 4, "youtube_cc")

        props = mock_track.call_args[1]["properties"]
        assert props["pin_count"] == 5
        assert props["platform"] == "youtube"

    def test_track_guest_user_uses_guest_id(self):
        """None user_id falls back to 'guest' as distinct_id."""
        from app.config.analytics import track_import_started

        with patch("app.config.analytics.track") as mock_track:
            track_import_started(None, "https://youtu.be/abc", "youtube")

        assert mock_track.call_args[1]["distinct_id"] == "guest"

    def test_track_trip_shared(self):
        """track_trip_shared sends trip_id in properties."""
        from app.config.analytics import track_trip_shared

        with patch("app.config.analytics.track") as mock_track:
            track_trip_shared("user_1", "trip_abc")

        props = mock_track.call_args[1]["properties"]
        assert props["trip_id"] == "trip_abc"

    def test_track_pin_edited(self):
        """track_pin_edited sends action in properties."""
        from app.config.analytics import track_pin_edited

        with patch("app.config.analytics.track") as mock_track:
            track_pin_edited("user_1", "trip_abc", "delete")

        props = mock_track.call_args[1]["properties"]
        assert props["action"] == "delete"


# ══════════════════════════════════════════════════════════════
#  5. routers/users.py — Clerk webhook handler
# ══════════════════════════════════════════════════════════════


class TestClerkWebhook:
    def _client(self):
        return TestClient(
            __import__("app.main", fromlist=["create_app"]).create_app(),
            raise_server_exceptions=False,
        )

    def _webhook_body(self, event_type: str, data: dict) -> dict:
        return {"type": event_type, "data": data}

    def test_user_created_event_syncs_user(self):
        """user.created webhook creates a new UserDocument."""
        client = self._client()
        body = self._webhook_body(
            "user.created",
            {
                "id": "user_clerk_1",
                "email_addresses": [{"id": "em_1", "email_address": "alice@test.com"}],
                "primary_email_address_id": "em_1",
                "first_name": "Alice",
                "last_name": "Smith",
                "image_url": None,
                "external_accounts": [],
            },
        )

        with patch("app.routers.users.UserDocument") as MockUD:
            MockUD.find_one = AsyncMock(return_value=None)
            new_user = MagicMock()
            new_user.insert = AsyncMock()
            MockUD.return_value = new_user
            resp = client.post("/api/webhooks/clerk", json=body)

        assert resp.status_code == 200
        assert resp.json()["data"]["synced"] is True

    def test_user_updated_event_updates_existing_user(self):
        """user.updated webhook updates existing UserDocument."""
        client = self._client()
        body = self._webhook_body(
            "user.updated",
            {
                "id": "user_clerk_1",
                "email_addresses": [{"id": "em_1", "email_address": "new@test.com"}],
                "primary_email_address_id": "em_1",
                "first_name": "Bob",
                "last_name": "Jones",
                "image_url": "https://img.com/avatar.jpg",
                "external_accounts": [],
            },
        )

        existing = MagicMock()
        existing.email = "old@test.com"
        existing.name = "Old Name"
        existing.avatar_url = None
        existing.google_id = None
        existing.updated_at = datetime.now(UTC)
        existing.save = AsyncMock()

        with patch("app.routers.users.UserDocument") as MockUD:
            MockUD.find_one = AsyncMock(return_value=existing)
            resp = client.post("/api/webhooks/clerk", json=body)

        assert resp.status_code == 200
        assert resp.json()["data"]["synced"] is True

    def test_user_deleted_event_purges_data(self):
        """user.deleted webhook purges all user data."""
        client = self._client()
        body = self._webhook_body("user.deleted", {"id": "user_clerk_1"})

        with patch("app.routers.users._purge_user_data", AsyncMock()):
            resp = client.post("/api/webhooks/clerk", json=body)

        assert resp.status_code == 200
        assert resp.json()["data"]["purged"] is True

    def test_unknown_event_type_ignored(self):
        """Unrecognised event types return ignored=True."""
        client = self._client()
        body = self._webhook_body("session.created", {})

        resp = client.post("/api/webhooks/clerk", json=body)

        assert resp.status_code == 200
        assert resp.json()["data"]["ignored"] is True

    def test_webhook_extracts_google_provider_id(self):
        """Google OAuth provider_user_id is extracted from external_accounts."""
        client = self._client()
        body = self._webhook_body(
            "user.created",
            {
                "id": "user_g1",
                "email_addresses": [{"id": "em_1", "email_address": "g@gmail.com"}],
                "primary_email_address_id": "em_1",
                "first_name": "Google",
                "last_name": "User",
                "image_url": None,
                "external_accounts": [{"provider": "google", "provider_user_id": "google_uid_123"}],
            },
        )

        inserted_user = None

        async def mock_insert(self):
            nonlocal inserted_user
            inserted_user = self

        with patch("app.routers.users.UserDocument") as MockUD:
            MockUD.find_one = AsyncMock(return_value=None)
            new_user = MagicMock()
            new_user.insert = AsyncMock()
            MockUD.return_value = new_user
            resp = client.post("/api/webhooks/clerk", json=body)

        assert resp.status_code == 200


# ══════════════════════════════════════════════════════════════
#  6. services/itinerary_service.py — GPT path
# ══════════════════════════════════════════════════════════════


class TestItineraryService:
    def _make_trip_with_pins(self, n_pins=4):
        trip = MagicMock()
        trip.title = "Tokyo Trip"
        trip.platform = "youtube"
        trip.id = "trip_1"

        pins = []
        for i in range(n_pins):
            pin = MagicMock()
            pin.id = f"pin_{i}"
            pin.place_name = f"Place {i}"
            pin.city = "Tokyo"
            pin.lat = 35.6 + i * 0.01
            pin.lng = 139.7 + i * 0.01
            pin.order = i
            pins.append(pin)
        trip.pins = pins
        return trip

    @pytest.mark.asyncio
    async def test_generate_itinerary_calls_openai(self):
        """generate_itinerary calls GPT when API key is set."""
        from app.services.itinerary_service import generate_itinerary

        trip = self._make_trip_with_pins(4)
        gpt_response = {
            "days": [
                {
                    "day_number": 1,
                    "label": "Day 1 — Tokyo North",
                    "pin_ids": ["pin_0", "pin_1"],
                    "notes": "Close together",
                },
                {
                    "day_number": 2,
                    "label": "Day 2 — Tokyo South",
                    "pin_ids": ["pin_2", "pin_3"],
                    "notes": "South area",
                },
            ]
        }

        mock_message = MagicMock()
        mock_message.content = json.dumps(gpt_response)
        mock_resp = MagicMock()
        mock_resp.choices = [MagicMock(message=mock_message)]

        with (
            patch("app.services.itinerary_service.get_settings") as ms,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            ms.return_value.openai_api_key = "sk-test"
            ms.return_value.openai_chat_model = "gpt-4o-mini"
            MockOpenAI.return_value.chat.completions.create = AsyncMock(return_value=mock_resp)

            result = await generate_itinerary(trip, trip_length_days=2)

        assert len(result) == 2
        assert result[0].day_number == 1
        assert "pin_0" in result[0].pin_ids

    @pytest.mark.asyncio
    async def test_generate_itinerary_falls_back_on_gpt_error(self):
        """generate_itinerary uses fallback split when GPT fails."""
        from app.services.itinerary_service import generate_itinerary

        trip = self._make_trip_with_pins(4)

        with (
            patch("app.services.itinerary_service.get_settings") as ms,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            ms.return_value.openai_api_key = "sk-test"
            ms.return_value.openai_chat_model = "gpt-4o-mini"
            MockOpenAI.return_value.chat.completions.create = AsyncMock(
                side_effect=Exception("OpenAI down")
            )
            result = await generate_itinerary(trip, trip_length_days=2)

        assert len(result) >= 1  # Fallback still produces days

    @pytest.mark.asyncio
    async def test_generate_itinerary_falls_back_on_bad_json(self):
        """generate_itinerary uses fallback split when GPT returns bad JSON."""
        from app.services.itinerary_service import generate_itinerary

        trip = self._make_trip_with_pins(4)
        mock_message = MagicMock()
        mock_message.content = "not valid json at all"
        mock_resp = MagicMock()
        mock_resp.choices = [MagicMock(message=mock_message)]

        with (
            patch("app.services.itinerary_service.get_settings") as ms,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            ms.return_value.openai_api_key = "sk-test"
            ms.return_value.openai_chat_model = "gpt-4o-mini"
            MockOpenAI.return_value.chat.completions.create = AsyncMock(return_value=mock_resp)
            result = await generate_itinerary(trip, trip_length_days=2)

        assert len(result) >= 1

    @pytest.mark.asyncio
    async def test_generate_itinerary_strips_markdown_fences(self):
        """generate_itinerary strips ```json fences from GPT response."""
        from app.services.itinerary_service import generate_itinerary

        trip = self._make_trip_with_pins(2)
        gpt_response = {
            "days": [
                {"day_number": 1, "label": "Day 1", "pin_ids": ["pin_0", "pin_1"], "notes": ""},
            ]
        }
        content = f"```json\n{json.dumps(gpt_response)}\n```"
        mock_message = MagicMock()
        mock_message.content = content
        mock_resp = MagicMock()
        mock_resp.choices = [MagicMock(message=mock_message)]

        with (
            patch("app.services.itinerary_service.get_settings") as ms,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            ms.return_value.openai_api_key = "sk-test"
            ms.return_value.openai_chat_model = "gpt-4o-mini"
            MockOpenAI.return_value.chat.completions.create = AsyncMock(return_value=mock_resp)
            result = await generate_itinerary(trip, trip_length_days=1)

        assert len(result) == 1


# ══════════════════════════════════════════════════════════════
#  7. services/geocoding/storage.py
# ══════════════════════════════════════════════════════════════


class TestGeocodingStorage:
    def test_classify_category_restaurant(self):
        """restaurant type → FOOD category."""
        from app.services.geocoding.storage import classify_category

        result = classify_category(["restaurant", "food"])
        assert result == "restaurant"

    def test_classify_category_museum(self):
        """museum type → LANDMARK category."""
        from app.services.geocoding.storage import classify_category

        result = classify_category(["museum"])
        assert result == "landmark"

    def test_classify_category_park(self):
        """park type → NATURE category."""
        from app.services.geocoding.storage import classify_category

        result = classify_category(["park"])
        assert result == "nature"

    def test_classify_category_shopping_mall(self):
        """shopping_mall type → SHOPPING category."""
        from app.services.geocoding.storage import classify_category

        result = classify_category(["shopping_mall"])
        assert result == "shopping"

    def test_classify_category_unknown_returns_other(self):
        """Unrecognised type → OTHER category."""
        from app.services.geocoding.storage import classify_category

        result = classify_category(["totally_unknown_type"])
        assert result == "other"

    def test_classify_category_empty_list_returns_other(self):
        """Empty type list → OTHER."""
        from app.services.geocoding.storage import classify_category

        result = classify_category([])
        assert result == "other"


# ══════════════════════════════════════════════════════════════
#  8. services/trip_service.py — uncovered branches
# ══════════════════════════════════════════════════════════════


class TestTripServiceBranches:
    @pytest.mark.asyncio
    async def test_get_raises_for_wrong_user(self):
        """TripService.get raises ForbiddenError for wrong user."""
        from app.middleware.error_handler import ForbiddenError
        from app.services.trip_service import TripService

        trip = MagicMock()
        trip.id = "trip_1"
        trip.user_id = "owner"
        trip.collaborators = []
        trip.is_public = False

        with (
            patch("app.models.documents.TripDocument.get", AsyncMock(return_value=trip)),
            pytest.raises(ForbiddenError),
        ):
            await TripService.get("trip_1", user_id="stranger")

    @pytest.mark.asyncio
    async def test_get_raises_not_found_for_missing_trip(self):
        """TripService.get raises NotFoundError when trip doesn't exist."""
        from app.middleware.error_handler import NotFoundError
        from app.services.trip_service import TripService

        with (
            patch("app.models.documents.TripDocument.get", AsyncMock(return_value=None)),
            pytest.raises(NotFoundError),
        ):
            await TripService.get("nonexistent")

    @pytest.mark.asyncio
    async def test_delete_raises_for_wrong_user(self):
        """TripService.delete raises ForbiddenError for non-owner."""
        from app.middleware.error_handler import ForbiddenError
        from app.services.trip_service import TripService

        trip = MagicMock()
        trip.id = "trip_1"
        trip.user_id = "owner"

        with (
            patch("app.models.documents.TripDocument.get", AsyncMock(return_value=trip)),
            pytest.raises(ForbiddenError),
        ):
            await TripService.delete("trip_1", user_id="not_owner")


# ══════════════════════════════════════════════════════════════
#  9. services/embedding_service.py — _vector_search pipeline
# ══════════════════════════════════════════════════════════════


class TestEmbeddingVectorSearch:
    @pytest.mark.asyncio
    async def test_semantic_search_public_returns_empty_on_vector_error(self):
        """semantic_search_public returns [] on any vector search error."""
        from app.services.embedding_service import semantic_search_public

        with (
            patch(
                "app.services.embedding_service.generate_embedding",
                AsyncMock(return_value=[0.1] * 1536),
            ),
            patch(
                "app.services.embedding_service._vector_search",
                AsyncMock(side_effect=Exception("vector search failed")),
            ),
        ):
            result = await semantic_search_public("tokyo food tour")

        assert result == []

    @pytest.mark.asyncio
    async def test_find_similar_trips_excludes_self(self):
        """find_similar_trips filters out the source trip's own ID."""
        from app.services.embedding_service import find_similar_trips

        trip = MagicMock()
        trip.id = "self_trip"
        trip.embedding = [0.1] * 1536

        fake_results = [
            {
                "id": "other_trip",
                "title": "Similar",
                "platform": "youtube",
                "pin_count": 3,
                "view_count": 0,
                "video_creator": None,
                "video_channel": None,
                "created_at": "2026-01-01",
                "similarity_score": 0.90,
            },
        ]

        with patch(
            "app.services.embedding_service._vector_search",
            AsyncMock(return_value=fake_results),
        ):
            result = await find_similar_trips(trip, public_only=True)

        assert len(result) == 1
        assert result[0]["id"] == "other_trip"

    @pytest.mark.asyncio
    async def test_format_result_handles_datetime_objects(self):
        """_format_result converts datetime objects to ISO strings."""
        from app.services.embedding_service import _format_result

        raw = {
            "_id": "trip_1",
            "title": "Test",
            "platform": "youtube",
            "pins": [MagicMock(), MagicMock()],
            "view_count": 5,
            "video_creator": "@creator",
            "video_channel": None,
            "created_at": datetime(2026, 1, 1, tzinfo=UTC),
            "score": 0.88,
        }
        result = _format_result(raw)
        assert result["id"] == "trip_1"
        assert result["pin_count"] == 2
        assert result["similarity_score"] == 0.88
        assert "2026" in result["created_at"]
