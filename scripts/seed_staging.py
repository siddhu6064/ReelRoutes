#!/usr/bin/env python3
"""
scripts/seed_staging.py

Populate the staging database with a realistic set of test trips and users
so QA testers don't have to import videos just to see the UI working.

Usage:
    # From repo root:
    MONGODB_URL=<staging-url> MONGODB_DB=reelroutes_staging \\
        python scripts/seed_staging.py

    # Or with a .env.staging file:
    ENV=staging python scripts/seed_staging.py

Safety:
    - Only runs when MONGODB_DB contains "staging" or ENV=staging
    - Skips if seed data already exists (idempotent)
    - Never touches production data
"""

from __future__ import annotations

import asyncio
import os
import sys
from datetime import UTC, datetime, timedelta

# ── Safety check ──────────────────────────────────────────────────────────────
_db_name = os.environ.get("MONGODB_DB", "")
_env = os.environ.get("ENV", "local")

if "staging" not in _db_name and _env != "staging":
    print(
        "❌ Safety check failed.\n"
        "   This script only runs against a staging database.\n"
        "   Set MONGODB_DB to a database name containing 'staging'\n"
        "   or set ENV=staging.\n"
        f"   Current MONGODB_DB={_db_name!r}  ENV={_env!r}"
    )
    sys.exit(1)

print(f"✅ Safety check passed — seeding '{_db_name}' (ENV={_env})")

# ── Seed data ─────────────────────────────────────────────────────────────────

SEED_USER_ID = "user_staging_seed_001"

SEED_TRIPS = [
    {
        "title": "Tokyo Street Food Tour",
        "source_url": "https://www.youtube.com/watch?v=seed_tokyo",
        "platform": "youtube",
        "pins": [
            {"place_name": "Tsukiji Outer Market", "lat": 35.6654, "lng": 139.7706,
             "city": "Tokyo", "country_code": "JP", "order": 0, "category": "food",
             "context_quote": "The best tuna sashimi I've ever had"},
            {"place_name": "Ramen Ichiran Shibuya", "lat": 35.6584, "lng": 139.7014,
             "city": "Tokyo", "country_code": "JP", "order": 1, "category": "food",
             "context_quote": "Solo dining booths — so uniquely Japanese"},
            {"place_name": "Depachika at Isetan Shinjuku", "lat": 35.6896, "lng": 139.7006,
             "city": "Tokyo", "country_code": "JP", "order": 2, "category": "food",
             "context_quote": "Underground food halls are an art form here"},
            {"place_name": "Yanaka Ginza shopping street", "lat": 35.7270, "lng": 139.7700,
             "city": "Tokyo", "country_code": "JP", "order": 3, "category": "attraction",
             "context_quote": "Old Tokyo vibes — cats everywhere"},
        ],
    },
    {
        "title": "Kyoto Temple Hopping",
        "source_url": "https://www.instagram.com/reel/seed_kyoto/",
        "platform": "instagram",
        "pins": [
            {"place_name": "Fushimi Inari Taisha", "lat": 34.9671, "lng": 135.7727,
             "city": "Kyoto", "country_code": "JP", "order": 0, "category": "attraction",
             "context_quote": "10,000 torii gates — go at sunrise"},
            {"place_name": "Kinkaku-ji (Golden Pavilion)", "lat": 35.0394, "lng": 135.7292,
             "city": "Kyoto", "country_code": "JP", "order": 1, "category": "attraction",
             "context_quote": "The reflection on the lake is worth the crowds"},
            {"place_name": "Arashiyama Bamboo Grove", "lat": 35.0170, "lng": 135.6722,
             "city": "Kyoto", "country_code": "JP", "order": 2, "category": "attraction",
             "context_quote": "Magical at dusk when the light goes golden"},
            {"place_name": "Nishiki Market", "lat": 35.0047, "lng": 135.7652,
             "city": "Kyoto", "country_code": "JP", "order": 3, "category": "food",
             "context_quote": "Try the pickled vegetables — incredible variety"},
        ],
    },
    {
        "title": "Lisbon Hidden Gems",
        "source_url": "https://www.tiktok.com/@traveler/video/seed_lisbon",
        "platform": "tiktok",
        "is_public": True,
        "pins": [
            {"place_name": "LX Factory", "lat": 38.7037, "lng": -9.1773,
             "city": "Lisbon", "country_code": "PT", "order": 0, "category": "attraction",
             "context_quote": "Sunday market is incredible — vintage everything"},
            {"place_name": "Time Out Market Lisbon", "lat": 38.7069, "lng": -9.1488,
             "city": "Lisbon", "country_code": "PT", "order": 1, "category": "food",
             "context_quote": "Best pastéis de nata in the whole city"},
            {"place_name": "Miradouro da Graça", "lat": 38.7152, "lng": -9.1333,
             "city": "Lisbon", "country_code": "PT", "order": 2, "category": "viewpoint",
             "context_quote": "Locals come here for sundowners — skip the tourist spots"},
            {"place_name": "Alfama district walking tour", "lat": 38.7139, "lng": -9.1334,
             "city": "Lisbon", "country_code": "PT", "order": 3, "category": "attraction",
             "context_quote": "Get lost in the alleyways — that's the point"},
        ],
    },
]


async def seed():
    import motor.motor_asyncio
    from beanie import init_beanie

    # ── Import models (lightweight import, no FastAPI needed) ──────────────
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "api"))

    from app.models.documents import PinDocument, TripDocument, UserDocument

    # ── Connect ───────────────────────────────────────────────────────────
    mongodb_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB", "reelroutes_staging")

    client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_url)
    await init_beanie(
        database=client[db_name],
        document_models=[UserDocument, TripDocument],
    )
    print(f"📦 Connected to {db_name}")

    # ── Seed user ─────────────────────────────────────────────────────────
    existing_user = await UserDocument.find_one(UserDocument.clerk_id == SEED_USER_ID)
    if not existing_user:
        await UserDocument(
            clerk_id=SEED_USER_ID,
            email="qa-tester@staging.reelroutes.app",
            name="QA Tester",
            avatar_url=None,
        ).insert()
        print("👤 Seed user created")
    else:
        print("👤 Seed user already exists — skipping")

    # ── Seed trips ────────────────────────────────────────────────────────
    for trip_data in SEED_TRIPS:
        existing = await TripDocument.find_one(
            TripDocument.user_id == SEED_USER_ID,
            TripDocument.source_url == trip_data["source_url"],
        )
        if existing:
            print(f"🗺  '{trip_data['title']}' already seeded — skipping")
            continue

        pins = [
            PinDocument(
                place_name=p["place_name"],
                lat=p["lat"],
                lng=p["lng"],
                city=p.get("city"),
                country_code=p.get("country_code"),
                order=p["order"],
                category=p.get("category", "attraction"),
                context_quote=p.get("context_quote", ""),
            )
            for p in trip_data["pins"]
        ]

        trip = TripDocument(
            user_id=SEED_USER_ID,
            title=trip_data["title"],
            source_url=trip_data["source_url"],
            platform=trip_data["platform"],
            pins=pins,
            is_public=trip_data.get("is_public", False),
            created_at=datetime.now(UTC) - timedelta(days=3),
        )
        await trip.insert()
        print(f"✅ '{trip_data['title']}' seeded with {len(pins)} pins")

    print("\n🌱 Staging seed complete!")
    print(f"   Login with Clerk test user and use clerk_id={SEED_USER_ID!r}")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
