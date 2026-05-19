import asyncio
from datetime import datetime, timezone

from services.forecast_service import (
    calculate_budget_exceed_risk,
    calculate_forecast_confidence,
    calculate_month_end_smoothed_projection,
    calculate_spend_velocity,
    generate_spend_forecast,
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
        date_q = query.get("date", {})
        gte = date_q.get("$gte")
        lte = date_q.get("$lte")

        matches = []
        for doc in self.docs:
            if doc.get("user_id") != query.get("user_id"):
                continue
            if doc.get("profile_id") != query.get("profile_id"):
                continue
            if query.get("period") and doc.get("period") != query.get("period"):
                continue

            dt = doc.get("date")
            if gte and dt is not None and dt < gte:
                continue
            if lte and dt is not None and dt > lte:
                continue

            if projection:
                matches.append({k: doc.get(k) for k, enabled in projection.items() if enabled})
            else:
                matches.append(dict(doc))

        return _FakeCursor(matches)


def _run(coro):
    return asyncio.run(coro)


def _sample_docs():
    return [
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 1, tzinfo=timezone.utc), "amount": 100, "type": "expense", "category_id": "food"},
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 2, tzinfo=timezone.utc), "amount": 110, "type": "expense", "category_id": "food"},
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 3, tzinfo=timezone.utc), "amount": 95, "type": "expense", "category_id": "transport"},
    ]


def _monthly_budget_docs(amount=1000.0):
    return [{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": amount}]


def test_7_day_forecast_normal_case():
    result = _run(
        generate_spend_forecast(
            "u1",
            "p1",
            expenses_collection=_FakeCollection(_sample_docs()),
            budgets_collection=_FakeCollection(_monthly_budget_docs()),
            now=datetime(2026, 4, 4, tzinfo=timezone.utc),
            recent_days=30,
        )
    )

    assert result["projections"]["next_7_days"] > 0


def test_30_day_forecast_normal_case():
    result = _run(
        generate_spend_forecast(
            "u1",
            "p1",
            expenses_collection=_FakeCollection(_sample_docs()),
            budgets_collection=_FakeCollection(_monthly_budget_docs()),
            now=datetime(2026, 4, 4, tzinfo=timezone.utc),
            recent_days=30,
        )
    )

    assert result["projections"]["next_30_days"] > result["projections"]["next_7_days"]


def test_month_end_smoothed_projection_early_month():
    smoothed = calculate_month_end_smoothed_projection(
        spend_to_date=120,
        elapsed_days=2,
        days_in_month=30,
        velocity_daily_spend=12,
    )

    naive_run_rate_total = (120 / 2) * 30
    assert smoothed["projected_month_total"] < naive_run_rate_total
    assert smoothed["observed_weight"] < smoothed["velocity_weight"]


def test_month_end_smoothed_projection_mid_month():
    smoothed = calculate_month_end_smoothed_projection(
        spend_to_date=450,
        elapsed_days=15,
        days_in_month=30,
        velocity_daily_spend=12,
    )

    assert smoothed["observed_weight"] == smoothed["velocity_weight"]
    assert smoothed["projected_month_total"] > 0


def test_month_end_smoothed_projection_late_month():
    smoothed = calculate_month_end_smoothed_projection(
        spend_to_date=780,
        elapsed_days=27,
        days_in_month=30,
        velocity_daily_spend=12,
    )

    assert smoothed["observed_weight"] > smoothed["velocity_weight"]
    assert smoothed["projected_remaining_spend"] >= 0


def test_spend_velocity_with_recent_cadence():
    velocity = calculate_spend_velocity(_sample_docs(), 30)

    assert velocity["transaction_count"] == 3
    assert velocity["cadence_per_day"] == 0.1
    assert velocity["daily_spend"] > 0


def test_category_weighting_deterministic_behavior():
    velocity = calculate_spend_velocity(_sample_docs(), 30)

    assert velocity["category_weights"]["food"] > velocity["category_weights"]["transport"]
    assert velocity["weighted_daily_spend"] >= velocity["daily_spend"]


def test_confidence_scoring_high_confidence_case():
    txs = [
        {"date": datetime(2026, 4, day, tzinfo=timezone.utc), "amount": 100, "type": "expense", "category_id": "food"}
        for day in range(1, 21)
    ]
    confidence = calculate_forecast_confidence(txs, 30)

    assert confidence["score"] >= 70
    assert confidence["level"] == "high"


def test_confidence_scoring_low_volume_case():
    txs = [{"date": datetime(2026, 4, 1, tzinfo=timezone.utc), "amount": 100, "type": "expense", "category_id": "food"}]
    confidence = calculate_forecast_confidence(txs, 30)

    assert confidence["score"] < 40
    assert confidence["level"] == "low"


def test_confidence_scoring_inconsistent_noisy_signal_case():
    txs = [
        {"date": datetime(2026, 4, 1, tzinfo=timezone.utc), "amount": 10, "type": "expense", "category_id": "food"},
        {"date": datetime(2026, 4, 2, tzinfo=timezone.utc), "amount": 900, "type": "expense", "category_id": "food"},
        {"date": datetime(2026, 4, 3, tzinfo=timezone.utc), "amount": 20, "type": "expense", "category_id": "food"},
        {"date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 850, "type": "expense", "category_id": "food"},
        {"date": datetime(2026, 4, 5, tzinfo=timezone.utc), "amount": 15, "type": "expense", "category_id": "food"},
        {"date": datetime(2026, 4, 6, tzinfo=timezone.utc), "amount": 920, "type": "expense", "category_id": "food"},
    ]
    confidence = calculate_forecast_confidence(txs, 30)

    assert confidence["components"]["consistency_cv"] is not None
    assert confidence["components"]["consistency_score"] <= 21


def test_risk_scoring_normal_case_with_budget_present():
    risk = calculate_budget_exceed_risk(projected_month_total=1150, budget_amount=1000)

    assert risk["status"] == "ok"
    assert risk["score"] > 0
    assert risk["projected_overrun_amount"] == 150.0
    assert risk["badge"] in {"risk_low", "risk_medium", "risk_high"}


def test_higher_projected_spend_results_in_higher_risk_score():
    low = calculate_budget_exceed_risk(projected_month_total=900, budget_amount=1000)
    high = calculate_budget_exceed_risk(projected_month_total=1400, budget_amount=1000)

    assert high["score"] > low["score"]


def test_forecast_response_structure_includes_totals_confidence_and_risk_fields():
    result = _run(
        generate_spend_forecast(
            "u1",
            "p1",
            expenses_collection=_FakeCollection(_sample_docs()),
            budgets_collection=_FakeCollection(_monthly_budget_docs()),
            now=datetime(2026, 4, 4, tzinfo=timezone.utc),
            recent_days=30,
        )
    )

    assert set(result.keys()) >= {"projections", "confidence", "forecast_summary", "budget_exceed_risk"}
    assert set(result["forecast_summary"].keys()) == {"totals", "confidence", "risk"}
    assert set(result["forecast_summary"]["totals"].keys()) >= {"next_7_days", "next_30_days", "projected_month_total"}


def test_sparse_no_data_cases_return_safe_confidence_values():
    sparse_confidence = calculate_forecast_confidence(
        [{"date": datetime(2026, 4, 1, tzinfo=timezone.utc), "amount": 20, "type": "expense", "category_id": "misc"}],
        30,
    )
    no_data_confidence = calculate_forecast_confidence([], 30)

    assert sparse_confidence["score"] >= 0
    assert no_data_confidence["score"] == 0.0
    assert no_data_confidence["level"] == "low"


def test_existing_forecast_outputs_remain_stable_where_intended():
    result = _run(
        generate_spend_forecast(
            "u1",
            "p1",
            expenses_collection=_FakeCollection(_sample_docs()),
            budgets_collection=_FakeCollection(_monthly_budget_docs()),
            now=datetime(2026, 4, 4, tzinfo=timezone.utc),
            recent_days=30,
        )
    )

    assert set(result["projections"].keys()) >= {
        "next_7_days",
        "next_30_days",
        "month_end",
        "days_to_month_end",
    }
    assert result["projections"]["next_7_days"] > 0


def test_user_profile_isolation_remains_preserved():
    docs = _sample_docs() + [
        {"user_id": "u2", "profile_id": "p1", "date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 9999, "type": "expense", "category_id": "food"},
        {"user_id": "u1", "profile_id": "p2", "date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 9999, "type": "expense", "category_id": "food"},
    ]

    result = _run(
        generate_spend_forecast(
            "u1",
            "p1",
            expenses_collection=_FakeCollection(docs),
            budgets_collection=_FakeCollection(_monthly_budget_docs()),
            now=datetime(2026, 4, 4, tzinfo=timezone.utc),
            recent_days=30,
        )
    )

    assert result["spend_velocity"]["transaction_count"] == 3
