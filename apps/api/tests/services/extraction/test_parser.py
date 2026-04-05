"""
tests/services/extraction/test_parser.py

Tests for parser.py — GPT-4o output parsing, validation, deduplication.
"""

from __future__ import annotations

import json

import pytest

from app.services.extraction.parser import (
    MIN_CONFIDENCE,
    ExtractedLocation,
    ParseResult,
    merge_chunk_results,
    parse_extraction_response,
)


def _json(locations: list[dict]) -> str:
    return json.dumps(locations)


class TestParseExtractionResponse:
    def test_parses_valid_json_array(self) -> None:
        raw = _json(
            [
                {
                    "place_name": "Shibuya Crossing",
                    "context_quote": "We started at Shibuya",
                    "confidence": 0.95,
                    "timestamp_hint": 42.0,
                },
                {
                    "place_name": "Senso-ji Temple",
                    "context_quote": "Then visited Senso-ji",
                    "confidence": 0.88,
                    "timestamp_hint": None,
                },
            ]
        )
        result = parse_extraction_response(raw)
        assert result.ok
        assert len(result.locations) == 2
        assert result.locations[0].place_name == "Shibuya Crossing"
        assert result.locations[0].confidence == pytest.approx(0.95)
        assert result.locations[0].timestamp_hint == pytest.approx(42.0)
        assert result.locations[1].timestamp_hint is None

    def test_strips_json_fences(self) -> None:
        raw = (
            "```json\n"
            + _json(
                [{"place_name": "Tokyo", "context_quote": "We went to Tokyo", "confidence": 0.9}]
            )
            + "\n```"
        )
        result = parse_extraction_response(raw)
        assert result.ok
        assert len(result.locations) == 1

    def test_strips_bare_code_fence(self) -> None:
        raw = (
            "```\n"
            + _json(
                [{"place_name": "Kyoto", "context_quote": "Beautiful Kyoto", "confidence": 0.85}]
            )
            + "\n```"
        )
        result = parse_extraction_response(raw)
        assert result.ok
        assert result.locations[0].place_name == "Kyoto"

    def test_filters_low_confidence(self) -> None:
        raw = _json(
            [
                {"place_name": "Shibuya", "context_quote": "Shibuya", "confidence": 0.95},
                {"place_name": "Vague Area", "context_quote": "some area", "confidence": 0.2},
                {
                    "place_name": "Another Vague",
                    "context_quote": "somewhere",
                    "confidence": MIN_CONFIDENCE - 0.01,
                },
            ]
        )
        result = parse_extraction_response(raw)
        assert len(result.locations) == 1
        assert result.locations[0].place_name == "Shibuya"
        assert result.filtered_count == 2

    def test_keeps_exactly_at_min_confidence(self) -> None:
        raw = _json(
            [
                {
                    "place_name": "Borderline Place",
                    "context_quote": "Borderline",
                    "confidence": MIN_CONFIDENCE,
                }
            ]
        )
        result = parse_extraction_response(raw)
        assert len(result.locations) == 1

    def test_empty_array_returns_ok(self) -> None:
        result = parse_extraction_response("[]")
        assert result.ok
        assert len(result.locations) == 0

    def test_malformed_json_returns_error(self) -> None:
        result = parse_extraction_response("{not valid json")
        assert not result.ok
        assert result.parse_error is not None

    def test_non_array_returns_error(self) -> None:
        result = parse_extraction_response('{"message": "error"}')
        # Parser should detect it's not a list
        # (unless it's a wrapped {"locations": [...]} which is handled separately)
        assert result.parse_error is not None or len(result.locations) == 0

    def test_skips_items_without_place_name(self) -> None:
        raw = _json(
            [
                {"context_quote": "no name here", "confidence": 0.9},
                {"place_name": "Valid Place", "context_quote": "Valid", "confidence": 0.9},
            ]
        )
        result = parse_extraction_response(raw)
        assert len(result.locations) == 1
        assert result.locations[0].place_name == "Valid Place"

    def test_deduplicates_by_normalised_name(self) -> None:
        raw = _json(
            [
                {
                    "place_name": "Shibuya Crossing",
                    "context_quote": "First mention",
                    "confidence": 0.8,
                },
                {
                    "place_name": "shibuya crossing",
                    "context_quote": "Second mention",
                    "confidence": 0.95,
                },
                {
                    "place_name": "SHIBUYA CROSSING",
                    "context_quote": "Third mention",
                    "confidence": 0.7,
                },
            ]
        )
        result = parse_extraction_response(raw)
        assert len(result.locations) == 1
        # Should keep the highest confidence (0.95)
        assert result.locations[0].confidence == pytest.approx(0.95)
        assert result.duplicate_count == 2

    def test_order_is_sequential_from_zero(self) -> None:
        raw = _json(
            [
                {"place_name": "Place A", "context_quote": "A", "confidence": 0.9},
                {"place_name": "Place B", "context_quote": "B", "confidence": 0.85},
                {"place_name": "Place C", "context_quote": "C", "confidence": 0.8},
            ]
        )
        result = parse_extraction_response(raw)
        orders = [loc.order for loc in result.locations]
        assert orders == list(range(len(result.locations)))

    def test_context_quote_truncated_at_max_length(self) -> None:
        long_quote = "x" * 500
        raw = _json([{"place_name": "Place", "context_quote": long_quote, "confidence": 0.9}])
        result = parse_extraction_response(raw)
        assert len(result.locations[0].context_quote) <= 200

    def test_partial_truncation_recovery(self) -> None:
        # Simulate a truncated response missing the closing bracket
        valid_part = '[{"place_name": "Tokyo", "context_quote": "Tokyo visit", "confidence": 0.9}'
        # Note: missing closing ] — should attempt recovery
        result = parse_extraction_response(valid_part)
        # Either recovers or returns error — should not crash
        assert isinstance(result, ParseResult)

    def test_wrapped_locations_object_unwrapped(self) -> None:
        # GPT-4o sometimes wraps: {"locations": [...]}
        raw = json.dumps(
            {
                "locations": [
                    {"place_name": "Kyoto", "context_quote": "Beautiful Kyoto", "confidence": 0.9}
                ]
            }
        )
        from app.services.extraction.service import _unwrap_if_needed

        unwrapped = _unwrap_if_needed(raw)
        result = parse_extraction_response(unwrapped)
        assert len(result.locations) == 1


class TestMergeChunkResults:
    def _make_result(self, places: list[tuple[str, float]]) -> ParseResult:
        result = ParseResult()
        result.locations = [
            ExtractedLocation(
                place_name=name,
                context_quote=f"{name} context",
                confidence=conf,
                order=i,
            )
            for i, (name, conf) in enumerate(places)
        ]
        return result

    def test_merge_combines_all_locations(self) -> None:
        r1 = self._make_result([("Tokyo", 0.9), ("Kyoto", 0.85)])
        r2 = self._make_result([("Osaka", 0.88), ("Nara", 0.75)])
        merged = merge_chunk_results([r1, r2])
        assert len(merged.locations) == 4

    def test_merge_deduplicates_across_chunks(self) -> None:
        r1 = self._make_result([("Tokyo", 0.9), ("Kyoto", 0.85)])
        r2 = self._make_result([("Tokyo", 0.95), ("Osaka", 0.8)])
        merged = merge_chunk_results([r1, r2])
        names = {loc.place_name for loc in merged.locations}
        assert len(names) == 3  # Tokyo deduplicated
        assert "Tokyo" in names

    def test_merge_keeps_higher_confidence_on_dedup(self) -> None:
        r1 = self._make_result([("Tokyo", 0.7)])
        r2 = self._make_result([("Tokyo", 0.95)])
        merged = merge_chunk_results([r1, r2])
        tokyo = next(loc for loc in merged.locations if loc.place_name == "Tokyo")
        assert tokyo.confidence == pytest.approx(0.95)

    def test_merge_reindexes_order(self) -> None:
        r1 = self._make_result([("Tokyo", 0.9), ("Kyoto", 0.85)])
        r2 = self._make_result([("Osaka", 0.8)])
        merged = merge_chunk_results([r1, r2])
        orders = sorted(loc.order for loc in merged.locations)
        assert orders == list(range(len(merged.locations)))

    def test_merge_skips_errored_chunks(self) -> None:
        r1 = self._make_result([("Tokyo", 0.9)])
        r2 = ParseResult()
        r2.parse_error = "Invalid JSON"
        r3 = self._make_result([("Kyoto", 0.85)])
        merged = merge_chunk_results([r1, r2, r3])
        assert len(merged.locations) == 2  # r2 skipped
