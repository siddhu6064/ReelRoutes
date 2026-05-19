from datetime import datetime, timezone

from fixtures.savings_goals_seed import build_savings_goal_seed
from models import SavingsGoal
from services.savings_goals_service import (
    calculate_goal_progress_percentage,
    calculate_goal_projection,
    calculate_monthly_savings_recommendation,
)


def _seeded_goals():
    return build_savings_goal_seed(
        user_id="user_seed_demo",
        profile_id="profile_seed_demo",
        now=datetime(2026, 4, 4, tzinfo=timezone.utc),
    )


def test_seed_data_matches_current_savings_goal_schema():
    goals = _seeded_goals()
    assert len(goals) >= 6
    for goal in goals:
        validated = SavingsGoal.model_validate(goal)
        assert validated.user_id == "user_seed_demo"
        assert validated.profile_id == "profile_seed_demo"


def test_seed_data_supports_enriched_goal_calculations_without_errors():
    for goal in _seeded_goals():
        progress = calculate_goal_progress_percentage(goal.get("current_amount"), goal.get("target_amount"))
        recommendation = calculate_monthly_savings_recommendation(
            current_amount=goal.get("current_amount"),
            target_amount=goal.get("target_amount"),
            deadline=goal.get("deadline"),
            now=datetime(2026, 4, 4, tzinfo=timezone.utc),
        )
        projection = calculate_goal_projection(
            current_amount=goal.get("current_amount"),
            target_amount=goal.get("target_amount"),
            monthly_velocity=300.0,
            manual_monthly_contribution=None,
            now=datetime(2026, 4, 4, tzinfo=timezone.utc),
        )

        assert isinstance(progress, float)
        assert projection["basis"] in {"historical_velocity", "already_completed", "unavailable"}
        assert recommendation is None or isinstance(recommendation, float)


def test_seed_data_has_realistic_variety_for_ui_and_demo_flows():
    goals = _seeded_goals()
    statuses = {goal["status"] for goal in goals}
    categories = {goal["category"] for goal in goals}

    assert {"active", "completed", "paused", "cancelled"}.issubset(statuses)
    assert len(categories) >= 5

    now = datetime(2026, 4, 4, tzinfo=timezone.utc)
    days_until = [int((goal["deadline"] - now).days) for goal in goals]
    assert any(days <= 90 for days in days_until)
    assert any(days >= 365 for days in days_until)

    completion_ratios = [goal["current_amount"] / goal["target_amount"] for goal in goals]
    assert any(ratio >= 0.85 for ratio in completion_ratios)
    assert any(ratio < 0.5 for ratio in completion_ratios)
