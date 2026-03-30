"""
tests/fixtures/beanie_fixture.py

Provides a pytest fixture that initialises Beanie with an in-memory
mongomock database so Document subclasses can be instantiated in unit tests
without a running MongoDB process.
"""
from __future__ import annotations

import pytest_asyncio
import mongomock_motor

from app.models.documents import ALL_DOCUMENTS
from beanie import init_beanie


@pytest_asyncio.fixture
async def beanie_init():
    """
    Initialise Beanie against an in-memory mongomock database.
    Use this fixture in any test that instantiates Beanie Document subclasses.
    """
    client = mongomock_motor.AsyncMongoMockClient()
    await init_beanie(database=client["test_db"], document_models=ALL_DOCUMENTS)
    yield
    # mongomock tears down automatically when client goes out of scope
