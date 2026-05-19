from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from deps import get_current_user
from services.forecast_service import generate_spend_forecast
from services.week13_metrics_service import (
    compute_budget_confidence,
    compute_financial_health_score,
    compute_projected_savings_summary,
    compute_savings_score,
    compute_spend_velocity,
    compute_top_category_summary,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


async def _ensure_profile_owned(profile_id: str, user_id: str):
    profile = await db.profiles.find_one(
        {"profile_id": profile_id, "user_id": user_id},
        {"_id": 0},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")


def _to_float(value) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _days_in_month(now: datetime) -> int:
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return (next_month.date() - month_start.date()).days


@router.get("/metrics")
async def get_dashboard_metrics(
    profile_id: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
):
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    await _ensure_profile_owned(profile_id, current_user["user_id"])

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    total_days = _days_in_month(now)
    elapsed_days = (now.date() - month_start.date()).days + 1

    expenses = await db.expenses.find(
        {
            "user_id": current_user["user_id"],
            "profile_id": profile_id,
            "date": {"$gte": month_start, "$lte": now},
        },
        {
            "_id": 0,
            "amount": 1,
            "type": 1,
            "date": 1,
            "category_id": 1,
        },
    ).to_list(5000)

    categories = await db.categories.find(
        {
            "user_id": current_user["user_id"],
            "profile_id": profile_id,
        },
        {"_id": 0, "category_id": 1, "name": 1},
    ).to_list(500)
    category_map = {row.get("category_id"): row.get("name") for row in categories}

    expense_txs = [row for row in expenses if row.get("type") != "income"]
    income_total = sum(_to_float(row.get("amount")) for row in expenses if row.get("type") == "income")
    expense_total = sum(_to_float(row.get("amount")) for row in expense_txs)
    net_total = round(income_total - expense_total, 2)

    spend_velocity = compute_spend_velocity(
        recent_expense_transactions=[
            {"amount": row.get("amount"), "date": row.get("date")}
            for row in expense_txs
        ],
        window_days=28,
    )

    top_category_summary = compute_top_category_summary(
        current_period_expense_transactions=[
            {
                "amount": row.get("amount"),
                "category_id": row.get("category_id"),
                "category_name": category_map.get(row.get("category_id")),
            }
            for row in expense_txs
        ]
    )

    projected_savings_summary = compute_projected_savings_summary(
        current_net_total=net_total,
        spend_velocity=spend_velocity,
        elapsed_days=elapsed_days,
        total_days=total_days,
    )

    budgets = await db.budgets.find(
        {
            "user_id": current_user["user_id"],
            "profile_id": profile_id,
            "period": "monthly",
        },
        {"_id": 0, "amount": 1, "category_id": 1},
    ).to_list(200)
    total_budget = None
    if budgets:
        top_level = next((item for item in budgets if item.get("category_id") is None), None)
        total_budget = _to_float(top_level.get("amount")) if top_level else sum(_to_float(item.get("amount")) for item in budgets)

    budget_usage_ratio = (expense_total / total_budget) if total_budget and total_budget > 0 else None
    budget_adherence = None if budget_usage_ratio is None else max(0.0, min(100.0, round((1.0 - budget_usage_ratio) * 100.0, 2)))
    budget_pressure = None if budget_usage_ratio is None else max(0.0, min(100.0, round(budget_usage_ratio * 100.0, 2)))
    remaining_budget_ratio = None if budget_usage_ratio is None else max(0.0, round(1.0 - budget_usage_ratio, 4))

    goals = await db.savings_goals.find(
        {
            "user_id": current_user["user_id"],
            "profile_id": profile_id,
        },
        {"_id": 0, "current_amount": 1, "target_amount": 1},
    ).to_list(200)

    goal_progress_values = []
    for goal in goals:
        target = _to_float(goal.get("target_amount"))
        if target <= 0:
            continue
        progress = max(0.0, min(100.0, round((_to_float(goal.get("current_amount")) / target) * 100.0, 2)))
        goal_progress_values.append(progress)
    goals_progress = round(sum(goal_progress_values) / len(goal_progress_values), 2) if goal_progress_values else None

    if income_total > 0:
        net_ratio = round((net_total / income_total) * 100.0, 2)
    else:
        net_ratio = 100.0 if net_total > 0 else None

    savings_behavior = net_ratio

    recent_14_start = now - timedelta(days=14)
    previous_14_start = now - timedelta(days=28)

    recent_14_spend = sum(
        _to_float(row.get("amount"))
        for row in expense_txs
        if row.get("date") and row.get("date").replace(tzinfo=timezone.utc) >= recent_14_start
    )
    previous_14_spend = sum(
        _to_float(row.get("amount"))
        for row in expense_txs
        if row.get("date") and previous_14_start <= row.get("date").replace(tzinfo=timezone.utc) < recent_14_start
    )

    discretionary_trend = None
    if previous_14_spend > 0:
        trend_ratio = (previous_14_spend - recent_14_spend) / previous_14_spend
        discretionary_trend = max(0.0, min(100.0, round(50.0 + (trend_ratio * 50.0), 2)))

    forecast = await generate_spend_forecast(
        user_id=current_user["user_id"],
        profile_id=profile_id,
        expenses_collection=db.expenses,
        budgets_collection=db.budgets,
        recent_days=30,
    )

    forecast_alignment = forecast.get("budget_exceed_risk", {}).get("level")
    historical_consistency = forecast.get("confidence", {}).get("score")

    savings_score = compute_savings_score(
        goals_progress=goals_progress,
        budget_adherence=budget_adherence,
        discretionary_trend=discretionary_trend,
    )
    financial_health_score = compute_financial_health_score(
        net_position=net_ratio,
        savings_behavior=savings_behavior,
        budget_pressure=budget_pressure,
        goal_progress=goals_progress,
    )
    budget_confidence = compute_budget_confidence(
        forecast_alignment=forecast_alignment,
        remaining_budget_ratio=remaining_budget_ratio,
        historical_consistency=historical_consistency,
    )

    return {
        "savings_score": savings_score,
        "spend_velocity": spend_velocity,
        "financial_health_score": financial_health_score,
        "budget_confidence": budget_confidence,
        "top_category_summary": top_category_summary,
        "projected_savings_summary": projected_savings_summary,
    }
