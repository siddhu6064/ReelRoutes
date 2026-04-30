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

import uuid
from datetime import UTC, datetime
from enum import StrEnum as Enum
from typing import Annotated, ClassVar

from beanie import Document, Indexed
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

# ── Enums ──────────────────────────────────────────────────────


class Platform(Enum):
    YOUTUBE = "youtube"
    INSTAGRAM = "instagram"
    TIKTOK = "tiktok"
    FACEBOOK = "facebook"
    TWITTER = "twitter"
    UNKNOWN = "unknown"


class JobStatus(Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class JobStep(Enum):
    FETCHING_VIDEO = "fetching_video"
    TRANSCRIBING = "transcribing"
    EXTRACTING_LOCATIONS = "extracting_locations"
    GEOCODING = "geocoding"
    FINALIZING = "finalizing"


class JobErrorCode(Enum):
    UNSUPPORTED_PLATFORM = "UNSUPPORTED_PLATFORM"
    VIDEO_UNAVAILABLE = "VIDEO_UNAVAILABLE"
    PRIVATE_VIDEO = "PRIVATE_VIDEO"
    TRANSCRIPT_FAILED = "TRANSCRIPT_FAILED"
    NO_LOCATIONS_FOUND = "NO_LOCATIONS_FOUND"
    GEOCODING_FAILED = "GEOCODING_FAILED"
    RATE_LIMITED = "RATE_LIMITED"
    UNKNOWN_ERROR = "UNKNOWN_ERROR"


# ── Pin category ──────────────────────────────────────────────


class PinCategory(Enum):
    RESTAURANT = "restaurant"
    LANDMARK = "landmark"
    ACCOMMODATION = "accommodation"
    NATURE = "nature"
    SHOPPING = "shopping"
    TRANSPORT = "transport"
    ENTERTAINMENT = "entertainment"
    OTHER = "other"


# ── Expense models ─────────────────────────────────────────────


class SplitType(Enum):
    EQUAL = "equal"
    EXACT = "exact"
    PERCENTAGE = "percentage"


class ExpenseCategory(Enum):
    ACCOMMODATION = "accommodation"
    FOOD = "food"
    TRANSPORT = "transport"
    ACTIVITIES = "activities"
    SHOPPING = "shopping"
    OTHER = "other"


class ExpenseSplit(BaseModel):
    member_name: str
    member_id: str | None = None
    amount: float = 0.0
    percentage: float | None = None
    settled: bool = False


class TripExpense(BaseModel):
    """
    A single expense. Works in two modes:
    - Solo (split_with=[]): personal budget tracking only
    - Split (split_with has members): tracks who paid and who owes what
    Other people don\'t need a ReelRoutes account — just a name.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    amount: float
    currency: str = "USD"
    category: ExpenseCategory = ExpenseCategory.OTHER
    paid_by_name: str
    paid_by_id: str | None = None
    split_type: SplitType = SplitType.EQUAL
    split_with: list[ExpenseSplit] = Field(default_factory=list)
    notes: str | None = None
    pin_id: str | None = None
    date: datetime = Field(default_factory=lambda: datetime.now(UTC))
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @property
    def is_solo(self) -> bool:
        return len(self.split_with) == 0


# ── Collaborator model ─────────────────────────────────────────


class CollaboratorRole(Enum):
    EDITOR = "editor"
    VIEWER = "viewer"


class TripCollaborator(BaseModel):
    """
    A person invited to collaborate on a trip.
    Pending = invite sent, not yet accepted.
    Active = signed in and accepted.
    Editors can add/edit pins and add expenses.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: str | None = None
    clerk_id: str | None = None
    role: CollaboratorRole = CollaboratorRole.VIEWER
    invite_token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: str = "pending"
    invited_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    joined_at: datetime | None = None


# ── GPS tracking (W18) ───────────────────────────────────────


class LocationPoint(BaseModel):
    """A single recorded GPS location during a live trip."""

    lat: float
    lng: float
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    accuracy_meters: float | None = None  # GPS accuracy radius


# ── Edit history (W15) ────────────────────────────────────────


class EditSnapshot(BaseModel):
    """Snapshot of pins[] state before a mutation — used by POST /undo.
    Stored as a JSON string to avoid Beanie issues with deeply-nested lists."""

    snapshot_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    pins_json: str  # json.dumps([pin.model_dump(mode="json") for pin in trip.pins])


# ── Reservations (W16) ────────────────────────────────────────


class ReservationType(Enum):
    FLIGHT = "flight"
    HOTEL = "hotel"
    ACTIVITY = "activity"
    CAR_RENTAL = "car_rental"
    OTHER = "other"


class ReservationDocument(BaseModel):
    """A parsed travel reservation embedded in a trip."""

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    reservation_type: ReservationType = ReservationType.OTHER
    title: str
    confirmation_number: str | None = None
    flight_number: str | None = None
    check_in: datetime | None = None
    check_out: datetime | None = None
    notes: str | None = None
    raw_email_snippet: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ── Embedded: Pin ─────────────────────────────────────────────


class TripDay(BaseModel):
    """
    One day in a structured itinerary.
    Pins are referenced by id, ordered for the day's visit sequence.
    """

    day_number: int  # 1-indexed
    label: str | None = None  # e.g. "Day 1 — Tokyo"
    pin_ids: list[str] = Field(default_factory=list)
    notes: str | None = None


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

    # Google Places enrichment (Week 2) — stored from Places API response
    rating: float | None = None
    user_ratings_total: int | None = None
    open_now: bool | None = None  # current open/closed status
    opening_hours_text: list[str] = Field(default_factory=list)  # ["Monday: 9 AM – 10 PM", …]
    website: str | None = None
    phone_number: str | None = None

    # City grouping (Week 3) — e.g. "Tokyo, JP"
    city_group: str | None = None

    # Category (Week 7) — auto-classified from Google Places types
    category: PinCategory = PinCategory.OTHER

    # User-editable
    notes: str | None = None
    tags: list[str] = Field(default_factory=list)

    # Visit tracking (W9)
    visited_at: datetime | None = None
    diary_entry: str | None = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # Plan-from-Scratch fields (added in plan-from-scratch feature)
    pin_type: str = "activity"  # "activity" | "food"
    meal: str | None = None  # "breakfast" | "lunch" | "dinner"
    famous_for: str | None = None
    best_time: str | None = None
    local_tip: str | None = None
    opening_hours: str | None = None
    website_url: str | None = None  # renamed from website to avoid collision
    phone: str | None = None
    price_level: int | None = None  # 0–4 (Google Places scale)
    day: int | None = None  # 1-indexed day number in itinerary


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
    push_token: str | None = None  # Expo push token for mobile notifications
    apple_id: str | None = None

    # ── Billing / subscription ────────────────────────────────
    # plan: "free" (default) or "pro" (active Stripe subscription)
    plan: str = "free"
    stripe_customer_id: str | None = None  # cus_... from Stripe
    stripe_subscription_id: str | None = None  # sub_... from Stripe
    # subscription_status mirrors Stripe: active | canceled | past_due | incomplete
    subscription_status: str = "inactive"

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    class Settings:
        name: ClassVar[str] = "users"
        indexes: ClassVar[list] = [
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

    # Structured itinerary (Feature 2)
    itinerary: list[TripDay] = Field(default_factory=list)

    # Expenses — solo tracking + optional splitting
    expenses: list[TripExpense] = Field(default_factory=list)
    expense_currency: str = "USD"  # default currency for trip
    expense_budget: float | None = None  # optional total budget

    # Collaborators — people invited to view or edit this trip
    collaborators: list[TripCollaborator] = Field(default_factory=list)

    # Source video attribution (Feature 1 — deep link)
    video_creator: str | None = None  # e.g. "@kara_and_nate"
    video_channel: str | None = None  # e.g. "Kara and Nate"

    # Sharing
    share_token: str | None = None
    is_shared: bool = False

    # Community feed (W13)
    is_public: bool = False
    view_count: int = 0
    share_count: int = 0

    # Undo history (W15) — last 20 pin-state snapshots
    trip_edit_history: list[EditSnapshot] = Field(default_factory=list)

    # GPS breadcrumb trail (W18) — recorded during active trip
    visited_path: list[LocationPoint] = Field(default_factory=list)

    # Reservations (W16) — parsed from confirmation emails
    reservations: list[ReservationDocument] = Field(default_factory=list)

    # Plan-from-Scratch fields (added in plan-from-scratch feature)
    source: str = "video"  # "video" | "scratch"
    starting_point: str | None = None
    destination_text: str | None = None  # renamed to avoid conflict
    trip_days: int | None = None  # requested number of days
    travel_mode: str | None = None  # "driving" | "walking" | "transit" | "cycling"
    trip_preferences: list[str] = Field(default_factory=list)  # ["food", "history", …]

    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    # ── Semantic embedding (Atlas Vector Search) ───────────────
    # 1536-dim vector from text-embedding-3-small.
    # None until first embed_trip() call completes.
    embedding: list[float] | None = None
    embedding_hash: str | None = None  # SHA-256[:16] of trip text fingerprint

    class Settings:
        name: ClassVar[str] = "trips"
        indexes: ClassVar[list] = [
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
            # TTL: auto-delete guest trips (user_id=null) after 30 days
            # MongoDB TTL indexes delete documents where the indexed field
            # is older than expireAfterSeconds. We index on created_at.
            # Note: only documents where user_id IS null should be deleted —
            # this is handled by a partial filter expression in production
            # via a separate admin script or Atlas trigger. The index here
            # supports the created_at query for the cleanup job.
            IndexModel(
                [("created_at", ASCENDING)],
                name="idx_trips_guest_ttl",
                sparse=True,
            ),
            # Community feed (W13)
            IndexModel(
                [("is_public", ASCENDING), ("view_count", DESCENDING)],
                name="idx_trips_public_views",
            ),
            IndexModel(
                [("is_public", ASCENDING), ("share_count", DESCENDING)],
                name="idx_trips_public_shares",
            ),
            # Invite token lookup (W14)
            IndexModel(
                [("collaborators.invite_token", ASCENDING)],
                sparse=True,
                name="idx_trips_invite_token",
            ),
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

    # ── Extraction results (Task 7 Week 6) ────────────────────
    extracted_places: list[dict] = Field(default_factory=list)
    extraction_model: str | None = None
    extraction_tokens: int = 0
    raw_llm_response: str | None = None
    extracted_at: datetime | None = None

    # ── Geocoding results (Task 4 + 6 Week 7) ─────────────────
    geocoded_places: list[dict] = Field(default_factory=list)
    place_resolution_candidates: dict = Field(default_factory=dict)
    unresolved_places: list[dict] = Field(
        default_factory=list
    )  # surfaced in 'Did we miss anything?'
    geocoded_at: datetime | None = None
    signal_type_used: str | None = None
    geocoding_stats: dict = Field(default_factory=dict)

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    started_at: datetime | None = None
    completed_at: datetime | None = None

    class Settings:
        name: ClassVar[str] = "jobs"
        indexes: ClassVar[list] = [
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
            # TTL: auto-delete completed/failed jobs after 30 days (2_592_000s)
            IndexModel(
                [("completed_at", ASCENDING)],
                expireAfterSeconds=2_592_000,
                sparse=True,
                name="idx_jobs_ttl",
            ),
        ]


# ── Convenience list for Beanie.init_beanie() ─────────────────

ALL_DOCUMENTS: list[type[Document]] = [
    UserDocument,
    TripDocument,
    JobDocument,
]
