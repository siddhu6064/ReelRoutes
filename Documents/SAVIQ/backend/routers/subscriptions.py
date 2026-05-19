from fastapi import APIRouter, Depends, HTTPException, Query

from database import db
from deps import get_current_user
from services.recurring_detection_service import detect_recurring_profile_summary

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


async def _ensure_profile_owned(profile_id: str, user_id: str):
    profile = await db.profiles.find_one(
        {"profile_id": profile_id, "user_id": user_id},
        {"_id": 0},
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")


@router.get("/summary")
async def get_subscriptions_summary(
    profile_id: str = Query(...),
    lookback_days: int = Query(400, ge=30, le=730),
    current_user: dict = Depends(get_current_user),
):
    await _ensure_profile_owned(profile_id, current_user["user_id"])

    return await detect_recurring_profile_summary(
        user_id=current_user["user_id"],
        profile_id=profile_id,
        expenses_collection=db.expenses,
        lookback_days=lookback_days,
    )
