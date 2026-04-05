"""
tests/adapters/conftest.py

Shared fixtures for adapter tests.
All tests mock yt-dlp and YouTube Data API — no live network calls.
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock

FIXTURES_DIR = Path(__file__).parent.parent / "fixtures" / "adapter_fixtures"


def load_fixture(name: str) -> dict:
    """Load a JSON fixture by filename (without .json extension)."""
    path = FIXTURES_DIR / f"{name}.json"
    data = json.loads(path.read_text())
    # Strip _comment keys — they're documentation only
    return {k: v for k, v in data.items() if k != "_comment"}


def load_transcript_fixture(name: str) -> list[dict]:
    """Load a transcript JSON fixture (list of segment dicts)."""
    path = FIXTURES_DIR / f"{name}.json"
    segments = json.loads(path.read_text())
    return [s for s in segments if "_comment" not in s]


# ── Shared mock factories ──────────────────────────────────────


def mock_ytdlp_extract(fixture_name: str):
    """
    Returns an async mock that returns the given fixture
    when ytdlp_extract is called.
    """
    fixture = load_fixture(fixture_name)
    return AsyncMock(return_value=fixture)


def mock_youtube_api(fixture_name: str):
    """Mock for YouTubeAdapter._fetch_metadata returning fixture data."""
    fixture = load_fixture(fixture_name)

    metadata = {
        "title": fixture.get("title", ""),
        "description": fixture.get("description", ""),
        "channelTitle": fixture.get("uploader", ""),
        "publishedAt": _ts_to_iso(fixture.get("timestamp")),
        "thumbnails": fixture.get("thumbnails", {}),
        "duration": _seconds_to_iso_duration(fixture.get("duration", 0)),
    }
    return AsyncMock(return_value=metadata)


def _ts_to_iso(ts: int | float | None) -> str | None:
    if ts is None:
        return None
    from datetime import UTC, datetime

    return datetime.fromtimestamp(float(ts), tz=UTC).isoformat()


def _seconds_to_iso_duration(seconds: int | float) -> str:
    """Convert seconds to ISO 8601 duration string e.g. PT1H42M0S."""
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    parts = "PT"
    if h:
        parts += f"{h}H"
    if m:
        parts += f"{m}M"
    parts += f"{sec}S"
    return parts
