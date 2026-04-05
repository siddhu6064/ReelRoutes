"""
app/main.py

FastAPI application factory.
All middleware, routers, and exception handlers are registered here.
The app is created once and imported by uvicorn.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config.database import connect_db, disconnect_db
from app.config.logging import configure_logging, get_logger
from app.config.settings import get_settings
from app.middleware import (
    AppError,
    RequestLoggingMiddleware,
    app_error_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.routers import health_router

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # noqa: ARG001
    """
    FastAPI lifespan context manager.
    Code before yield runs on startup; code after yield runs on shutdown.
    """
    settings = get_settings()
    configure_logging()

    # Task 7 — Sentry initialisation
    from app.config.sentry import init_sentry

    init_sentry()

    logger.info("app_starting", version=settings.version, env=settings.env)

    await connect_db()

    logger.info("app_ready", host=settings.api_host, port=settings.api_port)

    yield

    logger.info("app_shutting_down")
    await disconnect_db()
    logger.info("app_stopped")


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="ReelRoutes API",
        description="AI-powered travel video to trip planner",
        version=settings.version,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
        lifespan=lifespan,
    )

    # ── Middleware (added in reverse order — last added = outermost) ──
    # Request logging must be outermost to capture all requests
    app.add_middleware(RequestLoggingMiddleware)

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-Id"],
    )

    # ── Exception handlers ────────────────────────────────────
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)

    # ── Routers ───────────────────────────────────────────────
    app.include_router(health_router)
    from app.routers.jobs import router as jobs_router
    from app.routers.jobs import ws_router
    from app.routers.process import router as process_router
    from app.routers.trip_extras import router as trip_extras_router
    from app.routers.trips import router as trips_router
    from app.routers.users import (
        clerk_router,
    )
    from app.routers.users import (
        router as users_router,
    )
    from app.routers.users import (
        trips_router as user_trips_router,
    )

    app.include_router(jobs_router)
    app.include_router(ws_router)
    app.include_router(process_router)
    app.include_router(trips_router)
    app.include_router(users_router)
    app.include_router(user_trips_router)
    app.include_router(clerk_router)
    app.include_router(trip_extras_router)

    # Phase 3 — W9 / W10 / W11
    from app.routers.pin_visit import router as pin_visit_router
    from app.routers.suggestions import router as suggestions_router
    from app.routers.wrapped import router as wrapped_router

    app.include_router(pin_visit_router)
    app.include_router(wrapped_router)
    app.include_router(suggestions_router)

    # Phase 5 — W17 + W18 + W19
    from app.routers.directions import router as directions_router
    from app.routers.gps import router as gps_router

    app.include_router(directions_router)
    app.include_router(gps_router)

    from app.routers.book import router as book_router
    from app.routers.flyover import router as flyover_router

    app.include_router(flyover_router)
    app.include_router(book_router)

    # Phase 4 — W13 / W14 / W15 / W16
    from app.routers.collaborate import router as collaborate_router
    from app.routers.explore import router as explore_router
    from app.routers.reservations import router as reservations_router
    from app.routers.undo import router as undo_router

    app.include_router(explore_router)
    app.include_router(collaborate_router)
    app.include_router(undo_router)
    app.include_router(reservations_router)

    return app


app = create_app()
