import logging

from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded


STATUS_CODE_TO_ERROR_CODE = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}
logger = logging.getLogger(__name__)


def _message_for_exception(exc: HTTPException) -> str:
    if exc.status_code == 422:
        return "Invalid request"
    if isinstance(exc.detail, str) and exc.detail:
        return exc.detail
    return "Request failed"


def build_error_payload(status_code: int, message: str) -> dict:
    return {
        "error": {
            "code": STATUS_CODE_TO_ERROR_CODE.get(status_code, "HTTP_ERROR"),
            "message": message,
        }
    }


async def http_exception_handler(request: Request, exc: HTTPException):
    level = logging.WARNING if exc.status_code < 500 else logging.ERROR
    logger.log(
        level,
        "handled http error status=%s code=%s",
        exc.status_code,
        STATUS_CODE_TO_ERROR_CODE.get(exc.status_code, "HTTP_ERROR"),
        extra={"request_method": request.method, "request_path": request.url.path},
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=build_error_payload(exc.status_code, _message_for_exception(exc)),
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(
        "request validation error",
        extra={"request_method": request.method, "request_path": request.url.path},
    )
    return JSONResponse(
        status_code=422,
        content=build_error_payload(422, "Invalid request"),
    )


async def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded):
    logger.warning(
        "rate limit exceeded",
        extra={"request_method": request.method, "request_path": request.url.path},
    )
    return JSONResponse(
        status_code=429,
        content=build_error_payload(429, "Rate limit exceeded"),
    )
