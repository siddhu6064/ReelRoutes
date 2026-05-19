from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from services.week13_metrics_service import (
    compute_budget_confidence,
    compute_financial_health_score,
    compute_projected_savings_summary,
    compute_savings_score,
    compute_spend_velocity,
    compute_top_category_summary,
)


def _dt(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


def test_savings_score_computes_correctly_when_all_components_available():
    result = compute_savings_score(
        goals_progress=0.8,
        budget_adherence=90,
        discretionary_trend=0.7,
    )

    assert result["value"] == 80.0
    assert result["components"] == {
        "goals_progress": 80.0,
        "budget_adherence": 90.0,
        "discretionary_trend": 70.0,
    }
    assert result["has_sufficient_data"] is True


def test_savings_score_degrades_gracefully_when_one_component_missing():
    result = compute_savings_score(
        goals_progress=75,
        budget_adherence=None,
        discretionary_trend=0.5,
    )

    assert result["value"] == 62.5
    assert result["components"]["budget_adherence"] is None
    assert result["has_sufficient_data"] is True


def test_savings_score_no_data_case_returns_explicit_safe_outcome():
    result = compute_savings_score(
        goals_progress=None,
        budget_adherence=None,
        discretionary_trend=None,
    )

    assert result["value"] is None
    assert result["has_sufficient_data"] is False


def test_savings_score_is_deterministic_for_same_input():
    payload = {
        "goals_progress": 63,
        "budget_adherence": 72,
        "discretionary_trend": 81,
    }

    first = compute_savings_score(**payload)
    second = compute_savings_score(**payload)

    assert first == second


def test_savings_score_component_breakdown_matches_inputs():
    result = compute_savings_score(
        goals_progress=0.35,
        budget_adherence=125,
        discretionary_trend=-9,
    )

    assert result["components"] == {
        "goals_progress": 35.0,
        "budget_adherence": 100.0,
        "discretionary_trend": 0.0,
    }


def test_spend_velocity_computes_correctly_for_normal_recent_expense_activity():
    transactions = [
        {"date": _dt(2026, 4, 1), "amount": 20},
        {"date": _dt(2026, 4, 2), "amount": 30},
        {"date": _dt(2026, 4, 3), "amount": 50},
        {"date": _dt(2026, 4, 7), "amount": 40},
    ]

    result = compute_spend_velocity(recent_expense_transactions=transactions, window_days=7)

    assert result["recent_daily_average"] == 20.0
    assert result["recent_weekly_average"] == 140.0
    assert result["value"] == 140.0
    assert result["has_sufficient_data"] is True


def test_spend_velocity_zero_no_recent_expense_activity_returns_safe_outcome():
    result = compute_spend_velocity(recent_expense_transactions=[], window_days=7)

    assert result == {
        "value": None,
        "recent_daily_average": 0.0,
        "recent_weekly_average": 0.0,
        "transaction_cadence": 0.0,
        "has_sufficient_data": False,
    }


def test_spend_velocity_transaction_cadence_is_deterministic():
    transactions = [
        {"date": "2026-04-01T00:00:00+00:00", "amount": 20},
        {"date": "2026-04-02T00:00:00+00:00", "amount": 20},
        {"date": "2026-04-03T00:00:00+00:00", "amount": 20},
    ]

    result = compute_spend_velocity(recent_expense_transactions=transactions, window_days=6)

    assert result["transaction_cadence"] == 0.5


def test_spend_velocity_large_day_outlier_keeps_math_explicit_and_bounded_by_window():
    transactions = [
        {"date": _dt(2026, 4, 1), "amount": 10},
        {"date": _dt(2026, 4, 2), "amount": 10},
        {"date": _dt(2026, 4, 3), "amount": 1000},
    ]

    result = compute_spend_velocity(recent_expense_transactions=transactions, window_days=7)

    assert result["recent_daily_average"] == round((1020 / 7), 2)
    assert result["recent_weekly_average"] == round(result["recent_daily_average"] * 7, 2)


def test_spend_velocity_is_deterministic_for_same_input():
    transactions = [
        {"date": _dt(2026, 4, 1), "amount": 25},
        {"date": _dt(2026, 4, 2), "amount": 35},
    ]

    first = compute_spend_velocity(recent_expense_transactions=transactions, window_days=7)
    second = compute_spend_velocity(recent_expense_transactions=transactions, window_days=7)

    assert first == second



def test_financial_health_score_computes_correctly_when_all_components_available():
    result = compute_financial_health_score(
        net_position=70,
        savings_behavior=0.8,
        budget_pressure=0.3,
        goal_progress=60,
    )

    assert result["components"] == {
        "net_position": 70.0,
        "savings_behavior": 80.0,
        "budget_pressure": 70.0,
        "goal_progress": 60.0,
    }
    assert result["value"] == 70.0
    assert result["has_sufficient_data"] is True


def test_financial_health_score_degrades_gracefully_when_one_component_missing():
    result = compute_financial_health_score(
        net_position=70,
        savings_behavior=None,
        budget_pressure=20,
        goal_progress=80,
    )

    assert result["components"]["savings_behavior"] is None
    assert result["value"] == 76.67
    assert result["has_sufficient_data"] is True


def test_financial_health_score_no_data_case_returns_explicit_safe_outcome():
    result = compute_financial_health_score(
        net_position=None,
        savings_behavior=None,
        budget_pressure=None,
        goal_progress=None,
    )

    assert result["value"] is None
    assert result["has_sufficient_data"] is False


def test_financial_health_score_is_deterministic_for_same_input():
    payload = {
        "net_position": 45,
        "savings_behavior": 63,
        "budget_pressure": 32,
        "goal_progress": 81,
    }

    first = compute_financial_health_score(**payload)
    second = compute_financial_health_score(**payload)

    assert first == second


def test_financial_health_score_component_breakdown_matches_inputs():
    result = compute_financial_health_score(
        net_position=0.5,
        savings_behavior=200,
        budget_pressure=125,
        goal_progress=-5,
    )

    assert result["components"] == {
        "net_position": 50.0,
        "savings_behavior": 100.0,
        "budget_pressure": 0.0,
        "goal_progress": 0.0,
    }


def test_budget_confidence_computes_correctly_when_all_components_available():
    result = compute_budget_confidence(
        forecast_alignment="low",
        remaining_budget_ratio=0.6,
        historical_consistency=70,
    )

    assert result["components"] == {
        "forecast_alignment": 80.0,
        "remaining_budget_ratio": 60.0,
        "historical_consistency": 70.0,
    }
    assert result["value"] == 70.0
    assert result["has_sufficient_data"] is True


def test_budget_confidence_degrades_gracefully_when_forecast_is_missing():
    result = compute_budget_confidence(
        forecast_alignment=None,
        remaining_budget_ratio=0.5,
        historical_consistency=80,
    )

    assert result["components"]["forecast_alignment"] is None
    assert result["value"] == 65.0
    assert result["has_sufficient_data"] is True


def test_budget_confidence_no_data_case_returns_explicit_safe_outcome():
    result = compute_budget_confidence(
        forecast_alignment=None,
        remaining_budget_ratio=None,
        historical_consistency=None,
    )

    assert result["value"] is None
    assert result["has_sufficient_data"] is False


def test_budget_confidence_is_deterministic_for_same_input():
    payload = {
        "forecast_alignment": "medium",
        "remaining_budget_ratio": 55,
        "historical_consistency": 75,
    }

    first = compute_budget_confidence(**payload)
    second = compute_budget_confidence(**payload)

    assert first == second


def test_budget_confidence_component_breakdown_matches_inputs():
    result = compute_budget_confidence(
        forecast_alignment="critical",
        remaining_budget_ratio=120,
        historical_consistency=-10,
    )

    assert result["components"] == {
        "forecast_alignment": 0.0,
        "remaining_budget_ratio": 100.0,
        "historical_consistency": 0.0,
    }



def test_top_category_summary_computes_correctly_for_normal_expense_data():
    result = compute_top_category_summary(
        current_period_expense_transactions=[
            {"category_name": "Food", "amount": 120},
            {"category_name": "Travel", "amount": 90},
            {"category_name": "Food", "amount": 30},
        ]
    )

    assert result == {
        "category_name": "Food",
        "amount": 150.0,
        "share_of_expenses": 0.625,
        "has_sufficient_data": True,
    }


def test_top_category_summary_tie_breaking_is_deterministic():
    result = compute_top_category_summary(
        current_period_expense_transactions=[
            {"category_name": "Travel", "amount": 100},
            {"category_name": "Food", "amount": 100},
        ]
    )

    assert result["category_name"] == "Food"


def test_top_category_summary_no_data_case_returns_safe_explicit_outcome():
    result = compute_top_category_summary(current_period_expense_transactions=[])

    assert result == {
        "category_name": None,
        "amount": 0.0,
        "share_of_expenses": None,
        "has_sufficient_data": False,
    }


def test_projected_savings_summary_computes_correctly_for_normal_case():
    spend_velocity = {
        "recent_daily_average": 40,
    }

    result = compute_projected_savings_summary(
        current_net_total=1200,
        spend_velocity=spend_velocity,
        elapsed_days=10,
        total_days=30,
    )

    assert result == {
        "projected_savings": 400.0,
        "basis": "net_minus_velocity_remaining_spend",
        "has_sufficient_data": True,
    }


def test_projected_savings_summary_no_data_case_returns_safe_explicit_outcome():
    result = compute_projected_savings_summary(
        current_net_total=None,
        spend_velocity=None,
        elapsed_days=None,
        total_days=None,
    )

    assert result == {
        "projected_savings": None,
        "basis": None,
        "has_sufficient_data": False,
    }


def test_projected_savings_summary_is_deterministic_for_same_inputs():
    payload = {
        "current_net_total": 700,
        "spend_velocity": {"recent_daily_average": 25},
        "elapsed_days": 12,
        "total_days": 30,
    }

    first = compute_projected_savings_summary(**payload)
    second = compute_projected_savings_summary(**payload)

    assert first == second



def test_full_metric_bundle_helper_repeatability_is_deterministic_for_same_inputs():
    payload = {
        "savings": {
            "goals_progress": 70,
            "budget_adherence": 65,
            "discretionary_trend": 55,
        },
        "velocity": {
            "recent_expense_transactions": [
                {"date": _dt(2026, 4, 1), "amount": 20},
                {"date": _dt(2026, 4, 2), "amount": 30},
                {"date": _dt(2026, 4, 3), "amount": 40},
            ],
            "window_days": 7,
        },
        "health": {
            "net_position": 68,
            "savings_behavior": 70,
            "budget_pressure": 30,
            "goal_progress": 70,
        },
        "confidence": {
            "forecast_alignment": "medium",
            "remaining_budget_ratio": 60,
            "historical_consistency": 75,
        },
        "top_category": {
            "current_period_expense_transactions": [
                {"category_name": "Food", "amount": 120},
                {"category_name": "Rent", "amount": 500},
            ],
        },
    }

    velocity_first = compute_spend_velocity(**payload["velocity"])
    first = {
        "savings_score": compute_savings_score(**payload["savings"]),
        "spend_velocity": velocity_first,
        "financial_health_score": compute_financial_health_score(**payload["health"]),
        "budget_confidence": compute_budget_confidence(**payload["confidence"]),
        "top_category_summary": compute_top_category_summary(**payload["top_category"]),
        "projected_savings_summary": compute_projected_savings_summary(
            current_net_total=900,
            spend_velocity=velocity_first,
            elapsed_days=12,
            total_days=30,
        ),
    }

    velocity_second = compute_spend_velocity(**payload["velocity"])
    second = {
        "savings_score": compute_savings_score(**payload["savings"]),
        "spend_velocity": velocity_second,
        "financial_health_score": compute_financial_health_score(**payload["health"]),
        "budget_confidence": compute_budget_confidence(**payload["confidence"]),
        "top_category_summary": compute_top_category_summary(**payload["top_category"]),
        "projected_savings_summary": compute_projected_savings_summary(
            current_net_total=900,
            spend_velocity=velocity_second,
            elapsed_days=12,
            total_days=30,
        ),
    }

    assert first == second


def test_full_no_data_case_at_helper_level_returns_explicit_safe_structures():
    velocity = compute_spend_velocity(recent_expense_transactions=[], window_days=28)

    bundle = {
        "savings_score": compute_savings_score(goals_progress=None, budget_adherence=None, discretionary_trend=None),
        "spend_velocity": velocity,
        "financial_health_score": compute_financial_health_score(
            net_position=None,
            savings_behavior=None,
            budget_pressure=None,
            goal_progress=None,
        ),
        "budget_confidence": compute_budget_confidence(
            forecast_alignment=None,
            remaining_budget_ratio=None,
            historical_consistency=None,
        ),
        "top_category_summary": compute_top_category_summary(current_period_expense_transactions=[]),
        "projected_savings_summary": compute_projected_savings_summary(
            current_net_total=None,
            spend_velocity=velocity,
            elapsed_days=None,
            total_days=None,
        ),
    }

    assert bundle["savings_score"]["has_sufficient_data"] is False
    assert bundle["spend_velocity"]["has_sufficient_data"] is False
    assert bundle["financial_health_score"]["has_sufficient_data"] is False
    assert bundle["budget_confidence"]["has_sufficient_data"] is False
    assert bundle["top_category_summary"]["has_sufficient_data"] is False
    assert bundle["projected_savings_summary"]["has_sufficient_data"] is False


def test_score_outputs_stay_within_transparent_0_to_100_bounds():
    savings = compute_savings_score(goals_progress=-100, budget_adherence=250, discretionary_trend=0.3)
    health = compute_financial_health_score(net_position=-20, savings_behavior=500, budget_pressure=-10, goal_progress=150)
    confidence = compute_budget_confidence(forecast_alignment="critical", remaining_budget_ratio=200, historical_consistency=-40)

    for metric in [savings, health, confidence]:
        components = metric["components"]
        for value in components.values():
            if value is None:
                continue
            assert 0.0 <= value <= 100.0


def test_projected_savings_partial_data_behavior_is_explicit_and_stable():
    velocity = compute_spend_velocity(
        recent_expense_transactions=[{"date": _dt(2026, 4, 2), "amount": 35}],
        window_days=7,
    )

    partial = compute_projected_savings_summary(
        current_net_total=500,
        spend_velocity=velocity,
        elapsed_days=15,
        total_days=30,
    )
    invalid = compute_projected_savings_summary(
        current_net_total=500,
        spend_velocity=velocity,
        elapsed_days=31,
        total_days=30,
    )

    assert partial["has_sufficient_data"] is True
    assert partial["basis"] == "net_minus_velocity_remaining_spend"
    assert invalid == {
        "projected_savings": None,
        "basis": None,
        "has_sufficient_data": False,
    }
