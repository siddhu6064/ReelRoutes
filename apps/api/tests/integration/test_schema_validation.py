"""
tests/integration/test_schema_validation.py

Schema validation tests:
  - Required fields enforced by Pydantic before hitting MongoDB
  - Index strategy: unique constraints, sparse indexes
  - ObjectId reference integrity (user_id → clerk_id pattern)
  - Cross-document consistency (trip.user_id matches user.clerk_id)
  - Seed factory: full_scenario produces coherent data graph
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.documents import (
    JobDocument,
    JobStatus,
    PinDocument,
    Platform,
    TripDocument,
    UserDocument,
)
from app.utils.seed import SeedFactory, make_pin


# ── Required field enforcement ─────────────────────────────────

@pytest.mark.asyncio
class TestRequiredFields:
    async def test_user_requires_clerk_id(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            UserDocument(email="a@b.com", name="Test")  # type: ignore[call-arg]

    async def test_user_requires_email(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            UserDocument(clerk_id="clerk_x", name="Test")  # type: ignore[call-arg]

    async def test_user_requires_name(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            UserDocument(clerk_id="clerk_x", email="a@b.com")  # type: ignore[call-arg]

    async def test_trip_requires_title(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            TripDocument(source_url="https://youtube.com/watch?v=abc")  # type: ignore[call-arg]

    async def test_trip_requires_source_url(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            TripDocument(title="My Trip")  # type: ignore[call-arg]

    async def test_job_requires_url(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            JobDocument()  # type: ignore[call-arg]

    async def test_pin_requires_place_name(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            PinDocument(id="x", order=0, lat=35.0, lng=139.0)  # type: ignore[call-arg]

    async def test_pin_requires_lat_lng(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            PinDocument(id="x", order=0, place_name="Tokyo")  # type: ignore[call-arg]

    async def test_pin_requires_id(self) -> None:
        with pytest.raises((ValidationError, TypeError)):
            PinDocument(order=0, place_name="Tokyo", lat=35.0, lng=139.0)  # type: ignore[call-arg]


# ── Field value validation ─────────────────────────────────────

@pytest.mark.asyncio
class TestFieldValueValidation:
    async def test_pin_confidence_must_be_0_to_1(self) -> None:
        with pytest.raises(ValidationError):
            PinDocument(id="x", order=0, place_name="T", lat=0.0, lng=0.0, confidence=1.5)
        with pytest.raises(ValidationError):
            PinDocument(id="x", order=0, place_name="T", lat=0.0, lng=0.0, confidence=-0.1)

    async def test_pin_confidence_boundary_values_accepted(self) -> None:
        p0 = PinDocument(id="a", order=0, place_name="T", lat=0.0, lng=0.0, confidence=0.0)
        p1 = PinDocument(id="b", order=0, place_name="T", lat=0.0, lng=0.0, confidence=1.0)
        assert p0.confidence == 0.0
        assert p1.confidence == 1.0

    async def test_job_progress_must_be_0_to_100(self) -> None:
        with pytest.raises(ValidationError):
            JobDocument.model_validate({"url": "https://x.com", "progress": 101})
        with pytest.raises(ValidationError):
            JobDocument.model_validate({"url": "https://x.com", "progress": -1})

    async def test_job_progress_boundary_values_accepted(self) -> None:
        # These use model_validate to bypass Beanie's collection init check
        j0 = JobDocument.model_validate({"url": "https://x.com", "progress": 0})
        j100 = JobDocument.model_validate({"url": "https://x.com", "progress": 100})
        assert j0.progress == 0
        assert j100.progress == 100

    async def test_platform_enum_rejects_invalid_value(self) -> None:
        with pytest.raises(ValidationError):
            TripDocument.model_validate({
                "title": "T",
                "source_url": "https://x.com",
                "platform": "snapchat",  # not in Platform enum
            })

    async def test_job_status_enum_rejects_invalid_value(self) -> None:
        with pytest.raises(ValidationError):
            JobDocument.model_validate({
                "url": "https://x.com",
                "status": "pending",  # not in JobStatus enum
            })


# ── Index enforcement ──────────────────────────────────────────

@pytest.mark.asyncio
class TestIndexEnforcement:
    async def test_unique_clerk_id_prevents_duplicate_users(self) -> None:
        await SeedFactory.user(clerk_id="clerk_unique_test")
        with pytest.raises(Exception):
            await SeedFactory.user(clerk_id="clerk_unique_test")

    async def test_same_clerk_id_different_emails_rejected(self) -> None:
        await SeedFactory.user(clerk_id="clerk_same", email="first@test.com")
        with pytest.raises(Exception):
            await SeedFactory.user(clerk_id="clerk_same", email="second@test.com")

    async def test_share_token_unique_across_trips(self) -> None:
        token = "unique_share_token_abc"
        await SeedFactory.shared_trip(share_token=token)
        with pytest.raises(Exception):
            await SeedFactory.shared_trip(share_token=token)

    async def test_multiple_trips_without_share_token_allowed(self) -> None:
        """share_token index is SPARSE — null values must not collide."""
        t1 = await SeedFactory.trip()
        t2 = await SeedFactory.trip()
        t3 = await SeedFactory.trip()
        # All three have share_token=None — no unique conflict
        assert t1.share_token is None
        assert t2.share_token is None
        assert t3.share_token is None


# ── Reference integrity ────────────────────────────────────────

@pytest.mark.asyncio
class TestReferenceIntegrity:
    async def test_trip_user_id_matches_user_clerk_id(self) -> None:
        """Trips reference users by clerk_id string (not MongoDB ObjectId)."""
        user = await SeedFactory.user()
        trip = await SeedFactory.trip(user_id=user.clerk_id)

        reloaded_trip = await TripDocument.get(trip.id)
        reloaded_user = await UserDocument.find_one(
            UserDocument.clerk_id == reloaded_trip.user_id
        )
        assert reloaded_user is not None
        assert reloaded_user.clerk_id == user.clerk_id

    async def test_job_user_id_matches_user_clerk_id(self) -> None:
        user = await SeedFactory.user()
        job = await SeedFactory.job(user_id=user.clerk_id)

        reloaded_job = await JobDocument.get(job.id)
        reloaded_user = await UserDocument.find_one(
            UserDocument.clerk_id == reloaded_job.user_id
        )
        assert reloaded_user is not None

    async def test_null_user_id_is_valid_for_guest_documents(self) -> None:
        """Guest documents (user_id=None) are valid — not a referential error."""
        guest_trip = await SeedFactory.guest_trip()
        guest_job = await SeedFactory.job(user_id=None)

        assert guest_trip.user_id is None
        assert guest_job.user_id is None

    async def test_pin_ids_are_unique_within_trip(self) -> None:
        """All pin IDs within a trip must be unique — they are client-generated UUIDs."""
        pins = [make_pin(order=i) for i in range(5)]
        trip = await SeedFactory.trip(pins=pins)

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        pin_ids = [p.id for p in reloaded.pins]
        assert len(pin_ids) == len(set(pin_ids)), "Duplicate pin IDs found in trip"

    async def test_pin_orders_are_sequential_from_zero(self) -> None:
        pins = [make_pin(order=i) for i in range(4)]
        trip = await SeedFactory.trip(pins=pins)

        reloaded = await TripDocument.get(trip.id)
        assert reloaded is not None
        orders = sorted(p.order for p in reloaded.pins)
        assert orders == list(range(4))


# ── Seed factory integrity ─────────────────────────────────────

@pytest.mark.asyncio
class TestSeedFactoryIntegrity:
    async def test_full_scenario_creates_coherent_graph(self) -> None:
        scenario = await SeedFactory.full_scenario()
        user = scenario["user"]
        trips = scenario["trips"]
        jobs = scenario["jobs"]

        # All trips belong to the user
        for trip in trips:
            assert trip.user_id == user.clerk_id

        # All jobs belong to the user
        for job in jobs:
            assert job.user_id == user.clerk_id

    async def test_full_scenario_has_expected_document_counts(self) -> None:
        await SeedFactory.full_scenario()

        users = await UserDocument.find_all().to_list()
        trips = await TripDocument.find_all().to_list()
        jobs = await JobDocument.find_all().to_list()

        assert len(users) == 1
        assert len(trips) == 2
        assert len(jobs) == 2

    async def test_full_scenario_second_trip_is_shared(self) -> None:
        scenario = await SeedFactory.full_scenario()
        trips = scenario["trips"]
        shared = next((t for t in trips if t.is_shared), None)
        assert shared is not None
        assert shared.share_token is not None

    async def test_full_scenario_jobs_have_correct_statuses(self) -> None:
        scenario = await SeedFactory.full_scenario()
        jobs = scenario["jobs"]
        statuses = {j.status for j in jobs}
        assert JobStatus.COMPLETED in statuses
        assert JobStatus.FAILED in statuses

    async def test_multiple_scenarios_are_isolated(self) -> None:
        """Each call to full_scenario creates independent data — no sharing."""
        s1 = await SeedFactory.full_scenario()
        s2 = await SeedFactory.full_scenario()

        assert s1["user"].clerk_id != s2["user"].clerk_id
        for t1 in s1["trips"]:
            for t2 in s2["trips"]:
                assert str(t1.id) != str(t2.id)
