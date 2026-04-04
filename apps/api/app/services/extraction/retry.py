"""
app/services/extraction/retry.py

Per-platform retry configuration and failure reason classification.

Task 1: Capped retry strategy with platform-specific failure codes
Task 2: Instagram/TikTok rate limit and access error handling
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.config.logging import get_logger
from app.models.documents import Platform

logger = get_logger(__name__)


class FailureReason(StrEnum):
    RATE_LIMITED = "rate_limited"
    PRIVATE_CONTENT = "private_content"
    NO_TRANSCRIPT = "no_transcript"
    NO_CAPTIONS = "no_captions"
    API_ERROR = "api_error"
    TIMEOUT = "timeout"
    UNKNOWN = "unknown"


@dataclass
class PlatformRetryConfig:
    """Per-platform retry tuning."""
    max_retries: int
    base_delay_seconds: float
    # Whether to attempt Whisper when no captions found
    whisper_fallback: bool
    # Whether to retry on rate limit (some platforms rarely recover quickly)
    retry_on_rate_limit: bool


PLATFORM_RETRY_CONFIG: dict[Platform, PlatformRetryConfig] = {
    Platform.YOUTUBE: PlatformRetryConfig(
        max_retries=3,
        base_delay_seconds=1.0,
        whisper_fallback=True,
        retry_on_rate_limit=True,
    ),
    Platform.INSTAGRAM: PlatformRetryConfig(
        max_retries=2,           # Instagram rate limits recover slowly
        base_delay_seconds=3.0,
        whisper_fallback=True,
        retry_on_rate_limit=False,  # Don't hammer IG on 429
    ),
    Platform.TIKTOK: PlatformRetryConfig(
        max_retries=2,
        base_delay_seconds=3.0,
        whisper_fallback=True,
        retry_on_rate_limit=False,
    ),
    Platform.FACEBOOK: PlatformRetryConfig(
        max_retries=2,
        base_delay_seconds=2.0,
        whisper_fallback=True,
        retry_on_rate_limit=True,
    ),
    Platform.TWITTER: PlatformRetryConfig(
        max_retries=2,
        base_delay_seconds=2.0,
        whisper_fallback=False,  # Twitter videos rarely need Whisper
        retry_on_rate_limit=False,
    ),
    Platform.UNKNOWN: PlatformRetryConfig(
        max_retries=2,
        base_delay_seconds=2.0,
        whisper_fallback=True,
        retry_on_rate_limit=True,
    ),
}


def classify_adapter_failure(warning: str, platform: Platform) -> FailureReason:
    """
    Map an adapter warning string to a structured FailureReason.
    Used for analytics and deciding whether to retry.
    """
    w = warning.lower()
    if "rate" in w or "429" in w or "too many" in w:
        reason = FailureReason.RATE_LIMITED
    elif "private" in w or "login" in w or "protected" in w:
        reason = FailureReason.PRIVATE_CONTENT
    elif "transcript" in w or "caption" in w or "no cc" in w:
        reason = FailureReason.NO_CAPTIONS
    elif "timeout" in w:
        reason = FailureReason.TIMEOUT
    elif "error" in w or "failed" in w:
        reason = FailureReason.API_ERROR
    else:
        reason = FailureReason.UNKNOWN

    logger.info(
        "adapter_failure_classified",
        platform=platform,
        reason=reason,
        warning=warning[:120],
    )
    return reason


def should_use_whisper_fallback(
    platform: Platform,
    has_transcript: bool,
    warnings: list[str],
) -> bool:
    """
    Task 2 — decide whether to trigger Whisper for this platform.
    Returns True only when:
      - The platform config allows it
      - No transcript was obtained from the adapter
      - The failure isn't due to private/login-required content
        (Whisper would also fail on private content)
    """
    config = PLATFORM_RETRY_CONFIG.get(platform, PLATFORM_RETRY_CONFIG[Platform.UNKNOWN])
    if not config.whisper_fallback:
        return False
    if has_transcript:
        return False

    # Don't attempt Whisper if content is private
    for w in warnings:
        reason = classify_adapter_failure(w, platform)
        if reason == FailureReason.PRIVATE_CONTENT:
            logger.info("whisper_skipped_private_content", platform=platform)
            return False

    return True


def get_retry_config(platform: Platform) -> PlatformRetryConfig:
    return PLATFORM_RETRY_CONFIG.get(platform, PLATFORM_RETRY_CONFIG[Platform.UNKNOWN])
