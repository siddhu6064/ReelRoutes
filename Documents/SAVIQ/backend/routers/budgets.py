import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from database import db
from deps import get_current_user
from models import Budget, BudgetCreate, BudgetProgressResponse, BudgetUpdate, MessageResponse

router = APIRouter(prefix="/budgets", tags=["budgets"])


# ===================== HELPERS =====================

async def _spent_by_category(
    user_id: str, profile_id: str, period_start: datetime
) -> dict:
    """
    Single $group aggregation: returns {category_id: total_spent} for all
    expense transactions in the given period. category_id may be None for
    uncategorised expenses.
    """
    pipeline = [
        {
            "$match": {
                "user_id": user_id,
                "profile_id": profile_id,
                "type": "expense",
                "date": {"$gte": period_start},
            }
        },
        {
            "$group": {
                "_id": "$category_id",
                "total": {"$sum": "$amount"},
            }
        },
    ]
    docs = await db.expenses.aggregate(pipeline).to_list(None)
    return {doc["_id"]: doc["total"] for doc in docs}


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


# ===================== CRUD ENDPOINTS =====================

@router.get("", response_model=list[Budget])
async def get_budgets(
    profile_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Get all budgets for user"""
    query = {"user_id": current_user["user_id"]}
    if profile_id:
        query["profile_id"] = profile_id

    budgets = await db.budgets.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return budgets


@router.post("", response_model=Budget)
async def create_budget(
    budget_data: BudgetCreate,
    current_user: dict = Depends(get_current_user),
):
    """Create a new budget (inserts if profile/category combo does not exist)"""
    await _ensure_owned(
        db.profiles,
        "profile_id",
        budget_data.profile_id,
        current_user["user_id"],
        "Profile not found",
    )
    if budget_data.category_id:
        await _ensure_owned(
            db.categories,
            "category_id",
            budget_data.category_id,
            current_user["user_id"],
            "Category not found",
        )

    doc = Budget(
        user_id=current_user["user_id"],
        **budget_data.model_dump()
    ).model_dump()

    result = await db.budgets.find_one_and_update(
        {
            "user_id": current_user["user_id"],
            "profile_id": budget_data.profile_id,
            "category_id": budget_data.category_id,
        },
        {"$setOnInsert": doc},
        upsert=True,
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    return result


@router.put("/{budget_id}", response_model=Budget)
async def update_budget(
    budget_id: str,
    budget_data: BudgetUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update a budget"""
    existing_budget = await db.budgets.find_one(
        {"budget_id": budget_id, "user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if existing_budget is None:
        raise HTTPException(status_code=404, detail="Budget not found")

    await _ensure_owned(
        db.profiles,
        "profile_id",
        existing_budget["profile_id"],
        current_user["user_id"],
        "Profile not found",
    )
    if existing_budget.get("category_id"):
        await _ensure_owned(
            db.categories,
            "category_id",
            existing_budget["category_id"],
            current_user["user_id"],
            "Category not found",
        )

    update_data = budget_data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    update_data["updated_at"] = datetime.now(timezone.utc)

    result = await db.budgets.find_one_and_update(
        {"budget_id": budget_id, "user_id": current_user["user_id"]},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    return result


@router.delete("/{budget_id}", response_model=MessageResponse)
async def delete_budget(
    budget_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Delete a budget"""
    result = await db.budgets.delete_one(
        {"budget_id": budget_id, "user_id": current_user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Budget not found")
    return {"message": "Budget deleted"}


# ===================== PROGRESS ENDPOINT (N+1 fixed) =====================

@router.get("/progress", response_model=BudgetProgressResponse)
async def get_budget_progress(
    profile_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Get budget progress with spent amounts.

    Fix: instead of one db.expenses.find() per budget (N+1), we run at most
    one $group aggregation per distinct period (weekly / monthly / yearly) and
    execute those aggregations in parallel with asyncio.gather.
    """
    budgets = await db.budgets.find(
        {"user_id": current_user["user_id"], "profile_id": profile_id},
        {"_id": 0},
    ).to_list(100)

    if not budgets:
        return {"budgets": [], "total_budget": None}

    # Period boundary timestamps
    now = datetime.now(timezone.utc)
    period_starts = {
        "monthly": now.replace(day=1, hour=0, minute=0, second=0, microsecond=0),
        "weekly":  (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0),
        "yearly":  now.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0),
    }

    # Only query the periods that are actually referenced by these budgets
    distinct_periods = {b["period"] for b in budgets} & period_starts.keys()

    # One aggregation per distinct period, all in parallel
    period_keys = list(distinct_periods)
    aggregations = await asyncio.gather(*[
        _spent_by_category(
            current_user["user_id"],
            profile_id,
            period_starts[period],
        )
        for period in period_keys
    ])

    # spent_by_period[period] -> {category_id: total_amount}
    spent_by_period: dict[str, dict] = dict(zip(period_keys, aggregations))

    # Stitch aggregation results back to each budget
    result = []
    total_budget = None

    for budget in budgets:
        category_totals = spent_by_period.get(budget["period"], {})

        if budget["category_id"] is None:
            # Total budget: sum across ALL categories in the period
            spent = sum(category_totals.values())
        else:
            # Category budget: look up just that category
            spent = category_totals.get(budget["category_id"], 0)

        budget_item = {
            **budget,
            "spent": round(spent, 2),
            "remaining": round(budget["amount"] - spent, 2),
            "percentage": round((spent / budget["amount"]) * 100, 1) if budget["amount"] > 0 else 0,
            "is_over_budget": spent > budget["amount"],
        }

        if budget["category_id"] is None:
            total_budget = budget_item
        else:
            result.append(budget_item)

    return {"budgets": result, "total_budget": total_budget}
