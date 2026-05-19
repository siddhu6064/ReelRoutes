from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from deps import get_current_user
from services.forecast_service import generate_spend_forecast

router = APIRouter(prefix="/forecast", tags=["forecast"])


async def _ensure_profile_owned(profile_id: str, user_id: str):
    profile = await db.profiles.find_one(
        {"profile_id": profile_id, "user_id": user_id},
        {"_id": 0},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")


@router.get("")
async def get_forecast(
    profile_id: str = Query(...),
    recent_days: int = Query(30, ge=7, le=90),
    current_user: dict = Depends(get_current_user),
):
    await _ensure_profile_owned(profile_id, current_user["user_id"])

    return await generate_spend_forecast(
        user_id=current_user["user_id"],
        profile_id=profile_id,
        expenses_collection=db.expenses,
        budgets_collection=db.budgets,
        recent_days=recent_days,
    )
