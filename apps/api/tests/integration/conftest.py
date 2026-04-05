"""
tests/integration/conftest.py

Fixtures shared across all integration tests.
Uses mongomock-motor for an in-process MongoDB that's fast and
deterministic — no real MongoDB required for the test suite.

The `db` fixture re-initialises Beanie before every test so each
test gets a clean, empty database. This is the correct approach:
faster than spawning a real MongoDB, and avoids test-order coupling.
"""

from __future__ import annotations

import mongomock_motor
import pytest_asyncio
from beanie import init_beanie

from app.models.documents import ALL_DOCUMENTS


@pytest_asyncio.fixture(autouse=True)
async def db():
    """
    Fresh in-memory MongoDB for every integration test.

    autouse=True means every test in tests/integration/ gets this
    automatically — no need to declare it on each test function.
    """
    client = mongomock_motor.AsyncMongoMockClient()
    database = client["reelroutes_integration_test"]
    await init_beanie(database=database, document_models=ALL_DOCUMENTS)
    yield database
    # mongomock drops all data when client is garbage collected
    client.close()
