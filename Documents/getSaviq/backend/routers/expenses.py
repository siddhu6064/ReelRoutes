import asyncio
from datetime import datetime, timezone, timedelta
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from pymongo import ReturnDocument

from database import db
from deps import get_current_user
from models import Expense, ExpenseCreate, ExpenseUpdate, MessageResponse

router = APIRouter(tags=["expenses"])

STATS_PROJECTION = {"_id": 0, "amount": 1, "type": 1, "category_id": 1}


async def _ensure_owned(
    collection,
    id_field: str,
    resource_id: str,
    user_id: str,
    not_found_detail: str,
):
    doc = await collection.find_one({id_field: resource_id, "user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail=not_found_detail)


# ===================== EXPENSE CRUD =====================

@router.get("/expenses", response_model=list[Expense])
async def get_expenses(
    profile_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    q: Optional[str] = None,
    tx_type: Optional[Literal["expense", "income", "transfer"]] = Query(default=None, alias="type"),
    payment_method_id: Optional[str] = None,
    category_id: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    """Get expenses with optional filters and pagination"""
    query = {"user_id": current_user["user_id"]}

    if profile_id:
        query["profile_id"] = profile_id

    if start_date:
        try:
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query["date"] = {"$gte": start}
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format")

    if end_date:
        try:
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            if "date" in query:
                query["date"]["$lte"] = end
            else:
                query["date"] = {"$lte": end}
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid end_date format")
    if start_date and end_date and query.get("date", {}).get("$lte") < query.get("date", {}).get("$gte"):
        raise HTTPException(status_code=400, detail="end_date cannot be earlier than start_date")

    if tx_type:
        query["type"] = tx_type

    if category_id:
        query["category_id"] = category_id

    if payment_method_id:
        query["payment_method_id"] = payment_method_id

    expenses = await db.expenses.find(query, {"_id": 0}).to_list(5000)

    if q:
        needle = q.strip().lower()
        expenses = [
            e for e in expenses
            if needle in (e.get("description") or "").lower()
            or needle in (e.get("merchant") or "").lower()
            or needle in (e.get("notes") or "").lower()
        ]

    expenses.sort(key=lambda x: x.get("date"), reverse=True)
    expenses = expenses[skip: skip + limit]

    return expenses


@router.get("/expenses/{expense_id}", response_model=Expense)
async def get_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """Get a single expense"""
    expense = await db.expenses.find_one(
        {"expense_id": expense_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )

    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    return expense


@router.post("/expenses", response_model=Expense)
async def create_expense(data: ExpenseCreate, current_user: dict = Depends(get_current_user)):
    """Create a new expense"""
    await _ensure_owned(
        db.profiles,
        "profile_id",
        data.profile_id,
        current_user["user_id"],
        "Profile not found",
    )
    if data.category_id:
        await _ensure_owned(
            db.categories,
            "category_id",
            data.category_id,
            current_user["user_id"],
            "Category not found",
        )
    await _ensure_owned(
        db.payment_methods,
        "payment_id",
        data.payment_method_id,
        current_user["user_id"],
        "Payment method not found",
    )
    if data.to_payment_method_id:
        await _ensure_owned(
            db.payment_methods,
            "payment_id",
            data.to_payment_method_id,
            current_user["user_id"],
            "Payment method not found",
        )

    expense = Expense(
        user_id=current_user["user_id"],
        profile_id=data.profile_id,
        type=data.type,
        amount=data.amount,
        category_id=data.category_id,
        payment_method_id=data.payment_method_id,
        to_payment_method_id=data.to_payment_method_id,
        description=data.description,
        merchant=data.merchant,
        date=data.date,
        time=data.time,
        receipt_image=data.receipt_image,
        notes=data.notes,
        is_pending=data.is_pending,
        is_recurring=data.is_recurring,
        recurring_frequency=data.recurring_frequency,
        recurring_start_date=data.recurring_start_date,
        recurring_end_date=data.recurring_end_date,
    )
    await db.expenses.insert_one(expense.model_dump())
    return expense.model_dump()


@router.put("/expenses/{expense_id}", response_model=Expense)
async def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update an expense — single round-trip via find_one_and_update"""
    existing_expense = await db.expenses.find_one(
        {"expense_id": expense_id, "user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if existing_expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    merged_expense = {**existing_expense, **update_data}

    await _ensure_owned(
        db.profiles,
        "profile_id",
        merged_expense["profile_id"],
        current_user["user_id"],
        "Profile not found",
    )
    if merged_expense.get("category_id"):
        await _ensure_owned(
            db.categories,
            "category_id",
            merged_expense["category_id"],
            current_user["user_id"],
            "Category not found",
        )
    if merged_expense.get("payment_method_id"):
        await _ensure_owned(
            db.payment_methods,
            "payment_id",
            merged_expense["payment_method_id"],
            current_user["user_id"],
            "Payment method not found",
        )
    if merged_expense.get("to_payment_method_id"):
        await _ensure_owned(
            db.payment_methods,
            "payment_id",
            merged_expense["to_payment_method_id"],
            current_user["user_id"],
            "Payment method not found",
        )

    try:
        ExpenseCreate.model_validate(
            {
                "profile_id": merged_expense["profile_id"],
                "type": merged_expense.get("type", "expense"),
                "amount": merged_expense["amount"],
                "category_id": merged_expense.get("category_id"),
                "payment_method_id": merged_expense["payment_method_id"],
                "to_payment_method_id": merged_expense.get("to_payment_method_id"),
                "description": merged_expense["description"],
                "merchant": merged_expense.get("merchant"),
                "date": merged_expense["date"],
                "time": merged_expense.get("time"),
                "receipt_image": merged_expense.get("receipt_image"),
                "notes": merged_expense.get("notes"),
                "is_pending": merged_expense.get("is_pending", False),
                "is_recurring": merged_expense.get("is_recurring", False),
                "recurring_frequency": merged_expense.get("recurring_frequency"),
                "recurring_start_date": merged_expense.get("recurring_start_date"),
                "recurring_end_date": merged_expense.get("recurring_end_date"),
            }
        )
    except ValidationError as exc:
        safe_errors = [
            {
                "loc": list(err.get("loc", [])),
                "msg": err.get("msg", "Validation error"),
                "type": err.get("type", "value_error"),
            }
            for err in exc.errors()
        ]
        raise HTTPException(status_code=422, detail=safe_errors)

    update_data["updated_at"] = datetime.now(timezone.utc)

    expense = await db.expenses.find_one_and_update(
        {"expense_id": expense_id, "user_id": current_user["user_id"]},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )

    return expense


@router.delete("/expenses/{expense_id}", response_model=MessageResponse)
async def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an expense"""
    result = await db.expenses.delete_one(
        {"expense_id": expense_id, "user_id": current_user["user_id"]}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")

    return {"message": "Expense deleted"}


# ===================== STATS ENDPOINTS =====================

@router.get("/stats/summary")
async def get_expense_summary(
    profile_id: Optional[str] = None,
    period: str = "month",  # "week", "month", "year"
    current_user: dict = Depends(get_current_user),
):
    """Get expense summary statistics"""
    now = datetime.now(timezone.utc)

    if period == "week":
        start_date = now - timedelta(days=7)
    elif period == "year":
        start_date = now - timedelta(days=365)
    else:  # month
        start_date = now - timedelta(days=30)

    query = {
        "user_id": current_user["user_id"],
        "date": {"$gte": start_date},
    }
    if profile_id:
        query["profile_id"] = profile_id

    # Fetch expenses and categories in parallel
    expenses, categories = await asyncio.gather(
        db.expenses.find(query, STATS_PROJECTION).to_list(1000),
        db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100),
    )

    total = sum(exp.get("amount", 0) for exp in expenses)
    count = len(expenses)

    # Group by category
    by_category = {}
    for exp in expenses:
        cat_id = exp.get("category_id", "unknown")
        by_category[cat_id] = by_category.get(cat_id, 0) + exp.get("amount", 0)

    category_map = {cat["category_id"]: cat for cat in categories}

    category_breakdown = []
    for cat_id, amount in by_category.items():
        cat_info = category_map.get(cat_id, {"name": "Unknown", "color": "#6b7280", "icon": "help"})
        category_breakdown.append({
            "category_id": cat_id,
            "name": cat_info.get("name", "Unknown"),
            "color": cat_info.get("color", "#6b7280"),
            "icon": cat_info.get("icon", "help"),
            "amount": amount,
            "percentage": (amount / total * 100) if total > 0 else 0,
        })

    category_breakdown.sort(key=lambda x: x["amount"], reverse=True)

    return {
        "total": total,
        "count": count,
        "average": total / count if count > 0 else 0,
        "period": period,
        "start_date": start_date.isoformat(),
        "end_date": now.isoformat(),
        "by_category": category_breakdown,
    }


@router.get("/stats/weekly-summary")
async def get_weekly_summary(
    profile_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get this week's spending summary vs last week for notification content"""
    now = datetime.now(timezone.utc)

    days_since_monday = now.weekday()  # 0=Mon, 6=Sun
    this_week_start = (now - timedelta(days=days_since_monday)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    last_week_start = this_week_start - timedelta(days=7)
    last_week_end = this_week_start

    base_query = {"user_id": current_user["user_id"]}
    if profile_id:
        base_query["profile_id"] = profile_id

    this_week_query = {**base_query, "type": "expense", "date": {"$gte": this_week_start}}
    last_week_query = {**base_query, "type": "expense", "date": {"$gte": last_week_start, "$lt": last_week_end}}

    # Fetch both weeks and all categories in parallel
    this_week_expenses, last_week_expenses, all_categories = await asyncio.gather(
        db.expenses.find(this_week_query, STATS_PROJECTION).to_list(1000),
        db.expenses.find(last_week_query, STATS_PROJECTION).to_list(1000),
        db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(200),
    )

    this_week_total = sum(e.get("amount", 0) for e in this_week_expenses)
    last_week_total = sum(e.get("amount", 0) for e in last_week_expenses)
    this_week_count = len(this_week_expenses)

    pct_change = (
        ((this_week_total - last_week_total) / last_week_total) * 100
        if last_week_total > 0
        else 0.0
    )

    # Top spending category this week
    cat_totals: dict = {}
    for exp in this_week_expenses:
        cid = exp.get("category_id", "unknown")
        cat_totals[cid] = cat_totals.get(cid, 0) + exp.get("amount", 0)

    top_category_id = max(cat_totals, key=lambda k: cat_totals[k]) if cat_totals else None
    top_category_name = "N/A"
    top_category_amount = 0.0

    if top_category_id:
        cat_lookup = {c["category_id"]: c for c in all_categories}
        cat_doc = cat_lookup.get(top_category_id)
        top_category_name = cat_doc.get("name", "Other") if cat_doc else "Other"
        top_category_amount = cat_totals[top_category_id]

    week_label = f"Week of {this_week_start.strftime('%b %d')}"

    if pct_change == 0 or last_week_total == 0:
        change_str = "First tracked week"
    elif pct_change > 0:
        change_str = f"↑ {abs(pct_change):.0f}% vs last week"
    else:
        change_str = f"↓ {abs(pct_change):.0f}% vs last week"

    return {
        "week_label": week_label,
        "this_week_total": round(this_week_total, 2),
        "last_week_total": round(last_week_total, 2),
        "transaction_count": this_week_count,
        "pct_change": round(pct_change, 1),
        "top_category_name": top_category_name,
        "top_category_amount": round(top_category_amount, 2),
        "change_str": change_str,
        "notification_title": f"📊 {week_label}",
        "notification_body": f"Spent ${this_week_total:.0f} · {top_category_name} is top · {change_str}",
    }
