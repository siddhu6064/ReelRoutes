"""
tests/adapters/test_base_adapter.py

Tests for the shared AdapterOutput contract and utility methods.
Every adapter must produce output that passes these shape tests.
"""

from __future__ import annotations

import pytest

from app.adapters.base import (
    AdapterOutput,
    BaseAdapter,
    CaptionsSource,
    TranscriptSegment,
)
from app.models.documents import Platform

# ── TranscriptSegment ──────────────────────────────────────────


class TestTranscriptSegment:
    def test_duration_property(self) -> None:
        seg = TranscriptSegment(start=10.0, end=15.5, text="Hello")
        assert seg.duration == pytest.approx(5.5)

    def test_zero_duration(self) -> None:
        seg = TranscriptSegment(start=5.0, end=5.0, text="")
        assert seg.duration == 0.0


# ── AdapterOutput ──────────────────────────────────────────────


def make_output(**kwargs) -> AdapterOutput:
    defaults = {
        "platform": Platform.YOUTUBE,
        "url": "https://youtube.com/watch?v=test",
        "video_id": "test",
        "canonical_url": "https://youtube.com/watch?v=test",
        "title": "Test Video",
    }
    return AdapterOutput(**{**defaults, **kwargs})


class TestAdapterOutputSignalQuality:
    def test_rich_with_youtube_cc(self) -> None:
        out = make_output(captions_source=CaptionsSource.YOUTUBE_CC, transcript="hello")
        assert out.signal_quality == "rich"

    def test_rich_with_whisper(self) -> None:
        out = make_output(captions_source=CaptionsSource.WHISPER, transcript="hello")
        assert out.signal_quality == "rich"

    def test_medium_with_description(self) -> None:
        out = make_output(description="We visited Tokyo and Kyoto")
        assert out.signal_quality == "medium"

    def test_medium_with_many_hashtags(self) -> None:
        out = make_output(hashtags=["tokyo", "kyoto", "japan", "travel"])
        assert out.signal_quality == "medium"

    def test_sparse_with_nothing(self) -> None:
        out = make_output()
        assert out.signal_quality == "sparse"

    def test_sparse_with_too_few_hashtags(self) -> None:
        out = make_output(hashtags=["tokyo"])
        assert out.signal_quality == "sparse"


class TestAdapterOutputBestSignalText:
    def test_prefers_transcript_over_description(self) -> None:
        out = make_output(
            transcript="Full transcript here",
            description="Short description",
        )
        assert out.best_signal_text == "Full transcript here"

    def test_falls_back_to_description(self) -> None:
        out = make_output(description="We visited Shibuya Crossing in Tokyo")
        assert "Shibuya Crossing" in out.best_signal_text

    def test_includes_location_tag_in_text(self) -> None:
        out = make_output(description="Great trip", location_tag="Tokyo, Japan")
        assert "Tokyo, Japan" in out.best_signal_text

    def test_hashtags_as_last_resort(self) -> None:
        out = make_output(hashtags=["tokyo", "japan", "travel"])
        text = out.best_signal_text
        assert "#tokyo" in text
        assert "#japan" in text

    def test_empty_when_no_signals(self) -> None:
        out = make_output()
        assert out.best_signal_text == ""


class TestAdapterOutputWarnings:
    def test_add_warning_appends_to_list(self) -> None:
        out = make_output()
        out.add_warning("Rate limited")
        out.add_warning("No captions")
        assert len(out.fetch_warnings) == 2
        assert "Rate limited" in out.fetch_warnings
        assert "No captions" in out.fetch_warnings


# ── BaseAdapter utility methods ────────────────────────────────


class TestBaseAdapterUtils:
    def test_clean_description_strips_whitespace(self) -> None:
        result = BaseAdapter._clean_description("  hello   world  ")
        assert result == "hello world"

    def test_clean_description_returns_none_for_empty(self) -> None:
        assert BaseAdapter._clean_description("") is None
        assert BaseAdapter._clean_description(None) is None
        assert BaseAdapter._clean_description("   ") is None

    def test_extract_hashtags_from_text(self) -> None:
        tags = BaseAdapter._extract_hashtags("Great trip to #Tokyo and #Kyoto! #japan")
        assert "tokyo" in tags
        assert "kyoto" in tags
        assert "japan" in tags

    def test_extract_hashtags_deduplicates(self) -> None:
        tags = BaseAdapter._extract_hashtags("#tokyo #TOKYO #Tokyo")
        assert tags.count("tokyo") == 1

    def test_extract_hashtags_empty_string(self) -> None:
        assert BaseAdapter._extract_hashtags("") == []

    def test_segments_to_text_joins_with_spaces(self) -> None:
        segs = [
            TranscriptSegment(0, 5, "Hello"),
            TranscriptSegment(5, 10, "world"),
        ]
        assert BaseAdapter._segments_to_text(segs) == "Hello world"

    def test_segments_to_text_skips_empty(self) -> None:
        segs = [
            TranscriptSegment(0, 5, "Hello"),
            TranscriptSegment(5, 8, "  "),
            TranscriptSegment(8, 12, "world"),
        ]
        assert BaseAdapter._segments_to_text(segs) == "Hello world"


# ── Registry ───────────────────────────────────────────────────


class TestAdapterRegistry:
    def test_all_known_platforms_have_adapters(self) -> None:
        from app.adapters.registry import _REGISTRY
        from app.models.documents import Platform

        expected = {
            Platform.YOUTUBE,
            Platform.INSTAGRAM,
            Platform.TIKTOK,
            Platform.FACEBOOK,
            Platform.TWITTER,
        }
        assert expected.issubset(set(_REGISTRY.keys()))

    def test_get_adapter_returns_correct_type(self) -> None:
        from app.adapters.instagram import InstagramAdapter
        from app.adapters.registry import get_adapter
        from app.adapters.tiktok import TikTokAdapter
        from app.adapters.youtube import YouTubeAdapter

        assert isinstance(get_adapter(Platform.YOUTUBE), YouTubeAdapter)
        assert isinstance(get_adapter(Platform.INSTAGRAM), InstagramAdapter)
        assert isinstance(get_adapter(Platform.TIKTOK), TikTokAdapter)

    def test_unknown_platform_falls_back_gracefully(self) -> None:
        from app.adapters.registry import get_adapter

        # UNKNOWN platform should not raise
        adapter = get_adapter(Platform.UNKNOWN)
        assert adapter is not None
