"""
tests/test_chat_stream.py

Tests for the streaming SSE chat endpoint and chat_stream generator.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ══════════════════════════════════════════════════════════════
#  1. chat_stream generator (service layer)
# ══════════════════════════════════════════════════════════════


class TestChatStreamService:
    """Unit tests for chat_service.chat_stream() async generator."""

    def _make_trip(self, n_pins: int = 2):
        trip = MagicMock()
        trip.id = "trip_abc"
        trip.title = "Tokyo Adventure"
        trip.platform = "youtube"
        trip.source_url = "https://youtu.be/abc"
        trip.pins = []
        for i in range(n_pins):
            pin = MagicMock()
            pin.place_name = f"Place {i}"
            pin.city = "Tokyo"
            pin.country_code = "JP"
            pin.context_quote = ""
            pin.order = i
            trip.pins.append(pin)
        return trip

    @pytest.mark.asyncio
    async def test_mock_response_yields_sse_events(self):
        """When no API key is set, mock yields token events then [DONE]."""
        from app.services.chat_service import chat_stream

        trip = self._make_trip()

        with patch("app.services.chat_service.get_settings") as mock_settings:
            mock_settings.return_value.openai_api_key = None
            mock_settings.return_value.openai_chat_model = "gpt-4o"

            events = []
            async for chunk in chat_stream(trip, "What's the plan?", []):
                events.append(chunk)

        assert events[-1] == "data: [DONE]\n\n"
        token_events = [e for e in events if e != "data: [DONE]\n\n"]
        assert len(token_events) > 0
        # Each token event is valid SSE + JSON
        for event in token_events:
            assert event.startswith("data: ")
            payload = json.loads(event[6:].rstrip())
            assert "token" in payload
            assert isinstance(payload["token"], str)

    @pytest.mark.asyncio
    async def test_openai_streaming_yields_tokens(self):
        """Real API path: chunks from OpenAI are forwarded as SSE data lines."""
        from app.services.chat_service import chat_stream

        trip = self._make_trip()

        async def _fake_stream():
            for content in ["Hello", " world", "!"]:
                chunk = MagicMock()
                chunk.choices = [MagicMock()]
                chunk.choices[0].delta.content = content
                yield chunk

        mock_create = AsyncMock(return_value=_fake_stream())

        with (
            patch("app.services.chat_service.get_settings") as mock_settings,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            mock_settings.return_value.openai_api_key = "sk-test"
            mock_settings.return_value.openai_chat_model = "gpt-4o"
            MockOpenAI.return_value.chat.completions.create = mock_create

            events = []
            async for chunk in chat_stream(trip, "Hello", []):
                events.append(chunk)

        assert events[-1] == "data: [DONE]\n\n"
        token_events = [e for e in events if e != "data: [DONE]\n\n"]
        tokens = [json.loads(e[6:].rstrip())["token"] for e in token_events]
        assert "".join(tokens) == "Hello world!"

    @pytest.mark.asyncio
    async def test_openai_error_yields_error_event_then_done(self):
        """On OpenAI exception, generator yields error event + [DONE]."""
        from app.services.chat_service import chat_stream

        trip = self._make_trip()

        with (
            patch("app.services.chat_service.get_settings") as mock_settings,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            mock_settings.return_value.openai_api_key = "sk-test"
            mock_settings.return_value.openai_chat_model = "gpt-4o"
            MockOpenAI.return_value.chat.completions.create = AsyncMock(
                side_effect=Exception("OpenAI down")
            )

            events = []
            async for chunk in chat_stream(trip, "Hello", []):
                events.append(chunk)

        assert events[-1] == "data: [DONE]\n\n"
        error_events = [e for e in events if e != "data: [DONE]\n\n"]
        assert len(error_events) == 1
        payload = json.loads(error_events[0][6:].rstrip())
        assert "error" in payload

    @pytest.mark.asyncio
    async def test_stream_with_history(self):
        """History is passed through correctly in mock path."""
        from app.services.chat_service import chat_stream

        trip = self._make_trip()
        history = [
            {"role": "user", "content": "Hi"},
            {"role": "assistant", "content": "Hello!"},
        ]

        with patch("app.services.chat_service.get_settings") as mock_settings:
            mock_settings.return_value.openai_api_key = None
            mock_settings.return_value.openai_chat_model = "gpt-4o"

            events = []
            async for chunk in chat_stream(trip, "What next?", history):
                events.append(chunk)

        # Should still produce valid events regardless of history
        assert "data: [DONE]\n\n" in events


# ══════════════════════════════════════════════════════════════
#  2. Streaming endpoint — router level
# ══════════════════════════════════════════════════════════════


class TestChatStreamEndpoint:
    """Integration-style tests for POST /api/trips/:id/chat/stream."""

    def _make_trip(self):
        trip = MagicMock()
        trip.id = "trip_test"
        trip.title = "Test Trip"
        trip.platform = "youtube"
        trip.source_url = "https://youtu.be/abc"
        trip.pins = []
        return trip

    def _get_client(self):
        from app.main import create_app

        app = create_app()
        return TestClient(app, raise_server_exceptions=False)

    def test_stream_endpoint_returns_200_event_stream(self):
        client = self._get_client()
        trip = self._make_trip()

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.services.chat_service.get_settings") as ms,
            patch("app.config.analytics.track_chat_message_sent"),
        ):
            ms.return_value.openai_api_key = None
            ms.return_value.openai_chat_model = "gpt-4o"

            resp = client.post(
                "/api/trips/trip_test/chat/stream",
                json={"message": "Hi", "history": [], "user_id": "u1"},
                headers={"X-Test-User-Id": "u1"},
            )

        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    def test_stream_endpoint_no_buffering_headers(self):
        client = self._get_client()
        trip = self._make_trip()

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.services.chat_service.get_settings") as ms,
            patch("app.config.analytics.track_chat_message_sent"),
        ):
            ms.return_value.openai_api_key = None
            ms.return_value.openai_chat_model = "gpt-4o"

            resp = client.post(
                "/api/trips/trip_test/chat/stream",
                json={"message": "Hi", "history": [], "user_id": "u1"},
            )

        assert resp.headers.get("x-accel-buffering") == "no"
        assert "no-cache" in resp.headers.get("cache-control", "")

    def test_stream_body_contains_done_sentinel(self):
        client = self._get_client()
        trip = self._make_trip()

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.services.chat_service.get_settings") as ms,
            patch("app.config.analytics.track_chat_message_sent"),
        ):
            ms.return_value.openai_api_key = None
            ms.return_value.openai_chat_model = "gpt-4o"

            resp = client.post(
                "/api/trips/trip_test/chat/stream",
                json={"message": "Hi", "history": [], "user_id": "u1"},
            )

        assert "data: [DONE]" in resp.text

    def test_stream_body_contains_token_events(self):
        client = self._get_client()
        trip = self._make_trip()

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.services.chat_service.get_settings") as ms,
            patch("app.config.analytics.track_chat_message_sent"),
        ):
            ms.return_value.openai_api_key = None
            ms.return_value.openai_chat_model = "gpt-4o"

            resp = client.post(
                "/api/trips/trip_test/chat/stream",
                json={"message": "Itinerary please", "history": [], "user_id": "u1"},
            )

        lines = [
            line
            for line in resp.text.split("\n")
            if line.startswith("data: ") and line.strip() != "data: [DONE]"
        ]
        assert len(lines) > 0
        for line in lines:
            payload = json.loads(line[6:])
            assert "token" in payload

    def test_original_chat_endpoint_still_works(self):
        """Non-streaming endpoint must remain intact."""
        client = self._get_client()
        trip = self._make_trip()

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.routers.trips.chat", AsyncMock(return_value="Great trip!")),
            patch("app.config.analytics.track_chat_message_sent"),
        ):
            resp = client.post(
                "/api/trips/trip_test/chat",
                json={"message": "Hi", "history": [], "user_id": "u1"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["data"]["reply"] == "Great trip!"
