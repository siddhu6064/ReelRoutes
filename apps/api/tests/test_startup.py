"""
tests/test_startup.py

Tests that the app and settings initialise correctly.
These are the first tests to run — if they fail, nothing else will work.
"""
from __future__ import annotations

import pytest

from app.config.settings import Settings, get_settings
from app.main import create_app


class TestSettings:
    def test_settings_loads_without_error(self) -> None:
        settings = get_settings()
        assert settings is not None

    def test_env_is_test(self) -> None:
        settings = get_settings()
        assert settings.env == "test"

    def test_is_test_property(self) -> None:
        settings = get_settings()
        assert settings.is_test is True
        assert settings.is_production is False

    def test_debug_is_true_in_test(self) -> None:
        settings = get_settings()
        assert settings.debug is True

    def test_version_is_semver(self) -> None:
        settings = get_settings()
        parts = settings.version.split(".")
        assert len(parts) == 3
        assert all(p.isdigit() for p in parts)

    def test_cors_origins_parsed_from_string(self) -> None:
        settings = Settings(cors_origins="http://localhost:5173,http://localhost:19006")  # type: ignore[call-arg]
        assert "http://localhost:5173" in settings.cors_origins
        assert "http://localhost:19006" in settings.cors_origins

    def test_cors_origins_accepts_list(self) -> None:
        settings = Settings(cors_origins=["http://localhost:5173"])  # type: ignore[call-arg]
        assert settings.cors_origins == ["http://localhost:5173"]

    def test_settings_cache_cleared_between_tests(self) -> None:
        """The autouse settings_override fixture must clear cache each test."""
        s1 = get_settings()
        get_settings.cache_clear()
        s2 = get_settings()
        # Both should be equal value objects even if different instances
        assert s1.version == s2.version


class TestAppFactory:
    def test_create_app_returns_fastapi_instance(self) -> None:
        from fastapi import FastAPI
        app = create_app()
        assert isinstance(app, FastAPI)

    def test_app_has_health_route(self) -> None:
        app = create_app()
        routes = {route.path for route in app.routes}  # type: ignore[attr-defined]
        assert "/health" in routes

    def test_app_has_version_route(self) -> None:
        app = create_app()
        routes = {route.path for route in app.routes}  # type: ignore[attr-defined]
        assert "/version" in routes

    def test_docs_disabled_in_production(self) -> None:
        """OpenAPI docs must not be exposed in production."""
        from unittest.mock import patch
        with patch.dict("os.environ", {"ENV": "production"}):
            get_settings.cache_clear()
            app = create_app()
            routes = {route.path for route in app.routes}  # type: ignore[attr-defined]
            assert "/docs" not in routes
            assert "/openapi.json" not in routes
        get_settings.cache_clear()

    def test_docs_enabled_in_local(self) -> None:
        from unittest.mock import patch
        with patch.dict("os.environ", {"ENV": "local"}):
            get_settings.cache_clear()
            app = create_app()
            routes = {route.path for route in app.routes}  # type: ignore[attr-defined]
            assert "/docs" in routes
        get_settings.cache_clear()
