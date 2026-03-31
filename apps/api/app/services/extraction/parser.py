"""
app/services/extraction/parser.py

Parses and validates raw GPT-4o output into ExtractedLocation objects.

Responsibilities:
  - Strip markdown code fences if the model wraps in ```json ... ```
  - Validate JSON structure — reject malformed responses
  - Enforce field types and value ranges
  - Filter out locations with confidence < MIN_CONFIDENCE
  - Deduplicate by normalised place name
  - Re-index order field sequentially
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from app.config.logging import get_logger

logger = get_logger(__name__)

MIN_CONFIDENCE: float = 0.4     # Task 6: filter below this threshold
MAX_CONTEXT_QUOTE_LEN: int = 200


@dataclass
class ExtractedLocation:
    """
    One location extracted by GPT-4o.
    Mirrors the shared TypeScript ExtractedLocation type exactly.
    """
    place_name: str
    context_quote: str
    confidence: float
    order: int
    timestamp_hint: float | None = None

    def __post_init__(self) -> None:
        self.confidence = max(0.0, min(1.0, float(self.confidence)))
        self.context_quote = self.context_quote[:MAX_CONTEXT_QUOTE_LEN].strip()
        self.place_name = self.place_name.strip()


@dataclass
class ParseResult:
    locations: list[ExtractedLocation] = field(default_factory=list)
    raw_response: str = ""
    parse_error: str | None = None
    filtered_count: int = 0       # locations dropped due to low confidence
    duplicate_count: int = 0      # locations dropped as duplicates

    @property
    def ok(self) -> bool:
        return self.parse_error is None


def parse_extraction_response(
    raw: str,
    min_confidence: float = MIN_CONFIDENCE,
) -> ParseResult:
    """
    Parse a raw GPT-4o completion into validated ExtractedLocation objects.

    Handles:
      - Bare JSON array
      - JSON wrapped in ```json ... ``` fences
      - Partial truncation (attempts to recover)
      - Missing optional fields (timestamp_hint)
    """
    result = ParseResult(raw_response=raw)

    # ── Step 1: Clean the raw string ──────────────────────────
    cleaned = _strip_fences(raw.strip())

    # ── Step 2: Parse JSON ────────────────────────────────────
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to salvage a truncated array
        data = _attempt_partial_parse(cleaned)
        if data is None:
            result.parse_error = f"Invalid JSON from GPT-4o: {cleaned[:200]}"
            logger.warning("extraction_parse_failed", raw_snippet=cleaned[:200])
            return result

    if not isinstance(data, list):
        result.parse_error = f"Expected JSON array, got {type(data).__name__}"
        return result

    # ── Step 3: Validate and convert each item ────────────────
    valid: list[ExtractedLocation] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        place_name = str(item.get("place_name", "")).strip()
        if not place_name:
            continue
        confidence = float(item.get("confidence", 0.5))
        if confidence < min_confidence:
            result.filtered_count += 1
            continue

        loc = ExtractedLocation(
            place_name=place_name,
            context_quote=str(item.get("context_quote", "")).strip(),
            confidence=confidence,
            order=len(valid),
            timestamp_hint=_parse_timestamp_hint(item.get("timestamp_hint")),
        )
        valid.append(loc)

    # ── Step 4: Deduplicate by normalised name ─────────────────
    deduped, dup_count = _deduplicate(valid)
    result.duplicate_count = dup_count

    # ── Step 5: Re-index order ────────────────────────────────
    for i, loc in enumerate(deduped):
        loc.order = i

    result.locations = deduped

    logger.info(
        "extraction_parsed",
        total=len(data),
        kept=len(deduped),
        filtered=result.filtered_count,
        duplicates=dup_count,
    )
    return result


def merge_chunk_results(
    chunk_results: list[ParseResult],
) -> ParseResult:
    """
    Task 3 — merge results from multiple chunk extractions.
    Combines all locations, deduplicates across chunks, re-indexes order.
    Errors from individual chunks are accumulated as warnings.
    """
    merged = ParseResult()
    all_locations: list[ExtractedLocation] = []

    for cr in chunk_results:
        if cr.ok:
            all_locations.extend(cr.locations)
        else:
            logger.warning("chunk_parse_error", error=cr.parse_error)

    deduped, dup_count = _deduplicate(all_locations)
    for i, loc in enumerate(deduped):
        loc.order = i

    merged.locations = deduped
    merged.duplicate_count = dup_count
    merged.raw_response = "\n---\n".join(cr.raw_response for cr in chunk_results)

    logger.info(
        "chunk_results_merged",
        chunks=len(chunk_results),
        total_before_dedup=len(all_locations),
        after_dedup=len(deduped),
        duplicates_removed=dup_count,
    )
    return merged


# ── Private helpers ────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    """Remove ```json ... ``` or ``` ... ``` markdown fences."""
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _attempt_partial_parse(text: str) -> list | None:
    """
    Try to recover from a truncated JSON array by finding the last
    complete object and closing the array.
    """
    # Find the last complete object boundary
    last_close = text.rfind("}")
    if last_close == -1:
        return None
    truncated = text[: last_close + 1]
    # Find the opening bracket
    first_open = truncated.find("[")
    if first_open == -1:
        return None
    candidate = truncated[first_open:] + "]"
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _normalise_name(name: str) -> str:
    """Lower-case, strip punctuation — used for dedup key."""
    return re.sub(r"[^\w\s]", "", name.lower()).strip()


def _deduplicate(locations: list[ExtractedLocation]) -> tuple[list[ExtractedLocation], int]:
    """
    Remove duplicates by normalised place name.
    When two entries match, keep the one with higher confidence.
    Returns (deduped_list, removed_count).
    """
    seen: dict[str, ExtractedLocation] = {}
    for loc in locations:
        key = _normalise_name(loc.place_name)
        if key in seen:
            # Keep the higher-confidence entry
            if loc.confidence > seen[key].confidence:
                seen[key] = loc
        else:
            seen[key] = loc

    removed = len(locations) - len(seen)
    return list(seen.values()), removed


def _parse_timestamp_hint(value) -> float | None:
    if value is None:
        return None
    try:
        f = float(value)
        return f if f >= 0 else None
    except (TypeError, ValueError):
        return None
