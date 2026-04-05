"""
tests/integration/test_job_document.py

Integration tests for JobDocument.
Covers the full job lifecycle: queued → processing → completed/failed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.models.documents import (
    JobDocument,
    JobErrorCode,
    JobStatus,
    JobStep,
    Platform,
)
from app.utils.seed import SeedFactory


@pytest.mark.asyncio
class TestJobDocumentInsertAndRead:
    async def test_insert_returns_document_with_id(self) -> None:
        job = await SeedFactory.job()
        assert job.id is not None

    async def test_initial_status_is_queued(self) -> None:
        job = await SeedFactory.job()
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.status == JobStatus.QUEUED

    async def test_initial_progress_is_zero(self) -> None:
        job = await SeedFactory.job()
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.progress == 0

    async def test_all_fields_persisted(self) -> None:
        job = await SeedFactory.job(
            user_id="clerk_test",
            url="https://youtube.com/watch?v=abc123",
            platform=Platform.YOUTUBE,
        )
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.user_id == "clerk_test"
        assert reloaded.url == "https://youtube.com/watch?v=abc123"
        assert reloaded.platform == Platform.YOUTUBE

    async def test_guest_job_null_user_id(self) -> None:
        job = await SeedFactory.job(user_id=None)
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.user_id is None


@pytest.mark.asyncio
class TestJobLifecycle:
    async def test_transition_queued_to_processing(self) -> None:
        job = await SeedFactory.job()
        assert job.status == JobStatus.QUEUED

        job.status = JobStatus.PROCESSING
        job.current_step = JobStep.FETCHING_VIDEO
        job.progress = 5
        job.progress_message = "Fetching video metadata…"
        job.started_at = datetime.now(UTC)
        await job.save()

        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.status == JobStatus.PROCESSING
        assert reloaded.current_step == JobStep.FETCHING_VIDEO
        assert reloaded.started_at is not None

    async def test_progress_advances_through_steps(self) -> None:
        job = await SeedFactory.job(status=JobStatus.PROCESSING)
        steps_and_progress = [
            (JobStep.FETCHING_VIDEO, 10),
            (JobStep.TRANSCRIBING, 30),
            (JobStep.EXTRACTING_LOCATIONS, 55),
            (JobStep.GEOCODING, 75),
            (JobStep.FINALIZING, 95),
        ]
        for step, pct in steps_and_progress:
            job.current_step = step
            job.progress = pct
            await job.save()

        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.progress == 95
        assert reloaded.current_step == JobStep.FINALIZING

    async def test_transition_to_completed(self) -> None:
        job = await SeedFactory.completed_job()
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.status == JobStatus.COMPLETED
        assert reloaded.progress == 100
        assert reloaded.completed_at is not None
        assert reloaded.started_at is not None

    async def test_transition_to_failed(self) -> None:
        job = await SeedFactory.failed_job()
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.status == JobStatus.FAILED
        assert reloaded.error is not None
        assert reloaded.error_code == JobErrorCode.TRANSCRIPT_FAILED

    async def test_completed_job_stores_transcript(self) -> None:
        transcript = "We started in Tokyo at the famous Shibuya Crossing..."
        job = await SeedFactory.completed_job(transcript=transcript)
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.transcript == transcript

    async def test_completed_job_stores_raw_locations(self) -> None:
        locations = ["Shibuya Crossing", "Senso-ji Temple", "Fushimi Inari"]
        job = await SeedFactory.completed_job(raw_locations=locations)
        reloaded = await JobDocument.get(job.id)
        assert reloaded is not None
        assert reloaded.raw_locations == locations

    async def test_all_error_codes_can_be_stored(self) -> None:
        for code in JobErrorCode:
            job = await SeedFactory.failed_job(error_code=code)
            reloaded = await JobDocument.get(job.id)
            assert reloaded is not None
            assert reloaded.error_code == code


@pytest.mark.asyncio
class TestJobQueryPatterns:
    async def test_find_queued_jobs(self) -> None:
        await SeedFactory.job(status=JobStatus.QUEUED)
        await SeedFactory.job(status=JobStatus.QUEUED)
        await SeedFactory.completed_job()

        queued = await JobDocument.find(JobDocument.status == JobStatus.QUEUED).to_list()
        assert len(queued) == 2

    async def test_find_jobs_by_user(self) -> None:
        uid = "clerk_jobquery"
        await SeedFactory.job(user_id=uid)
        await SeedFactory.job(user_id=uid)
        await SeedFactory.job(user_id="clerk_other")

        user_jobs = await JobDocument.find(JobDocument.user_id == uid).to_list()
        assert len(user_jobs) == 2

    async def test_find_processing_jobs(self) -> None:
        await SeedFactory.job(status=JobStatus.PROCESSING, progress=40)
        await SeedFactory.job(status=JobStatus.QUEUED)

        processing = await JobDocument.find(JobDocument.status == JobStatus.PROCESSING).to_list()
        assert len(processing) == 1
        assert processing[0].progress == 40

    async def test_deduplication_query_find_existing_queued_url(self) -> None:
        """Simulate the worker dedup check: don't re-queue an already-queued URL."""
        url = "https://youtube.com/watch?v=dedup_test"
        await SeedFactory.job(url=url, status=JobStatus.QUEUED)

        existing = await JobDocument.find_one(
            JobDocument.url == url,
            JobDocument.status == JobStatus.QUEUED,
        )
        assert existing is not None

    async def test_deduplication_allows_requeue_after_failure(self) -> None:
        """A failed job for a URL should not block re-import of the same URL."""
        url = "https://youtube.com/watch?v=retry_test"
        await SeedFactory.failed_job(url=url)

        # No queued job exists — user can re-import
        existing_queued = await JobDocument.find_one(
            JobDocument.url == url,
            JobDocument.status == JobStatus.QUEUED,
        )
        assert existing_queued is None

    async def test_count_failed_jobs(self) -> None:
        await SeedFactory.failed_job()
        await SeedFactory.failed_job()
        await SeedFactory.completed_job()

        count = await JobDocument.find(JobDocument.status == JobStatus.FAILED).count()
        assert count == 2


@pytest.mark.asyncio
class TestJobDelete:
    async def test_delete_job(self) -> None:
        job = await SeedFactory.job()
        job_id = job.id
        await job.delete()
        found = await JobDocument.get(job_id)
        assert found is None
