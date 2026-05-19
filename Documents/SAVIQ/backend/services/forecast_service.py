from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
import math


def _month_end_days_remaining(now: datetime) -> int:
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    next_month = (now.replace(day=28) + timedelta(days=4)).replace(day=1)
    return max((next_month.date() - now.date()).days, 0)


def _month_start(now: datetime) -> datetime:
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _days_in_month(now: datetime) -> int:
    month_start = _month_start(now)
    next_month = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return (next_month.date() - month_start.date()).days


def _to_spend_amount(tx: dict) -> float:
    tx_type = tx.get("type", "expense")
    if tx_type == "income":
        return 0.0
    return max(float(tx.get("amount", 0.0)), 0.0)


def calculate_spend_velocity(transactions: list[dict], window_days: int) -> dict:
    if window_days <= 0:
        window_days = 1

    spend_txs = [tx for tx in transactions if _to_spend_amount(tx) > 0]
    if not spend_txs:
        return {
            "window_days": window_days,
            "transaction_count": 0,
            "cadence_per_day": 0.0,
            "daily_spend": 0.0,
            "weighted_daily_spend": 0.0,
            "average_spend_per_transaction": 0.0,
            "category_weights": {},
        }

    total_spend = round(sum(_to_spend_amount(tx) for tx in spend_txs), 2)
    tx_count = len(spend_txs)
    daily_spend = total_spend / window_days

    category_totals: dict[str, float] = {}
    category_counts: dict[str, int] = {}
    for tx in spend_txs:
        category = tx.get("category_id") or "uncategorized"
        category_totals[category] = category_totals.get(category, 0.0) + _to_spend_amount(tx)
        category_counts[category] = category_counts.get(category, 0) + 1

    category_weights: dict[str, float] = {}
    weighted_daily_spend = 0.0

    for category, amount in category_totals.items():
        category_share = category_counts[category] / tx_count
        # deterministic weighting tied only to recent observed category cadence.
        weight = round(1.0 + (category_share * 0.5), 4)
        category_weights[category] = weight
        weighted_daily_spend += (amount / window_days) * weight

    return {
        "window_days": window_days,
        "transaction_count": tx_count,
        "cadence_per_day": round(tx_count / window_days, 4),
        "daily_spend": round(daily_spend, 2),
        "weighted_daily_spend": round(weighted_daily_spend, 2),
        "average_spend_per_transaction": round(total_spend / tx_count, 2),
        "category_weights": category_weights,
    }


def calculate_month_end_smoothed_projection(
    *,
    spend_to_date: float,
    elapsed_days: int,
    days_in_month: int,
    velocity_daily_spend: float,
) -> dict:
    elapsed = max(elapsed_days, 1)
    total_days = max(days_in_month, 1)
    observed_daily = max(float(spend_to_date), 0.0) / elapsed
    velocity_daily = max(float(velocity_daily_spend), 0.0)

    # Early month: lean on velocity. Late month: lean on observed spend-to-date.
    progress_ratio = min(max(elapsed / total_days, 0.0), 1.0)
    observed_weight = min(max(progress_ratio, 0.15), 0.85)
    velocity_weight = round(1.0 - observed_weight, 4)

    smoothed_daily = (observed_daily * observed_weight) + (velocity_daily * velocity_weight)
    projected_month_total = round(smoothed_daily * total_days, 2)
    projected_remaining = round(max(projected_month_total - float(spend_to_date), 0.0), 2)

    return {
        "observed_daily_spend": round(observed_daily, 2),
        "velocity_daily_spend": round(velocity_daily, 2),
        "observed_weight": round(observed_weight, 4),
        "velocity_weight": velocity_weight,
        "smoothed_daily_spend": round(smoothed_daily, 2),
        "projected_month_total": projected_month_total,
        "projected_remaining_spend": projected_remaining,
    }


def calculate_budget_exceed_risk(
    *,
    projected_month_total: float,
    budget_amount: Optional[float],
) -> dict:
    budget = float(budget_amount or 0.0)
    if budget <= 0:
        return {
            "status": "no_budget",
            "score": 0.0,
            "level": "low",
            "badge": "risk_low",
            "projected_overrun_amount": 0.0,
            "budget_amount": 0.0,
            "projected_month_total": round(float(projected_month_total), 2),
        }

    projected = max(float(projected_month_total), 0.0)
    ratio = projected / budget if budget > 0 else 0.0
    score = ((ratio - 0.6) / 0.8) * 100.0
    score = round(min(max(score, 0.0), 100.0), 2)
    overrun = round(max(projected - budget, 0.0), 2)

    if score >= 75:
        level = "high"
    elif score >= 40:
        level = "medium"
    else:
        level = "low"

    return {
        "status": "ok",
        "score": score,
        "level": level,
        "badge": f"risk_{level}",
        "projected_overrun_amount": overrun,
        "budget_amount": round(budget, 2),
        "projected_month_total": round(projected, 2),
    }


def calculate_forecast_confidence(transactions: list[dict], window_days: int) -> dict:
    days = max(window_days, 1)
    spend_txs = [tx for tx in transactions if _to_spend_amount(tx) > 0]
    tx_count = len(spend_txs)

    if tx_count == 0:
        return {
            "score": 0.0,
            "level": "low",
            "components": {
                "transaction_volume": 0,
                "volume_score": 0.0,
                "consistency_score": 0.0,
                "consistency_cv": None,
            },
        }

    volume_ratio = min(tx_count / 30.0, 1.0)
    volume_score = volume_ratio * 60.0

    daily_totals: dict[datetime.date, float] = {}
    for tx in spend_txs:
        tx_date = tx.get("date")
        if tx_date is None:
            continue
        daily_totals[tx_date.date()] = daily_totals.get(tx_date.date(), 0.0) + _to_spend_amount(tx)

    series = list(daily_totals.values())
    mean_daily = sum(series) / len(series) if series else 0.0
    if len(series) <= 1 or mean_daily <= 0:
        consistency_cv = None
        consistency_score = 10.0 if tx_count >= 5 else 0.0
    else:
        variance = sum((value - mean_daily) ** 2 for value in series) / len(series)
        std_dev = math.sqrt(variance)
        consistency_cv = std_dev / mean_daily
        # Lower coefficient of variation => higher consistency confidence.
        consistency_ratio = max(0.0, 1.0 - min(consistency_cv, 2.0) / 2.0)
        consistency_score = consistency_ratio * 40.0

    score = round(min(max(volume_score + consistency_score, 0.0), 100.0), 2)
    if score >= 70:
        level = "high"
    elif score >= 40:
        level = "medium"
    else:
        level = "low"

    return {
        "score": score,
        "level": level,
        "components": {
            "transaction_volume": tx_count,
            "volume_score": round(volume_score, 2),
            "consistency_score": round(consistency_score, 2),
            "consistency_cv": round(consistency_cv, 4) if consistency_cv is not None else None,
        },
    }


async def _resolve_monthly_budget_amount(
    *,
    user_id: str,
    profile_id: str,
    budgets_collection,
) -> Optional[float]:
    if budgets_collection is None:
        return None

    budgets = await budgets_collection.find(
        {"user_id": user_id, "profile_id": profile_id, "period": "monthly"},
        {"_id": 0, "amount": 1, "category_id": 1},
    ).to_list(200)

    if not budgets:
        return None

    total_budget = next((b for b in budgets if b.get("category_id") is None), None)
    if total_budget:
        return float(total_budget.get("amount", 0.0))

    return float(sum(float(b.get("amount", 0.0)) for b in budgets))


async def generate_spend_forecast(
    user_id: str,
    profile_id: str,
    *,
    expenses_collection,
    budgets_collection=None,
    now: Optional[datetime] = None,
    recent_days: int = 30,
) -> dict:
    current_now = now or datetime.now(timezone.utc)
    if current_now.tzinfo is None:
        current_now = current_now.replace(tzinfo=timezone.utc)

    window_days = max(recent_days, 1)
    window_start = current_now - timedelta(days=window_days)

    txs = await expenses_collection.find(
        {
            "user_id": user_id,
            "profile_id": profile_id,
            "date": {"$gte": window_start, "$lte": current_now},
        },
        {"_id": 0, "amount": 1, "type": 1, "date": 1, "category_id": 1},
    ).to_list(5000)

    velocity = calculate_spend_velocity(txs, window_days)

    base_daily_spend = velocity["weighted_daily_spend"] if velocity["weighted_daily_spend"] > 0 else velocity["daily_spend"]
    days_to_month_end = _month_end_days_remaining(current_now)
    month_start = _month_start(current_now)
    days_in_month = _days_in_month(current_now)
    elapsed_days = max((current_now.date() - month_start.date()).days + 1, 1)

    spend_to_date = round(
        sum(_to_spend_amount(tx) for tx in txs if tx.get("date") and tx.get("date").replace(tzinfo=timezone.utc) >= month_start),
        2,
    )
    smoothed_month = calculate_month_end_smoothed_projection(
        spend_to_date=spend_to_date,
        elapsed_days=elapsed_days,
        days_in_month=days_in_month,
        velocity_daily_spend=base_daily_spend,
    )
    budget_amount = await _resolve_monthly_budget_amount(
        user_id=user_id,
        profile_id=profile_id,
        budgets_collection=budgets_collection,
    )
    budget_risk = calculate_budget_exceed_risk(
        projected_month_total=smoothed_month["projected_month_total"],
        budget_amount=budget_amount,
    )
    confidence = calculate_forecast_confidence(txs, window_days)

    projections = {
        "next_7_days": round(base_daily_spend * 7, 2),
        "next_30_days": round(base_daily_spend * 30, 2),
        "month_end": smoothed_month["projected_month_total"],
        "month_end_remaining": smoothed_month["projected_remaining_spend"],
        "days_to_month_end": days_to_month_end,
        "elapsed_days_in_month": elapsed_days,
    }

    return {
        "as_of": current_now,
        "basis": "recent_weighted_velocity" if velocity["transaction_count"] > 0 else "no_data",
        "spend_velocity": velocity,
        "month_end_smoothing": smoothed_month,
        "spend_to_date": spend_to_date,
        "budget_exceed_risk": budget_risk,
        "confidence": confidence,
        "forecast_summary": {
            "totals": {
                "spend_to_date": spend_to_date,
                "projected_month_total": smoothed_month["projected_month_total"],
                "projected_remaining_spend": smoothed_month["projected_remaining_spend"],
                "next_7_days": projections["next_7_days"],
                "next_30_days": projections["next_30_days"],
                "budget_amount": budget_risk["budget_amount"],
                "projected_overrun_amount": budget_risk["projected_overrun_amount"],
            },
            "confidence": confidence,
            "risk": {
                "score": budget_risk["score"],
                "level": budget_risk.get("level", "low"),
                "badge": budget_risk.get("badge", "risk_low"),
                "status": budget_risk["status"],
            },
        },
        "projections": projections,
    }
