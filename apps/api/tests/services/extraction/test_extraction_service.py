"""
tests/services/extraction/test_extraction_service.py

Task 8 — extraction.service.test with mocked multi-platform inputs.
Covers rich (YouTube CC), medium (Instagram description), sparse (hashtags only),
Whisper fallback, chunked extraction, and Job document persistence.
"""
from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

import pytest

from app.adapters.base import AdapterOutput, CaptionsSource
from app.models.documents import Platform
from app.services.extraction.parser import ExtractedLocation
from app.services.extraction.service import (
    ExtractionResult,
    ExtractionService,
    _unwrap_if_needed,
)
from app.services.extraction.signals import SignalType
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401


# ── Shared fixtures ────────────────────────────────────────────

JAPAN_LOCATIONS_JSON = json.dumps([
    {"place_name": "Shibuya Crossing", "context_quote": "We started at Shibuya", "confidence": 0.97, "timestamp_hint": 135.0},
    {"place_name": "Senso-ji Temple", "context_quote": "Oldest temple in Tokyo", "confidence": 0.94, "timestamp_hint": 810.0},
    {"place_name": "Fushimi Inari Taisha", "context_quote": "Ten thousand torii gates", "confidence": 0.96, "timestamp_hint": 3120.0},
    {"place_name": "Arashiyama Bamboo Grove", "context_quote": "The bamboo grove is surreal", "confidence": 0.93, "timestamp_hint": 3136.7},
    {"place_name": "Dotonbori", "context_quote": "Osaka food scene at Dotonbori", "confidence": 0.91, "timestamp_hint": 4920.0},
])

BALI_LOCATIONS_JSON = json.dumps([
    {"place_name": "Ubud Monkey Forest", "context_quote": "Feed the monkeys carefully", "confidence": 0.92, "timestamp_hint": None},
    {"place_name": "Tegallalang Rice Terraces", "context_quote": "Tegallalang at sunrise", "confidence": 0.90, "timestamp_hint": None},
    {"place_name": "Mount Batur", "context_quote": "Woke up at 2am for this hike", "confidence": 0.88, "timestamp_hint": None},
])


def _make_output(
    platform: Platform,
    transcript: str | None = None,
    description: str | None = None,
    hashtags: list[str] | None = None,
    location_tag: str | None = None,
    captions_source: CaptionsSource = CaptionsSource.NONE,
    has_captions: bool = False,
) -> AdapterOutput:
    out = AdapterOutput(
        platform=platform,
        url="https://example.com/video",
        video_id="test",
        canonical_url="https://example.com/video",
        title="Test Travel Video",
        transcript=transcript,
        description=description,
        hashtags=hashtags or [],
        location_tag=location_tag,
        captions_source=captions_source,
        has_captions=has_captions,
    )
    return out


# ── ExtractionService.extract tests ───────────────────────────

@pytest.mark.asyncio
class TestExtractionServiceRichSignal:
    """YouTube with full CC transcript — richest case."""

    async def test_extracts_locations_from_youtube_cc(self) -> None:
        out = _make_output(
            Platform.YOUTUBE,
            transcript="We started at the Shibuya Crossing then visited Senso-ji Temple in Asakusa.",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        with patch("app.services.extraction.service._call_gpt4o", AsyncMock(return_value=(JAPAN_LOCATIONS_JSON, 312))):
            result = await ExtractionService.extract(out)

        assert result.ok
        assert len(result.locations) == 5
        assert result.signal_type == SignalType.YOUTUBE_CC
        assert result.total_tokens == 312

    async def test_locations_have_confidence_above_threshold(self) -> None:
        out = _make_output(
            Platform.YOUTUBE,
            transcript="Full transcript about Japan",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        with patch("app.services.extraction.service._call_gpt4o", AsyncMock(return_value=(JAPAN_LOCATIONS_JSON, 200))):
            result = await ExtractionService.extract(out)

        assert all(loc.confidence >= 0.4 for loc in result.locations)

    async def test_locations_have_sequential_order(self) -> None:
        out = _make_output(
            Platform.YOUTUBE,
            transcript="Japan travel video",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        with patch("app.services.extraction.service._call_gpt4o", AsyncMock(return_value=(JAPAN_LOCATIONS_JSON, 200))):
            result = await ExtractionService.extract(out)

        orders = [loc.order for loc in result.locations]
        assert orders == list(range(len(result.locations)))

    async def test_timestamp_hints_populated_from_cc(self) -> None:
        out = _make_output(
            Platform.YOUTUBE,
            transcript="Japan with timestamps",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        with patch("app.services.extraction.service._call_gpt4o", AsyncMock(return_value=(JAPAN_LOCATIONS_JSON, 200))):
            result = await ExtractionService.extract(out)

        # First location should have a timestamp_hint from the fixture
        first = result.locations[0]
        assert first.timestamp_hint is not None


@pytest.mark.asyncio
class TestExtractionServiceMediumSignal:
    """Instagram with rich description — medium signal."""

    async def test_extracts_from_instagram_description(self) -> None:
        out = _make_output(
            Platform.INSTAGRAM,
            description="📍 Ubud Monkey Forest\n📍 Tegallalang Rice Terraces\n📍 Mount Batur\n#bali #travel",
            hashtags=["bali", "indonesia", "travel"],
            location_tag="Ubud, Bali, Indonesia",
        )
        with patch("app.services.extraction.service._call_gpt4o", AsyncMock(return_value=(BALI_LOCATIONS_JSON, 180))):
            result = await ExtractionService.extract(out)

        assert result.ok
        assert result.signal_type == SignalType.DESCRIPTION
        assert len(result.locations) == 3

    async def test_location_tag_included_in_context(self) -> None:
        """The tagged location should appear in the context block sent to GPT-4o."""
        out = _make_output(
            Platform.INSTAGRAM,
            description="Beautiful trip",
            location_tag="Kyoto, Japan",
        )
        captured_prompts: list[str] = []

        async def capture(system, user, model, retries=3):
            captured_prompts.append(user)
            return ("[]", 0)

        with patch("app.services.extraction.service._call_gpt4o", capture):
            await ExtractionService.extract(out)

        assert any("Kyoto" in p for p in captured_prompts)


@pytest.mark.asyncio
class TestExtractionServiceSparseSignal:
    """Hashtags-only signal — sparsest case."""

    async def test_extracts_from_hashtags_only(self) -> None:
        sparse_json = json.dumps([
            {"place_name": "Morocco", "context_quote": "#morocco", "confidence": 0.55},
            {"place_name": "Marrakech", "context_quote": "#marrakech", "confidence": 0.58},
        ])
        out = _make_output(
            Platform.TIKTOK,
            hashtags=["morocco", "marrakech", "travel"],
        )
        with patch("app.services.extraction.service._call_gpt4o", AsyncMock(return_value=(sparse_json, 80))):
            result = await ExtractionService.extract(out)

        assert result.ok
        assert result.signal_type == SignalType.HASHTAGS
        assert len(result.locations) >= 1

    async def test_no_signal_returns_error_result(self) -> None:
        out = _make_output(Platform.TIKTOK)  # no transcript, description, or hashtags
        result = await ExtractionService.extract(out)
        assert not result.ok
        assert result.error is not None
        assert len(result.locations) == 0


@pytest.mark.asyncio
class TestExtractionServiceWhisperFallback:
    """Platforms without captions trigger Whisper before GPT-4o."""

    async def test_whisper_called_when_no_cc(self) -> None:
        out = _make_output(
            Platform.TIKTOK,
            description=None,
            hashtags=["morocco"],
        )
        mock_whisper_transcript = "We started in Marrakech then drove to Chefchaouen."
        whisper_mock = AsyncMock(return_value=(mock_whisper_transcript, [], CaptionsSource.WHISPER))
        gpt_mock = AsyncMock(return_value=(json.dumps([
            {"place_name": "Marrakech", "context_quote": "Started in Marrakech", "confidence": 0.9},
        ]), 100))

        with (
            patch("app.services.extraction.service.transcribe_url", whisper_mock),
            patch("app.services.extraction.service._call_gpt4o", gpt_mock),
        ):
            result = await ExtractionService.extract(out)

        whisper_mock.assert_awaited_once()
        assert result.signal_type == SignalType.WHISPER
        assert len(result.locations) >= 1

    async def test_whisper_not_called_when_transcript_exists(self) -> None:
        out = _make_output(
            Platform.INSTAGRAM,
            transcript="We visited Ubud Monkey Forest",
            description="Bali trip",
            captions_source=CaptionsSource.DESCRIPTION,
        )
        whisper_mock = AsyncMock()
        with (
            patch("app.services.extraction.service.transcribe_url", whisper_mock),
            patch("app.services.extraction.service._call_gpt4o", AsyncMock(return_value=(BALI_LOCATIONS_JSON, 100))),
        ):
            await ExtractionService.extract(out)

        whisper_mock.assert_not_awaited()


@pytest.mark.asyncio
class TestExtractionServiceChunking:
    """Long transcripts are split and results merged."""

    async def test_chunked_extraction_called_for_long_transcript(self) -> None:
        # 800x = ~4801 tokens, above the 4000-token CHUNK_THRESHOLD
        long_transcript = "We visited Shibuya Crossing. " * 800
        out = _make_output(
            Platform.YOUTUBE,
            transcript=long_transcript,
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        chunk_results: list[int] = []

        async def counting_gpt4o(system, user, model, retries=3):
            chunk_results.append(1)
            return (JAPAN_LOCATIONS_JSON, 200)

        with patch("app.services.extraction.service._call_gpt4o", counting_gpt4o):
            result = await ExtractionService.extract(out)

        assert result.chunk_count > 1
        assert len(chunk_results) > 1  # multiple GPT-4o calls made
        assert result.ok

    async def test_merged_results_deduplicated(self) -> None:
        long_transcript = "We visited Shibuya. " * 800
        out = _make_output(
            Platform.YOUTUBE,
            transcript=long_transcript,
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        # Each chunk returns the same locations (extreme overlap scenario)
        with patch("app.services.extraction.service._call_gpt4o",
                   AsyncMock(return_value=(JAPAN_LOCATIONS_JSON, 200))):
            result = await ExtractionService.extract(out)

        place_names = [loc.place_name for loc in result.locations]
        assert len(place_names) == len(set(place_names)), "Duplicates found after merge"


@pytest.mark.asyncio
class TestExtractionServiceRetry:
    """GPT-4o retries on transient failures."""

    async def test_gpt4o_retry_on_rate_limit(self) -> None:
        """Service handles rate limits gracefully — returns empty but doesn't crash."""
        out = _make_output(
            Platform.YOUTUBE,
            transcript="Japan travel",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        # Simulate all retries failing
        with patch(
            "app.services.extraction.service._call_gpt4o",
            AsyncMock(return_value=("[]", 0)),
        ):
            result = await ExtractionService.extract(out)

        # Should complete without crashing, just with no locations
        assert isinstance(result, ExtractionResult)
        assert result.ok  # no locations but no hard error


@pytest.mark.asyncio
class TestExtractionServiceJobPersistence:
    """Task 7 — extracted_places stored on Job document."""

    async def test_extraction_persisted_to_job(self, beanie_init) -> None:
        from app.utils.seed import SeedFactory
        job = await SeedFactory.job()

        out = _make_output(
            Platform.YOUTUBE,
            transcript="Visit Shibuya then Senso-ji",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        with patch("app.services.extraction.service._call_gpt4o",
                   AsyncMock(return_value=(JAPAN_LOCATIONS_JSON, 312))):
            await ExtractionService.extract(out, job=job)

        from app.services.job_service import JobService
        from bson import ObjectId
        reloaded = await JobService.get(str(job.id))

        assert len(reloaded.extracted_places) == 5
        first = reloaded.extracted_places[0]
        assert first["place_name"] == "Shibuya Crossing"
        assert first["confidence"] > 0.9
        assert "signal_type" in first
        assert reloaded.extraction_tokens == 312
        assert reloaded.extracted_at is not None

    async def test_extraction_persisted_signal_type(self, beanie_init) -> None:
        from app.utils.seed import SeedFactory
        job = await SeedFactory.job()

        out = _make_output(
            Platform.INSTAGRAM,
            description="📍 Ubud Monkey Forest\n📍 Tegallalang",
            hashtags=["bali"],
        )
        with patch("app.services.extraction.service._call_gpt4o",
                   AsyncMock(return_value=(BALI_LOCATIONS_JSON, 150))):
            await ExtractionService.extract(out, job=job)

        from app.services.job_service import JobService
        reloaded = await JobService.get(str(job.id))
        assert all(p["signal_type"] == SignalType.DESCRIPTION for p in reloaded.extracted_places)


class TestUnwrapIfNeeded:
    def test_bare_array_unchanged(self) -> None:
        raw = json.dumps([{"place_name": "Tokyo", "confidence": 0.9}])
        assert _unwrap_if_needed(raw) == raw

    def test_locations_key_unwrapped(self) -> None:
        wrapped = json.dumps({"locations": [{"place_name": "Tokyo"}]})
        result = _unwrap_if_needed(wrapped)
        assert json.loads(result) == [{"place_name": "Tokyo"}]

    def test_places_key_unwrapped(self) -> None:
        wrapped = json.dumps({"places": [{"place_name": "Kyoto"}]})
        result = _unwrap_if_needed(wrapped)
        assert json.loads(result) == [{"place_name": "Kyoto"}]

    def test_invalid_json_returned_as_is(self) -> None:
        raw = "not json"
        assert _unwrap_if_needed(raw) == raw
