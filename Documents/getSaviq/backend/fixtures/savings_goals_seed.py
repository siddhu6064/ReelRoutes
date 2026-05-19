from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models import SavingsGoal


def build_savings_goal_seed(user_id: str, profile_id: str, now: datetime | None = None) -> list[dict]:
    base_now = now or datetime.now(timezone.utc)

    rows = [
        {
            "goal_id": "goal_seed_emergency_fund",
            "title": "Emergency Fund",
            "target_amount": 12000,
            "current_amount": 4200,
            "deadline": base_now + timedelta(days=365),
            "category": "Emergency",
            "status": "active",
        },
        {
            "goal_id": "goal_seed_vacation_japan",
            "title": "Japan Vacation",
            "target_amount": 4500,
            "current_amount": 3900,
            "deadline": base_now + timedelta(days=75),
            "category": "Travel",
            "status": "active",
        },
        {
            "goal_id": "goal_seed_new_laptop",
            "title": "New Laptop",
            "target_amount": 2200,
            "current_amount": 2200,
            "deadline": base_now + timedelta(days=30),
            "category": "Tech",
            "status": "completed",
        },
        {
            "goal_id": "goal_seed_home_down_payment",
            "title": "Home Down Payment",
            "target_amount": 60000,
            "current_amount": 12500,
            "deadline": base_now + timedelta(days=730),
            "category": "Housing",
            "status": "active",
        },
        {
            "goal_id": "goal_seed_wedding",
            "title": "Wedding Budget",
            "target_amount": 18000,
            "current_amount": 6000,
            "deadline": base_now + timedelta(days=280),
            "category": "Life Events",
            "status": "paused",
        },
        {
            "goal_id": "goal_seed_side_business",
            "title": "Side Business Launch",
            "target_amount": 10000,
            "current_amount": 1400,
            "deadline": base_now + timedelta(days=500),
            "category": "Business",
            "status": "cancelled",
        },
    ]

    seeded = []
    for row in rows:
        goal = SavingsGoal(
            user_id=user_id,
            profile_id=profile_id,
            **row,
        )
        seeded.append(goal.model_dump())

    return seeded
