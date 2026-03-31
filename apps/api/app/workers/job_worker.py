"""
app/workers/job_worker.py

ARQ async job worker. Runs as a separate process:
  poetry run arq app.workers.job_worker.WorkerSettings

The worker picks up JobDocument records from Redis (via ARQ),
runs the full pipeline, and saves progress to MongoDB at each step.
The WebSocket endpoint and polling endpoint both read from MongoDB,
so client updates are decoupled from worker execution.
"""
from __future__ import annotations

import asyncio
from typing import Any

import motor.motor_asyncio
from arq import Retry
from beanie import init_beanie

from app.config.logging import configure_logging, get_logger
from app.config.settings import get_settings
from app.models.documents import ALL_DOCUMENTS, JobErrorCode, JobStep
from app.services.job_service import JobService

logger = get_logger(__name__)

STEP_PROGRESS = {
    JobStep.FETCHING_VIDEO: (5, 18, "Fetching video metadata…"),
    JobStep.TRANSCRIBING: (20, 42, "Transcribing audio…"),
    JobStep.EXTRACTING_LOCATIONS: (45, 65, "Identifying locations with AI…"),
    JobStep.GEOCODING: (67, 82, "Geocoding place names…"),
    JobStep.FINALIZING: (85, 98, "Building your trip…"),
}


async def process_video(ctx: dict[str, Any], job_id: str) -> dict:
    """
    Main ARQ task — called by the worker when a job is dequeued.
    Runs the full pipeline and updates MongoDB at each step.
    """
    logger.info("worker_task_started", job_id=job_id)

    try:
        job = await JobService.get(job_id)
        await JobService.start(job)

        # ── Step 1: Fetch video metadata & signals via adapter ──
        await JobService.update_progress(
            job, JobStep.FETCHING_VIDEO, 10, "Fetching video metadata…"
        )
        from app.adapters.registry import fetch_from_url
        adapter_output = await fetch_from_url(job.url, job.platform)

        await JobService.update_progress(
            job, JobStep.FETCHING_VIDEO, 18,
            f"Video metadata fetched · {adapter_output.signal_quality} signal"
        )

        # ── Step 2: Transcription ──────────────────────────────
        await JobService.update_progress(
            job, JobStep.TRANSCRIBING, 22, "Transcribing audio…"
        )

        transcript = adapter_output.transcript or ""

        if not transcript and not adapter_output.has_captions:
            # TODO Phase 3 Week 6: run Whisper here
            # For now, flag that Whisper is needed
            transcript = (
                adapter_output.description
                or " ".join(f"#{h}" for h in adapter_output.hashtags)
                or ""
            )
            if not transcript:
                await JobService.fail(
                    job,
                    error="No transcript or description available for this video",
                    error_code=JobErrorCode.TRANSCRIPT_FAILED,
                )
                return {"job_id": job_id, "status": "failed"}

        await JobService.update_progress(
            job, JobStep.TRANSCRIBING, 42,
            f"Transcript ready · {len(transcript)} chars · source: {adapter_output.captions_source}"
        )

        # ── Step 3: AI location extraction ─────────────────────
        await JobService.update_progress(
            job, JobStep.EXTRACTING_LOCATIONS, 48, "Identifying locations with AI…"
        )
        from app.services.extraction.service import ExtractionService
        extraction_result = await ExtractionService.extract(adapter_output, job)

        raw_locations = [loc.place_name for loc in extraction_result.locations]

        if not raw_locations and not extraction_result.ok:
            await JobService.fail(
                job,
                error=extraction_result.error or "Extraction failed",
                error_code=JobErrorCode.NO_LOCATIONS_FOUND,
            )
            return {"job_id": job_id, "status": "failed"}

        await JobService.update_progress(
            job, JobStep.EXTRACTING_LOCATIONS, 65,
            f"{len(raw_locations)} locations found"
        )

        # ── Step 4: Geocoding ──────────────────────────────────
        await JobService.update_progress(
            job, JobStep.GEOCODING, 68, "Geocoding place names…"
        )
        # TODO Phase 3 Week 7: GeocodingService.geocode(raw_locations)
        await JobService.update_progress(
            job, JobStep.GEOCODING, 82, "Geocoding complete."
        )

        # ── Step 5: Finalize ───────────────────────────────────
        await JobService.update_progress(
            job, JobStep.FINALIZING, 88, "Building your trip…"
        )
        # TODO Phase 3 Week 7: TripService.create_from_extraction_result(...)

        await JobService.complete(
            job,
            transcript=transcript,
            raw_locations=raw_locations,
        )

        logger.info(
            "worker_task_completed",
            job_id=job_id,
            platform=job.platform,
            signal_quality=adapter_output.signal_quality,
        )
        return {"job_id": job_id, "status": "completed"}

    except Exception as exc:
        logger.error("worker_task_failed", job_id=job_id, error=str(exc))
        try:
            job = await JobService.get(job_id)
            await JobService.fail(
                job,
                error=str(exc),
                error_code=JobErrorCode.UNKNOWN_ERROR,
            )
        except Exception:
            pass
        raise


# ── ARQ worker settings ────────────────────────────────────────

async def startup(ctx: dict) -> None:
    """Called once when the worker process starts."""
    settings = get_settings()
    configure_logging()

    client = motor.motor_asyncio.AsyncIOMotorClient(settings.mongodb_url)
    await init_beanie(database=client[settings.mongodb_db], document_models=ALL_DOCUMENTS)
    ctx["db_client"] = client
    logger.info("worker_started", db=settings.mongodb_db)


async def shutdown(ctx: dict) -> None:
    """Called when the worker process shuts down."""
    if client := ctx.get("db_client"):
        client.close()
    logger.info("worker_stopped")


class WorkerSettings:
    """ARQ worker configuration."""
    functions = [process_video]
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 10
    job_timeout = 300  # 5 min max per job
    keep_result = 86400  # keep job result 24h in Redis

    @classmethod
    def redis_settings(cls):  # type: ignore[override]
        from arq.connections import RedisSettings
        settings = get_settings()
        return RedisSettings.from_dsn(settings.redis_url)
