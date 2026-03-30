"""
tests/test_models.py

Unit tests for all Beanie document models.
Validates field defaults, enum values, embedded Pin structure,
and index strategy declarations — without a live MongoDB connection.
"""
from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from pymongo import ASCENDING, DESCENDING

from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401 — registers fixture

from app.models.documents import (
    ALL_DOCUMENTS,
    JobDocument,
    JobErrorCode,
    JobStatus,
    JobStep,
    PinDocument,
    Platform,
    TripDocument,
    UserDocument,
)


# ── Platform enum ──────────────────────────────────────────────

class TestPlatformEnum:
    def test_all_expected_platforms_exist(self) -> None:
        expected = {"youtube", "instagram", "tiktok", "facebook", "twitter", "unknown"}
        actual = {p.value for p in Platform}
        assert actual == expected

    def test_platform_is_str_enum(self) -> None:
        assert isinstance(Platform.YOUTUBE, str)
        assert Platform.YOUTUBE == "youtube"

    def test_unknown_is_safe_default(self) -> None:
        assert Platform.UNKNOWN == "unknown"


# ── JobStatus enum ─────────────────────────────────────────────

class TestJobStatusEnum:
    def test_all_statuses_exist(self) -> None:
        values = {s.value for s in JobStatus}
        assert values == {"queued", "processing", "completed", "failed"}

    def test_queued_is_initial_state(self) -> None:
        assert JobStatus.QUEUED == "queued"


# ── JobStep enum ───────────────────────────────────────────────

class TestJobStepEnum:
    def test_exactly_five_steps(self) -> None:
        assert len(list(JobStep)) == 5

    def test_steps_in_pipeline_order(self) -> None:
        steps = list(JobStep)
        assert steps[0] == JobStep.FETCHING_VIDEO
        assert steps[-1] == JobStep.FINALIZING


# ── JobErrorCode enum ──────────────────────────────────────────

class TestJobErrorCodeEnum:
    def test_unknown_error_exists(self) -> None:
        assert JobErrorCode.UNKNOWN_ERROR == "UNKNOWN_ERROR"

    def test_all_expected_codes(self) -> None:
        codes = {c.value for c in JobErrorCode}
        assert "TRANSCRIPT_FAILED" in codes
        assert "NO_LOCATIONS_FOUND" in codes
        assert "VIDEO_UNAVAILABLE" in codes
        assert "RATE_LIMITED" in codes


# ── PinDocument ────────────────────────────────────────────────

class TestPinDocument:
    def _make_pin(self, **overrides) -> PinDocument:
        defaults = dict(
            id="pin-uuid-001",
            order=0,
            place_name="Shibuya Crossing",
            lat=35.6595,
            lng=139.7004,
            confidence=0.95,
        )
        return PinDocument(**{**defaults, **overrides})

    def test_creates_with_required_fields(self) -> None:
        pin = self._make_pin()
        assert pin.place_name == "Shibuya Crossing"
        assert pin.lat == 35.6595
        assert pin.lng == 139.7004

    def test_defaults_manually_added_false(self) -> None:
        pin = self._make_pin()
        assert pin.manually_added is False

    def test_defaults_tags_to_empty_list(self) -> None:
        pin = self._make_pin()
        assert pin.tags == []

    def test_defaults_confidence_to_full(self) -> None:
        pin = PinDocument(
            id="x", order=0, place_name="Test", lat=0.0, lng=0.0
        )
        assert pin.confidence == 1.0

    def test_confidence_clamped_to_0_1(self) -> None:
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            PinDocument(id="x", order=0, place_name="T", lat=0.0, lng=0.0, confidence=1.5)
        with pytest.raises(ValidationError):
            PinDocument(id="x", order=0, place_name="T", lat=0.0, lng=0.0, confidence=-0.1)

    def test_optional_fields_are_none_by_default(self) -> None:
        pin = self._make_pin()
        assert pin.place_id is None
        assert pin.address is None
        assert pin.country_code is None
        assert pin.city is None
        assert pin.context_quote is None
        assert pin.timestamp_hint is None
        assert pin.notes is None

    def test_has_created_and_updated_at(self) -> None:
        pin = self._make_pin()
        assert isinstance(pin.created_at, datetime)
        assert isinstance(pin.updated_at, datetime)
        assert pin.created_at.tzinfo is not None  # timezone-aware

    def test_low_confidence_pin(self) -> None:
        """Confidence < 0.5 should trigger the suggestion UI — valid value."""
        pin = self._make_pin(confidence=0.3)
        assert pin.confidence == 0.3

    def test_manually_added_pin_has_no_context_quote(self) -> None:
        pin = self._make_pin(manually_added=True, context_quote=None)
        assert pin.manually_added is True
        assert pin.context_quote is None


# ── UserDocument ───────────────────────────────────────────────

class TestUserDocument:
    def test_settings_collection_name(self) -> None:
        assert UserDocument.Settings.name == "users"

    def test_index_strategy_declares_unique_clerk_id(self) -> None:
        indexes = UserDocument.Settings.indexes
        clerk_index = next(
            (i for i in indexes if i.document.get("name") == "uq_users_clerk_id"),
            None,
        )
        assert clerk_index is not None, "uq_users_clerk_id index not declared"
        assert clerk_index.document.get("unique") is True

    def test_index_strategy_declares_email_index(self) -> None:
        indexes = UserDocument.Settings.indexes
        names = [i.document.get("name") for i in indexes]
        assert "idx_users_email" in names

    def test_user_document_in_all_documents(self) -> None:
        assert UserDocument in ALL_DOCUMENTS


# ── TripDocument ───────────────────────────────────────────────

class TestTripDocument:
    def test_settings_collection_name(self) -> None:
        assert TripDocument.Settings.name == "trips"

    async def test_defaults_is_shared_false(self, beanie_init) -> None:
        trip = TripDocument(
            title="Tokyo Trip",
            source_url="https://youtube.com/watch?v=abc",
        )
        assert trip.is_shared is False
        assert trip.share_token is None

    async def test_defaults_pins_to_empty_list(self, beanie_init) -> None:
        trip = TripDocument(
            title="Tokyo Trip",
            source_url="https://youtube.com/watch?v=abc",
        )
        assert trip.pins == []

    async def test_defaults_platform_to_unknown(self, beanie_init) -> None:
        trip = TripDocument(
            title="Tokyo Trip",
            source_url="https://youtube.com/watch?v=abc",
        )
        assert trip.platform == Platform.UNKNOWN

    async def test_user_id_nullable_for_guest(self, beanie_init) -> None:
        trip = TripDocument(
            title="Guest Trip",
            source_url="https://youtube.com/watch?v=abc",
            user_id=None,
        )
        assert trip.user_id is None

    async def test_embeds_pin_documents(self, beanie_init) -> None:
        pin = PinDocument(
            id="pin-001",
            order=0,
            place_name="Kyoto",
            lat=35.0116,
            lng=135.7681,
        )
        trip = TripDocument(
            title="Japan Trip",
            source_url="https://youtube.com/watch?v=abc",
            pins=[pin],
        )
        assert len(trip.pins) == 1
        assert trip.pins[0].place_name == "Kyoto"

    def test_index_strategy_user_created_compound(self) -> None:
        """Primary query: all trips for a user, newest first."""
        indexes = TripDocument.Settings.indexes
        user_idx = next(
            (i for i in indexes if i.document.get("name") == "idx_trips_user_created"),
            None,
        )
        assert user_idx is not None
        # pymongo stores compound index keys as an ordered dict e.g. {"user_id": 1, "created_at": -1}
        keys: dict = user_idx.document["key"]
        assert "user_id" in keys
        assert keys["user_id"] == ASCENDING
        assert "created_at" in keys
        assert keys["created_at"] == DESCENDING

    def test_index_strategy_share_token_unique_sparse(self) -> None:
        """Share token index must be sparse (most trips are unshared)."""
        indexes = TripDocument.Settings.indexes
        share_idx = next(
            (i for i in indexes if i.document.get("name") == "uq_trips_share_token"),
            None,
        )
        assert share_idx is not None
        assert share_idx.document.get("sparse") is True
        assert share_idx.document.get("unique") is True

    def test_trip_document_in_all_documents(self) -> None:
        assert TripDocument in ALL_DOCUMENTS


# ── JobDocument ────────────────────────────────────────────────

class TestJobDocument:
    def test_settings_collection_name(self) -> None:
        assert JobDocument.Settings.name == "jobs"

    async def test_defaults_status_queued(self, beanie_init) -> None:
        job = JobDocument(url="https://youtube.com/watch?v=abc")
        assert job.status == JobStatus.QUEUED

    async def test_defaults_progress_zero(self, beanie_init) -> None:
        job = JobDocument(url="https://youtube.com/watch?v=abc")
        assert job.progress == 0

    def test_progress_clamped_0_100(self) -> None:
        from pydantic import ValidationError
        with pytest.raises(ValidationError):
            JobDocument.model_validate({"url": "https://youtube.com/watch?v=abc", "progress": 101})
        with pytest.raises(ValidationError):
            JobDocument.model_validate({"url": "https://youtube.com/watch?v=abc", "progress": -1})

    async def test_user_id_nullable_for_guest(self, beanie_init) -> None:
        job = JobDocument(url="https://youtube.com/watch?v=abc", user_id=None)
        assert job.user_id is None

    async def test_full_lifecycle_fields(self, beanie_init) -> None:
        now = datetime.now(UTC)
        job = JobDocument(
            url="https://youtube.com/watch?v=abc",
            status=JobStatus.COMPLETED,
            progress=100,
            started_at=now,
            completed_at=now,
        )
        assert job.status == JobStatus.COMPLETED
        assert job.progress == 100
        assert job.completed_at == now

    async def test_error_fields(self, beanie_init) -> None:
        job = JobDocument(
            url="https://youtube.com/watch?v=abc",
            status=JobStatus.FAILED,
            error="Transcript failed",
            error_code=JobErrorCode.TRANSCRIPT_FAILED,
        )
        assert job.error_code == JobErrorCode.TRANSCRIPT_FAILED

    def test_index_url_status_for_deduplication(self) -> None:
        indexes = JobDocument.Settings.indexes
        dedup_idx = next(
            (i for i in indexes if i.document.get("name") == "idx_jobs_url_status"),
            None,
        )
        assert dedup_idx is not None

    def test_index_status_created_for_worker_polling(self) -> None:
        indexes = JobDocument.Settings.indexes
        worker_idx = next(
            (i for i in indexes if i.document.get("name") == "idx_jobs_status_created"),
            None,
        )
        assert worker_idx is not None

    def test_job_document_in_all_documents(self) -> None:
        assert JobDocument in ALL_DOCUMENTS


# ── ALL_DOCUMENTS ──────────────────────────────────────────────

class TestAllDocuments:
    def test_contains_exactly_three_collections(self) -> None:
        assert len(ALL_DOCUMENTS) == 3

    def test_contains_all_expected_models(self) -> None:
        assert UserDocument in ALL_DOCUMENTS
        assert TripDocument in ALL_DOCUMENTS
        assert JobDocument in ALL_DOCUMENTS

    def test_all_have_settings_with_name(self) -> None:
        for doc_cls in ALL_DOCUMENTS:
            assert hasattr(doc_cls, "Settings")
            assert hasattr(doc_cls.Settings, "name")
            assert isinstance(doc_cls.Settings.name, str)

    def test_collection_names_are_unique(self) -> None:
        names = [doc_cls.Settings.name for doc_cls in ALL_DOCUMENTS]
        assert len(names) == len(set(names)), "Duplicate collection names found"

    def test_all_have_indexes_declared(self) -> None:
        for doc_cls in ALL_DOCUMENTS:
            assert hasattr(doc_cls.Settings, "indexes")
            assert len(doc_cls.Settings.indexes) > 0, (
                f"{doc_cls.__name__} has no indexes declared"
            )
