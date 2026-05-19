import asyncio
from datetime import date, datetime, timezone
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from services.weekly_digest_service import (
    build_digest_recommendations,
    build_weekly_financial_digest,
    normalize_week_window,
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
        gte = query.get("date", {}).get("$gte")
        lte = query.get("date", {}).get("$lte")
        out = []
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
                out.append({k: row.get(k) for k, enabled in projection.items() if enabled})
            else:
                out.append(dict(row))
        return _FakeCursor(out)


def _dt(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


def _run(coro):
    return asyncio.run(coro)


def test_digest_builder_returns_expected_summary_totals_for_mixed_week():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "income", "amount": 1200, "date": _dt(2026, 4, 7)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 200, "category_id": "food", "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 300, "category_id": "rent", "date": _dt(2026, 4, 9)},
    ]

    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )

    assert digest["summary"]["income_total"] == 1200.0
    assert digest["summary"]["expense_total"] == 500.0
    assert digest["summary"]["net_total"] == 700.0
    assert digest["summary"]["transaction_count"] == 3
    assert digest["comparisons"]["previous_week_income_delta"] == 1200.0
    assert digest["comparisons"]["previous_week_expense_delta"] == 500.0
    assert digest["comparisons"]["previous_week_net_delta"] == 700.0


def test_improved_week_summary_case_mentions_spend_decrease():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "income", "amount": 1000, "date": _dt(2026, 4, 7)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 200, "category_id": "food", "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 400, "category_id": "food", "date": _dt(2026, 4, 2)},
    ]

    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )

    assert "Spending decreased" in digest["narrative"]["summary"]


def test_worse_week_summary_case_mentions_spend_increase():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "income", "amount": 1000, "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 450, "category_id": "rent", "date": _dt(2026, 4, 9)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 150, "category_id": "rent", "date": _dt(2026, 4, 2)},
    ]

    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )

    assert "Spending increased" in digest["narrative"]["summary"]


def test_low_data_fallback_summary_case_is_safe_and_deterministic():
    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection([]),
        )
    )

    assert digest["narrative"]["summary"] == "Not enough activity this week for a detailed digest yet."
    assert digest["narrative"]["tone"] == "encouraging"


def test_recommendations_count_is_bounded_to_one_to_three():
    recommendations = build_digest_recommendations(
        summary={"transaction_count": 8},
        comparisons={"previous_week_expense_delta": 200},
        highlights={"savings_rate": 0.3, "top_category_name": "travel"},
        signals={"unusual_spending_detected": True},
        forecast_overview={"budget_exceed_risk": {"level": "high"}},
        subscriptions_summary={"totals": {"monthly_recurring_total": 99}},
    )

    assert 1 <= len(recommendations) <= 3


def test_recommendations_ids_and_content_are_deterministic_for_same_input():
    payload = {
        "summary": {"transaction_count": 8},
        "comparisons": {"previous_week_expense_delta": 80},
        "highlights": {"savings_rate": 0.24, "top_category_name": "food"},
        "signals": {"unusual_spending_detected": True},
    }

    first = build_digest_recommendations(**payload)
    second = build_digest_recommendations(**payload)

    assert first == second


def test_savings_positive_highlight_appears_when_applicable():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "income", "amount": 1000, "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 200, "category_id": "food", "date": _dt(2026, 4, 9)},
    ]

    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )

    assert "net savings" in digest["narrative"]["summary"]


def test_recommendations_gracefully_degrade_when_forecast_and_subscriptions_absent():
    recommendations = build_digest_recommendations(
        summary={"transaction_count": 5},
        comparisons={"previous_week_expense_delta": 0},
        highlights={"savings_rate": None, "top_category_name": "food"},
        signals={"unusual_spending_detected": False},
        forecast_overview=None,
        subscriptions_summary=None,
    )

    assert 1 <= len(recommendations) <= 3
    assert all("id" in item and "text" in item for item in recommendations)


def test_empty_week_returns_zero_safe_summary_and_null_largest_expense():
    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection([]),
        )
    )

    assert digest["summary"] == {
        "income_total": 0.0,
        "expense_total": 0.0,
        "net_total": 0.0,
        "transaction_count": 0,
    }
    assert digest["signals"]["largest_expense"] is None
    assert digest["highlights"]["top_category_name"] is None
    assert digest["highlights"]["top_category_amount"] == 0.0


def test_top_expense_categories_ordering_is_deterministic():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 50, "category_id": "food", "date": _dt(2026, 4, 7)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 75, "category_id": "travel", "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 40, "category_id": "food", "date": _dt(2026, 4, 9)},
    ]

    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )

    categories = digest["breakdown"]["top_expense_categories"]
    assert categories[0]["category_id"] == "food"
    assert categories[0]["total_amount"] == 90.0
    assert categories[1]["category_id"] == "travel"
    assert digest["highlights"]["top_category_name"] == "food"
    assert digest["highlights"]["top_category_amount"] == 90.0


def test_unusual_spending_detected_heuristic_is_deterministic():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 20, "date": _dt(2026, 4, 7)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 30, "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 250, "date": _dt(2026, 4, 9)},
    ]

    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )
    assert digest["signals"]["unusual_spending_detected"] is True


def test_zero_safe_comparison_behavior_when_previous_week_is_empty():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "income", "amount": 300, "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 120, "date": _dt(2026, 4, 9)},
    ]
    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )
    assert digest["comparisons"]["previous_week_income_delta"] == 300.0
    assert digest["comparisons"]["previous_week_expense_delta"] == 120.0
    assert digest["comparisons"]["previous_week_net_delta"] == 180.0


def test_savings_rate_is_null_when_income_total_is_zero_or_less():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 100, "date": _dt(2026, 4, 8)},
    ]
    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )
    assert digest["highlights"]["savings_rate"] is None


def test_savings_rate_is_computed_correctly_when_income_exists():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "type": "income", "amount": 1000, "date": _dt(2026, 4, 8)},
        {"user_id": "u1", "profile_id": "p1", "type": "expense", "amount": 300, "date": _dt(2026, 4, 9)},
    ]
    digest = _run(
        build_weekly_financial_digest(
            user_id="u1",
            profile_id="p1",
            week_start=_dt(2026, 4, 6),
            week_end=_dt(2026, 4, 12),
            expenses_collection=_FakeCollection(docs),
        )
    )
    assert digest["highlights"]["savings_rate"] == 0.7


def test_week_normalization_and_validation_behavior():
    start, end = normalize_week_window(
        now=datetime(2026, 4, 9, 15, 0, tzinfo=timezone.utc)
    )
    assert start == _dt(2026, 4, 6).replace(hour=0, minute=0, second=0, microsecond=0)
    assert end == _dt(2026, 4, 12).replace(hour=23, minute=59, second=59, microsecond=999999)

    explicit_start, explicit_end = normalize_week_window(
        week_start=date(2026, 4, 6),
        week_end=date(2026, 4, 12),
    )
    assert explicit_start.date() == date(2026, 4, 6)
    assert explicit_end.date() == date(2026, 4, 12)

    try:
        normalize_week_window(week_start=date(2026, 4, 12), week_end=date(2026, 4, 6))
        assert False, "expected ValueError"
    except ValueError:
        assert True
