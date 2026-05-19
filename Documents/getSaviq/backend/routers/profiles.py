from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from database import db
from deps import get_current_user
from models import MessageResponse, Profile, ProfileCreate, ProfileUpdate

router = APIRouter(prefix="/profiles", tags=["profiles"])


def _infer_profile_type(name: str) -> str:
    normalized = (name or "").strip().lower()
    if normalized == "business":
        return "business"
    if normalized == "shared":
        return "shared"
    return "personal"


@router.get("", response_model=list[Profile])
async def get_profiles(current_user: dict = Depends(get_current_user)):
    """Get all profiles for current user"""
    profiles = await db.profiles.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0}
    ).sort("created_at", 1).to_list(100)
    for profile in profiles:
        if not profile.get("profile_type"):
            profile["profile_type"] = _infer_profile_type(profile.get("name", ""))
    return profiles


@router.post("", response_model=Profile)
async def create_profile(data: ProfileCreate, current_user: dict = Depends(get_current_user)):
    """Create a new profile"""
    normalized_name = data.name.strip().lower()
    existing_profiles = await db.profiles.find(
        {"user_id": current_user["user_id"]},
        {"_id": 0, "name": 1},
    ).to_list(200)
    if any((p.get("name") or "").strip().lower() == normalized_name for p in existing_profiles):
        raise HTTPException(status_code=409, detail="Profile name already exists")

    profile = Profile(
        user_id=current_user["user_id"],
        name=data.name,
        profile_type=data.profile_type,
    )
    profile_doc = profile.model_dump()
    profile_doc["name_normalized"] = normalized_name
    try:
        await db.profiles.insert_one(profile_doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Profile name already exists")
    return profile_doc


@router.put("/{profile_id}", response_model=Profile)
async def update_profile(profile_id: str, data: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update a profile"""
    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    if "name" in update_data and update_data["name"] is not None:
        update_data["name_normalized"] = update_data["name"].strip().lower()

    result = await db.profiles.find_one_and_update(
        {"profile_id": profile_id, "user_id": current_user["user_id"]},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result


@router.delete("/{profile_id}", response_model=MessageResponse)
async def delete_profile(profile_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a profile (cannot delete default profiles)"""
    profile = await db.profiles.find_one(
        {"profile_id": profile_id, "user_id": current_user["user_id"]},
        {"_id": 0}
    )

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile_type = profile.get("profile_type") or _infer_profile_type(profile.get("name", ""))
    normalized_name = (profile.get("name") or "").strip().lower()
    inferred_default_name = normalized_name in {"personal", "business"}
    is_default_profile = bool(profile.get("is_default")) or (
        profile.get("is_default") is None and inferred_default_name
    )
    if is_default_profile and profile_type in ["personal", "business"]:
        raise HTTPException(status_code=400, detail="Cannot delete default profiles")

    expense_ref = await db.expenses.find_one(
        {"user_id": current_user["user_id"], "profile_id": profile_id},
        {"_id": 0, "expense_id": 1},
    )
    budget_ref = await db.budgets.find_one(
        {"user_id": current_user["user_id"], "profile_id": profile_id},
        {"_id": 0, "budget_id": 1},
    )
    if expense_ref or budget_ref:
        raise HTTPException(status_code=409, detail="Profile is referenced by existing expenses or budgets")

    await db.profiles.delete_one({"profile_id": profile_id, "user_id": current_user["user_id"]})
    return {"message": "Profile deleted"}
