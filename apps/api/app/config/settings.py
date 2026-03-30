"""
app/config/settings.py

All configuration is loaded from environment variables via pydantic-settings.
Never hardcode secrets. See /.env.example for full documentation.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────────────
    env: Literal["local", "test", "staging", "production"] = "local"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: list[str] = Field(default=["http://localhost:5173"])
    version: str = "4.0.0"

    # ── MongoDB ───────────────────────────────────────────────
    mongodb_url: str = "mongodb://localhost:27017"
    mongodb_db: str = "reelroutes_local"

    # ── Redis ─────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379"

    # ── Clerk ─────────────────────────────────────────────────
    clerk_secret_key: str = ""
    clerk_publishable_key: str = ""
    clerk_webhook_secret: str = ""

    # ── OpenAI ────────────────────────────────────────────────
    openai_api_key: str = ""
    openai_extraction_model: str = "gpt-4o"
    openai_chat_model: str = "gpt-4o-mini"

    # ── Google ────────────────────────────────────────────────
    google_places_api_key: str = ""
    youtube_api_key: str = ""

    # ── Sentry ────────────────────────────────────────────────
    sentry_dsn: str = ""

    # ── Computed helpers ──────────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def is_test(self) -> bool:
        return self.env == "test"

    @property
    def debug(self) -> bool:
        return self.env in ("local", "test")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings instance. The cache is cleared in tests via
    get_settings.cache_clear() to allow per-test env overrides.
    """
    return Settings()
