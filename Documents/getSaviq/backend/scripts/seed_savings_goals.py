import argparse
import asyncio
from datetime import datetime, timezone

from database import db
from fixtures.savings_goals_seed import build_savings_goal_seed


async def seed_savings_goals(user_id: str, profile_id: str, clear_existing: bool = False):
    now = datetime.now(timezone.utc)
    goals = build_savings_goal_seed(user_id=user_id, profile_id=profile_id, now=now)

    if clear_existing:
        await db.savings_goals.delete_many({"user_id": user_id, "profile_id": profile_id})

    existing = await db.savings_goals.find(
        {"user_id": user_id, "profile_id": profile_id},
        {"_id": 0, "goal_id": 1},
    ).to_list(200)
    existing_ids = {doc["goal_id"] for doc in existing}

    to_insert = [goal for goal in goals if goal["goal_id"] not in existing_ids]
    if to_insert:
        await db.savings_goals.insert_many(to_insert)

    return {"seeded": len(to_insert), "total_available": len(goals)}


def main():
    parser = argparse.ArgumentParser(description="Seed realistic savings goals for a user/profile")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--profile-id", required=True)
    parser.add_argument("--clear-existing", action="store_true")
    args = parser.parse_args()

    result = asyncio.run(
        seed_savings_goals(
            user_id=args.user_id,
            profile_id=args.profile_id,
            clear_existing=args.clear_existing,
        )
    )
    print(result)


if __name__ == "__main__":
    main()
