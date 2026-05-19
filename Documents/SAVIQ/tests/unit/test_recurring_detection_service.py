import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from services.recurring_detection_service import (
    build_recurring_detection_result,
    calculate_interval_confidence,
    detect_recurring_merchants,
    detect_recurring_profile_summary,
    detect_recurring_merchants_from_transactions,
    summarize_recurring_candidates,
)


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _length):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query, projection=None):
        matches = []
        gte = query.get("date", {}).get("$gte")
        lte = query.get("date", {}).get("$lte")

        for row in self.docs:
            if row.get("user_id") != query.get("user_id"):
                continue
            if row.get("profile_id") != query.get("profile_id"):
                continue
            dt = row.get("date")
            if gte and dt < gte:
                continue
            if lte and dt > lte:
                continue

            if projection:
                matches.append({k: row.get(k) for k, enabled in projection.items() if enabled})
            else:
                matches.append(dict(row))

        return _FakeCursor(matches)


def _run(coro):
    return asyncio.run(coro)


def _dt(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


def test_recurring_merchant_detection_normal_case():
    txs = [
        {"merchant": "Netflix, Inc", "amount": 15.99, "date": _dt(2026, 1, 5), "type": "expense"},
        {"merchant": "NETFLIX*123", "amount": 15.99, "date": _dt(2026, 2, 5), "type": "expense"},
        {"merchant": "Netflix", "amount": 15.99, "date": _dt(2026, 3, 5), "type": "expense"},
    ]

    candidates = detect_recurring_merchants_from_transactions(txs)
    assert len(candidates) == 1
    assert candidates[0]["merchant_normalized"] == "netflix"
    assert candidates[0]["interval"] == "monthly"


def test_weekly_interval_pattern_detection():
    confidence = calculate_interval_confidence([_dt(2026, 1, 1), _dt(2026, 1, 8), _dt(2026, 1, 15), _dt(2026, 1, 22)])
    assert confidence["interval"] == "weekly"
    assert confidence["confidence"] >= 0.9


def test_monthly_interval_pattern_detection():
    confidence = calculate_interval_confidence([_dt(2026, 1, 1), _dt(2026, 2, 1), _dt(2026, 3, 1), _dt(2026, 4, 1)])
    assert confidence["interval"] == "monthly"
    assert confidence["confidence"] >= 0.7


def test_quarterly_interval_pattern_detection():
    confidence = calculate_interval_confidence([_dt(2025, 1, 1), _dt(2025, 4, 2), _dt(2025, 7, 1), _dt(2025, 10, 2)])
    assert confidence["interval"] == "quarterly"
    assert confidence["confidence"] >= 0.6


def test_annual_interval_pattern_detection():
    confidence = calculate_interval_confidence([_dt(2023, 6, 1), _dt(2024, 6, 1), _dt(2025, 6, 2), _dt(2026, 6, 1)])
    assert confidence["interval"] == "annual"
    assert confidence["confidence"] >= 0.6


def test_irregular_non_recurring_pattern_remains_low_confidence_or_excluded():
    confidence = calculate_interval_confidence([_dt(2026, 1, 1), _dt(2026, 1, 11), _dt(2026, 2, 27), _dt(2026, 4, 3)])
    assert confidence["interval"] == "none" or confidence["confidence"] < 0.55

    candidates = detect_recurring_merchants_from_transactions([
        {"merchant": "Random Shop", "amount": 21, "date": _dt(2026, 1, 1), "type": "expense"},
        {"merchant": "Random Shop", "amount": 35, "date": _dt(2026, 1, 11), "type": "expense"},
        {"merchant": "Random Shop", "amount": 12, "date": _dt(2026, 2, 27), "type": "expense"},
        {"merchant": "Random Shop", "amount": 67, "date": _dt(2026, 4, 3), "type": "expense"},
    ])
    assert candidates == []


def test_user_profile_isolation_is_preserved():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "merchant": "Spotify", "amount": 9.99, "date": _dt(2026, 1, 2), "type": "expense"},
        {"user_id": "u1", "profile_id": "p1", "merchant": "Spotify", "amount": 9.99, "date": _dt(2026, 2, 2), "type": "expense"},
        {"user_id": "u1", "profile_id": "p1", "merchant": "Spotify", "amount": 9.99, "date": _dt(2026, 3, 2), "type": "expense"},
        {"user_id": "u2", "profile_id": "p2", "merchant": "Spotify", "amount": 9.99, "date": _dt(2026, 1, 2), "type": "expense"},
        {"user_id": "u2", "profile_id": "p2", "merchant": "Spotify", "amount": 9.99, "date": _dt(2026, 2, 2), "type": "expense"},
        {"user_id": "u2", "profile_id": "p2", "merchant": "Spotify", "amount": 9.99, "date": _dt(2026, 3, 2), "type": "expense"},
    ]

    candidates = _run(
        detect_recurring_merchants(
            user_id="u1",
            profile_id="p1",
            expenses_collection=_FakeCollection(docs),
            now=_dt(2026, 3, 3),
        )
    )

    assert len(candidates) == 1
    assert candidates[0]["merchant_normalized"] == "spotify"


def test_detection_is_deterministic_and_ignores_invalid_dated_rows():
    txs = [
        {"merchant": "Netflix", "amount": 15.99, "date": "not-a-date", "type": "expense"},
        {"merchant": "Netflix", "amount": 15.99, "date": _dt(2026, 3, 5), "type": "expense"},
        {"merchant": "NETFLIX*123", "amount": 15.99, "date": _dt(2026, 2, 5), "type": "expense"},
        {"merchant": "Netflix, Inc", "amount": 15.99, "date": _dt(2026, 1, 5), "type": "expense"},
    ]

    forward = detect_recurring_merchants_from_transactions(txs)
    reverse = detect_recurring_merchants_from_transactions(list(reversed(txs)))

    assert forward == reverse
    assert len(forward) == 1
    assert forward[0]["occurrences"] == 3


def test_monthly_recurring_total_normal_case():
    totals = summarize_recurring_candidates([
        {"interval": "monthly", "confidence": 0.9, "average_amount": 20.0},
    ])
    assert totals["monthly_recurring_total"] == 20.0
    assert totals["candidate_count"] == 1


def test_annual_recurring_estimate_normal_case():
    totals = summarize_recurring_candidates([
        {"interval": "monthly", "confidence": 0.9, "average_amount": 20.0},
    ])
    assert totals["annual_recurring_estimate"] == 240.0


def test_mixed_intervals_produce_correct_normalized_totals():
    totals = summarize_recurring_candidates([
        {"interval": "weekly", "confidence": 0.9, "average_amount": 10.0},      # 520/yr
        {"interval": "monthly", "confidence": 0.9, "average_amount": 20.0},     # 240/yr
        {"interval": "quarterly", "confidence": 0.9, "average_amount": 30.0},   # 120/yr
        {"interval": "annual", "confidence": 0.9, "average_amount": 120.0},     # 120/yr
    ])
    assert totals["annual_recurring_estimate"] == 1000.0
    assert totals["monthly_recurring_total"] == 83.33
    assert totals["candidate_count"] == 4


def test_low_confidence_or_non_recurring_items_are_excluded():
    totals = summarize_recurring_candidates([
        {"interval": "monthly", "confidence": 0.4, "average_amount": 100.0},
        {"interval": "none", "confidence": 0.9, "average_amount": 50.0},
        {"interval": "annual", "confidence": 0.9, "average_amount": 80.0},
    ])
    assert totals["candidate_count"] == 1
    assert totals["annual_recurring_estimate"] == 80.0
    assert totals["monthly_recurring_total"] == 6.67


def test_reusable_service_output_shape_is_stable_and_consumable():
    output = build_recurring_detection_result(
        user_id="u1",
        profile_id="p1",
        candidates=[{"merchant_normalized": "spotify", "interval": "monthly", "confidence": 0.9, "average_amount": 10.0}],
    )
    assert sorted(output.keys()) == ["candidates", "profile_id", "totals", "user_id"]
    assert sorted(output["totals"].keys()) == [
        "annual_recurring_estimate",
        "candidate_count",
        "monthly_recurring_total",
    ]
    assert output["user_id"] == "u1"
    assert output["profile_id"] == "p1"
    assert len(output["candidates"]) == 1


def test_summary_user_profile_isolation_is_preserved():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "merchant": "Spotify", "amount": 10.0, "date": _dt(2026, 1, 2), "type": "expense"},
        {"user_id": "u1", "profile_id": "p1", "merchant": "Spotify", "amount": 10.0, "date": _dt(2026, 2, 2), "type": "expense"},
        {"user_id": "u1", "profile_id": "p1", "merchant": "Spotify", "amount": 10.0, "date": _dt(2026, 3, 2), "type": "expense"},
        {"user_id": "u2", "profile_id": "p2", "merchant": "Spotify", "amount": 40.0, "date": _dt(2026, 1, 2), "type": "expense"},
        {"user_id": "u2", "profile_id": "p2", "merchant": "Spotify", "amount": 40.0, "date": _dt(2026, 2, 2), "type": "expense"},
        {"user_id": "u2", "profile_id": "p2", "merchant": "Spotify", "amount": 40.0, "date": _dt(2026, 3, 2), "type": "expense"},
    ]

    summary = _run(
        detect_recurring_profile_summary(
            user_id="u1",
            profile_id="p1",
            expenses_collection=_FakeCollection(docs),
            now=_dt(2026, 3, 3),
        )
    )

    assert summary["user_id"] == "u1"
    assert summary["profile_id"] == "p1"
    assert summary["totals"]["monthly_recurring_total"] == 10.0


def test_variable_merchant_false_positive_is_excluded_safely():
    txs = [
        {"merchant": "Amazon", "amount": 20.0, "date": _dt(2026, 1, 5), "type": "expense"},
        {"merchant": "Amazon", "amount": 120.0, "date": _dt(2026, 2, 5), "type": "expense"},
        {"merchant": "Amazon", "amount": 40.0, "date": _dt(2026, 3, 5), "type": "expense"},
    ]
    candidates = detect_recurring_merchants_from_transactions(txs)
    assert candidates == []


def test_one_off_repeat_purchase_is_excluded_safely():
    txs = [
        {"merchant": "Best Buy", "amount": 60.0, "date": _dt(2026, 1, 1), "type": "expense"},
        {"merchant": "Best Buy", "amount": 80.0, "date": _dt(2026, 1, 2), "type": "expense"},
        {"merchant": "Best Buy", "amount": 45.0, "date": _dt(2026, 1, 3), "type": "expense"},
    ]
    candidates = detect_recurring_merchants_from_transactions(txs)
    assert candidates == []
