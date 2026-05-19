from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed != parsed:  # NaN
        return None
    return parsed


def _normalize_score_component(value) -> float | None:
    parsed = _to_float(value)
    if parsed is None:
        return None

    # allow ratio-like inputs while preserving transparent 0-100 contract
    if 0 <= parsed <= 1:
        parsed *= 100

    return round(max(0.0, min(parsed, 100.0)), 2)


def compute_savings_score(
    *,
    goals_progress=None,
    budget_adherence=None,
    discretionary_trend=None,
) -> dict:
    components = {
        "goals_progress": _normalize_score_component(goals_progress),
        "budget_adherence": _normalize_score_component(budget_adherence),
        "discretionary_trend": _normalize_score_component(discretionary_trend),
    }

    available = [value for value in components.values() if value is not None]
    if not available:
        return {
            "value": None,
            "components": components,
            "has_sufficient_data": False,
        }

    score = round(sum(available) / len(available), 2)
    return {
        "value": score,
        "components": components,
        "has_sufficient_data": True,
    }


def _coerce_datetime(value) -> datetime | None:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def compute_spend_velocity(*, recent_expense_transactions: list[dict], window_days: int = 28) -> dict:
    if window_days <= 0:
        raise ValueError("window_days must be greater than 0")

    parsed_transactions: list[tuple[datetime, float]] = []
    for tx in recent_expense_transactions or []:
        dt = _coerce_datetime(tx.get("date"))
        amount = _to_float(tx.get("amount"))
        if dt is None or amount is None or amount <= 0:
            continue
        parsed_transactions.append((dt, amount))

    if not parsed_transactions:
        return {
            "value": None,
            "recent_daily_average": 0.0,
            "recent_weekly_average": 0.0,
            "transaction_cadence": 0.0,
            "has_sufficient_data": False,
        }

    latest_date = max(item[0] for item in parsed_transactions)
    start_date = latest_date - timedelta(days=window_days - 1)

    windowed = [item for item in parsed_transactions if item[0] >= start_date]
    total_spend = sum(item[1] for item in windowed)
    transaction_count = len(windowed)

    recent_daily_average = round(total_spend / window_days, 2)
    recent_weekly_average = round(recent_daily_average * 7, 2)
    transaction_cadence = round(transaction_count / window_days, 4)

    return {
        "value": recent_weekly_average,
        "recent_daily_average": recent_daily_average,
        "recent_weekly_average": recent_weekly_average,
        "transaction_cadence": transaction_cadence,
        "has_sufficient_data": True,
    }


def _average_available_components(components: dict[str, float | None]) -> tuple[float | None, bool]:
    available = [value for value in components.values() if value is not None]
    if not available:
        return None, False
    return round(sum(available) / len(available), 2), True


def _normalize_budget_pressure(value) -> float | None:
    pressure = _normalize_score_component(value)
    if pressure is None:
        return None
    # higher pressure means lower health score contribution
    return round(100.0 - pressure, 2)


def compute_financial_health_score(
    *,
    net_position=None,
    savings_behavior=None,
    budget_pressure=None,
    goal_progress=None,
) -> dict:
    components = {
        "net_position": _normalize_score_component(net_position),
        "savings_behavior": _normalize_score_component(savings_behavior),
        "budget_pressure": _normalize_budget_pressure(budget_pressure),
        "goal_progress": _normalize_score_component(goal_progress),
    }

    value, has_sufficient_data = _average_available_components(components)
    return {
        "value": value,
        "components": components,
        "has_sufficient_data": has_sufficient_data,
    }


def _normalize_forecast_alignment(value) -> float | None:
    if isinstance(value, str):
        mapping = {
            "very_low": 90.0,
            "low": 80.0,
            "medium": 50.0,
            "high": 20.0,
            "critical": 0.0,
        }
        return mapping.get(value.lower())
    return _normalize_score_component(value)


def compute_budget_confidence(
    *,
    forecast_alignment=None,
    remaining_budget_ratio=None,
    historical_consistency=None,
) -> dict:
    components = {
        "forecast_alignment": _normalize_forecast_alignment(forecast_alignment),
        "remaining_budget_ratio": _normalize_score_component(remaining_budget_ratio),
        "historical_consistency": _normalize_score_component(historical_consistency),
    }

    value, has_sufficient_data = _average_available_components(components)
    return {
        "value": value,
        "components": components,
        "has_sufficient_data": has_sufficient_data,
    }



def compute_top_category_summary(*, current_period_expense_transactions: list[dict]) -> dict:
    grouped: dict[str, float] = {}
    total_expenses = 0.0

    for tx in current_period_expense_transactions or []:
        amount = _to_float(tx.get("amount"))
        if amount is None or amount <= 0:
            continue
        label = tx.get("category_name") or tx.get("category_id") or "uncategorized"
        label = str(label)
        grouped[label] = grouped.get(label, 0.0) + amount
        total_expenses += amount

    if not grouped or total_expenses <= 0:
        return {
            "category_name": None,
            "amount": 0.0,
            "share_of_expenses": None,
            "has_sufficient_data": False,
        }

    top_category, top_amount = sorted(
        grouped.items(),
        key=lambda item: (-item[1], item[0]),
    )[0]

    return {
        "category_name": top_category,
        "amount": round(top_amount, 2),
        "share_of_expenses": round(top_amount / total_expenses, 4),
        "has_sufficient_data": True,
    }



def compute_projected_savings_summary(
    *,
    current_net_total,
    spend_velocity: dict | None,
    elapsed_days: int | None,
    total_days: int | None,
) -> dict:
    net_total = _to_float(current_net_total)
    daily_spend = _to_float((spend_velocity or {}).get("recent_daily_average"))

    if (
        net_total is None
        or daily_spend is None
        or elapsed_days is None
        or total_days is None
        or elapsed_days <= 0
        or total_days <= 0
        or elapsed_days > total_days
    ):
        return {
            "projected_savings": None,
            "basis": None,
            "has_sufficient_data": False,
        }

    remaining_days = total_days - elapsed_days
    projected_remaining_spend = daily_spend * remaining_days
    projected_savings = round(net_total - projected_remaining_spend, 2)

    return {
        "projected_savings": projected_savings,
        "basis": "net_minus_velocity_remaining_spend",
        "has_sufficient_data": True,
    }
