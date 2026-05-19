import time
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from database import create_indexes, close_db, db
from errors import (
    http_exception_handler,
    validation_exception_handler,
    rate_limit_exception_handler,
)
from logging_config import configure_logging
from config import get_settings
from routers.auth import router as auth_router
from routers.profiles import router as profiles_router
from routers.categories import router as categories_router
from routers.expenses import router as expenses_router
from routers.budgets import router as budgets_router
from routers.analytics import router as analytics_router
from routers.insights import router as insights_router
from routers.ai import router as ai_router
from routers.savings_goals import router as savings_goals_router
from routers.forecast import router as forecast_router
from routers.subscriptions import router as subscriptions_router
from routers.weekly_digest import router as weekly_digest_router
from routers.dashboard_metrics import router as dashboard_metrics_router
from routers.misc import settings_router, export_router
from models import ApiRootResponse, StatusResponse

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
configure_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

@asynccontextmanager
async def lifespan(app):
    await create_indexes()
    yield
    await close_db()

app = FastAPI(title="SAVIQ API", version="2.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.state.limiter.enabled = settings.RATE_LIMIT_ENABLED
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(RateLimitExceeded, rate_limit_exception_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request, call_next):
    if not settings.REQUEST_LOGGING_ENABLED:
        return await call_next(request)
    start = time.perf_counter()
    method = request.method
    path = request.url.path
    try:
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "request completed status=%s duration_ms=%s",
            response.status_code,
            duration_ms,
            extra={"request_method": method, "request_path": path},
        )
        return response
    except Exception:
        duration_ms = int((time.perf_counter() - start) * 1000)
        logger.exception(
            "unhandled request exception duration_ms=%s",
            duration_ms,
            extra={"request_method": method, "request_path": path},
        )
        raise

PREFIX = "/api"
app.include_router(auth_router,       prefix=f"{PREFIX}/auth")
app.include_router(profiles_router,   prefix=PREFIX)
app.include_router(categories_router, prefix=PREFIX)
app.include_router(expenses_router,   prefix=PREFIX)
app.include_router(budgets_router,    prefix=PREFIX)
app.include_router(analytics_router,  prefix=PREFIX)
app.include_router(insights_router,   prefix=PREFIX)
app.include_router(ai_router,         prefix=PREFIX)
app.include_router(savings_goals_router, prefix=PREFIX)
app.include_router(forecast_router, prefix=PREFIX)
app.include_router(subscriptions_router, prefix=PREFIX)
app.include_router(weekly_digest_router, prefix=PREFIX)
app.include_router(dashboard_metrics_router, prefix=PREFIX)
app.include_router(settings_router,   prefix=PREFIX)
app.include_router(export_router,     prefix=PREFIX)

@app.get("/api", response_model=ApiRootResponse)
async def root():
    return {"message": "SAVIQ API", "version": "2.0.0"}


@app.get("/healthz", response_model=StatusResponse)
async def healthz():
    return {"status": "ok"}


@app.get("/health", response_model=StatusResponse)
async def health():
    return {"status": "ok"}


async def _dependencies_ready() -> bool:
    try:
        await db.command("ping")
        return bool(settings.DB_NAME and settings.MONGO_URL)
    except Exception:
        return False


@app.get("/readyz", response_model=StatusResponse)
async def readyz():
    if await _dependencies_ready():
        return {"status": "ready"}
    raise HTTPException(status_code=503, detail="Service not ready")


@app.get("/ready", response_model=StatusResponse)
async def ready():
    if await _dependencies_ready():
        return {"status": "ready"}
    raise HTTPException(status_code=503, detail="Service not ready")
