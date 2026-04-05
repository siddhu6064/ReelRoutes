"""
app/routers/process.py

POST /api/process — accepts any social URL, detects platform,
creates a Job, enqueues the ARQ task, returns job_id immediately.

The client then connects to ws/jobs/:job_id or polls GET /api/jobs/:job_id.
"""

from __future__ import annotations

import re

from fastapi import APIRouter, Request

from app.middleware.rate_limit import check_rate_limit
from app.models.documents import Platform
from app.routers.schemas import ProcessRequest
from app.services.job_service import JobService

router = APIRouter(prefix="/api", tags=["process"])

PLATFORM_PATTERNS: list[tuple[re.Pattern, Platform]] = [
    (re.compile(r"(youtube\.com|youtu\.be)"), Platform.YOUTUBE),
    (re.compile(r"instagram\.com"), Platform.INSTAGRAM),
    (re.compile(r"tiktok\.com"), Platform.TIKTOK),
    (re.compile(r"(facebook\.com|fb\.watch)"), Platform.FACEBOOK),
    (re.compile(r"(twitter\.com|x\.com)"), Platform.TWITTER),
]


def detect_platform(url: str) -> Platform:
    for pattern, platform in PLATFORM_PATTERNS:
        if pattern.search(url):
            return platform
    return Platform.UNKNOWN


@router.post("/process", summary="Start video processing", status_code=202)
async def process_video(body: ProcessRequest, request: Request) -> dict:
    """
    Accepts a social video URL, detects the platform, deduplicates,
    creates a Job document, enqueues the ARQ worker task, and returns
    the job_id for the client to track progress.
    """
    # Rate limiting
    rate_limit_response = await check_rate_limit(request)
    if rate_limit_response:
        return rate_limit_response  # type: ignore[return-value]

    url = str(body.url).strip()
    platform = detect_platform(url)

    # Deduplication — don't re-queue an already-in-flight import
    existing = await JobService.find_existing_queued(url)
    if existing:
        return {
            "ok": True,
            "data": {
                "jobId": str(existing.id),
                "status": existing.status,
                "deduplicated": True,
            },
        }

    # Create Job document
    job = await JobService.create(
        url=url,
        platform=platform,
        user_id=body.user_id,
    )

    # Track analytics event
    from app.config.analytics import track_import_started

    track_import_started(body.user_id, url, platform.value)

    # Enqueue ARQ task (falls back gracefully if Redis unavailable in local dev)
    try:
        from arq import create_pool
        from arq.connections import RedisSettings

        from app.config.settings import get_settings

        settings = get_settings()
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        await pool.enqueue_job("process_video", str(job.id))
        await pool.aclose()
    except Exception:
        # In local dev without Redis, the job stays in QUEUED state.
        # Run the worker manually: poetry run arq app.workers.job_worker.WorkerSettings
        pass

    return {
        "ok": True,
        "data": {
            "jobId": str(job.id),
            "status": job.status,
            "deduplicated": False,
        },
    }
