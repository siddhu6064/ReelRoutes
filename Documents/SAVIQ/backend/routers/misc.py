import asyncio
import csv
import io
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from database import db
from deps import get_current_user
from models import UserSettingsUpdate

settings_router = APIRouter(prefix="/settings", tags=["settings"])
export_router = APIRouter(prefix="/export", tags=["export"])


def _safe_filename_part(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_-]", "_", value or "")
    return cleaned or "profile"


# ===================== SETTINGS =====================

@settings_router.get("")
async def get_user_settings(current_user: dict = Depends(get_current_user)):
    """Get user settings"""
    settings = await db.user_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if not settings:
        return {"user_id": current_user["user_id"], "dark_mode": False, "currency": "USD"}
    return settings


@settings_router.put("")
async def update_user_settings(
    settings_data: UserSettingsUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update user settings"""
    update_data = settings_data.model_dump(exclude_unset=True)
    update_data["updated_at"] = datetime.now(timezone.utc)

    await db.user_settings.update_one(
        {"user_id": current_user["user_id"]},
        {"$set": update_data},
        upsert=True,
    )

    settings = await db.user_settings.find_one(
        {"user_id": current_user["user_id"]},
        {"_id": 0},
    )
    return settings


# ===================== EXPORT =====================

@export_router.get("/csv")
async def export_csv(
    profile_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Export transactions as CSV"""
    query = {"user_id": current_user["user_id"], "profile_id": profile_id}

    if start_date or end_date:
        query["date"] = {}
        try:
            if start_date:
                query["date"]["$gte"] = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if end_date:
                query["date"]["$lte"] = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date filter format")
        if "$gte" in query["date"] and "$lte" in query["date"] and query["date"]["$lte"] < query["date"]["$gte"]:
            raise HTTPException(status_code=400, detail="end_date cannot be earlier than start_date")

    expenses, cats_raw, pms_raw = await asyncio.gather(
        db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(10000),
        db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(200),
        db.payment_methods.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100),
    )
    categories = {c["category_id"]: c["name"] for c in cats_raw}
    payment_methods = {p["payment_id"]: p["name"] for p in pms_raw}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Type", "Description", "Amount", "Category", "Payment Method", "Merchant", "Notes"])

    for exp in expenses:
        date_str = (
            exp["date"].strftime("%Y-%m-%d")
            if isinstance(exp["date"], datetime)
            else str(exp["date"])[:10]
        )
        writer.writerow([
            date_str,
            exp.get("type", "expense"),
            exp.get("description", ""),
            exp.get("amount", 0),
            categories.get(exp.get("category_id"), ""),
            payment_methods.get(exp.get("payment_method_id"), ""),
            exp.get("merchant", ""),
            exp.get("notes", ""),
        ])

    return PlainTextResponse(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=expenses_{_safe_filename_part(profile_id)}.csv"},
    )


@export_router.get("/json")
async def export_json(
    profile_id: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Export transactions as JSON for PDF generation on the frontend"""
    query = {"user_id": current_user["user_id"], "profile_id": profile_id}

    if start_date or end_date:
        query["date"] = {}
        try:
            if start_date:
                query["date"]["$gte"] = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            if end_date:
                query["date"]["$lte"] = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date filter format")
        if "$gte" in query["date"] and "$lte" in query["date"] and query["date"]["$lte"] < query["date"]["$gte"]:
            raise HTTPException(status_code=400, detail="end_date cannot be earlier than start_date")

    expenses, cats_raw, pms_raw = await asyncio.gather(
        db.expenses.find(query, {"_id": 0}).sort("date", -1).to_list(10000),
        db.categories.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(200),
        db.payment_methods.find({"user_id": current_user["user_id"]}, {"_id": 0}).to_list(100),
    )
    categories = {c["category_id"]: c for c in cats_raw}
    payment_methods = {p["payment_id"]: p for p in pms_raw}

    total_income   = sum(e["amount"] for e in expenses if e.get("type") == "income")
    total_expense  = sum(e["amount"] for e in expenses if e.get("type") == "expense")
    total_transfer = sum(e["amount"] for e in expenses if e.get("type") == "transfer")

    category_totals: dict = {}
    for exp in expenses:
        if exp.get("type") == "expense":
            cat_name = categories.get(exp.get("category_id"), {}).get("name", "Uncategorized")
            category_totals[cat_name] = category_totals.get(cat_name, 0) + exp["amount"]

    formatted_expenses = []
    for exp in expenses:
        formatted_exp = {**exp}
        if isinstance(exp.get("date"), datetime):
            formatted_exp["date"] = exp["date"].isoformat()
        formatted_exp["category_name"] = categories.get(exp.get("category_id"), {}).get("name", "")
        formatted_exp["payment_method_name"] = payment_methods.get(exp.get("payment_method_id"), {}).get("name", "")
        formatted_expenses.append(formatted_exp)

    return {
        "expenses": formatted_expenses,
        "summary": {
            "total_income":       round(total_income, 2),
            "total_expense":      round(total_expense, 2),
            "total_transfer":     round(total_transfer, 2),
            "balance":            round(total_income - total_expense, 2),
            "transaction_count":  len(expenses),
        },
        "category_breakdown": [
            {"name": k, "amount": round(v, 2)}
            for k, v in sorted(category_totals.items(), key=lambda x: -x[1])
        ],
        "period": {
            "start": start_date or (expenses[-1]["date"].isoformat() if expenses else None),
            "end":   end_date   or (expenses[0]["date"].isoformat()  if expenses else None),
        },
    }
