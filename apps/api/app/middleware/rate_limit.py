"""
app/middleware/rate_limit.py

Simple in-memory rate limiter for the /api/process endpoint.
Free tier: 10 video imports per user per day.

In production, swap the in-memory store for Redis using the
existing Redis connection (settings.redis_url).
"""
from __future__ import annotations

import time
from collections import defaultdict

from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.config.logging import get_logger
from app.config.settings import get_settings

logger = get_logger(__name__)

# In-memory store: {key: (count, window_start_unix)}
_store: dict[str, tuple[int, float]] = defaultdict(lambda: (0, time.time()))

FREE_TIER_DAILY_LIMIT = 10
WINDOW_SECONDS = 86_400  # 24 hours


def _rate_limit_key(request: Request) -> str:
    """
    Key = clerk_id when authenticated, otherwise IP address.
    Guest users share an IP-based bucket.
    """
    clerk_id = getattr(request.state, "clerk_id", None)
    if clerk_id:
        return f"rl:user:{clerk_id}"
    client_ip = request.headers.get("X-Forwarded-For", "")
    if client_ip:
        return f"rl:ip:{client_ip.split(',')[0].strip()}"
    return f"rl:ip:{request.client.host if request.client else 'unknown'}"


async def check_rate_limit(request: Request) -> JSONResponse | None:
    """
    Returns a 429 JSONResponse if the rate limit is exceeded,
    otherwise returns None (allow the request to proceed).
    """
    settings = get_settings()
    if settings.env in ("local", "test"):
        return None  # No rate limiting in dev/test

    key = _rate_limit_key(request)
    count, window_start = _store[key]
    now = time.time()

    if now - window_start > WINDOW_SECONDS:
        # New window — reset counter
        _store[key] = (1, now)
        return None

    if count >= FREE_TIER_DAILY_LIMIT:
        logger.warning("rate_limit_exceeded", key=key, count=count)
        request_id = getattr(request.state, "request_id", "unknown")
        return JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content={
                "ok": False,
                "error": {
                    "code": "RATE_LIMITED",
                    "message": f"Free tier allows {FREE_TIER_DAILY_LIMIT} video imports per day. Try again tomorrow.",
                    "request_id": request_id,
                },
            },
            headers={"Retry-After": str(int(WINDOW_SECONDS - (now - window_start)))},
        )

    _store[key] = (count + 1, window_start)
    return None
