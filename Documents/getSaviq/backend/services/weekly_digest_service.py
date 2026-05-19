from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone


DEFAULT_DIGEST_TONE = "encouraging"
LOW_DATA_SUMMARY = "Not enough activity this week for a detailed digest yet."
LOW_DATA_RECOMMENDATION = {
    "id": "build-weekly-activity",
    "kind": "activity",
    "polarity": "neutral",
    "text": "Add a few transactions this week to unlock sharper weekly insights.",
}


def normalize_week_window(
    *,
    week_start: date | None = None,
    week_end: date | None = None,
    now: datetime | None = None,
) -> tuple[datetime, datetime]:
    if (week_start is None) != (week_end is None):
        raise ValueError("week_start and week_end must be provided together")

    if week_start is None and week_end is None:
        current = now or datetime.now(timezone.utc)
        if current.tzinfo is None:
            current = current.replace(tzinfo=timezone.utc)
        current_date = current.date()
        monday = current_date - timedelta(days=current_date.weekday())
        sunday = monday + timedelta(days=6)
        week_start = monday
        week_end = sunday

    if week_end < week_start:
        raise ValueError("week_end must be on or after week_start")

    start_dt = datetime.combine(week_start, time.min).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(week_end, time.max).replace(tzinfo=timezone.utc)
    return start_dt, end_dt


def _to_float(value) -> float:
    try:
        parsed = float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0
    return parsed


def _format_compact_currency(value: float) -> str:
    amount = round(abs(_to_float(value)), 2)
    return f"${amount:,.2f}"


def _build_top_expense_categories(expenses: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for expense in expenses:
        category_id = str(expense.get("category_id") or "uncategorized")
        amount = _to_float(expense.get("amount"))
        group = grouped.setdefault(
            category_id,
            {"category_id": category_id, "total_amount": 0.0, "transaction_count": 0},
        )
        group["total_amount"] += amount
        group["transaction_count"] += 1

    ordered = sorted(
        grouped.values(),
        key=lambda item: (-item["total_amount"], -item["transaction_count"], item["category_id"]),
    )

    return [
        {
            "category_id": item["category_id"],
            "total_amount": round(item["total_amount"], 2),
            "transaction_count": item["transaction_count"],
        }
        for item in ordered
    ]


def _build_largest_expense(expenses: list[dict]) -> dict | None:
    if not expenses:
        return None

    ordered = sorted(
        expenses,
        key=lambda row: (
            -_to_float(row.get("amount")),
            row.get("date") or datetime.min.replace(tzinfo=timezone.utc),
            str(row.get("expense_id") or ""),
        ),
    )
    winner = ordered[0]
    return {
        "expense_id": winner.get("expense_id"),
        "amount": round(_to_float(winner.get("amount")), 2),
        "merchant": winner.get("merchant"),
        "description": winner.get("description"),
        "date": winner.get("date"),
        "category_id": winner.get("category_id"),
    }


def _detect_unusual_spending(expenses: list[dict]) -> bool:
    if len(expenses) < 2:
        return False

    amounts = [_to_float(expense.get("amount")) for expense in expenses]
    positive = [amount for amount in amounts if amount > 0]
    if len(positive) < 2:
        return False

    largest = max(positive)
    average = sum(positive) / len(positive)
    return largest >= 100.0 and largest > (average * 2.0)


def _summarize_transactions(transactions: list[dict]) -> dict:
    income = [row for row in transactions if row.get("type") == "income"]
    expenses = [row for row in transactions if row.get("type") != "income"]

    income_total = round(sum(_to_float(row.get("amount")) for row in income), 2)
    expense_total = round(sum(_to_float(row.get("amount")) for row in expenses), 2)
    net_total = round(income_total - expense_total, 2)

    return {
        "income_total": income_total,
        "expense_total": expense_total,
        "net_total": net_total,
        "transaction_count": len(transactions),
        "expenses": expenses,
    }


def build_digest_narrative(*, summary: dict, comparisons: dict, highlights: dict) -> dict:
    tx_count = int(summary.get("transaction_count") or 0)
    expense_total = _to_float(summary.get("expense_total"))

    if tx_count < 2 or expense_total <= 0:
        return {
            "summary": LOW_DATA_SUMMARY,
            "tone": DEFAULT_DIGEST_TONE,
        }

    parts: list[str] = []
    weekly_spend_delta = _to_float(comparisons.get("previous_week_expense_delta"))
    if weekly_spend_delta > 0:
        parts.append(f"Spending increased by {_format_compact_currency(weekly_spend_delta)} vs last week.")
    elif weekly_spend_delta < 0:
        parts.append(f"Spending decreased by {_format_compact_currency(weekly_spend_delta)} vs last week.")
    else:
        parts.append("Spending stayed flat vs last week.")

    top_category = highlights.get("top_category_name")
    top_category_amount = _to_float(highlights.get("top_category_amount"))
    if top_category:
        parts.append(f"{top_category} was your largest spend category at {_format_compact_currency(top_category_amount)}.")

    savings_rate = highlights.get("savings_rate")
    if savings_rate is not None and _to_float(savings_rate) > 0:
        percent = round(_to_float(savings_rate) * 100)
        parts.append(f"You kept {percent}% of income as net savings.")

    summary_text = " ".join(parts[:3]) if parts else LOW_DATA_SUMMARY
    return {
        "summary": summary_text,
        "tone": DEFAULT_DIGEST_TONE,
    }


def _slugify(value: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "-" for char in value)
    return "-".join(part for part in normalized.split("-") if part) or "uncategorized"


def build_digest_recommendations(
    *,
    summary: dict,
    comparisons: dict,
    highlights: dict,
    signals: dict,
    forecast_overview: dict | None = None,
    subscriptions_summary: dict | None = None,
) -> list[dict]:
    tx_count = int(summary.get("transaction_count") or 0)
    if tx_count < 2:
        return [LOW_DATA_RECOMMENDATION]

    candidates: list[dict] = []

    expense_delta = _to_float(comparisons.get("previous_week_expense_delta"))
    if expense_delta > 0:
        candidates.append(
            {
                "id": "slow-spend-growth",
                "kind": "spending",
                "polarity": "negative",
                "text": "Set one spending cap this week to slow expense growth.",
            }
        )
    elif expense_delta < 0:
        candidates.append(
            {
                "id": "keep-spend-trend",
                "kind": "spending",
                "polarity": "positive",
                "text": "Nice progress—keep this lower spend pace next week.",
            }
        )

    if bool(signals.get("unusual_spending_detected")):
        candidates.append(
            {
                "id": "review-largest-expense",
                "kind": "anomaly",
                "polarity": "negative",
                "text": "Review this week's largest expense for one-time vs recurring cost.",
            }
        )

    savings_rate = highlights.get("savings_rate")
    if savings_rate is not None and _to_float(savings_rate) >= 0.2:
        candidates.append(
            {
                "id": "keep-savings-momentum",
                "kind": "savings",
                "polarity": "positive",
                "text": "Savings rate is strong—keep that cushion strategy in place.",
            }
        )
    elif savings_rate is not None and _to_float(savings_rate) < 0.1:
        candidates.append(
            {
                "id": "nudge-savings-rate",
                "kind": "savings",
                "polarity": "neutral",
                "text": "Try moving one discretionary purchase to next week to lift savings.",
            }
        )

    top_category = highlights.get("top_category_name")
    if top_category:
        top_category_id = _slugify(str(top_category))
        candidates.append(
            {
                "id": f"watch-category-{top_category_id}",
                "kind": "category",
                "polarity": "neutral",
                "text": f"Track {top_category} closely to keep weekly spending balanced.",
            }
        )

    forecast_risk = (forecast_overview or {}).get("budget_exceed_risk", {}).get("level")
    if forecast_risk in {"high", "medium"}:
        candidates.append(
            {
                "id": f"forecast-risk-{forecast_risk}",
                "kind": "forecast",
                "polarity": "negative",
                "text": "Forecast risk is elevated—pause one optional spend this week.",
            }
        )

    recurring_total = _to_float((subscriptions_summary or {}).get("totals", {}).get("monthly_recurring_total"))
    if recurring_total > 0:
        candidates.append(
            {
                "id": "review-recurring-costs",
                "kind": "subscription",
                "polarity": "neutral",
                "text": "Review recurring charges and trim one low-value subscription.",
            }
        )

    deduped: list[dict] = []
    seen_ids: set[str] = set()
    for item in candidates:
        if item["id"] in seen_ids:
            continue
        seen_ids.add(item["id"])
        deduped.append(item)

    if not deduped:
        deduped.append(
            {
                "id": "maintain-weekly-routine",
                "kind": "routine",
                "polarity": "positive",
                "text": "Your week was steady—maintain the same tracking routine.",
            }
        )

    return deduped[:3]


async def store_weekly_digest_payload(
    *,
    digest_collection,
    user_id: str,
    profile_id: str,
    week_start: datetime,
    week_end: datetime,
    digest_payload: dict,
) -> None:
    await digest_collection.update_one(
        {
            "user_id": user_id,
            "profile_id": profile_id,
            "week_start": week_start,
            "week_end": week_end,
        },
        {
            "$set": {
                "digest_payload": digest_payload,
                "updated_at": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )




async def fetch_newest_persisted_digest(
    *,
    digest_collection,
    user_id: str,
    profile_id: str,
    include_dismissed: bool = False,
) -> dict | None:
    docs = await digest_collection.find(
        {
            "user_id": user_id,
            "profile_id": profile_id,
        }
    ).to_list(100)

    candidates = [
        doc for doc in docs
        if doc.get("digest_payload")
        and (include_dismissed or not doc.get("banner_dismissed_at"))
    ]
    if not candidates:
        return None

    ordered = sorted(
        candidates,
        key=lambda item: (
            item.get("week_end") or datetime.min.replace(tzinfo=timezone.utc),
            item.get("updated_at") or datetime.min.replace(tzinfo=timezone.utc),
            item.get("week_start") or datetime.min.replace(tzinfo=timezone.utc),
        ),
        reverse=True,
    )
    return ordered[0]


async def dismiss_newest_persisted_digest(
    *,
    digest_collection,
    user_id: str,
    profile_id: str,
) -> bool:
    newest = await fetch_newest_persisted_digest(
        digest_collection=digest_collection,
        user_id=user_id,
        profile_id=profile_id,
        include_dismissed=True,
    )
    if not newest:
        return False

    await digest_collection.update_one(
        {
            "user_id": user_id,
            "profile_id": profile_id,
            "week_start": newest.get("week_start"),
            "week_end": newest.get("week_end"),
        },
        {
            "$set": {
                "banner_dismissed_at": datetime.now(timezone.utc),
            }
        },
        upsert=False,
    )
    return True

async def build_weekly_financial_digest(
    *,
    user_id: str,
    profile_id: str,
    week_start: datetime,
    week_end: datetime,
    expenses_collection,
    forecast_overview: dict | None = None,
    subscriptions_summary: dict | None = None,
) -> dict:
    projection = {
        "_id": 0,
        "expense_id": 1,
        "type": 1,
        "amount": 1,
        "category_id": 1,
        "merchant": 1,
        "description": 1,
        "date": 1,
    }
    current_query = {
        "user_id": user_id,
        "profile_id": profile_id,
        "date": {"$gte": week_start, "$lte": week_end},
    }
    transactions = await expenses_collection.find(current_query, projection).to_list(5000)

    previous_week_end = week_start - timedelta(microseconds=1)
    previous_duration = week_end - week_start
    previous_week_start = previous_week_end - previous_duration
    previous_query = {
        "user_id": user_id,
        "profile_id": profile_id,
        "date": {"$gte": previous_week_start, "$lte": previous_week_end},
    }
    previous_transactions = await expenses_collection.find(previous_query, projection).to_list(5000)

    current_summary = _summarize_transactions(transactions)
    previous_summary = _summarize_transactions(previous_transactions)

    top_categories = _build_top_expense_categories(current_summary["expenses"])
    top_category = top_categories[0] if top_categories else None
    savings_rate = None
    if current_summary["income_total"] > 0:
        savings_rate = round(current_summary["net_total"] / current_summary["income_total"], 4)

    digest = {
        "week": {
            "start_date": week_start,
            "end_date": week_end,
        },
        "summary": {
            "income_total": current_summary["income_total"],
            "expense_total": current_summary["expense_total"],
            "net_total": current_summary["net_total"],
            "transaction_count": current_summary["transaction_count"],
        },
        "breakdown": {
            "top_expense_categories": top_categories,
        },
        "signals": {
            "largest_expense": _build_largest_expense(current_summary["expenses"]),
            "unusual_spending_detected": _detect_unusual_spending(current_summary["expenses"]),
        },
        "comparisons": {
            "previous_week_expense_delta": round(
                current_summary["expense_total"] - previous_summary["expense_total"],
                2,
            ),
            "previous_week_income_delta": round(
                current_summary["income_total"] - previous_summary["income_total"],
                2,
            ),
            "previous_week_net_delta": round(
                current_summary["net_total"] - previous_summary["net_total"],
                2,
            ),
        },
        "highlights": {
            "top_category_name": top_category["category_id"] if top_category else None,
            "top_category_amount": top_category["total_amount"] if top_category else 0.0,
            "savings_rate": savings_rate,
        },
    }

    digest["narrative"] = build_digest_narrative(
        summary=digest["summary"],
        comparisons=digest["comparisons"],
        highlights=digest["highlights"],
    )
    digest["recommendations"] = build_digest_recommendations(
        summary=digest["summary"],
        comparisons=digest["comparisons"],
        highlights=digest["highlights"],
        signals=digest["signals"],
        forecast_overview=forecast_overview,
        subscriptions_summary=subscriptions_summary,
    )

    return digest
