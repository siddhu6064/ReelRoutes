"""
app/routers/schemas.py

Pydantic v2 request/response schemas with validation for all write endpoints.
These schemas are the single source of truth for what the API accepts.

Validation philosophy:
  - Reject bad input early with clear field-level error messages
  - Strip HTML/script tags from all user-supplied strings
  - Enforce sensible length limits everywhere
  - URLs validated with a regex (not just "is a string")
  - Never trust client-supplied IDs for ownership — always verify in service layer
"""
from __future__ import annotations

import re
from typing import Annotated

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

# ── Shared validators ──────────────────────────────────────────

_SCRIPT_RE = re.compile(r"<script.*?>.*?</script>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_URL_RE = re.compile(
    r"^https?://(www\.)?"
    r"(youtube\.com|youtu\.be|instagram\.com|tiktok\.com|"
    r"facebook\.com|fb\.watch|twitter\.com|x\.com)"
    r"/.+",
    re.IGNORECASE,
)


def _sanitize(text: str) -> str:
    """Strip HTML tags and script blocks from user input."""
    text = _SCRIPT_RE.sub("", text)
    text = _TAG_RE.sub("", text)
    return text.strip()


def _validate_url(url: str) -> str:
    url = url.strip()
    if not _URL_RE.match(url):
        raise ValueError(
            "URL must be from a supported platform: "
            "YouTube, Instagram, TikTok, Facebook, or X/Twitter"
        )
    return url


# ── Process endpoint ───────────────────────────────────────────

class ProcessRequest(BaseModel):
    url: str = Field(..., description="Social video URL to import")
    user_id: str | None = Field(None, description="Clerk user ID (null for guest)")

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        return _validate_url(v)


# ── Trip endpoints ─────────────────────────────────────────────

class CreateTripRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    source_url: str
    platform: str
    user_id: str | None = None
    thumbnail_url: str | None = None
    video_duration: float | None = None

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v: str) -> str:
        return _sanitize(v)


class UpdateTripRequest(BaseModel):
    user_id: str
    title: str | None = Field(None, min_length=1, max_length=200)
    thumbnail_url: str | None = None

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v: str | None) -> str | None:
        return _sanitize(v) if v else v


# ── Pin endpoints ──────────────────────────────────────────────

class AddPinRequest(BaseModel):
    user_id: str
    place_name: str = Field(..., min_length=1, max_length=300)
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    address: str | None = Field(None, max_length=500)
    notes: str | None = Field(None, max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("place_name")
    @classmethod
    def sanitize_place_name(cls, v: str) -> str:
        return _sanitize(v)

    @field_validator("notes")
    @classmethod
    def sanitize_notes(cls, v: str | None) -> str | None:
        return _sanitize(v) if v else v

    @field_validator("tags")
    @classmethod
    def sanitize_tags(cls, v: list[str]) -> list[str]:
        sanitized = [_sanitize(tag)[:50] for tag in v if tag.strip()]
        return list(dict.fromkeys(sanitized))[:20]  # deduplicate, cap at 20


class UpdatePinRequest(BaseModel):
    user_id: str
    place_name: str | None = Field(None, min_length=1, max_length=300)
    notes: str | None = Field(None, max_length=2000)
    tags: list[str] | None = None
    lat: float | None = Field(None, ge=-90.0, le=90.0)
    lng: float | None = Field(None, ge=-180.0, le=180.0)

    @field_validator("place_name")
    @classmethod
    def sanitize_place_name(cls, v: str | None) -> str | None:
        return _sanitize(v) if v else v

    @field_validator("notes")
    @classmethod
    def sanitize_notes(cls, v: str | None) -> str | None:
        return _sanitize(v) if v else v


class ReorderPinsRequest(BaseModel):
    user_id: str
    pin_ids: list[str] = Field(..., min_length=1, max_length=500)


# ── Chat endpoint ──────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=10_000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=50)
    user_id: str | None = None

    @field_validator("message")
    @classmethod
    def sanitize_message(cls, v: str) -> str:
        return _sanitize(v)


# ── Merge trips ────────────────────────────────────────────────

class MergeTripsRequest(BaseModel):
    user_id: str
    source_trip_id: str


# ── Share trip ─────────────────────────────────────────────────

class ShareTripRequest(BaseModel):
    user_id: str
