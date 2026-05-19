from __future__ import annotations

from datetime import datetime, timedelta, timezone

from services.forecast_service import generate_spend_forecast
from services.insights_v2_service import generate_spend_comparison


_EXPENSE_PROJECTION = {"_id": 0, "amount": 1, "type": 1, "category_id": 1, "date": 1}


def _spend_amount(item: dict) -> float:
    if item.get("type", "expense") == "income":
        return 0.0
    return max(float(item.get("amount", 0.0)), 0.0)


def _build_top_categories(expenses: list[dict], category_lookup: dict[str, str], limit: int = 3) -> list[dict]:
    totals: dict[str, float] = {}
    for item in expenses:
        amount = _spend_amount(item)
        if amount <= 0:
            continue
        category_id = item.get("category_id") or "uncategorized"
        totals[category_id] = round(totals.get(category_id, 0.0) + amount, 2)

    ranked = sorted(totals.items(), key=lambda kv: kv[1], reverse=True)[:limit]
    return [
        {
            "category_id": category_id,
            "category_name": category_lookup.get(category_id, "Other"),
            "amount": amount,
        }
        for category_id, amount in ranked
    ]


async def build_chat_transaction_context(
    *,
    user_id: str,
    profile_id: str,
    recent_days: int = 30,
    expenses_collection,
    categories_collection,
    budgets_collection,
    now: datetime | None = None,
) -> dict:
    current_now = now or datetime.now(timezone.utc)
    if current_now.tzinfo is None:
        current_now = current_now.replace(tzinfo=timezone.utc)

    window_days = max(int(recent_days), 1)
    window_start = current_now - timedelta(days=window_days)

    base_query = {
        "user_id": user_id,
        "profile_id": profile_id,
        "date": {"$gte": window_start, "$lte": current_now},
    }
    recent_expenses = await expenses_collection.find(base_query, _EXPENSE_PROJECTION).to_list(5000)

    categories = await categories_collection.find(
        {"user_id": user_id},
        {"_id": 0, "category_id": 1, "name": 1},
    ).to_list(1000)
    category_lookup = {c.get("category_id"): c.get("name", "Other") for c in categories}

    spend_items = [item for item in recent_expenses if _spend_amount(item) > 0]
    recent_spend_total = round(sum(_spend_amount(item) for item in spend_items), 2)
    tx_count = len(spend_items)

    spend_comparison = await generate_spend_comparison(
        user_id=user_id,
        profile_id=profile_id,
        period_type="monthly",
        now=current_now,
        expenses_collection=expenses_collection,
        budgets_collection=budgets_collection,
    )

    forecast = await generate_spend_forecast(
        user_id=user_id,
        profile_id=profile_id,
        expenses_collection=expenses_collection,
        budgets_collection=budgets_collection,
        now=current_now,
        recent_days=window_days,
    )

    return {
        "recent_spend": {
            "window_days": window_days,
            "total": recent_spend_total,
            "transaction_count": tx_count,
            "average_daily_spend": round(recent_spend_total / max(window_days, 1), 2),
        },
        "trends": {
            "month_over_month": {
                "current_total": spend_comparison.get("current_total", 0.0),
                "previous_total": spend_comparison.get("previous_total", 0.0),
                "delta_amount": spend_comparison.get("delta_amount", 0.0),
                "delta_percent": spend_comparison.get("delta_percent", 0.0),
            },
        },
        "top_categories": _build_top_categories(spend_items, category_lookup),
        "budgets": {
            "period": "monthly",
            "risk": spend_comparison.get("budget_risk", {}),
        },
        "forecast": {
            "summary": forecast.get("forecast_summary", {}),
            "projections": forecast.get("projections", {}),
        },
    }
