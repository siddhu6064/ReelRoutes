"""
app/services/job_service.py

Service layer for Job documents. All business logic for the job
lifecycle lives here. Routers and workers call these methods — they
never touch the ODM directly.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.config.logging import get_logger
from app.middleware.error_handler import NotFoundError
from app.models.documents import (
    JobDocument,
    JobErrorCode,
    JobStatus,
    JobStep,
    Platform,
)

logger = get_logger(__name__)


class JobService:
    @staticmethod
    async def create(
        url: str,
        platform: Platform,
        user_id: str | None = None,
    ) -> JobDocument:
        job = JobDocument(
            url=url,
            platform=platform,
            user_id=user_id,
            status=JobStatus.QUEUED,
            progress=0,
        )
        await job.insert()
        logger.info("job_created", job_id=str(job.id), url=url, platform=platform)
        return job

    @staticmethod
    async def get(job_id: str) -> JobDocument:
        job = await JobDocument.get(job_id)
        if not job:
            raise NotFoundError("Job", job_id)
        return job

    @staticmethod
    async def find_existing_queued(url: str) -> JobDocument | None:
        """Deduplication — find a queued job for this URL if one exists."""
        return await JobDocument.find_one(
            JobDocument.url == url,
            JobDocument.status == JobStatus.QUEUED,
        )

    @staticmethod
    async def start(job: JobDocument) -> JobDocument:
        job.status = JobStatus.PROCESSING
        job.started_at = datetime.now(UTC)
        job.current_step = JobStep.FETCHING_VIDEO
        job.progress = 5
        job.progress_message = "Fetching video metadata…"
        await job.save()
        return job

    @staticmethod
    async def update_progress(
        job: JobDocument,
        step: JobStep,
        progress: int,
        message: str,
    ) -> JobDocument:
        job.current_step = step
        job.progress = min(max(progress, 0), 99)  # never 100 until complete
        job.progress_message = message
        await job.save()
        return job

    @staticmethod
    async def complete(
        job: JobDocument,
        transcript: str | None = None,
        raw_locations: list[str] | None = None,
    ) -> JobDocument:
        job.status = JobStatus.COMPLETED
        job.progress = 100
        job.current_step = JobStep.FINALIZING
        job.progress_message = "Your trip is ready!"
        job.completed_at = datetime.now(UTC)
        if transcript:
            job.transcript = transcript
        if raw_locations:
            job.raw_locations = raw_locations
        await job.save()
        logger.info("job_completed", job_id=str(job.id))
        return job

    @staticmethod
    async def fail(
        job: JobDocument,
        error: str,
        error_code: JobErrorCode = JobErrorCode.UNKNOWN_ERROR,
    ) -> JobDocument:
        job.status = JobStatus.FAILED
        job.error = error
        job.error_code = error_code
        job.completed_at = datetime.now(UTC)
        await job.save()
        logger.warning("job_failed", job_id=str(job.id), error_code=error_code, error=error)
        return job

    @staticmethod
    async def list_for_user(
        user_id: str,
        limit: int = 20,
        skip: int = 0,
    ) -> list[JobDocument]:
        return (
            await JobDocument.find(JobDocument.user_id == user_id)
            .sort(-JobDocument.created_at)
            .skip(skip)
            .limit(limit)
            .to_list()
        )
