import os
import logging
import re
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext

from database import db

logger = logging.getLogger(__name__)

# ===================== SECURITY =====================

security = HTTPBearer(auto_error=False)

# ===================== PASSWORD HELPERS =====================

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# ===================== VALIDATORS =====================

def validate_email(email: str) -> bool:
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_password(password: str) -> tuple[bool, str]:
    if len(password) < 6:
        return False, "Password must be at least 6 characters"
    return True, ""


# ===================== AUTH DEPENDENCY =====================

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    request: Request = None,
):
    """Get current user from session token (cookie or header)"""
    token = None

    # Try to get token from cookie first
    if request:
        token = request.cookies.get("session_token")

    # Fallback to Authorization header
    if not token and credentials:
        token = credentials.credentials

    if not token:
        logger.warning(
            "unauthorized access: missing auth token",
            extra={"request_method": request.method if request else "-", "request_path": request.url.path if request else "-"},
        )
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Find session
    session = await db.user_sessions.find_one(
        {"session_token": token},
        {"_id": 0}
    )

    if not session:
        logger.warning(
            "unauthorized access: invalid session",
            extra={"request_method": request.method if request else "-", "request_path": request.url.path if request else "-"},
        )
        raise HTTPException(status_code=401, detail="Invalid session")

    # Check expiration
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < datetime.now(timezone.utc):
        await db.user_sessions.delete_many({"session_token": token})
        logger.info(
            "session expired and removed",
            extra={"request_method": request.method if request else "-", "request_path": request.url.path if request else "-"},
        )
        raise HTTPException(status_code=401, detail="Session expired")

    # Get user
    user = await db.users.find_one(
        {"user_id": session["user_id"]},
        {"_id": 0}
    )

    if not user:
        logger.warning(
            "unauthorized access: session user missing",
            extra={"request_method": request.method if request else "-", "request_path": request.url.path if request else "-"},
        )
        raise HTTPException(status_code=401, detail="User not found")

    user.pop("password_hash", None)
    return user
