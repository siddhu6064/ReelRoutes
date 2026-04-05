"""
app/utils/seed.py

Seed data factories for local development and integration tests.

Usage in tests:
    from app.utils.seed import SeedFactory
    user = await SeedFactory.user()
    trip = await SeedFactory.trip(user_id=user.clerk_id)
    job  = await SeedFactory.job(user_id=user.clerk_id)

Usage for local dev seeding:
    poetry run python -m app.utils.seed

All factories accept keyword overrides — only provide what you need to vary.
"""

from __future__ import annotations

import asyncio
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from app.models.documents import (
    JobDocument,
    JobStatus,
    JobStep,
    PinDocument,
    Platform,
    TripDocument,
    UserDocument,
)

# ── Pin factory ────────────────────────────────────────────────

SAMPLE_PLACES = [
    {
        "place_name": "Shibuya Crossing",
        "place_id": "ChIJAQS2-TB9GGARsZnKeJiMRYU",
        "lat": 35.6595,
        "lng": 139.7004,
        "address": "2 Chome-2-1 Dogenzaka, Shibuya City, Tokyo, Japan",
        "country_code": "JP",
        "city": "Tokyo",
        "context_quote": "We started our day at the famous Shibuya Crossing",
    },
    {
        "place_name": "Senso-ji Temple",
        "place_id": "ChIJ8T1GpMGOGGAR6RIQaAn3bJc",
        "lat": 35.7148,
        "lng": 139.7967,
        "address": "2 Chome-3-1 Asakusa, Taito City, Tokyo, Japan",
        "country_code": "JP",
        "city": "Tokyo",
        "context_quote": "The oldest temple in Tokyo, Senso-ji is absolutely breathtaking",
    },
    {
        "place_name": "Fushimi Inari Taisha",
        "place_id": "ChIJsWoKZy_8AGARqkTQNbCjkE4",
        "lat": 34.9672,
        "lng": 135.7727,
        "address": "68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto, Japan",
        "country_code": "JP",
        "city": "Kyoto",
        "context_quote": "Ten thousand torii gates — I could have walked here all day",
    },
    {
        "place_name": "Arashiyama Bamboo Grove",
        "place_id": "ChIJeaIg0d8JAWARf_kxGhUkEpI",
        "lat": 35.0170,
        "lng": 135.6727,
        "address": "Sagaogurayama Tabuchiyamacho, Ukyo Ward, Kyoto, Japan",
        "country_code": "JP",
        "city": "Kyoto",
        "context_quote": "The bamboo grove at Arashiyama is surreal at sunrise",
    },
    {
        "place_name": "Dotonbori",
        "place_id": "ChIJd8KL4dznAGAR5Cj4ULMI4Fo",
        "lat": 34.6687,
        "lng": 135.5013,
        "address": "Dotonbori, Chuo Ward, Osaka, Japan",
        "country_code": "JP",
        "city": "Osaka",
        "context_quote": "Osaka's food scene is incredible — try everything at Dotonbori",
    },
]


def make_pin(order: int = 0, **overrides: Any) -> PinDocument:
    """Create a PinDocument without saving — used for embedding in trips."""
    sample = SAMPLE_PLACES[order % len(SAMPLE_PLACES)]
    return PinDocument(
        id=str(uuid.uuid4()),
        order=order,
        place_name=overrides.pop("place_name", sample["place_name"]),
        place_id=overrides.pop("place_id", sample["place_id"]),
        lat=overrides.pop("lat", sample["lat"]),
        lng=overrides.pop("lng", sample["lng"]),
        address=overrides.pop("address", sample["address"]),
        country_code=overrides.pop("country_code", sample["country_code"]),
        city=overrides.pop("city", sample["city"]),
        context_quote=overrides.pop("context_quote", sample["context_quote"]),
        timestamp_hint=overrides.pop("timestamp_hint", float(order * 60 + 30)),
        confidence=overrides.pop("confidence", 0.92),
        manually_added=overrides.pop("manually_added", False),
        tags=overrides.pop("tags", []),
        **overrides,
    )


def make_pins(count: int = 3) -> list[PinDocument]:
    """Create a list of PinDocuments with sequential ordering."""
    return [make_pin(order=i) for i in range(count)]


# ── SeedFactory ────────────────────────────────────────────────


class SeedFactory:
    """
    Async factory methods that insert documents into the active Beanie database.
    Requires Beanie to be initialised before calling any method.
    """

    @staticmethod
    async def user(**overrides: Any) -> UserDocument:
        """Insert and return a UserDocument."""
        uid = secrets.token_hex(8)
        doc = UserDocument(
            clerk_id=overrides.pop("clerk_id", f"clerk_{uid}"),
            email=overrides.pop("email", f"user_{uid}@example.com"),
            name=overrides.pop("name", f"Test User {uid[:6]}"),
            avatar_url=overrides.pop("avatar_url", None),
            google_id=overrides.pop("google_id", None),
            apple_id=overrides.pop("apple_id", None),
            **overrides,
        )
        await doc.insert()
        return doc

    @staticmethod
    async def trip(
        user_id: str | None = None,
        pin_count: int = 3,
        **overrides: Any,
    ) -> TripDocument:
        """Insert and return a TripDocument with embedded pins."""
        uid = secrets.token_hex(6)
        pins = overrides.pop("pins", make_pins(pin_count))
        doc = TripDocument(
            user_id=user_id,
            title=overrides.pop("title", f"Japan Adventure {uid}"),
            source_url=overrides.pop(
                "source_url",
                f"https://www.youtube.com/watch?v={uid}",
            ),
            platform=overrides.pop("platform", Platform.YOUTUBE),
            thumbnail_url=overrides.pop(
                "thumbnail_url",
                f"https://img.youtube.com/vi/{uid}/maxresdefault.jpg",
            ),
            video_duration=overrides.pop("video_duration", 1847.0),
            pins=pins,
            **overrides,
        )
        await doc.insert()
        return doc

    @staticmethod
    async def job(
        user_id: str | None = None,
        **overrides: Any,
    ) -> JobDocument:
        """Insert and return a JobDocument in queued state."""
        uid = secrets.token_hex(6)
        doc = JobDocument(
            user_id=user_id,
            url=overrides.pop(
                "url",
                f"https://www.youtube.com/watch?v={uid}",
            ),
            platform=overrides.pop("platform", Platform.YOUTUBE),
            status=overrides.pop("status", JobStatus.QUEUED),
            progress=overrides.pop("progress", 0),
            **overrides,
        )
        await doc.insert()
        return doc

    @staticmethod
    async def completed_job(user_id: str | None = None, **overrides: Any) -> JobDocument:
        """Insert a completed job with all pipeline fields populated."""
        now = datetime.now(UTC)
        return await SeedFactory.job(
            user_id=user_id,
            status=overrides.pop("status", JobStatus.COMPLETED),
            progress=overrides.pop("progress", 100),
            current_step=overrides.pop("current_step", JobStep.FINALIZING),
            progress_message=overrides.pop("progress_message", "Trip created!"),
            transcript=overrides.pop(
                "transcript",
                "We started in Tokyo at the Shibuya Crossing...",
            ),
            raw_locations=overrides.pop(
                "raw_locations",
                ["Shibuya Crossing", "Senso-ji Temple"],
            ),
            started_at=overrides.pop("started_at", now - timedelta(seconds=45)),
            completed_at=overrides.pop("completed_at", now),
            **overrides,
        )

    @staticmethod
    async def failed_job(user_id: str | None = None, **overrides: Any) -> JobDocument:
        """Insert a failed job with error details."""
        from app.models.documents import JobErrorCode

        return await SeedFactory.job(
            user_id=user_id,
            status=JobStatus.FAILED,
            progress=20,
            error="Could not transcribe audio: no speech detected",
            error_code=overrides.pop("error_code", JobErrorCode.TRANSCRIPT_FAILED),
            **overrides,
        )

    @staticmethod
    async def shared_trip(user_id: str | None = None, **overrides: Any) -> TripDocument:
        """Insert a trip with a share token set."""
        return await SeedFactory.trip(
            user_id=user_id,
            share_token=overrides.pop("share_token", secrets.token_urlsafe(16)),
            is_shared=True,
            **overrides,
        )

    @staticmethod
    async def guest_trip(**overrides: Any) -> TripDocument:
        """Insert a trip with no user_id (guest/anonymous)."""
        return await SeedFactory.trip(user_id=None, **overrides)

    @staticmethod
    async def full_scenario() -> dict:
        """
        Insert a complete realistic scenario:
          1 user → 2 trips → 1 completed job → 1 failed job

        Returns a dict with all created documents for test assertions.
        """
        user = await SeedFactory.user(name="Yuki Tanaka", email="yuki@example.com")

        trip_a = await SeedFactory.trip(
            user_id=user.clerk_id,
            title="Japan 2024 — Tokyo & Kyoto",
            pin_count=5,
        )
        trip_b = await SeedFactory.shared_trip(
            user_id=user.clerk_id,
            title="Osaka Food Tour",
            pin_count=2,
        )

        completed = await SeedFactory.completed_job(user_id=user.clerk_id)
        failed = await SeedFactory.failed_job(user_id=user.clerk_id)

        return {
            "user": user,
            "trips": [trip_a, trip_b],
            "jobs": [completed, failed],
        }


# ── Local dev seeding script ───────────────────────────────────


async def seed_local_db() -> None:
    """
    Seed a local MongoDB database with realistic dev data.
    Run with: poetry run python -m app.utils.seed
    """
    import motor.motor_asyncio
    from beanie import init_beanie

    from app.config.settings import get_settings
    from app.models.documents import ALL_DOCUMENTS

    settings = get_settings()
    client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
    await init_beanie(database=client[settings.mongodb_db], document_models=ALL_DOCUMENTS)

    print(f"Seeding {settings.mongodb_db}...")

    # Create 3 independent user scenarios
    for _i in range(3):
        scenario = await SeedFactory.full_scenario()
        user = scenario["user"]
        trips = scenario["trips"]
        jobs = scenario["jobs"]
        print(f"  Created user {user.email}: " f"{len(trips)} trips, {len(jobs)} jobs")

    # One guest trip
    await SeedFactory.guest_trip(title="Anonymous Bali Trip")
    print("  Created 1 guest trip")

    print("✓ Seeding complete.")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed_local_db())
