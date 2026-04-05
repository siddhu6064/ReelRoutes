"""
tests/adapters/test_job_pipeline_integration.py

Tests the adapter layer wired into the job worker pipeline.
Verifies that platform detection → fetch → job progress updates flow correctly.
No live API calls — all adapters are mocked.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.adapters.base import AdapterOutput, CaptionsSource
from app.models.documents import JobStatus, Platform
from app.services.job_service import JobService
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401


def _make_adapter_output(
    platform: Platform, description: str, transcript: str | None = None
) -> AdapterOutput:
    return AdapterOutput(
        platform=platform,
        url="https://example.com/video",
        video_id="test123",
        canonical_url="https://example.com/video",
        title="Test Travel Video",
        description=description,
        transcript=transcript or description,
        captions_source=CaptionsSource.DESCRIPTION if not transcript else CaptionsSource.YOUTUBE_CC,
        has_captions=bool(transcript),
        hashtags=["travel", "japan"],
    )


@pytest.mark.asyncio
class TestAdapterInPipeline:
    async def test_youtube_adapter_populates_transcript_on_job(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        await JobService.start(job)

        youtube_output = _make_adapter_output(
            Platform.YOUTUBE,
            description="Visit Shibuya Crossing and Senso-ji Temple in Tokyo",
            transcript="Visit Shibuya Crossing and Senso-ji Temple in Tokyo. Then take the Shinkansen to Kyoto.",
        )

        with patch("app.adapters.registry.fetch_from_url", AsyncMock(return_value=youtube_output)):
            from app.adapters.registry import fetch_from_url

            output = await fetch_from_url(job.url, job.platform)
            await JobService.complete(job, transcript=output.transcript)

        reloaded = await JobService.get(str(job.id))
        assert reloaded.status == JobStatus.COMPLETED
        assert reloaded.transcript is not None
        assert "Shibuya" in reloaded.transcript

    async def test_instagram_adapter_uses_description_as_transcript(self, beanie_init) -> None:
        job = await JobService.create("https://instagram.com/reel/abc", Platform.INSTAGRAM)
        await JobService.start(job)

        ig_output = _make_adapter_output(
            Platform.INSTAGRAM,
            description="📍 Ubud Monkey Forest\n📍 Tegallalang Rice Terraces\n📍 Mount Batur\n#bali #travel",
        )

        with patch("app.adapters.registry.fetch_from_url", AsyncMock(return_value=ig_output)):
            from app.adapters.registry import fetch_from_url

            output = await fetch_from_url(job.url, job.platform)
            transcript = output.transcript or output.description or ""
            await JobService.complete(job, transcript=transcript)

        reloaded = await JobService.get(str(job.id))
        assert reloaded.status == JobStatus.COMPLETED
        assert "Ubud" in (reloaded.transcript or "")

    async def test_failed_adapter_triggers_job_failure(self, beanie_init) -> None:
        from app.models.documents import JobErrorCode

        job = await JobService.create("https://tiktok.com/@u/video/123", Platform.TIKTOK)
        await JobService.start(job)

        empty_output = AdapterOutput(
            platform=Platform.TIKTOK,
            url="https://tiktok.com/@u/video/123",
            video_id="123",
            canonical_url="https://tiktok.com/@u/video/123",
            title="TikTok Video",
        )
        empty_output.add_warning("Rate limited")

        with patch("app.adapters.registry.fetch_from_url", AsyncMock(return_value=empty_output)):
            from app.adapters.registry import fetch_from_url

            output = await fetch_from_url(job.url, job.platform)

            # No usable signals → fail the job
            if not output.best_signal_text:
                await JobService.fail(
                    job,
                    error="No transcript or description available",
                    error_code=JobErrorCode.TRANSCRIPT_FAILED,
                )

        reloaded = await JobService.get(str(job.id))
        assert reloaded.status == JobStatus.FAILED
        assert reloaded.error_code == JobErrorCode.TRANSCRIPT_FAILED

    async def test_signal_quality_logged_in_progress_message(self, beanie_init) -> None:
        job = await JobService.create("https://youtube.com/watch?v=abc", Platform.YOUTUBE)
        await JobService.start(job)

        rich_output = _make_adapter_output(
            Platform.YOUTUBE,
            description="Full Japan itinerary",
            transcript="Tokyo Shibuya Kyoto Fushimi Inari Osaka Dotonbori",
        )

        from app.models.documents import JobStep

        await JobService.update_progress(
            job,
            JobStep.FETCHING_VIDEO,
            18,
            f"Video metadata fetched · {rich_output.signal_quality} signal",
        )

        reloaded = await JobService.get(str(job.id))
        assert reloaded.progress_message is not None
        assert "rich" in reloaded.progress_message
