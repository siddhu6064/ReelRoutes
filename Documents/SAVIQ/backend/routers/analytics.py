from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import get_current_user
from models import (
    AnalyticsSummaryResponse,
    CategoryBreakdownItem,
    CategoryBreakdownResponse,
    MonthlyTrendItem,
    MonthlyTrendResponse,
    PaymentMethodBreakdownItem,
    PaymentMethodBreakdownResponse,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _add_months(month_dt: datetime, delta: int) -> datetime:
    year = month_dt.year + (month_dt.month - 1 + delta) // 12
    month = (month_dt.month - 1 + delta) % 12 + 1
    return month_dt.replace(year=year, month=month, day=1)


def _parse_date_range(start_date: Optional[str], end_date: Optional[str]) -> tuple[Optional[datetime], Optional[datetime]]:
    parsed_start = None
    parsed_end = None

    if start_date:
        try:
            parsed_start = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format")

    if end_date:
        try:
            parsed_end = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format")

    if parsed_start and parsed_end and parsed_end < parsed_start:
        raise HTTPException(status_code=400, detail="end_date cannot be earlier than start_date")

    return parsed_start, parsed_end


@router.get("/summary", response_model=AnalyticsSummaryResponse)
async def get_analytics_summary(
    profile_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    parsed_start, parsed_end = _parse_date_range(start_date, end_date)
    query = {"user_id": current_user["user_id"]}
    if profile_id:
        query["profile_id"] = profile_id
    if parsed_start or parsed_end:
        query["date"] = {}
        if parsed_start:
            query["date"]["$gte"] = parsed_start
        if parsed_end:
            query["date"]["$lte"] = parsed_end

    expenses = await db.expenses.find(query, {"_id": 0, "amount": 1, "type": 1, "date": 1}).to_list(5000)
    now = datetime.now(timezone.utc)
    current_month_start = _month_start(now)
    prev_month_start = _add_months(current_month_start, -1)

    total_spend = sum(e["amount"] for e in expenses if e.get("type") == "expense")
    total_income = sum(e["amount"] for e in expenses if e.get("type") == "income")

    current_month_spend = sum(
        e["amount"]
        for e in expenses
        if e.get("type") == "expense"
        and isinstance(e.get("date"), datetime)
        and e["date"].replace(tzinfo=timezone.utc) >= current_month_start
    )
    previous_month_spend = sum(
        e["amount"]
        for e in expenses
        if e.get("type") == "expense"
        and isinstance(e.get("date"), datetime)
        and prev_month_start <= e["date"].replace(tzinfo=timezone.utc) < current_month_start
    )
    if previous_month_spend > 0:
        month_over_month_change_pct = ((current_month_spend - previous_month_spend) / previous_month_spend) * 100
    elif current_month_spend > 0:
        month_over_month_change_pct = 100.0
    else:
        month_over_month_change_pct = 0.0

    return AnalyticsSummaryResponse(
        total_spend=round(total_spend, 2),
        total_income=round(total_income, 2),
        net_balance=round(total_income - total_spend, 2),
        current_month_spend=round(current_month_spend, 2),
        previous_month_spend=round(previous_month_spend, 2),
        month_over_month_change_pct=round(month_over_month_change_pct, 2),
    )


@router.get("/category-breakdown", response_model=CategoryBreakdownResponse)
async def get_category_breakdown(
    profile_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    parsed_start, parsed_end = _parse_date_range(start_date, end_date)
    query = {"user_id": current_user["user_id"], "type": "expense"}
    if profile_id:
        query["profile_id"] = profile_id
    if parsed_start or parsed_end:
        query["date"] = {}
        if parsed_start:
            query["date"]["$gte"] = parsed_start
        if parsed_end:
            query["date"]["$lte"] = parsed_end

    expenses = await db.expenses.find(query, {"_id": 0, "amount": 1, "category_id": 1}).to_list(5000)
    categories = await db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0, "category_id": 1, "name": 1}).to_list(500)
    cat_name = {c["category_id"]: c.get("name", "Unknown") for c in categories}

    totals: dict[str, float] = {}
    for exp in expenses:
        cid = exp.get("category_id") or "uncategorized"
        totals[cid] = totals.get(cid, 0.0) + float(exp.get("amount", 0.0))

    grand_total = sum(totals.values())
    items = [
        CategoryBreakdownItem(
            category_id=cid,
            category_name=cat_name.get(cid, "Uncategorized"),
            amount=round(amount, 2),
            percentage=round((amount / grand_total * 100) if grand_total > 0 else 0.0, 2),
        )
        for cid, amount in totals.items()
    ]
    items.sort(key=lambda x: (-x.amount, x.category_name))
    return CategoryBreakdownResponse(items=items)


@router.get("/payment-method-breakdown", response_model=PaymentMethodBreakdownResponse)
async def get_payment_method_breakdown(
    profile_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    parsed_start, parsed_end = _parse_date_range(start_date, end_date)
    query = {"user_id": current_user["user_id"], "type": "expense"}
    if profile_id:
        query["profile_id"] = profile_id
    if parsed_start or parsed_end:
        query["date"] = {}
        if parsed_start:
            query["date"]["$gte"] = parsed_start
        if parsed_end:
            query["date"]["$lte"] = parsed_end

    expenses = await db.expenses.find(query, {"_id": 0, "amount": 1, "payment_method_id": 1}).to_list(5000)
    methods = await db.payment_methods.find({"user_id": current_user["user_id"]}, {"_id": 0, "payment_id": 1, "name": 1}).to_list(500)
    pm_name = {m["payment_id"]: m.get("name", "Unknown") for m in methods}

    totals: dict[str, float] = {}
    for exp in expenses:
        pmid = exp.get("payment_method_id") or "unknown"
        totals[pmid] = totals.get(pmid, 0.0) + float(exp.get("amount", 0.0))

    items = [
        PaymentMethodBreakdownItem(
            payment_method_id=pmid,
            payment_method_name=pm_name.get(pmid, "Unknown"),
            amount=round(amount, 2),
        )
        for pmid, amount in totals.items()
    ]
    items.sort(key=lambda x: (-x.amount, x.payment_method_name))
    return PaymentMethodBreakdownResponse(items=items)


@router.get("/monthly-trend", response_model=MonthlyTrendResponse)
async def get_monthly_trend(
    profile_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    parsed_start, parsed_end = _parse_date_range(start_date, end_date)

    now = datetime.now(timezone.utc)
    if parsed_start or parsed_end:
        range_start = _month_start(parsed_start or _add_months(_month_start(now), -5))
        range_end_anchor = _month_start(parsed_end or now)
        month_starts = []
        cursor = range_start
        while cursor <= range_end_anchor:
            month_starts.append(cursor)
            cursor = _add_months(cursor, 1)
        next_month = _add_months(range_end_anchor, 1)
    else:
        current_start = _month_start(now)
        month_starts = [_add_months(current_start, -5 + i) for i in range(6)]
        next_month = _add_months(current_start, 1)

    query = {
        "user_id": current_user["user_id"],
        "type": "expense",
        "date": {"$gte": month_starts[0], "$lt": next_month},
    }
    if profile_id:
        query["profile_id"] = profile_id

    expenses = await db.expenses.find(query, {"_id": 0, "amount": 1, "date": 1}).to_list(10000)

    totals_by_key = {m.strftime("%Y-%m"): 0.0 for m in month_starts}
    for exp in expenses:
        date_val = exp.get("date")
        if not isinstance(date_val, datetime):
            continue
        key = date_val.strftime("%Y-%m")
        if key in totals_by_key:
            totals_by_key[key] += float(exp.get("amount", 0.0))

    items = [
        MonthlyTrendItem(month=m.strftime("%Y-%m"), amount=round(totals_by_key[m.strftime("%Y-%m")], 2))
        for m in month_starts
    ]
    return MonthlyTrendResponse(items=items)
