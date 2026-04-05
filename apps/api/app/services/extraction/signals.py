"""
app/services/extraction/signals.py

Normalises an AdapterOutput into an ExtractionSignals object — the
single input type the AI extraction service operates on.

Every platform adapter produces different raw fields; this layer
flattens them into a consistent structure before the LLM call:

  transcript   — full text (CC, Whisper, or description fallback)
  segments     — timed transcript segments if available
  description  — platform description / post caption
  hashtags     — deduplicated lowercase list
  location_tag — tagged location if the creator set one
  title        — video / post title
  platform     — source platform enum
  signal_type  — which signal is primary (for analytics / debugging)
  token_count  — pre-computed tiktoken count of the best_text field
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

import tiktoken

from app.adapters.base import AdapterOutput, CaptionsSource, TranscriptSegment
from app.config.logging import get_logger
from app.models.documents import Platform

logger = get_logger(__name__)

# Tiktoken encoder — cl100k_base covers GPT-4o
_ENCODER = tiktoken.get_encoding("cl100k_base")


class SignalType(StrEnum):
    """
    Records which source produced the primary extraction text.
    Stored on Job.extracted_places for analytics.
    """

    YOUTUBE_CC = "youtube_cc"  # YouTube closed captions
    WHISPER = "whisper"  # OpenAI Whisper transcription
    DESCRIPTION = "description"  # Platform description / caption
    HASHTAGS = "hashtags"  # Hashtags only — sparsest
    NONE = "none"  # No usable signal


@dataclass
class ExtractionSignals:
    """
    Normalised signal bundle consumed by ExtractionService.
    Built from AdapterOutput via build_signals().
    """

    # ── Primary text ───────────────────────────────────────────
    best_text: str  # richest available text for extraction
    signal_type: SignalType  # which source produced best_text
    token_count: int  # tiktoken count of best_text

    # ── All available signals ──────────────────────────────────
    transcript: str | None = None  # full plain-text transcript
    segments: list[TranscriptSegment] = field(default_factory=list)
    description: str | None = None
    hashtags: list[str] = field(default_factory=list)
    location_tag: str | None = None
    title: str = ""
    platform: Platform = Platform.UNKNOWN

    # ── Diagnostics ────────────────────────────────────────────
    signal_quality: str = "sparse"  # rich / medium / sparse

    @property
    def has_timed_segments(self) -> bool:
        return len(self.segments) > 0

    @property
    def needs_chunking(self) -> bool:
        """True when the text is too long for a single GPT-4o call."""
        return self.token_count > CHUNK_THRESHOLD_TOKENS

    def to_context_block(self) -> str:
        """
        Produces the context block injected into the extraction prompt.
        Includes all available signals so GPT-4o has maximum context.
        """
        parts: list[str] = []

        if self.title:
            parts.append(f"Title: {self.title}")

        if self.platform and self.platform != Platform.UNKNOWN:
            parts.append(f"Platform: {self.platform}")

        if self.location_tag:
            parts.append(f"Tagged location: {self.location_tag}")

        if self.hashtags:
            parts.append("Hashtags: " + " ".join(f"#{h}" for h in self.hashtags[:30]))

        if self.description and self.signal_type != SignalType.YOUTUBE_CC:
            parts.append(f"\nDescription:\n{self.description[:2000]}")

        if self.transcript:
            parts.append(f"\nTranscript:\n{self.transcript}")

        return "\n".join(parts)


# ── Token thresholds ───────────────────────────────────────────

CHUNK_THRESHOLD_TOKENS = 4_000  # above this, use chunking strategy
CHUNK_SIZE_TOKENS = 2_000  # target size per chunk
CHUNK_OVERLAP_TOKENS = 200  # overlap between chunks to catch boundary places


# ── Builder ────────────────────────────────────────────────────


def build_signals(adapter_output: AdapterOutput) -> ExtractionSignals:
    """
    Convert an AdapterOutput into ExtractionSignals.
    Selects the richest available signal as best_text.
    """
    transcript = adapter_output.transcript
    description = adapter_output.description
    hashtags = adapter_output.hashtags
    location_tag = adapter_output.location_tag
    segments = adapter_output.caption_segments

    # Determine best_text and signal_type
    if adapter_output.captions_source in (CaptionsSource.YOUTUBE_CC, CaptionsSource.WHISPER):
        best_text = transcript or ""
        signal_type = (
            SignalType.YOUTUBE_CC
            if adapter_output.captions_source == CaptionsSource.YOUTUBE_CC
            else SignalType.WHISPER
        )
    elif description:
        # Build enriched description: description + location + hashtags
        parts = [description]
        if location_tag:
            parts.append(f"\nLocation: {location_tag}")
        if hashtags:
            parts.append("\nHashtags: " + " ".join(f"#{h}" for h in hashtags[:30]))
        best_text = "\n".join(parts)
        signal_type = SignalType.DESCRIPTION
    elif hashtags:
        best_text = "Hashtags: " + " ".join(f"#{h}" for h in hashtags)
        signal_type = SignalType.HASHTAGS
    else:
        best_text = ""
        signal_type = SignalType.NONE

    token_count = len(_ENCODER.encode(best_text)) if best_text else 0

    signals = ExtractionSignals(
        best_text=best_text,
        signal_type=signal_type,
        token_count=token_count,
        transcript=transcript,
        segments=segments,
        description=description,
        hashtags=hashtags,
        location_tag=location_tag,
        title=adapter_output.title,
        platform=adapter_output.platform,
        signal_quality=adapter_output.signal_quality,
    )

    logger.info(
        "signals_built",
        platform=adapter_output.platform,
        signal_type=signal_type,
        token_count=token_count,
        needs_chunking=signals.needs_chunking,
        quality=signals.signal_quality,
    )
    return signals


def count_tokens(text: str) -> int:
    """Count GPT-4o tokens in a string."""
    return len(_ENCODER.encode(text))


def split_text_into_chunks(
    text: str,
    chunk_size: int = CHUNK_SIZE_TOKENS,
    overlap: int = CHUNK_OVERLAP_TOKENS,
) -> list[str]:
    """
    Task 3 — Chunking strategy:
    Split text into overlapping token chunks.
    Each chunk is chunk_size tokens with overlap tokens shared
    with the previous chunk to avoid cutting a place name mid-sentence.

    Returns a list of text strings (decoded from tokens).
    """
    tokens = _ENCODER.encode(text)
    if len(tokens) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0
    while start < len(tokens):
        end = min(start + chunk_size, len(tokens))
        chunk_tokens = tokens[start:end]
        chunks.append(_ENCODER.decode(chunk_tokens))
        if end == len(tokens):
            break
        start = end - overlap  # step back by overlap to create continuity

    logger.info(
        "text_chunked",
        total_tokens=len(tokens),
        chunk_count=len(chunks),
        chunk_size=chunk_size,
        overlap=overlap,
    )
    return chunks
