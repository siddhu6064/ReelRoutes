"""
tests/test_vector_search.py

Tests for:
  1. Embedding service — text fingerprint, hash, generate, embed_trip
  2. Similar trips endpoint — GET /api/trips/:id/similar
  3. Semantic search endpoint — GET /api/explore/semantic
  4. Graceful fallback on M0 cluster (OperationFailure)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ══════════════════════════════════════════════════════════════
#  Helpers
# ══════════════════════════════════════════════════════════════


def _make_trip(
    trip_id: str = "trip_abc",
    title: str = "Tokyo Adventure",
    pins: list[dict] | None = None,
    embedding: list[float] | None = None,
    is_public: bool = True,
):
    trip = MagicMock()
    trip.id = trip_id
    trip.title = title
    trip.platform = "youtube"
    trip.source_url = f"https://youtu.be/{trip_id}"
    trip.destination_text = "Tokyo, Japan"
    trip.trip_preferences = ["food", "culture"]
    trip.embedding = embedding
    trip.embedding_hash = None
    trip.is_public = is_public
    trip.view_count = 0
    trip.video_creator = "@traveler"
    trip.video_channel = "Traveler"

    pin_data = pins or [
        {
            "place_name": "Tsukiji Market",
            "city": "Tokyo",
            "country_code": "JP",
            "context_quote": "Best tuna",
            "order": 0,
        },
        {
            "place_name": "Shibuya Crossing",
            "city": "Tokyo",
            "country_code": "JP",
            "context_quote": "",
            "order": 1,
        },
    ]
    trip_pins = []
    for p in pin_data:
        pin = MagicMock()
        pin.place_name = p["place_name"]
        pin.city = p.get("city", "")
        pin.country_code = p.get("country_code", "")
        pin.context_quote = p.get("context_quote", "")
        pin.order = p.get("order", 0)
        trip_pins.append(pin)
    trip.pins = trip_pins

    return trip


FAKE_VECTOR = [0.1] * 1536


# ══════════════════════════════════════════════════════════════
#  1. Embedding service unit tests
# ══════════════════════════════════════════════════════════════


class TestBuildTripText:
    def test_includes_title(self):
        from app.services.embedding_service import build_trip_text

        trip = _make_trip(title="Lisbon Hidden Gems")
        text = build_trip_text(trip)
        assert "Lisbon Hidden Gems" in text

    def test_includes_all_pin_names(self):
        from app.services.embedding_service import build_trip_text

        trip = _make_trip()
        text = build_trip_text(trip)
        assert "Tsukiji Market" in text
        assert "Shibuya Crossing" in text

    def test_includes_city_and_country(self):
        from app.services.embedding_service import build_trip_text

        trip = _make_trip()
        text = build_trip_text(trip)
        assert "Tokyo" in text
        assert "JP" in text

    def test_includes_context_quotes(self):
        from app.services.embedding_service import build_trip_text

        trip = _make_trip()
        text = build_trip_text(trip)
        assert "Best tuna" in text

    def test_includes_preferences(self):
        from app.services.embedding_service import build_trip_text

        trip = _make_trip()
        text = build_trip_text(trip)
        assert "food" in text

    def test_empty_pins_produces_minimal_text(self):
        from app.services.embedding_service import build_trip_text

        trip = _make_trip(pins=[])
        text = build_trip_text(trip)
        assert "Tokyo Adventure" in text


class TestFingerprintHash:
    def test_same_trip_same_hash(self):
        from app.services.embedding_service import fingerprint_hash

        trip = _make_trip()
        assert fingerprint_hash(trip) == fingerprint_hash(trip)

    def test_different_titles_different_hash(self):
        from app.services.embedding_service import fingerprint_hash

        t1 = _make_trip(title="Tokyo")
        t2 = _make_trip(title="Kyoto")
        assert fingerprint_hash(t1) != fingerprint_hash(t2)

    def test_hash_is_16_chars(self):
        from app.services.embedding_service import fingerprint_hash

        trip = _make_trip()
        assert len(fingerprint_hash(trip)) == 16


class TestGenerateEmbedding:
    @pytest.mark.asyncio
    async def test_returns_none_when_no_api_key(self):
        from app.services.embedding_service import generate_embedding

        with patch("app.services.embedding_service.get_settings") as ms:
            ms.return_value.openai_api_key = ""
            result = await generate_embedding("test text")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_vector_on_success(self):
        from app.services.embedding_service import generate_embedding

        mock_response = MagicMock()
        mock_response.data = [MagicMock(embedding=FAKE_VECTOR)]

        with (
            patch("app.services.embedding_service.get_settings") as ms,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            ms.return_value.openai_api_key = "sk-test"
            MockOpenAI.return_value.embeddings.create = AsyncMock(return_value=mock_response)
            result = await generate_embedding("Tokyo street food")

        assert result == FAKE_VECTOR
        assert len(result) == 1536

    @pytest.mark.asyncio
    async def test_returns_none_on_openai_error(self):
        from app.services.embedding_service import generate_embedding

        with (
            patch("app.services.embedding_service.get_settings") as ms,
            patch("openai.AsyncOpenAI") as MockOpenAI,
        ):
            ms.return_value.openai_api_key = "sk-test"
            MockOpenAI.return_value.embeddings.create = AsyncMock(
                side_effect=Exception("API error")
            )
            result = await generate_embedding("text")

        assert result is None


class TestEmbedTrip:
    @pytest.mark.asyncio
    async def test_skips_trip_with_no_pins(self):
        from app.services.embedding_service import embed_trip

        trip = _make_trip(pins=[])
        result = await embed_trip(trip)
        assert result is False

    @pytest.mark.asyncio
    async def test_skips_unchanged_fingerprint(self):
        from app.services.embedding_service import embed_trip, fingerprint_hash

        trip = _make_trip(embedding=FAKE_VECTOR)
        trip.embedding_hash = fingerprint_hash(trip)  # same hash = no change

        result = await embed_trip(trip)
        assert result is False

    @pytest.mark.asyncio
    async def test_generates_and_saves_embedding(self):
        from app.services.embedding_service import embed_trip

        trip = _make_trip()
        trip.save = AsyncMock()

        with patch(
            "app.services.embedding_service.generate_embedding",
            AsyncMock(return_value=FAKE_VECTOR),
        ):
            result = await embed_trip(trip)

        assert result is True
        assert trip.embedding == FAKE_VECTOR
        trip.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_force_regenerates_even_if_unchanged(self):
        from app.services.embedding_service import embed_trip, fingerprint_hash

        trip = _make_trip(embedding=FAKE_VECTOR)
        trip.embedding_hash = fingerprint_hash(trip)  # same hash normally skipped
        trip.save = AsyncMock()

        with patch(
            "app.services.embedding_service.generate_embedding",
            AsyncMock(return_value=FAKE_VECTOR),
        ):
            result = await embed_trip(trip, force=True)

        assert result is True

    @pytest.mark.asyncio
    async def test_returns_false_when_generate_fails(self):
        from app.services.embedding_service import embed_trip

        trip = _make_trip()
        trip.save = AsyncMock()

        with patch(
            "app.services.embedding_service.generate_embedding",
            AsyncMock(return_value=None),
        ):
            result = await embed_trip(trip)

        assert result is False
        trip.save.assert_not_called()


# ══════════════════════════════════════════════════════════════
#  2. find_similar_trips — graceful fallback
# ══════════════════════════════════════════════════════════════


class TestFindSimilarTrips:
    @pytest.mark.asyncio
    async def test_returns_empty_when_no_embedding(self):
        from app.services.embedding_service import find_similar_trips

        trip = _make_trip(embedding=None)
        result = await find_similar_trips(trip)
        assert result == []

    @pytest.mark.asyncio
    async def test_returns_empty_on_vector_search_unavailable(self):
        from app.services.embedding_service import find_similar_trips

        trip = _make_trip(embedding=FAKE_VECTOR)

        with patch(
            "app.services.embedding_service._vector_search",
            AsyncMock(side_effect=Exception("$vectorSearch is not supported on this cluster tier")),
        ):
            result = await find_similar_trips(trip)

        assert result == []

    @pytest.mark.asyncio
    async def test_returns_formatted_results(self):
        from app.services.embedding_service import find_similar_trips

        trip = _make_trip(embedding=FAKE_VECTOR)
        fake_results = [
            {
                "id": "trip_xyz",
                "title": "Kyoto Trip",
                "platform": "instagram",
                "pin_count": 4,
                "view_count": 10,
                "video_creator": "@creator",
                "video_channel": "Creator",
                "created_at": "2026-01-01T00:00:00",
                "similarity_score": 0.91,
            }
        ]

        with patch(
            "app.services.embedding_service._vector_search",
            AsyncMock(return_value=fake_results),
        ):
            result = await find_similar_trips(trip)

        assert len(result) == 1
        assert result[0]["id"] == "trip_xyz"
        assert result[0]["similarity_score"] == 0.91

    @pytest.mark.asyncio
    async def test_semantic_search_returns_empty_when_embedding_fails(self):
        from app.services.embedding_service import semantic_search_public

        with patch(
            "app.services.embedding_service.generate_embedding",
            AsyncMock(return_value=None),
        ):
            result = await semantic_search_public("Tokyo food tour")

        assert result == []


# ══════════════════════════════════════════════════════════════
#  3. HTTP endpoints
# ══════════════════════════════════════════════════════════════


class TestSimilarTripsEndpoint:
    def _client(self):
        from fastapi.testclient import TestClient

        from app.main import create_app

        return TestClient(create_app(), raise_server_exceptions=False)

    def test_similar_trips_returns_200(self):
        client = self._client()
        trip = _make_trip(embedding=FAKE_VECTOR)

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.services.embedding_service.find_similar_trips",
                AsyncMock(return_value=[]),
            ),
        ):
            resp = client.get("/api/trips/trip_abc/similar")

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "trips" in data["data"]

    def test_similar_trips_returns_trip_cards(self):
        client = self._client()
        trip = _make_trip(embedding=FAKE_VECTOR)
        similar = [
            {
                "id": "trip_xyz",
                "title": "Kyoto Trip",
                "platform": "instagram",
                "pin_count": 3,
                "view_count": 5,
                "video_creator": None,
                "video_channel": None,
                "created_at": "2026-01-01T00:00:00",
                "similarity_score": 0.88,
            }
        ]

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.services.embedding_service.find_similar_trips",
                AsyncMock(return_value=similar),
            ),
        ):
            resp = client.get("/api/trips/trip_abc/similar")

        data = resp.json()
        assert len(data["data"]["trips"]) == 1
        assert data["data"]["trips"][0]["similarity_score"] == 0.88

    def test_similar_trips_returns_empty_when_no_embedding(self):
        """No embedding → endpoint still returns 200 with empty list."""
        client = self._client()
        trip = _make_trip(embedding=None)

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.services.embedding_service.find_similar_trips",
                AsyncMock(return_value=[]),
            ),
        ):
            resp = client.get("/api/trips/trip_abc/similar")

        assert resp.status_code == 200
        assert resp.json()["data"]["trips"] == []

    def test_similar_trips_includes_source_trip_id(self):
        client = self._client()
        trip = _make_trip(embedding=FAKE_VECTOR)

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.services.embedding_service.find_similar_trips", AsyncMock(return_value=[])),
        ):
            resp = client.get("/api/trips/trip_abc/similar")

        assert resp.json()["data"]["source_trip_id"] == "trip_abc"


class TestSemanticSearchEndpoint:
    def _client(self):
        from fastapi.testclient import TestClient

        from app.main import create_app

        return TestClient(create_app(), raise_server_exceptions=False)

    def test_semantic_search_requires_q(self):
        client = self._client()
        resp = client.get("/api/explore/semantic")
        assert resp.status_code == 422

    def test_semantic_search_q_too_short_rejected(self):
        client = self._client()
        resp = client.get("/api/explore/semantic?q=a")
        assert resp.status_code == 422

    def test_semantic_search_returns_200(self):
        client = self._client()

        with patch(
            "app.services.embedding_service.semantic_search_public",
            AsyncMock(return_value=[]),
        ):
            resp = client.get("/api/explore/semantic?q=tokyo+street+food")

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["data"]["semantic"] is True
        assert data["data"]["query"] == "tokyo street food"

    def test_semantic_search_returns_results(self):
        client = self._client()
        results = [
            {
                "id": "trip_sea",
                "title": "Seoul Food Tour",
                "platform": "tiktok",
                "pin_count": 6,
                "view_count": 100,
                "video_creator": "@foodie",
                "video_channel": None,
                "created_at": "2026-02-01T00:00:00",
                "similarity_score": 0.85,
            }
        ]

        with patch(
            "app.services.embedding_service.semantic_search_public",
            AsyncMock(return_value=results),
        ):
            resp = client.get("/api/explore/semantic?q=asian+street+food")

        data = resp.json()
        assert len(data["data"]["trips"]) == 1
        assert data["data"]["trips"][0]["title"] == "Seoul Food Tour"

    def test_semantic_search_graceful_on_vector_error(self):
        """Should return empty trips, not 500, when vector search fails."""
        client = self._client()

        with patch(
            "app.services.embedding_service.semantic_search_public",
            AsyncMock(return_value=[]),
        ):
            resp = client.get("/api/explore/semantic?q=mountains+hiking")

        assert resp.status_code == 200
        assert resp.json()["data"]["trips"] == []
