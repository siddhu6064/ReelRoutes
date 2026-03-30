"""
app/models/documents.py

Beanie ODM document models for all core MongoDB collections.
These mirror the TypeScript types in @reelroutes/shared exactly.

Collections:
  - users     (clerk_id unique index)
  - trips     (compound: user_id + created_at desc)
  - jobs      (url + status indexes)

Pins are embedded inside Trip documents — no separate collection.
"""
from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


# ── Enums ──────────────────────────────────────────────────────

class Platform(StrEnum):
    YOUTUBE = "youtube"
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    UNKNOWN = "unknown"


class JobStatus(StrEnum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobStep(StrEnum):
    FETCHING_VIDEO = "fetching_video"
    TRANSCRIBING = "transcribing"
    EXTRACTING_LOCATIONS = "extracting_locations"
    GEOCODING = "geocoding"
    FINALIZING = "finalizing"


class JobErrorCode(StrEnum):
    UNSUPPORTED_PLATFORM = "UNSUPPORTED_PLATFORM"
    VIDEO_UNAVAILABLE = "VIDEO_UNAVAILABLE"
    PRIVATE_VIDEO = "PRIVATE_VIDEO"
    TRANSCRIPT_FAILED = "TRANSCRIPT_FAILED"
    NO_LOCATIONS_FOUND = "NO_LOCATIONS_FOUND"
    GEOCODING_FAILED = "GEOCODING_FAILED"
    RATE_LIMITED = "RATE_LIMITED"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


# ── Embedded: Pin ─────────────────────────────────────────────

class PinDocument(BaseModel):
    """
    Embedded inside TripDocument.pins[].
    Not a top-level collection — pins have no independent lifecycle.
    """
    id: str = Field(..., description="Client-generated UUID, stable across edits")
    order: int
    place_name: str
    place_id: str | None = None
    lat: float
    lng: float
    address: str | None = None
    country_code: str | None = None
    city: str | None = None

    # Extraction provenance
    context_quote: str | None = None
    timestamp_hint: float | None = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    manually_added: bool = False

    # User-editable
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ── Document: User ────────────────────────────────────────────

class UserDocument(Document):
    """
    Mirrors a Clerk user into MongoDB for trip ownership queries.
    Synced via Clerk webhooks (user.created, user.updated).
    """
    clerk_id: Annotated[str, Indexed(unique=True)]
    email: str
    name: str
    avatar_url: str | None = None
    google_id: str | None = None
    apple_id: str | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "users"
        indexes = [
            IndexModel([("clerk_id", ASCENDING)], unique=True, name="uq_users_clerk_id"),
            IndexModel([("email", ASCENDING)], name="idx_users_email"),
        ]


# ── Document: Trip ────────────────────────────────────────────

class TripDocument(Document):
    """
    Primary user-facing document. Pins are embedded here.
    userId is null for guest (unauthenticated) trips.
    """
    user_id: str | None = None  # clerk_id reference; null = guest
    title: str
    source_url: str
    platform: Platform = Platform.UNKNOWN
    thumbnail_url: str | None = None
    video_duration: float | None = None
    job_id: str | None = None  # provenance reference

    pins: list[PinDocument] = Field(default_factory=list)

    # Sharing
    share_token: str | None = None
    is_shared: bool = False

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name = "trips"
        indexes = [
            # Primary list query: "all trips for user, newest first"
            IndexModel(
                [("user_id", ASCENDING), ("created_at", DESCENDING)],
                name="idx_trips_user_created",
            ),
            # Share token lookups (sparse — only present on shared trips)
            IndexModel(
                [("share_token", ASCENDING)],
                sparse=True,
                unique=True,
                name="uq_trips_share_token",
            ),
            # Guest-mode cleanup: find old anonymous trips by age
            IndexModel([("created_at", DESCENDING)], name="idx_trips_created_at"),
        ]


# ── Document: Job ─────────────────────────────────────────────

class JobDocument(Document):
    """
    Represents a single video import/processing task.
    Workers update status, progress, and step fields as the
    pipeline advances. Client polls GET /api/jobs/:id every 3s.
    """
    user_id: str | None = None
    url: str
    platform: Platform = Platform.UNKNOWN

    status: JobStatus = JobStatus.QUEUED
    progress: int = Field(default=0, ge=0, le=100)
    current_step: JobStep | None = None
    progress_message: str | None = None

    # Pipeline artifacts — kept for debugging / re-extraction
    transcript: str | None = None
    raw_locations: list[str] = Field(default_factory=list)

    # Error state
    error: str | None = None
    error_code: JobErrorCode | None = None

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    completed_at: datetime | None = None

    class Settings:
        name = "jobs"
        indexes = [
            # Deduplication: don't re-process the same URL if already queued
            IndexModel(
                [("url", ASCENDING), ("status", ASCENDING)],
                name="idx_jobs_url_status",
            ),
            # User's job history
            IndexModel(
                [("user_id", ASCENDING), ("created_at", DESCENDING)],
                name="idx_jobs_user_created",
            ),
            # Worker picks up queued jobs by age
            IndexModel(
                [("status", ASCENDING), ("created_at", ASCENDING)],
                name="idx_jobs_status_created",
            ),
        ]


# ── Convenience list for Beanie.init_beanie() ─────────────────

ALL_DOCUMENTS: list[type[Document]] = [
    UserDocument,
    TripDocument,
    JobDocument,
]
