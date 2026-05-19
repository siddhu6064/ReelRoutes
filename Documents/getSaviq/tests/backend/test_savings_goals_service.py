import asyncio
from datetime import datetime, timezone

from services.savings_goals_service import (
    calculate_goal_progress_percentage,
    calculate_monthly_savings_recommendation,
    calculate_goal_projection,
    calculate_recent_monthly_savings_velocity,
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
            date = doc.get("date")
            if gte and date < gte:
                continue
            if lte and date > lte:
                continue

            if projection:
                matches.append({k: doc.get(k) for k, enabled in projection.items() if enabled})
            else:
                matches.append(dict(doc))
        return _FakeCursor(matches)


def _run(coro):
    return asyncio.run(coro)


def test_progress_percentage_normal_case():
    assert calculate_goal_progress_percentage(250, 1000) == 25.0


def test_progress_percentage_when_current_amount_zero():
    assert calculate_goal_progress_percentage(0, 1000) == 0.0


def test_progress_percentage_when_current_exceeds_target():
    assert calculate_goal_progress_percentage(1200, 1000) == 100.0


def test_progress_safe_handling_when_target_invalid_or_zero():
    assert calculate_goal_progress_percentage(100, 0) == 0.0
    assert calculate_goal_progress_percentage(-20, 1000) == 0.0
    assert calculate_goal_progress_percentage(None, None) == 0.0


def test_projected_completion_using_manual_contribution_assumption():
    now = datetime(2026, 4, 1, tzinfo=timezone.utc)
    result = calculate_goal_projection(
        current_amount=200,
        target_amount=1000,
        monthly_velocity=None,
        manual_monthly_contribution=200,
        now=now,
    )

    assert result["basis"] == "manual_assumption"
    assert result["monthly_contribution_assumed"] == 200.0
    assert result["months_remaining"] == 4.0
    assert result["projected_completion_date"] == datetime(2026, 7, 30, tzinfo=timezone.utc)


def test_projected_completion_using_historical_velocity():
    docs = [
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 3, 1, tzinfo=timezone.utc), "amount": 3000, "type": "income"},
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 3, 15, tzinfo=timezone.utc), "amount": 1500, "type": "expense"},
    ]
    velocity = _run(
        calculate_recent_monthly_savings_velocity(
            "u1",
            "p1",
            expenses_collection=_FakeCollection(docs),
            now=datetime(2026, 4, 1, tzinfo=timezone.utc),
            recent_days=90,
        )
    )

    result = calculate_goal_projection(
        current_amount=100,
        target_amount=1000,
        monthly_velocity=velocity,
        manual_monthly_contribution=150,
        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )

    assert velocity == 500.0
    assert result["basis"] == "historical_velocity"
    assert result["months_remaining"] == 1.8


def test_projection_safe_fallback_when_not_computable():
    result = calculate_goal_projection(
        current_amount=100,
        target_amount=1000,
        monthly_velocity=-50,
        manual_monthly_contribution=None,
        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )

    assert result == {
        "basis": "unavailable",
        "monthly_contribution_assumed": 0.0,
        "months_remaining": None,
        "projected_completion_date": None,
    }


def test_monthly_recommendation_normal_case():
    recommendation = calculate_monthly_savings_recommendation(
        current_amount=200,
        target_amount=1400,
        deadline=datetime(2026, 10, 1, tzinfo=timezone.utc),
        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    assert recommendation == 196.72


def test_monthly_recommendation_for_already_completed_goal():
    recommendation = calculate_monthly_savings_recommendation(
        current_amount=1500,
        target_amount=1000,
        deadline=datetime(2026, 10, 1, tzinfo=timezone.utc),
        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    assert recommendation == 0.0


def test_monthly_recommendation_when_deadline_already_passed():
    recommendation = calculate_monthly_savings_recommendation(
        current_amount=200,
        target_amount=1000,
        deadline=datetime(2026, 3, 1, tzinfo=timezone.utc),
        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    assert recommendation is None


def test_monthly_recommendation_when_target_met_or_exceeded():
    met = calculate_monthly_savings_recommendation(
        current_amount=1000,
        target_amount=1000,
        deadline=datetime(2026, 9, 1, tzinfo=timezone.utc),
        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    exceeded = calculate_monthly_savings_recommendation(
        current_amount=1200,
        target_amount=1000,
        deadline=datetime(2026, 9, 1, tzinfo=timezone.utc),
        now=datetime(2026, 4, 1, tzinfo=timezone.utc),
    )
    assert met == 0.0
    assert exceeded == 0.0
