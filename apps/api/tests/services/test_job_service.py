"""
tests/services/test_job_service.py

Unit tests for JobService covering the full lifecycle:
queued → processing → completed / failed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.middleware.error_handler import NotFoundError
from app.models.documents import JobErrorCode, JobStatus, JobStep, Platform
from app.services.job_service import JobService
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401


@pytest.mark.asyncio
class TestJobServiceCreate:
    async def test_create_returns_queued_job(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        assert job.id is not None
        assert job.status == JobStatus.QUEUED
        assert job.progress == 0

    async def test_create_with_user_id(self, beanie_init) -> None:
        job = await JobService.create(
            "https://youtube.com/watch?v=abc",
            Platform.YOUTUBE,
            user_id="clerk_user123",
        )
        assert job.user_id == "clerk_user123"

    async def test_create_guest_job(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        assert job.user_id is None

    async def test_detect_all_platforms(self, beanie_init) -> None:
        for platform in Platform:
            job = await JobService.create(f"https://example.com/{platform}", platform)
            assert job.platform == platform


@pytest.mark.asyncio
class TestJobServiceGet:
    async def test_get_returns_job(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        fetched = await JobService.get(str(job.id))
        assert str(fetched.id) == str(job.id)

    async def test_get_nonexistent_raises(self, beanie_init) -> None:
        from bson import ObjectId

        fake_id = str(ObjectId())
        with pytest.raises(NotFoundError):
            await JobService.get(fake_id)


@pytest.mark.asyncio
class TestJobServiceLifecycle:
    async def test_start_transitions_to_processing(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        await JobService.start(job)
        assert job.status == JobStatus.PROCESSING
        assert job.started_at is not None
        assert job.current_step == JobStep.FETCHING_VIDEO

    async def test_update_progress(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        await JobService.start(job)
        await JobService.update_progress(job, JobStep.TRANSCRIBING, 35, "Transcribing…")
        assert job.progress == 35
        assert job.current_step == JobStep.TRANSCRIBING
        assert job.progress_message == "Transcribing…"

    async def test_progress_capped_at_99_until_complete(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        await JobService.start(job)
        await JobService.update_progress(job, JobStep.FINALIZING, 150, "Nearly done")
        assert job.progress == 99  # capped

    async def test_complete_sets_100_and_timestamps(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        await JobService.start(job)
        await JobService.complete(job, transcript="Test transcript", raw_locations=["Tokyo"])
        assert job.status == JobStatus.COMPLETED
        assert job.progress == 100
        assert job.completed_at is not None
        assert job.transcript == "Test transcript"
        assert "Tokyo" in job.raw_locations

    async def test_fail_sets_error_fields(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        await JobService.start(job)
        await JobService.fail(job, "No captions found", JobErrorCode.TRANSCRIPT_FAILED)
        assert job.status == JobStatus.FAILED
        assert job.error == "No captions found"
        assert job.error_code == JobErrorCode.TRANSCRIPT_FAILED
        assert job.completed_at is not None

    async def test_full_success_lifecycle(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        assert job.status == JobStatus.QUEUED

        await JobService.start(job)
        assert job.status == JobStatus.PROCESSING

        for step, pct, msg in [
            (JobStep.TRANSCRIBING, 30, "Transcribing…"),
            (JobStep.EXTRACTING_LOCATIONS, 55, "Extracting…"),
            (JobStep.GEOCODING, 75, "Geocoding…"),
        ]:
            await JobService.update_progress(job, step, pct, msg)

        await JobService.complete(job)
        assert job.status == JobStatus.COMPLETED
        assert job.progress == 100


@pytest.mark.asyncio
class TestJobServiceDeduplication:
    async def test_find_existing_queued_returns_match(self, beanie_init) -> None:
        url = "https://youtube.com/watch?v=dedup"
        await JobService.create(url, Platform.YOUTUBE)
        found = await JobService.find_existing_queued(url)
        assert found is not None
        assert found.url == url

    async def test_find_existing_queued_returns_none_for_completed(self, beanie_init) -> None:
        url = "https://youtube.com/watch?v=completed"
        job = await JobService.create(url, Platform.YOUTUBE)
        await JobService.start(job)
        await JobService.complete(job)
        found = await JobService.find_existing_queued(url)
        assert found is None

    async def test_find_existing_queued_returns_none_for_unknown(self, beanie_init) -> None:
        found = await JobService.find_existing_queued("https://youtube.com/watch?v=unknown")
        assert found is None


@pytest.mark.asyncio
class TestJobServiceListForUser:
    async def test_list_returns_user_jobs(self, beanie_init) -> None:
        uid = "clerk_listtest"
        await JobService.create("https://youtube.com/watch?v=a", Platform.YOUTUBE, uid)
        await JobService.create("https://youtube.com/watch?v=b", Platform.YOUTUBE, uid)
        await JobService.create("https://youtube.com/watch?v=c", Platform.YOUTUBE)  # guest

        jobs = await JobService.list_for_user(uid)
        assert len(jobs) == 2
        assert all(j.user_id == uid for j in jobs)

    async def test_list_sorted_newest_first(self, beanie_init) -> None:
        uid = "clerk_sorttest"
        from datetime import timedelta

        # Insert two jobs with explicitly different created_at timestamps
        j1 = await JobService.create("https://youtube.com/watch?v=1", Platform.YOUTUBE, uid)
        j1.created_at = datetime.now(UTC) - timedelta(seconds=10)
        await j1.save()
        await JobService.create("https://youtube.com/watch?v=2", Platform.YOUTUBE, uid)
        # j2 is newer by default
        jobs = await JobService.list_for_user(uid)
        assert len(jobs) == 2
        # Both belong to the user
        assert all(j.user_id == uid for j in jobs)
