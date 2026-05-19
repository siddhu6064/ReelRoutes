import os
from dataclasses import dataclass
from functools import lru_cache


def _get_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int, min_value: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    if value < min_value:
        return default
    return value


def _get_choice(name: str, default: str, allowed: set[str]) -> str:
    raw = os.getenv(name, default).strip().upper()
    return raw if raw in allowed else default


def _parse_origins(raw: str) -> list[str]:
    origins = [o.strip() for o in raw.split(",") if o.strip()]
    return origins or ["http://localhost:5173"]


@dataclass(frozen=True)
class Settings:
    MONGO_URL: str
    DB_NAME: str
    APP_NAME: str
    APP_URL: str | None
    WEB_URL: str | None
    MOBILE_APP_URL: str | None
    JWT_SECRET: str | None
    ALLOWED_ORIGINS: list[str]
    LOG_LEVEL: str
    SESSION_DAYS: int
    APP_ENV: str
    REQUEST_LOGGING_ENABLED: bool
    RATE_LIMIT_ENABLED: bool
    SECURE_COOKIES: bool
    COOKIE_SAMESITE: str
    COOKIE_DOMAIN: str | None




PROD_ENVS = {"production", "prod", "staging"}


def _validate_settings(settings: Settings) -> None:
    env = settings.APP_ENV.lower()
    if env not in PROD_ENVS:
        return

    errors: list[str] = []

    if not settings.MONGO_URL:
        errors.append("MONGO_URL is required")
    if not settings.DB_NAME:
        errors.append("DB_NAME is required")
    if not settings.ALLOWED_ORIGINS:
        errors.append("ALLOWED_ORIGINS must include at least one origin")

    if not settings.JWT_SECRET:
        errors.append("JWT_SECRET is required in staging/production environments")

    if env == "production":
        if settings.MONGO_URL.startswith("mongodb://localhost"):
            errors.append("MONGO_URL must not point to localhost in production")
        if any("localhost" in origin for origin in settings.ALLOWED_ORIGINS):
            errors.append("ALLOWED_ORIGINS must not include localhost in production")

    if errors:
        raise RuntimeError("Invalid server configuration: " + "; ".join(errors))

@lru_cache(maxsize=1)
def get_settings() -> Settings:
    app_env = os.getenv("APP_ENV") or os.getenv("ENV") or "development"
    cookie_samesite = os.getenv("COOKIE_SAMESITE", "lax").strip().lower()
    if cookie_samesite not in {"lax", "strict", "none"}:
        cookie_samesite = "lax"

    mongo_url = os.getenv("MONGODB_URI") or os.getenv("MONGO_URL", "mongodb://localhost:27017")

    settings = Settings(
        MONGO_URL=mongo_url,
        DB_NAME=os.getenv("DB_NAME", "expense_tracker"),
        APP_NAME=os.getenv("APP_NAME", "SAVIQ"),
        APP_URL=os.getenv("APP_URL") or None,
        WEB_URL=os.getenv("WEB_URL") or None,
        MOBILE_APP_URL=os.getenv("MOBILE_APP_URL") or None,
        JWT_SECRET=os.getenv("JWT_SECRET") or None,
        ALLOWED_ORIGINS=_parse_origins(os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")),
        LOG_LEVEL=_get_choice("LOG_LEVEL", "INFO", {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}),
        SESSION_DAYS=_get_int("SESSION_DAYS", 7, min_value=1),
        APP_ENV=app_env,
        REQUEST_LOGGING_ENABLED=_get_bool("REQUEST_LOGGING_ENABLED", True),
        RATE_LIMIT_ENABLED=_get_bool("RATE_LIMIT_ENABLED", True),
        SECURE_COOKIES=_get_bool("SECURE_COOKIES", app_env.lower() in {"production", "prod"}),
        COOKIE_SAMESITE=cookie_samesite,
        COOKIE_DOMAIN=os.getenv("COOKIE_DOMAIN") or None,
    )
    _validate_settings(settings)
    return settings
