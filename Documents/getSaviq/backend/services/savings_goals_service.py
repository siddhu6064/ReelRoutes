from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional


def calculate_goal_progress_percentage(
    current_amount: Optional[float],
    target_amount: Optional[float],
) -> float:
    target = float(target_amount or 0.0)
    current = float(current_amount or 0.0)

    if target <= 0:
        return 0.0

    current = max(current, 0.0)
    progress = (current / target) * 100
    progress = min(max(progress, 0.0), 100.0)
    return round(progress, 2)


async def calculate_recent_monthly_savings_velocity(
    user_id: str,
    profile_id: str,
    *,
    expenses_collection,
    now: Optional[datetime] = None,
    recent_days: int = 90,
) -> float:
    current_now = now or datetime.now(timezone.utc)
    window_start = current_now - timedelta(days=recent_days)

    query = {
        "user_id": user_id,
        "profile_id": profile_id,
        "date": {"$gte": window_start, "$lte": current_now},
    }
    docs = await expenses_collection.find(query, {"_id": 0, "amount": 1, "type": 1}).to_list(5000)

    income_total = sum(float(d.get("amount", 0.0)) for d in docs if d.get("type") == "income")
    expense_total = sum(float(d.get("amount", 0.0)) for d in docs if d.get("type", "expense") != "income")
    net = income_total - expense_total

    months = max(recent_days / 30.0, 1.0)
    velocity = net / months
    return round(velocity, 2)


def calculate_goal_projection(
    *,
    current_amount: Optional[float],
    target_amount: Optional[float],
    monthly_velocity: Optional[float],
    manual_monthly_contribution: Optional[float],
    now: Optional[datetime] = None,
) -> dict:
    current_now = now or datetime.now(timezone.utc)
    current = max(float(current_amount or 0.0), 0.0)
    target = float(target_amount or 0.0)

    if target <= 0:
        return {
            "basis": "unavailable",
            "monthly_contribution_assumed": 0.0,
            "months_remaining": None,
            "projected_completion_date": None,
        }

    remaining = max(target - current, 0.0)
    if remaining == 0:
        return {
            "basis": "already_completed",
            "monthly_contribution_assumed": 0.0,
            "months_remaining": 0.0,
            "projected_completion_date": current_now,
        }

    basis = "unavailable"
    contribution = 0.0

    if monthly_velocity is not None and monthly_velocity > 0:
        basis = "historical_velocity"
        contribution = float(monthly_velocity)
    elif manual_monthly_contribution is not None and manual_monthly_contribution > 0:
        basis = "manual_assumption"
        contribution = float(manual_monthly_contribution)

    if contribution <= 0:
        return {
            "basis": "unavailable",
            "monthly_contribution_assumed": 0.0,
            "months_remaining": None,
            "projected_completion_date": None,
        }

    months_remaining = round(remaining / contribution, 2)
    projected_days = max(int(round(months_remaining * 30.0)), 0)

    return {
        "basis": basis,
        "monthly_contribution_assumed": round(contribution, 2),
        "months_remaining": months_remaining,
        "projected_completion_date": current_now + timedelta(days=projected_days),
    }


def calculate_monthly_savings_recommendation(
    *,
    current_amount: Optional[float],
    target_amount: Optional[float],
    deadline: Optional[datetime],
    now: Optional[datetime] = None,
) -> Optional[float]:
    current_now = now or datetime.now(timezone.utc)
    current = max(float(current_amount or 0.0), 0.0)
    target = float(target_amount or 0.0)

    if target <= 0:
        return None
    if current >= target:
        return 0.0
    if deadline is None:
        return None

    deadline_dt = deadline
    if deadline_dt.tzinfo is None:
        deadline_dt = deadline_dt.replace(tzinfo=timezone.utc)

    seconds_remaining = (deadline_dt - current_now).total_seconds()
    if seconds_remaining <= 0:
        return None

    months_remaining = max(seconds_remaining / (30 * 24 * 60 * 60), 0.01)
    recommendation = (target - current) / months_remaining
    return round(max(recommendation, 0.0), 2)
