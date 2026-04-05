"""
tests/adapters/test_youtube_adapter.py

Tests for YouTubeAdapter using fixture data — no live API calls.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

if TYPE_CHECKING:
    from app.adapters.base import AdapterOutput

from app.adapters.youtube import YouTubeAdapter, extract_video_id, parse_duration
from app.models.documents import Platform
from tests.adapters.conftest import load_fixture, load_transcript_fixture, mock_youtube_api

# ── URL parsing ────────────────────────────────────────────────


class TestExtractVideoId:
    def test_standard_watch_url(self) -> None:
        assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_short_url(self) -> None:
        assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_shorts_url(self) -> None:
        assert extract_video_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_embed_url(self) -> None:
        assert extract_video_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_url_with_extra_params(self) -> None:
        assert (
            extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&list=PLabc")
            == "dQw4w9WgXcQ"
        )

    def test_invalid_url_returns_none(self) -> None:
        assert extract_video_id("https://vimeo.com/123456") is None
        assert extract_video_id("not a url") is None


class TestParseDuration:
    def test_full_hms(self) -> None:
        assert parse_duration("PT1H42M30S") == pytest.approx(6150.0)

    def test_minutes_seconds(self) -> None:
        assert parse_duration("PT10M2S") == pytest.approx(602.0)

    def test_seconds_only(self) -> None:
        assert parse_duration("PT45S") == pytest.approx(45.0)

    def test_hours_only(self) -> None:
        assert parse_duration("PT2H") == pytest.approx(7200.0)

    def test_empty_string(self) -> None:
        assert parse_duration("") == pytest.approx(0.0)


# ── YouTubeAdapter.fetch ───────────────────────────────────────


@pytest.mark.asyncio
class TestYouTubeAdapterFetch:
    async def _run_fetch(self, with_transcript: bool = True) -> AdapterOutput:
        load_fixture("youtube_japan_travel")
        transcript_data = load_transcript_fixture("youtube_japan_transcript")

        # Build mock transcript objects matching youtube-transcript-api API
        MagicMock()

        class MockEntry:
            def __init__(self, d: dict):
                self.start = d["start"]
                self.duration = d["duration"]
                self.text = d["text"]

        mock_raw = [MockEntry(s) for s in transcript_data]

        mock_transcript = MagicMock()
        mock_transcript.fetch = MagicMock(return_value=mock_raw)

        mock_transcript_list = MagicMock()
        mock_transcript_list.find_manually_created_transcript = MagicMock(
            side_effect=lambda _langs: mock_transcript
            if with_transcript
            else (_ for _ in ()).throw(Exception("no cc"))
        )
        mock_transcript_list.find_generated_transcript = MagicMock(
            return_value=mock_transcript
            if with_transcript
            else (_ for _ in ()).throw(Exception("no auto"))
        )

        adapter = YouTubeAdapter()
        meta = mock_youtube_api("youtube_japan_travel")

        with (
            patch.object(adapter, "_fetch_metadata", meta),
            patch(
                "app.adapters.youtube.YouTubeTranscriptApi.list_transcripts",
                return_value=mock_transcript_list,
            ),
            patch("app.adapters.youtube._run_in_thread", new=AsyncMock(side_effect=_sync_mock)),
        ):
            return await adapter.fetch("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    async def test_returns_youtube_platform(self) -> None:
        out = await self._run_fetch()
        assert out.platform == Platform.YOUTUBE

    async def test_title_populated(self) -> None:
        out = await self._run_fetch()
        assert "Japan" in out.title

    async def test_description_populated(self) -> None:
        out = await self._run_fetch()
        assert out.description is not None
        assert len(out.description) > 0

    async def test_duration_in_seconds(self) -> None:
        out = await self._run_fetch()
        assert out.duration_seconds is not None
        assert out.duration_seconds > 0

    async def test_thumbnail_url_present(self) -> None:
        out = await self._run_fetch()
        assert out.thumbnail_url is not None
        assert "youtube.com" in out.thumbnail_url or "ytimg" in out.thumbnail_url

    async def test_hashtags_extracted_from_description(self) -> None:
        out = await self._run_fetch()
        assert "japan" in out.hashtags
        assert "tokyo" in out.hashtags
        assert "kyoto" in out.hashtags

    async def test_canonical_url_format(self) -> None:
        out = await self._run_fetch()
        assert out.canonical_url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assert out.video_id == "dQw4w9WgXcQ"

    async def test_invalid_url_raises(self) -> None:
        from app.middleware.error_handler import AppError

        adapter = YouTubeAdapter()
        with pytest.raises(AppError):
            await adapter.fetch("https://not-youtube.com/video")


# ── Helper: makes _run_in_thread behave synchronously for tests ──


async def _sync_mock(fn, *args, **kwargs):
    """Run the sync function directly in tests (no thread pool needed)."""
    from functools import partial

    if isinstance(fn, partial):
        return fn()
    return fn(*args, **kwargs)
