"""
tests/conftest.py

Shared pytest fixtures available to all test modules.

Key fixtures:
  - settings_override   — patches env to "test" before any test
  - mock_db             — mongomock-motor in-memory MongoDB
  - client              — AsyncClient wired to the FastAPI app
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

# Set test env BEFORE importing app modules so settings load correctly
os.environ.setdefault("ENV", "test")
os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
os.environ.setdefault("MONGODB_DB", "reelroutes_test")
os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_dummy")
# Fake key — non-empty so service uses GPT-4o path (mocked in tests, never hits OpenAI)
os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake-key-for-tests")
# Fake Places key — non-empty so geocoder uses real path (mocked in tests, never hits Google)
os.environ.setdefault("GOOGLE_PLACES_API_KEY", "fake-places-key-for-tests")

from app.config.settings import get_settings
from app.main import create_app

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator


# ── Settings ───────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def settings_override() -> None:
    """Ensure settings cache is cleared between tests."""
    get_settings.cache_clear()
    yield  # type: ignore[misc]
    get_settings.cache_clear()


# ── Database mock ──────────────────────────────────────────────


@pytest.fixture
def mock_db_ping() -> AsyncMock:
    """Mock a successful MongoDB ping command."""
    ping = AsyncMock(return_value={"ok": 1.0})
    return ping


@pytest.fixture
def mock_healthy_db(mock_db_ping: AsyncMock) -> MagicMock:
    """Returns a mock Motor database that responds to ping."""
    db = MagicMock()
    db.command = mock_db_ping
    return db


@pytest.fixture
def mock_unhealthy_db() -> MagicMock:
    """Returns a mock Motor database whose ping raises a connection error."""
    db = MagicMock()
    db.command = AsyncMock(side_effect=ConnectionError("Connection refused"))
    return db


# ── HTTP client ────────────────────────────────────────────────


@pytest_asyncio.fixture
async def client(mock_healthy_db: MagicMock) -> AsyncGenerator[AsyncClient, None]:
    """
    AsyncClient for the FastAPI app.
    MongoDB is mocked — no real connection needed for unit tests.
    Integration tests that need real MongoDB use a separate fixture.
    """
    app = create_app()

    with (
        patch("app.config.database.connect_db", new_callable=AsyncMock),
        patch("app.config.database.disconnect_db", new_callable=AsyncMock),
        patch("app.config.database.get_db", return_value=mock_healthy_db),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as ac:
            yield ac


@pytest_asyncio.fixture
async def client_unhealthy_db(mock_unhealthy_db: MagicMock) -> AsyncGenerator[AsyncClient, None]:
    """Client where the database ping fails — used to test degraded health."""
    app = create_app()

    with (
        patch("app.config.database.connect_db", new_callable=AsyncMock),
        patch("app.config.database.disconnect_db", new_callable=AsyncMock),
        patch("app.config.database.get_db", return_value=mock_unhealthy_db),
    ):
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as ac:
            yield ac
