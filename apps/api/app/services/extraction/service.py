"""
app/services/extraction/service.py

ExtractionService — the AI extraction pipeline.

Orchestrates:
  1. Signal selection: pick richest signal from AdapterOutput
  2. Whisper fallback: if no captions, transcribe audio first
  3. Chunking: split long transcripts into overlapping windows
  4. GPT-4o calls: extract locations from each chunk
  5. Merge + deduplicate: combine chunk results
  6. Validate + filter: remove low-confidence and malformed results
  7. Persist: store extracted_places on the Job document

Usage:
    result = await ExtractionService.extract(adapter_output, job)
    # result.locations is List[ExtractedLocation]
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.adapters.base import AdapterOutput
from app.config.logging import get_logger
from app.config.settings import get_settings
from app.models.documents import JobDocument
from app.services.extraction.parser import (
    ExtractedLocation,
    ParseResult,
    merge_chunk_results,
    parse_extraction_response,
)
from app.services.extraction.prompt import (
    SYSTEM_PROMPT,
    build_chunk_user_prompt,
    build_user_prompt,
)
from app.services.extraction.signals import (
    ExtractionSignals,
    SignalType,
    build_signals,
    split_text_into_chunks,
)
from app.services.extraction.whisper import transcribe_url

logger = get_logger(__name__)

# Retry config for transient GPT-4o failures
MAX_RETRIES = 3
RETRY_DELAY_SECONDS = 2.0


@dataclass
class ExtractionResult:
    """Full output of one extraction run — stored on Job."""

    locations: list[ExtractedLocation] = field(default_factory=list)
    signal_type: SignalType = SignalType.NONE
    model: str = ""
    total_tokens: int = 0
    chunk_count: int = 1
    raw_response: str = ""
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None

    def to_job_storage(self) -> list[dict]:
        """Serialise for storage in Job.extracted_places."""
        return [
            {
                "place_name": loc.place_name,
                "context_quote": loc.context_quote,
                "confidence": loc.confidence,
                "order": loc.order,
                "timestamp_hint": loc.timestamp_hint,
                "signal_type": self.signal_type,
            }
            for loc in self.locations
        ]


class ExtractionService:
    @staticmethod
    async def extract(
        adapter_output: AdapterOutput,
        job: JobDocument | None = None,
    ) -> ExtractionResult:
        """
        Full pipeline: signals → optional Whisper → GPT-4o → parse → persist.

        If job is provided, extracted_places is saved to the Job document.
        """
        settings = get_settings()

        # ── Step 1: Build signals ──────────────────────────────
        signals = build_signals(adapter_output)

        # ── Step 2: Whisper fallback for platforms without CC ──
        if not adapter_output.has_captions and not adapter_output.transcript:
            logger.info("whisper_fallback_triggered", platform=adapter_output.platform)
            transcript, segments, source = await transcribe_url(adapter_output.url)
            if transcript:
                adapter_output.transcript = transcript
                adapter_output.caption_segments = segments
                adapter_output.captions_source = source
                adapter_output.has_captions = True
                # Rebuild signals with the Whisper transcript
                signals = build_signals(adapter_output)

        # ── Step 3: Guard — no usable signal ──────────────────
        if not signals.best_text.strip():
            logger.warning("extraction_no_signal", platform=adapter_output.platform)
            result = ExtractionResult(
                signal_type=SignalType.NONE,
                error="No usable signal available for extraction",
            )
            if job:
                await _persist_to_job(job, result)
            return result

        # ── Step 4: GPT-4o extraction (with chunking if needed) ─
        if not settings.openai_api_key:
            logger.warning("openai_api_key_missing_using_mock_extraction")
            result = _mock_extraction(signals)
        elif signals.needs_chunking:
            result = await _extract_chunked(signals, settings.openai_extraction_model)
        else:
            result = await _extract_single(signals, settings.openai_extraction_model)

        # ── Step 5: Persist to Job document ───────────────────
        if job:
            await _persist_to_job(job, result)

        logger.info(
            "extraction_complete",
            platform=adapter_output.platform,
            locations=len(result.locations),
            signal_type=result.signal_type,
            chunks=result.chunk_count,
            tokens=result.total_tokens,
        )
        return result


# ── Single extraction (no chunking needed) ────────────────────


async def _extract_single(
    signals: ExtractionSignals,
    model: str,
) -> ExtractionResult:
    context_block = signals.to_context_block()
    raw, tokens = await _call_gpt4o(
        system=SYSTEM_PROMPT,
        user=build_user_prompt(context_block),
        model=model,
    )
    parse_result = parse_extraction_response(raw)
    return ExtractionResult(
        locations=parse_result.locations,
        signal_type=signals.signal_type,
        model=model,
        total_tokens=tokens,
        chunk_count=1,
        raw_response=raw,
        error=parse_result.parse_error,
    )


# ── Chunked extraction ────────────────────────────────────────


async def _extract_chunked(
    signals: ExtractionSignals,
    model: str,
) -> ExtractionResult:
    """
    Task 3 — chunking strategy:
    Split text into overlapping windows, extract from each,
    then merge and deduplicate across all chunks.
    """
    chunks = split_text_into_chunks(signals.best_text)
    logger.info("chunked_extraction_start", chunks=len(chunks), model=model)

    chunk_results: list[ParseResult] = []
    total_tokens = 0

    for i, chunk_text in enumerate(chunks):
        # Build per-chunk signals with same metadata but chunk text
        chunk_context = (
            signals.to_context_block().replace(signals.best_text, chunk_text)
            if signals.best_text in signals.to_context_block()
            else chunk_text
        )

        raw, tokens = await _call_gpt4o(
            system=SYSTEM_PROMPT,
            user=build_chunk_user_prompt(chunk_context, i, len(chunks)),
            model=model,
        )
        total_tokens += tokens
        chunk_results.append(parse_extraction_response(raw))

    merged = merge_chunk_results(chunk_results)
    return ExtractionResult(
        locations=merged.locations,
        signal_type=signals.signal_type,
        model=model,
        total_tokens=total_tokens,
        chunk_count=len(chunks),
        raw_response=merged.raw_response,
        error=merged.parse_error,
    )


# ── GPT-4o API call with retry ────────────────────────────────


async def _call_gpt4o(
    system: str,
    user: str,
    model: str,
    retries: int = MAX_RETRIES,
) -> tuple[str, int]:
    """
    Call GPT-4o and return (raw_content, total_tokens).
    Retries on transient errors with exponential backoff.
    """
    import asyncio

    from openai import APIStatusError, AsyncOpenAI, RateLimitError

    settings = get_settings()
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    for attempt in range(retries):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.0,  # deterministic output
                response_format={"type": "json_object"},
                max_tokens=4096,
            )
            content = response.choices[0].message.content or "[]"
            tokens = response.usage.total_tokens if response.usage else 0

            # response_format=json_object wraps in {"locations": [...]} sometimes
            content = _unwrap_if_needed(content)

            return content, tokens

        except RateLimitError:
            wait = RETRY_DELAY_SECONDS * (2**attempt)
            logger.warning("gpt4o_rate_limited", attempt=attempt, wait=wait)
            await asyncio.sleep(wait)

        except APIStatusError as exc:
            if exc.status_code >= 500 and attempt < retries - 1:
                wait = RETRY_DELAY_SECONDS * (2**attempt)
                logger.warning("gpt4o_server_error", status=exc.status_code, attempt=attempt)
                await asyncio.sleep(wait)
            else:
                logger.error("gpt4o_api_error", error=str(exc))
                return "[]", 0

        except Exception as exc:
            logger.error("gpt4o_unexpected_error", error=str(exc))
            return "[]", 0

    return "[]", 0


def _unwrap_if_needed(content: str) -> str:
    """
    When response_format=json_object is set, GPT-4o sometimes wraps
    the array in a root object e.g. {"locations": [...]} or {"places": [...]}.
    Unwrap it to get the bare array.
    """
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            for key in ("locations", "places", "results", "extracted_places", "data"):
                if key in data and isinstance(data[key], list):
                    return json.dumps(data[key])
            # If the dict has no known key, return as-is and let the parser handle it
        return content
    except Exception:
        return content


# ── Persist extracted places to Job document (Task 7) ────────


async def _persist_to_job(job: JobDocument, result: ExtractionResult) -> None:
    """
    Task 7 — store extracted_places on the Job document.
    Includes signal_type, platform, confidence, and raw LLM response.
    """
    from datetime import UTC, datetime

    job.extracted_places = result.to_job_storage()  # type: ignore[attr-defined]
    job.extraction_model = result.model  # type: ignore[attr-defined]
    job.extraction_tokens = result.total_tokens  # type: ignore[attr-defined]
    job.raw_llm_response = result.raw_response[:10_000]  # cap at 10KB  # type: ignore[attr-defined]
    job.extracted_at = datetime.now(UTC)  # type: ignore[attr-defined]
    await job.save()


# ── Mock extraction for local dev without API key ─────────────


def _mock_extraction(signals: ExtractionSignals) -> ExtractionResult:
    """
    Return placeholder locations when no OpenAI API key is set.
    Parses obvious place names from the text heuristically.
    """
    import re

    # Simple heuristic: find capitalised 2-3 word phrases that look like place names
    text = signals.best_text
    candidates = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b", text)
    # Filter obvious non-places
    stop_words = {"The", "A", "An", "This", "That", "It", "We", "I", "My", "Our"}
    locations = []
    seen: set[str] = set()
    for name in candidates:
        if name not in stop_words and name not in seen and len(name) > 3:
            seen.add(name)
            locations.append(
                ExtractedLocation(
                    place_name=name,
                    context_quote=f"[mock] {name} mentioned in content",
                    confidence=0.6,
                    order=len(locations),
                )
            )
        if len(locations) >= 10:
            break

    logger.warning("mock_extraction_used", locations=len(locations))
    return ExtractionResult(
        locations=locations,
        signal_type=signals.signal_type,
        model="mock",
        chunk_count=1,
    )
