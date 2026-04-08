# pytest.ini additions for E2E tests
# Add these settings to your existing pytest.ini or pyproject.toml [tool.pytest.ini_options]

"""
[pytest]
asyncio_mode = auto
markers =
    e2e: End-to-end integration tests (require mocked external APIs)
    unit: Pure unit tests (no external dependencies)
    integration: Integration tests (require mocked DB)
"""

# conftest.py additions for tests/e2e/
# Place this in tests/e2e/conftest.py

import os

import pytest


@pytest.fixture(autouse=True)
def set_test_env_vars():
    """
    Inject test API keys so FastAPI dependency functions don't
    raise 503 for missing environment variables during E2E tests.
    """
    os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake-key-for-tests")
    os.environ.setdefault("GOOGLE_MAPS_API_KEY", "fake-google-key-for-tests")
    yield
    # No teardown needed — os.environ changes don't persist across processes
