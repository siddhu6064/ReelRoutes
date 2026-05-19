from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db
from deps import get_current_user
from models import (
    Category, CategoryCreate, CategoryUpdate,
    MessageResponse,
    PaymentMethod, PaymentMethodCreate, PaymentMethodUpdate,
)

router = APIRouter(tags=["categories"])


# ===================== CATEGORY ENDPOINTS =====================

@router.get("/categories", response_model=list[Category])
async def get_categories(current_user: dict = Depends(get_current_user)):
    """Get all categories for current user"""
    categories = await db.categories.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return categories


@router.post("/categories", response_model=Category)
async def create_category(data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """Create a new category"""
    normalized_name = data.name.strip().lower()
    existing_categories = await db.categories.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0, "name": 1, "profile_id": 1},
    ).to_list(500)
    if any(
        (c.get("name") or "").strip().lower() == normalized_name
        and c.get("profile_id") == data.profile_id
        for c in existing_categories
    ):
        raise HTTPException(status_code=409, detail="Category name already exists for this profile scope")

    category = Category(
        user_id=current_user["user_id"],
        name=data.name,
        icon=data.icon,
        color=data.color,
        profile_id=data.profile_id
    )
    category_doc = category.model_dump()
    category_doc["name_normalized"] = normalized_name
    try:
        await db.categories.insert_one(category_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Category name already exists for this profile scope")
    return category_doc


@router.put("/categories/{category_id}", response_model=Category)
async def update_category(category_id: str, data: CategoryUpdate, current_user: dict = Depends(get_current_user)):
    """Update a category"""
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    if "name" in update_data and update_data["name"] is not None:
        update_data["name_normalized"] = update_data["name"].strip().lower()

    result = await db.categories.find_one_and_update(
        {"category_id": category_id, "user_id": current_user["user_id"]},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return result


@router.delete("/categories/{category_id}", response_model=MessageResponse)
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a category (cannot delete default categories)"""
    category = await db.categories.find_one(
        {"category_id": category_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )

    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    if category.get("is_default"):
        raise HTTPException(status_code=400, detail="Cannot delete default categories")

    expense_ref = await db.expenses.find_one(
        {"user_id": current_user["user_id"], "category_id": category_id},
        {"_id": 0, "expense_id": 1},
    )
    budget_ref = await db.budgets.find_one(
        {"user_id": current_user["user_id"], "category_id": category_id},
        {"_id": 0, "budget_id": 1},
    )
    if expense_ref or budget_ref:
        raise HTTPException(status_code=409, detail="Category is referenced by existing expenses or budgets")

    await db.categories.delete_one({"category_id": category_id, "user_id": current_user["user_id"]})
    return {"message": "Category deleted"}


# ===================== PAYMENT METHOD ENDPOINTS =====================

@router.get("/payment-methods", response_model=list[PaymentMethod])
async def get_payment_methods(current_user: dict = Depends(get_current_user)):
    """Get all payment methods for current user"""
    payment_methods = await db.payment_methods.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    return payment_methods


@router.post("/payment-methods", response_model=PaymentMethod)
async def create_payment_method(data: PaymentMethodCreate, current_user: dict = Depends(get_current_user)):
    """Create a new payment method"""
    normalized_name = data.name.strip().lower()
    existing_methods = await db.payment_methods.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0, "name": 1, "type": 1, "last_four": 1},
    ).to_list(500)
    if any(
        (pm.get("name") or "").strip().lower() == normalized_name
        and pm.get("type") == data.type
        and (pm.get("last_four") or None) == (data.last_four or None)
        for pm in existing_methods
    ):
        raise HTTPException(status_code=409, detail="Payment method already exists")

    payment = PaymentMethod(
        user_id=current_user["user_id"],
        name=data.name,
        type=data.type,
        last_four=data.last_four,
        is_default=data.is_default
    )
    payment_doc = payment.model_dump()
    payment_doc["name_normalized"] = normalized_name
    try:
        await db.payment_methods.insert_one(payment_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Payment method already exists")
    return payment_doc


@router.put("/payment-methods/{payment_id}", response_model=PaymentMethod)
async def update_payment_method(payment_id: str, data: PaymentMethodUpdate, current_user: dict = Depends(get_current_user)):
    """Update a payment method"""
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    if "name" in update_data and update_data["name"] is not None:
        update_data["name_normalized"] = update_data["name"].strip().lower()

    result = await db.payment_methods.find_one_and_update(
        {"payment_id": payment_id, "user_id": current_user["user_id"]},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Payment method not found")
    return result


@router.delete("/payment-methods/{payment_id}", response_model=MessageResponse)
async def delete_payment_method(payment_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a payment method"""
    expense_ref = await db.expenses.find_one(
        {
            "user_id": current_user["user_id"],
            "$or": [{"payment_method_id": payment_id}, {"to_payment_method_id": payment_id}],
        },
        {"_id": 0, "expense_id": 1},
    )
    if expense_ref:
        raise HTTPException(status_code=409, detail="Payment method is referenced by existing expenses")

    result = await db.payment_methods.delete_one(
        {"payment_id": payment_id, "user_id": current_user["user_id"]}
    )

    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Payment method not found")

    return {"message": "Payment method deleted"}
