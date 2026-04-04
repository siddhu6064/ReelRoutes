"""
tests/services/extraction/test_signals.py

Tests for signals.py — ExtractionSignals building and chunking strategy.
"""
from __future__ import annotations

import pytest

from app.adapters.base import AdapterOutput, CaptionsSource, TranscriptSegment
from app.models.documents import Platform
from app.services.extraction.signals import (
    ExtractionSignals,
    SignalType,
    build_signals,
    count_tokens,
    split_text_into_chunks,
    CHUNK_THRESHOLD_TOKENS,
    CHUNK_OVERLAP_TOKENS,
)


def _make_adapter(
    transcript: str | None = None,
    description: str | None = None,
    hashtags: list[str] | None = None,
    location_tag: str | None = None,
    captions_source: CaptionsSource = CaptionsSource.NONE,
    has_captions: bool = False,
    platform: Platform = Platform.YOUTUBE,
    segments: list[TranscriptSegment] | None = None,
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
        caption_segments=segments or [],
    )
    return out


class TestBuildSignals:
    def test_youtube_cc_is_primary(self) -> None:
        out = _make_adapter(
            transcript="Full CC transcript",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        signals = build_signals(out)
        assert signals.signal_type == SignalType.YOUTUBE_CC
        assert signals.best_text == "Full CC transcript"

    def test_whisper_is_primary(self) -> None:
        out = _make_adapter(
            transcript="Whisper result",
            captions_source=CaptionsSource.WHISPER,
            has_captions=True,
        )
        signals = build_signals(out)
        assert signals.signal_type == SignalType.WHISPER

    def test_description_when_no_cc(self) -> None:
        out = _make_adapter(
            description="We visited Tokyo and Kyoto",
            hashtags=["japan", "travel"],
        )
        signals = build_signals(out)
        assert signals.signal_type == SignalType.DESCRIPTION
        assert "Tokyo" in signals.best_text
        assert "#japan" in signals.best_text

    def test_hashtags_as_last_resort(self) -> None:
        out = _make_adapter(hashtags=["tokyo", "kyoto", "japan"])
        signals = build_signals(out)
        assert signals.signal_type == SignalType.HASHTAGS
        assert "#tokyo" in signals.best_text

    def test_none_when_no_signals(self) -> None:
        out = _make_adapter()
        signals = build_signals(out)
        assert signals.signal_type == SignalType.NONE
        assert signals.best_text == ""

    def test_location_tag_included_in_description_text(self) -> None:
        out = _make_adapter(
            description="Beautiful place",
            location_tag="Bali, Indonesia",
        )
        signals = build_signals(out)
        assert "Bali, Indonesia" in signals.best_text

    def test_token_count_is_nonzero_for_text(self) -> None:
        out = _make_adapter(
            transcript="Hello world",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        signals = build_signals(out)
        assert signals.token_count > 0

    def test_needs_chunking_false_for_short_text(self) -> None:
        out = _make_adapter(
            transcript="Short text",
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        signals = build_signals(out)
        assert signals.needs_chunking is False

    def test_needs_chunking_true_for_long_text(self) -> None:
        # 800x repeat = ~4801 tokens > CHUNK_THRESHOLD_TOKENS (4000)
        long_text = "We visited Shibuya Crossing. " * 800
        out = _make_adapter(
            transcript=long_text,
            captions_source=CaptionsSource.YOUTUBE_CC,
            has_captions=True,
        )
        signals = build_signals(out)
        assert signals.needs_chunking is True

    def test_context_block_includes_title(self) -> None:
        out = _make_adapter(transcript="Hello")
        out.title = "Japan 2024 Travel Vlog"
        signals = build_signals(out)
        assert "Japan 2024 Travel Vlog" in signals.to_context_block()

    def test_context_block_includes_hashtags(self) -> None:
        out = _make_adapter(description="Great trip", hashtags=["japan", "tokyo"])
        signals = build_signals(out)
        assert "#japan" in signals.to_context_block()

    def test_tiktok_uses_description_signal(self) -> None:
        out = _make_adapter(
            description="Morocco is incredible. The Medina of Marrakech is insane.",
            hashtags=["morocco", "marrakech"],
            platform=Platform.TIKTOK,
        )
        signals = build_signals(out)
        assert signals.signal_type == SignalType.DESCRIPTION
        assert "Morocco" in signals.best_text


class TestChunking:
    def test_short_text_returns_single_chunk(self) -> None:
        text = "Short travel text about Tokyo"
        chunks = split_text_into_chunks(text, chunk_size=500, overlap=50)
        assert len(chunks) == 1
        assert chunks[0] == text

    def test_long_text_splits_into_multiple_chunks(self) -> None:
        long_text = "We visited Shibuya Crossing. " * 500
        chunks = split_text_into_chunks(long_text, chunk_size=200, overlap=20)
        assert len(chunks) > 1

    def test_chunks_are_strings(self) -> None:
        text = "word " * 1000
        chunks = split_text_into_chunks(text, chunk_size=100, overlap=10)
        assert all(isinstance(c, str) for c in chunks)

    def test_overlap_content_appears_in_adjacent_chunks(self) -> None:
        text = " ".join(f"place{i}" for i in range(500))
        chunks = split_text_into_chunks(text, chunk_size=100, overlap=20)
        if len(chunks) > 1:
            # Last tokens of chunk[0] should appear at start of chunk[1]
            end_of_first = chunks[0].split()[-5:]
            start_of_second = chunks[1].split()[:10]
            overlap_found = any(w in start_of_second for w in end_of_first)
            assert overlap_found

    def test_all_content_covered_by_chunks(self) -> None:
        # Every word should appear in at least one chunk
        words = [f"place{i}" for i in range(100)]
        text = " ".join(words)
        chunks = split_text_into_chunks(text, chunk_size=50, overlap=10)
        all_chunk_text = " ".join(chunks)
        for word in words:
            assert word in all_chunk_text

    def test_count_tokens_returns_int(self) -> None:
        assert count_tokens("Hello world") > 0
        assert count_tokens("") == 0
