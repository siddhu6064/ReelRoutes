from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from database import db
from deps import get_current_user
from models import MessageResponse, SavingsGoal, SavingsGoalCreate, SavingsGoalResponse, SavingsGoalUpdate
from services.savings_goals_service import (
    calculate_goal_progress_percentage,
    calculate_monthly_savings_recommendation,
    calculate_goal_projection,
    calculate_recent_monthly_savings_velocity,
)

router = APIRouter(prefix="/savings-goals", tags=["savings-goals"])


async def _ensure_profile_owned(profile_id: str, user_id: str):
    profile = await db.profiles.find_one(
        {"profile_id": profile_id, "user_id": user_id},
        {"_id": 0},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")


async def _enrich_goal(
    goal: dict,
    user_id: str,
    manual_monthly_contribution: Optional[float] = None,
    monthly_velocity: Optional[float] = None,
) -> dict:
    progress_percentage = calculate_goal_progress_percentage(
        goal.get("current_amount"),
        goal.get("target_amount"),
    )
    velocity = monthly_velocity
    if velocity is None:
        velocity = await calculate_recent_monthly_savings_velocity(
            user_id,
            goal["profile_id"],
            expenses_collection=db.expenses,
        )
    projection = calculate_goal_projection(
        current_amount=goal.get("current_amount"),
        target_amount=goal.get("target_amount"),
        monthly_velocity=velocity,
        manual_monthly_contribution=manual_monthly_contribution,
    )
    monthly_recommendation = calculate_monthly_savings_recommendation(
        current_amount=goal.get("current_amount"),
        target_amount=goal.get("target_amount"),
        deadline=goal.get("deadline"),
    )
    return {
        **goal,
        "progress_percentage": progress_percentage,
        "monthly_savings_recommendation": monthly_recommendation,
        "projected_completion": projection,
    }


@router.post("", response_model=SavingsGoalResponse)
async def create_savings_goal(
    data: SavingsGoalCreate,
    current_user: dict = Depends(get_current_user),
):
    await _ensure_profile_owned(data.profile_id, current_user["user_id"])

    goal = SavingsGoal(user_id=current_user["user_id"], **data.model_dump())
    await db.savings_goals.insert_one(goal.model_dump())
    return await _enrich_goal(goal.model_dump(), current_user["user_id"])


@router.get("", response_model=list[SavingsGoalResponse])
async def list_savings_goals(
    profile_id: Optional[str] = None,
    manual_monthly_contribution: Optional[float] = None,
    current_user: dict = Depends(get_current_user),
):
    query = {"user_id": current_user["user_id"]}
    if profile_id:
        query["profile_id"] = profile_id

    goals = await db.savings_goals.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    profile_velocity: dict[str, float] = {}
    enriched = []
    for goal in goals:
        profile_id = goal["profile_id"]
        if profile_id not in profile_velocity:
            profile_velocity[profile_id] = await calculate_recent_monthly_savings_velocity(
                current_user["user_id"],
                profile_id,
                expenses_collection=db.expenses,
            )
        enriched.append(
            await _enrich_goal(
                goal,
                current_user["user_id"],
                manual_monthly_contribution,
                monthly_velocity=profile_velocity[profile_id],
            )
        )
    return enriched


@router.get("/{goal_id}", response_model=SavingsGoalResponse)
async def get_savings_goal(
    goal_id: str,
    manual_monthly_contribution: Optional[float] = None,
    current_user: dict = Depends(get_current_user),
):
    goal = await db.savings_goals.find_one(
        {"goal_id": goal_id, "user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if not goal:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    return await _enrich_goal(goal, current_user["user_id"], manual_monthly_contribution)


@router.put("/{goal_id}", response_model=SavingsGoalResponse)
async def update_savings_goal(
    goal_id: str,
    data: SavingsGoalUpdate,
    current_user: dict = Depends(get_current_user),
):
    existing = await db.savings_goals.find_one(
        {"goal_id": goal_id, "user_id": current_user["user_id"]},
        {"_id": 0},
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Savings goal not found")

    update_data = data.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")

    target_profile_id = update_data.get("profile_id", existing["profile_id"])
    await _ensure_profile_owned(target_profile_id, current_user["user_id"])

    update_data["updated_at"] = datetime.now(timezone.utc)

    updated = await db.savings_goals.find_one_and_update(
        {"goal_id": goal_id, "user_id": current_user["user_id"]},
        {"$set": update_data},
        projection={"_id": 0},
        return_document=ReturnDocument.AFTER,
    )
    return await _enrich_goal(updated, current_user["user_id"])


@router.delete("/{goal_id}", response_model=MessageResponse)
async def delete_savings_goal(goal_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.savings_goals.delete_one(
        {"goal_id": goal_id, "user_id": current_user["user_id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Savings goal not found")
    return {"message": "Savings goal deleted"}
