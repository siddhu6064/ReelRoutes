from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from database import db
from deps import get_current_user
from models import InsightItem, InsightListResponse
from services.insights_v2_service import generate_spend_comparison

router = APIRouter(prefix="/insights", tags=["insights"])


def _month_start(dt: datetime) -> datetime:
    return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _add_months(month_dt: datetime, delta: int) -> datetime:
    year = month_dt.year + (month_dt.month - 1 + delta) // 12
    month = (month_dt.month - 1 + delta) % 12 + 1
    return month_dt.replace(year=year, month=month, day=1)


def _expense_totals_by_category(expenses: list[dict]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for e in expenses:
        if e.get("type") != "expense":
            continue
        cid = e.get("category_id") or "uncategorized"
        totals[cid] = totals.get(cid, 0.0) + float(e.get("amount", 0.0))
    return totals


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


async def _ensure_profile_owned(user_id: str, profile_id: str) -> None:
    profile = await db.profiles.find_one({"user_id": user_id, "profile_id": profile_id}, {"_id": 0, "profile_id": 1})
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")


@router.get("/overview", response_model=InsightListResponse)
async def insights_overview(
    profile_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    parsed_start, parsed_end = _parse_date_range(start_date, end_date)
    now = datetime.now(timezone.utc)
    current_month_start = _month_start(now)
    prev_month_start = _add_months(current_month_start, -1)

    query = {"user_id": current_user["user_id"]}
    if profile_id:
        query["profile_id"] = profile_id
    if parsed_start or parsed_end:
        query["date"] = {}
        if parsed_start:
            query["date"]["$gte"] = parsed_start
        if parsed_end:
            query["date"]["$lte"] = parsed_end

    expenses = await db.expenses.find(query, {"_id": 0, "amount": 1, "type": 1, "category_id": 1, "date": 1}).to_list(10000)
    categories = await db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0, "category_id": 1, "name": 1}).to_list(500)
    category_names = {c["category_id"]: c.get("name", "Uncategorized") for c in categories}

    expense_only = [e for e in expenses if e.get("type") == "expense"]
    if not expense_only:
        return InsightListResponse(
            insights=[
                InsightItem(
                    type="empty_state",
                    severity="info",
                    title="No spending data yet",
                    message="Add a few expenses to unlock trend and category insights.",
                )
            ]
        )

    current_month_spend = sum(
        e["amount"] for e in expense_only if isinstance(e.get("date"), datetime) and e["date"].replace(tzinfo=timezone.utc) >= current_month_start
    )
    previous_month_spend = sum(
        e["amount"]
        for e in expense_only
        if isinstance(e.get("date"), datetime) and prev_month_start <= e["date"].replace(tzinfo=timezone.utc) < current_month_start
    )
    income_total = sum(float(e.get("amount", 0.0)) for e in expenses if e.get("type") == "income")
    expense_total = sum(float(e.get("amount", 0.0)) for e in expense_only)
    insights: list[InsightItem] = []
    if previous_month_spend > 0:
        change_pct = ((current_month_spend - previous_month_spend) / previous_month_spend) * 100
        if change_pct >= 10:
            insights.append(
                InsightItem(
                    type="trend",
                    severity="warning",
                    title="Spending increased vs last month",
                    message=f"Spending is up {change_pct:.1f}% compared with last month.",
                    metric={"current_month_spend": round(current_month_spend, 2), "previous_month_spend": round(previous_month_spend, 2)},
                )
            )
        elif change_pct <= -10:
            insights.append(
                InsightItem(
                    type="trend",
                    severity="positive",
                    title="Spending decreased vs last month",
                    message=f"Spending is down {abs(change_pct):.1f}% compared with last month.",
                    metric={"current_month_spend": round(current_month_spend, 2), "previous_month_spend": round(previous_month_spend, 2)},
                )
            )

    by_category = _expense_totals_by_category(expense_only)
    if by_category:
        top_category_id, top_amount = max(by_category.items(), key=lambda x: x[1])
        share = (top_amount / expense_total * 100) if expense_total > 0 else 0.0
        top_name = category_names.get(top_category_id, "Uncategorized")
        insights.append(
            InsightItem(
                type="top_category",
                severity="info",
                title="Top spending category",
                message=f"{top_name} is your largest expense category at {share:.1f}% of spend.",
                metric={"category": top_name, "share_pct": round(share, 2)},
            )
        )
        if share >= 50:
            insights.append(
                InsightItem(
                    type="concentration",
                    severity="warning",
                    title="High category concentration",
                    message=f"{top_name} accounts for {share:.1f}% of your expenses.",
                    metric={"category": top_name, "share_pct": round(share, 2)},
                )
            )

    if income_total > 0:
        if income_total >= expense_total:
            insights.append(
                InsightItem(
                    type="cashflow",
                    severity="positive",
                    title="Income exceeds expenses",
                    message="Your recorded income currently covers your expenses.",
                    metric={"income": round(income_total, 2), "expenses": round(expense_total, 2)},
                )
            )
        else:
            insights.append(
                InsightItem(
                    type="cashflow",
                    severity="warning",
                    title="Expenses exceed income",
                    message="Your recorded expenses are currently above income.",
                    metric={"income": round(income_total, 2), "expenses": round(expense_total, 2)},
                )
            )

    return InsightListResponse(insights=insights)


@router.get("/recommendations", response_model=InsightListResponse)
async def insights_recommendations(
    profile_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    parsed_start, parsed_end = _parse_date_range(start_date, end_date)
    now = datetime.now(timezone.utc)
    current_month_start = _month_start(now)

    query = {"user_id": current_user["user_id"]}
    if profile_id:
        query["profile_id"] = profile_id
    if parsed_start or parsed_end:
        query["date"] = {}
        if parsed_start:
            query["date"]["$gte"] = parsed_start
        if parsed_end:
            query["date"]["$lte"] = parsed_end

    expenses = await db.expenses.find(query, {"_id": 0, "amount": 1, "type": 1, "category_id": 1, "payment_method_id": 1, "date": 1}).to_list(10000)
    categories = await db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0, "category_id": 1, "name": 1}).to_list(500)
    budgets_query = {"user_id": current_user["user_id"]}
    if profile_id:
        budgets_query["profile_id"] = profile_id
    budgets = await db.budgets.find(budgets_query, {"_id": 0, "budget_id": 1, "category_id": 1, "amount": 1}).to_list(500)

    category_names = {c["category_id"]: c.get("name", "Uncategorized") for c in categories}
    expense_only = [e for e in expenses if e.get("type") == "expense"]
    income_total = sum(float(e.get("amount", 0.0)) for e in expenses if e.get("type") == "income")
    expense_total = sum(float(e.get("amount", 0.0)) for e in expense_only)

    if not expenses:
        return InsightListResponse(
            insights=[
                InsightItem(
                    type="getting_started",
                    severity="info",
                    title="Start with a week of transactions",
                    message="Add expenses and income to receive actionable recommendations.",
                )
            ]
        )

    recommendations: list[InsightItem] = []
    by_category = _expense_totals_by_category(expense_only)
    if by_category and expense_total > 0:
        top_category_id, top_amount = max(by_category.items(), key=lambda x: x[1])
        top_share = (top_amount / expense_total) * 100
        top_name = category_names.get(top_category_id, "Uncategorized")
        if top_share >= 40:
            recommendations.append(
                InsightItem(
                    type="category_control",
                    severity="warning",
                    title="Reduce top category spend",
                    message=f"Consider setting a tighter cap for {top_name} ({top_share:.1f}% of expenses).",
                    metric={"category": top_name, "share_pct": round(top_share, 2)},
                )
            )

    entertainment_spend = 0.0
    for cid, amount in by_category.items():
        name = category_names.get(cid, "").lower()
        if "entertain" in name or "subscription" in name:
            entertainment_spend += amount
    if expense_total > 0 and (entertainment_spend / expense_total) * 100 >= 20:
        recommendations.append(
            InsightItem(
                type="subscriptions_review",
                severity="warning",
                title="Review entertainment/subscriptions",
                message="Entertainment/subscription spend is a large share of total expenses.",
                metric={"share_pct": round((entertainment_spend / expense_total) * 100, 2)},
            )
        )

    if parsed_start or parsed_end:
        this_month_expenses = expense_only
    else:
        this_month_expenses = [
            e for e in expense_only if isinstance(e.get("date"), datetime) and e["date"].replace(tzinfo=timezone.utc) >= current_month_start
        ]
    month_by_category = _expense_totals_by_category(this_month_expenses)
    for budget in budgets:
        cid = budget.get("category_id")
        if not cid:
            continue
        spent = month_by_category.get(cid, 0.0)
        limit = float(budget.get("amount", 0.0))
        if limit <= 0:
            continue
        ratio = spent / limit
        if ratio >= 1:
            recommendations.append(
                InsightItem(
                    type="budget_alert",
                    severity="warning",
                    title="Category budget exceeded",
                    message=f"{category_names.get(cid, 'Category')} is over budget this month.",
                    metric={"spent": round(spent, 2), "budget": round(limit, 2)},
                )
            )
        elif ratio >= 0.8:
            recommendations.append(
                InsightItem(
                    type="budget_watch",
                    severity="info",
                    title="Category budget near limit",
                    message=f"{category_names.get(cid, 'Category')} is near its monthly budget limit.",
                    metric={"spent": round(spent, 2), "budget": round(limit, 2)},
                )
            )

    if income_total > 0:
        margin = income_total - expense_total
        if margin > income_total * 0.2:
            recommendations.append(
                InsightItem(
                    type="savings_opportunity",
                    severity="positive",
                    title="Healthy savings margin",
                    message="You have room to transfer part of this margin to savings.",
                    metric={"margin": round(margin, 2)},
                )
            )

    payment_totals: dict[str, float] = {}
    for e in expense_only:
        pmid = e.get("payment_method_id") or "unknown"
        payment_totals[pmid] = payment_totals.get(pmid, 0.0) + float(e.get("amount", 0.0))
    if payment_totals and expense_total > 0:
        top_pm = max(payment_totals.values())
        if (top_pm / expense_total) * 100 >= 70:
            recommendations.append(
                InsightItem(
                    type="payment_concentration",
                    severity="info",
                    title="High payment-method concentration",
                    message="Most spend is concentrated on one payment method; review utilization.",
                    metric={"share_pct": round((top_pm / expense_total) * 100, 2)},
                )
            )

    if not recommendations:
        recommendations.append(
            InsightItem(
                type="steady_state",
                severity="positive",
                title="Spending pattern looks stable",
                message="No major warning signals detected from current spending patterns.",
            )
        )

    return InsightListResponse(insights=recommendations)


@router.get("/v2")
async def insights_v2(
    profile_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if not profile_id:
        raise HTTPException(status_code=400, detail="profile_id is required")

    await _ensure_profile_owned(current_user["user_id"], profile_id)

    weekly = await generate_spend_comparison(
        user_id=current_user["user_id"],
        profile_id=profile_id,
        period_type="weekly",
        expenses_collection=db.expenses,
        budgets_collection=db.budgets,
    )
    monthly = await generate_spend_comparison(
        user_id=current_user["user_id"],
        profile_id=profile_id,
        period_type="monthly",
        expenses_collection=db.expenses,
        budgets_collection=db.budgets,
    )

    return {
        "profile_id": profile_id,
        "weekly": weekly,
        "monthly": monthly,
    }
