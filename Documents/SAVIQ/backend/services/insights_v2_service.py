from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from database import db

PeriodType = Literal["weekly", "monthly"]
_PROJECTION = {"_id": 0, "amount": 1, "type": 1}
TOTAL_SPEND_SPIKE_PCT_THRESHOLD = 50.0
CATEGORY_SPEND_SPIKE_PCT_THRESHOLD = 75.0


def _month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _add_months(month_dt: datetime, delta: int) -> datetime:
    year = month_dt.year + (month_dt.month - 1 + delta) // 12
    month = (month_dt.month - 1 + delta) % 12 + 1
    return month_dt.replace(year=year, month=month, day=1)


def _period_bounds(period_type: PeriodType, now: datetime) -> tuple[datetime, datetime, datetime]:
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    if period_type == "weekly":
        current_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        previous_start = current_start - timedelta(days=7)
        next_start = current_start + timedelta(days=7)
        return previous_start, current_start, next_start

    if period_type == "monthly":
        current_start = _month_start(now)
        previous_start = _add_months(current_start, -1)
        next_start = _add_months(current_start, 1)
        return previous_start, current_start, next_start

    raise ValueError("period_type must be 'weekly' or 'monthly'")


def _sum_spend(expenses: list[dict]) -> float:
    # Keep existing product behavior: treat all non-income entries as spend.
    return round(sum(float(e.get("amount", 0.0)) for e in expenses if e.get("type", "expense") != "income"), 2)


def _delta_percent(current_total: float, previous_total: float) -> float:
    if previous_total <= 0:
        return 0.0
    return round(((current_total - previous_total) / previous_total) * 100, 2)


def _category_totals(expenses: list[dict]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for expense in expenses:
        if expense.get("type", "expense") == "income":
            continue
        category = expense.get("category_id") or "uncategorized"
        totals[category] = round(totals.get(category, 0.0) + float(expense.get("amount", 0.0)), 2)
    return totals


def _build_category_comparisons(current_expenses: list[dict], previous_expenses: list[dict]) -> list[dict]:
    current_totals = _category_totals(current_expenses)
    previous_totals = _category_totals(previous_expenses)
    categories = sorted(set(current_totals) | set(previous_totals))

    comparisons: list[dict] = []
    for category in categories:
        current_total = round(current_totals.get(category, 0.0), 2)
        previous_total = round(previous_totals.get(category, 0.0), 2)
        delta_amount = round(current_total - previous_total, 2)
        comparisons.append(
            {
                "category": category,
                "current_total": current_total,
                "previous_total": previous_total,
                "delta_amount": delta_amount,
                "delta_percent": _delta_percent(current_total, previous_total),
            }
        )
    return comparisons


def _detect_anomalies(
    current_total: float,
    previous_total: float,
    category_comparisons: list[dict],
) -> dict:
    total_delta_percent = _delta_percent(current_total, previous_total)
    total_anomaly = {
        "detected": previous_total > 0 and total_delta_percent >= TOTAL_SPEND_SPIKE_PCT_THRESHOLD,
        "threshold_percent": TOTAL_SPEND_SPIKE_PCT_THRESHOLD,
        "delta_percent": total_delta_percent,
        "severity": _severity_for_spike(total_delta_percent),
    }

    category_anomalies = [
        {
            "category": item["category"],
            "threshold_percent": CATEGORY_SPEND_SPIKE_PCT_THRESHOLD,
            "delta_percent": item["delta_percent"],
            "severity": _severity_for_spike(item["delta_percent"]),
        }
        for item in category_comparisons
        if item["previous_total"] > 0 and item["delta_percent"] >= CATEGORY_SPEND_SPIKE_PCT_THRESHOLD
    ]

    return {"total_spend_spike": total_anomaly, "category_spend_spikes": category_anomalies}


def _severity_for_spike(delta_percent: float) -> str:
    if delta_percent >= 150:
        return "critical"
    if delta_percent >= 100:
        return "high"
    if delta_percent >= 50:
        return "warning"
    return "info"


def _severity_for_risk(risk_score: float) -> str:
    if risk_score >= 90:
        return "critical"
    if risk_score >= 70:
        return "high"
    if risk_score >= 40:
        return "warning"
    return "info"


def _resolve_budget_amount(budgets: list[dict], period_type: PeriodType) -> float:
    period_budgets = [b for b in budgets if b.get("period") == period_type]
    if not period_budgets:
        return 0.0

    total_budget = next((b for b in period_budgets if b.get("category_id") is None), None)
    if total_budget:
        return round(float(total_budget.get("amount", 0.0)), 2)

    return round(sum(float(b.get("amount", 0.0)) for b in period_budgets), 2)


def _build_budget_risk(
    period_type: PeriodType,
    now: datetime,
    current_start: datetime,
    next_start: datetime,
    current_total: float,
    budget_amount: float,
) -> dict:
    total_days = max((next_start.date() - current_start.date()).days, 1)
    elapsed_days = min(max((now.date() - current_start.date()).days + 1, 1), total_days)
    remaining_days = max((next_start.date() - now.date()).days - 1, 0)

    if budget_amount <= 0:
        return {
            "period_type": period_type,
            "status": "no_budget",
            "budget_amount": 0.0,
            "current_spend": current_total,
            "progress_percent": 0.0,
            "remaining_days": remaining_days,
            "risk_score": 0.0,
            "severity": "info",
        }

    progress_percent = round((current_total / budget_amount) * 100, 2)
    expected_progress_percent = round((elapsed_days / total_days) * 100, 2)
    projected_total = round((current_total / max(elapsed_days, 1)) * total_days, 2)
    projected_progress_percent = round((projected_total / budget_amount) * 100, 2)

    risk_score = max(
        0.0,
        progress_percent - expected_progress_percent,
        projected_progress_percent - 100.0,
    )
    risk_score = round(min(risk_score, 100.0), 2)

    return {
        "period_type": period_type,
        "status": "ok",
        "budget_amount": budget_amount,
        "current_spend": current_total,
        "progress_percent": progress_percent,
        "remaining_days": remaining_days,
        "risk_score": risk_score,
        "severity": _severity_for_risk(risk_score),
    }


def _build_insight_metadata(
    period_type: PeriodType,
    current_total: float,
    previous_total: float,
    delta_amount: float,
    delta_percent: float,
    category_comparisons: list[dict],
    anomalies: dict,
    budget_risk: dict,
) -> dict:
    return {
        "schema_version": "v2",
        "period_type": period_type,
        "total_comparison": {
            "period_type": period_type,
            "current_total": current_total,
            "previous_total": previous_total,
            "delta_amount": delta_amount,
            "delta_percent": delta_percent,
        },
        "category_comparisons": category_comparisons,
        "anomalies": {
            "total_spend_spike": {
                "detected": bool(anomalies.get("total_spend_spike", {}).get("detected", False)),
                "threshold_percent": float(anomalies.get("total_spend_spike", {}).get("threshold_percent", TOTAL_SPEND_SPIKE_PCT_THRESHOLD)),
                "delta_percent": float(anomalies.get("total_spend_spike", {}).get("delta_percent", 0.0)),
                "severity": anomalies.get("total_spend_spike", {}).get("severity", "info"),
            },
            "category_spend_spikes": [
                {
                    "category": item.get("category", "uncategorized"),
                    "threshold_percent": float(item.get("threshold_percent", CATEGORY_SPEND_SPIKE_PCT_THRESHOLD)),
                    "delta_percent": float(item.get("delta_percent", 0.0)),
                    "severity": item.get("severity", "info"),
                }
                for item in anomalies.get("category_spend_spikes", [])
            ],
        },
        "budget_risk": {
            "period_type": budget_risk.get("period_type", period_type),
            "status": budget_risk.get("status", "no_budget"),
            "budget_amount": float(budget_risk.get("budget_amount", 0.0)),
            "current_spend": float(budget_risk.get("current_spend", 0.0)),
            "progress_percent": float(budget_risk.get("progress_percent", 0.0)),
            "remaining_days": int(budget_risk.get("remaining_days", 0)),
            "risk_score": float(budget_risk.get("risk_score", 0.0)),
            "severity": budget_risk.get("severity", "info"),
        },
    }


async def generate_spend_comparison(
    user_id: str,
    profile_id: Optional[str] = None,
    period_type: PeriodType = "monthly",
    now: Optional[datetime] = None,
    expenses_collection=None,
    budgets_collection=None,
) -> dict:
    current_now = now or datetime.now(timezone.utc)
    previous_start, current_start, next_start = _period_bounds(period_type, current_now)

    collection = expenses_collection if expenses_collection is not None else db.expenses
    base_query = {"user_id": user_id}
    if profile_id:
        base_query["profile_id"] = profile_id

    current_query = {**base_query, "date": {"$gte": current_start, "$lt": next_start}}
    previous_query = {**base_query, "date": {"$gte": previous_start, "$lt": current_start}}

    current_expenses = await collection.find(current_query, _PROJECTION).to_list(5000)
    previous_expenses = await collection.find(previous_query, _PROJECTION).to_list(5000)

    current_total = _sum_spend(current_expenses)
    previous_total = _sum_spend(previous_expenses)
    delta_amount = round(current_total - previous_total, 2)
    category_comparisons = _build_category_comparisons(current_expenses, previous_expenses)
    budgets_source = budgets_collection if budgets_collection is not None else db.budgets
    budgets = await budgets_source.find(base_query, {"_id": 0, "amount": 1, "period": 1, "category_id": 1}).to_list(500)
    budget_amount = _resolve_budget_amount(budgets, period_type)
    _, current_start, next_start = _period_bounds(period_type, current_now)
    budget_risk = _build_budget_risk(
        period_type=period_type,
        now=current_now,
        current_start=current_start,
        next_start=next_start,
        current_total=current_total,
        budget_amount=budget_amount,
    )

    anomalies = _detect_anomalies(
        current_total=current_total,
        previous_total=previous_total,
        category_comparisons=category_comparisons,
    )

    return {
        "period_type": period_type,
        "current_total": current_total,
        "previous_total": previous_total,
        "delta_amount": delta_amount,
        "delta_percent": _delta_percent(current_total, previous_total),
        "category_comparisons": category_comparisons,
        "anomalies": anomalies,
        "budget_risk": budget_risk,
        "insight_metadata": _build_insight_metadata(
            period_type=period_type,
            current_total=current_total,
            previous_total=previous_total,
            delta_amount=delta_amount,
            delta_percent=_delta_percent(current_total, previous_total),
            category_comparisons=category_comparisons,
            anomalies=anomalies,
            budget_risk=budget_risk,
        ),
    }
