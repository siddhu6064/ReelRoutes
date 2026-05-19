import logging
import os
import secrets
import uuid
import httpx
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt as pyjwt
from jwt.algorithms import RSAAlgorithm
from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
from pydantic import BaseModel

from database import db
from deps import (
    get_current_user,
    get_password_hash,
    verify_password,
    validate_email,
    validate_password,
    normalize_email,
)
from models import (
    AuthResponse,
    Category,
    EmailLoginRequest,
    EmailRegisterRequest,
    MessageResponse,
    PaymentMethod,
    Profile,
    UserSession,
    User,
)
from config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])
settings = get_settings()
limiter.enabled = settings.RATE_LIMIT_ENABLED


# ===================== REQUEST MODELS =====================

class GoogleAuthRequest(BaseModel):
    id_token: str  # Google ID token from the frontend OAuth flow


class AppleAuthRequest(BaseModel):
    identity_token: str       # Apple-signed JWT
    user: str                 # Apple stable user identifier
    email: Optional[str] = None
    full_name: Optional[dict] = None


class DeleteAccountRequest(BaseModel):
    confirmation: str


# ===================== SHARED HELPER =====================

async def _make_session(user_id: str) -> tuple[str, UserSession]:
    session_token = secrets.token_urlsafe(32)
    expires_at    = datetime.now(timezone.utc) + timedelta(days=settings.SESSION_DAYS)
    session = UserSession(
        user_id=user_id,
        session_token=session_token,
        expires_at=expires_at,
    )
    return session_token, session


async def _rotate_and_store_session(user_id: str) -> str:
    session_token, session = await _make_session(user_id)
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session.model_dump())
    return session_token


async def create_default_data_for_user(user_id: str):
    """Seed default profiles, categories and payment methods for a brand-new user."""
    profiles = [
        Profile(user_id=user_id, name="Personal", profile_type="personal", is_default=True),
        Profile(user_id=user_id, name="Business", profile_type="business", is_default=False),
    ]
    for p in profiles:
        profile_doc = p.model_dump()
        profile_doc["name_normalized"] = p.name.strip().lower()
        await db.profiles.insert_one(profile_doc)

    for cat in [
        {"name": "Food & Dining",    "icon": "restaurant",          "color": "#ef4444"},
        {"name": "Transportation",   "icon": "car",                 "color": "#f97316"},
        {"name": "Shopping",         "icon": "cart",                "color": "#eab308"},
        {"name": "Bills & Utilities","icon": "flash",               "color": "#22c55e"},
        {"name": "Entertainment",    "icon": "film",                "color": "#06b6d4"},
        {"name": "Healthcare",       "icon": "medical",             "color": "#3b82f6"},
        {"name": "Travel",           "icon": "airplane",            "color": "#8b5cf6"},
        {"name": "Education",        "icon": "school",              "color": "#ec4899"},
        {"name": "Other",            "icon": "ellipsis-horizontal", "color": "#6b7280"},
    ]:
        category_doc = Category(user_id=user_id, is_default=True, **cat).model_dump()
        category_doc["name_normalized"] = category_doc["name"].strip().lower()
        await db.categories.insert_one(category_doc)

    for pm in [
        {"name": "Cash",          "type": "cash",          "is_default": True},
        {"name": "Credit Card",   "type": "credit_card",   "is_default": False},
        {"name": "Debit Card",    "type": "debit_card",    "is_default": False},
        {"name": "Bank Transfer", "type": "bank_transfer", "is_default": False},
    ]:
        payment_doc = PaymentMethod(user_id=user_id, **pm).model_dump()
        payment_doc["name_normalized"] = payment_doc["name"].strip().lower()
        await db.payment_methods.insert_one(payment_doc)


# ===================== GOOGLE VERIFICATION =====================

def _verify_google_id_token(token: str) -> dict:
    """
    Verify a Google ID token against Google's public keys.
    Accepts multiple client IDs (web / iOS / Android) via GOOGLE_CLIENT_IDS env var
    (comma-separated).
    """
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests

    raw        = os.environ.get("GOOGLE_CLIENT_IDS", "")
    client_ids = [c.strip() for c in raw.split(",") if c.strip()]

    if not client_ids:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth not configured — set GOOGLE_CLIENT_IDS in environment",
        )

    last_error: Exception | None = None
    for cid in client_ids:
        try:
            return google_id_token.verify_oauth2_token(
                token, google_requests.Request(), cid
            )
        except ValueError as exc:
            last_error = exc

    logger.warning(f"Google token rejected for all client IDs: {last_error}")
    raise HTTPException(status_code=401, detail="Invalid or expired Google token")


# ===================== APPLE VERIFICATION =====================

async def _verify_apple_identity_token(identity_token: str) -> dict:
    """
    Verify an Apple identity JWT using Apple's published JWKS endpoint.
    Required env var: APPLE_APP_ID (your app's bundle ID or service ID).
    """
    apple_app_id = os.environ.get("APPLE_APP_ID")
    if not apple_app_id:
        raise HTTPException(
            status_code=500,
            detail="Apple OAuth not configured — set APPLE_APP_ID in environment",
        )

    # Peek at the header to find the key ID (kid), without signature verification
    try:
        header = pyjwt.get_unverified_header(identity_token)
    except pyjwt.DecodeError:
        raise HTTPException(status_code=401, detail="Malformed Apple token")

    kid = header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Apple token has no key ID")

    # Fetch Apple's JWKS
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://appleid.apple.com/auth/keys")
        resp.raise_for_status()
        jwks = resp.json()
    except Exception as exc:
        logger.error(f"Failed to fetch Apple JWKS: {exc}")
        raise HTTPException(status_code=503, detail="Could not reach Apple auth servers")

    # Locate the matching public key
    public_key = None
    for key_data in jwks.get("keys", []):
        if key_data.get("kid") == kid:
            public_key = RSAAlgorithm.from_jwk(key_data)
            break

    if public_key is None:
        raise HTTPException(status_code=401, detail="Apple signing key not found in JWKS")

    # Verify and decode
    try:
        return pyjwt.decode(
            identity_token,
            public_key,
            algorithms=["RS256"],
            audience=apple_app_id,
            issuer="https://appleid.apple.com",
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Apple token has expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid Apple token")


# ===================== ENDPOINTS =====================

@router.post("/google", response_model=AuthResponse)
@limiter.limit("20/minute")
async def google_auth(request: Request, body: GoogleAuthRequest):
    """
    Accept a Google ID token from the client-side Google Sign-In flow,
    verify it, then create or return the matching user + session.
    """
    try:
        idinfo = _verify_google_id_token(body.id_token)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Unexpected Google auth error: {exc}")
        raise HTTPException(status_code=500, detail="Google authentication failed")

    email      = normalize_email(idinfo.get("email") or "")
    name       = idinfo.get("name", "")
    picture    = idinfo.get("picture")
    google_sub = idinfo.get("sub")  # stable Google user ID

    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email address")

    # Try to find by google_sub first, fall back to email
    query = {"$or": [{"google_sub": google_sub}]}
    if email:
        query["$or"].append({"email": email})

    existing_user = await db.users.find_one(query, {"_id": 0})

    if existing_user:
        user_id = existing_user["user_id"]
        updates: dict = {}
        if name and not existing_user.get("name"):
            updates["name"] = name
        if picture and not existing_user.get("picture"):
            updates["picture"] = picture
        if not existing_user.get("google_sub"):
            updates["google_sub"] = google_sub
        if updates:
            await db.users.update_one({"user_id": user_id}, {"$set": updates})
    else:
        user_id  = f"user_{uuid.uuid4().hex[:12]}"
        new_user = {
            "user_id":       user_id,
            "email":         email,
            "name":          name or "Google User",
            "picture":       picture,
            "google_sub":    google_sub,
            "auth_provider": "google",
            "created_at":    datetime.now(timezone.utc),
        }
        await db.users.insert_one(new_user)
        await create_default_data_for_user(user_id)

    session_token = await _rotate_and_store_session(user_id)

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@router.post("/apple/login", response_model=AuthResponse)
@limiter.limit("20/minute")
async def apple_auth_login(request: Request, body: AppleAuthRequest):
    """
    Verify an Apple identity token and create or return the matching user + session.
    """
    try:
        payload = await _verify_apple_identity_token(body.identity_token)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Unexpected Apple auth error: {exc}")
        raise HTTPException(status_code=500, detail="Apple authentication failed")

    apple_sub   = payload.get("sub") or body.user
    token_email = normalize_email(payload.get("email") or body.email or "")

    query = {"apple_sub": apple_sub}
    if token_email:
        query = {"$or": [{"apple_sub": apple_sub}, {"email": token_email}]}

    existing_user = await db.users.find_one(query, {"_id": 0})

    if existing_user:
        user_id  = existing_user["user_id"]
        updates: dict = {}
        if token_email and not existing_user.get("email"):
            updates["email"] = token_email
        if body.full_name and not existing_user.get("name"):
            given  = body.full_name.get("givenName", "")
            family = body.full_name.get("familyName", "")
            full   = f"{given} {family}".strip()
            if full:
                updates["name"] = full
        if not existing_user.get("apple_sub"):
            updates["apple_sub"] = apple_sub
        if updates:
            await db.users.update_one({"user_id": user_id}, {"$set": updates})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        name    = ""
        if body.full_name:
            given  = body.full_name.get("givenName", "")
            family = body.full_name.get("familyName", "")
            name   = f"{given} {family}".strip()

        new_user = {
            "user_id":       user_id,
            "apple_sub":     apple_sub,
            "email":         token_email,
            "name":          name or "Apple User",
            "picture":       None,
            "auth_provider": "apple",
            "created_at":    datetime.now(timezone.utc),
        }
        await db.users.insert_one(new_user)
        await create_default_data_for_user(user_id)

    session_token = await _rotate_and_store_session(user_id)

    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user, "session_token": session_token}


@router.post("/register", response_model=AuthResponse)
@limiter.limit("5/minute")
async def register_with_email(request: Request, body: EmailRegisterRequest):
    """Register a new user with email and password."""
    try:
        email = normalize_email(body.email)

        if not validate_email(email):
            raise HTTPException(status_code=400, detail="Invalid email format")

        is_valid, error_msg = validate_password(body.password)
        if not is_valid:
            raise HTTPException(status_code=400, detail=error_msg)

        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name is required")

        if await db.users.find_one({"email": email}, {"_id": 0}):
            logger.warning(
                "registration failed: email already registered",
                extra={"request_method": request.method, "request_path": request.url.path},
            )
            raise HTTPException(status_code=400, detail="Email already registered")

        user_id         = f"user_{uuid.uuid4().hex[:12]}"
        hashed_password = get_password_hash(body.password)
        created_at      = datetime.now(timezone.utc).isoformat()

        await db.users.insert_one({
            "user_id":       user_id,
            "email":         email,
            "name":          body.name.strip(),
            "picture":       None,
            "password_hash": hashed_password,
            "auth_provider": "email",
            "created_at":    created_at,
        })
        await create_default_data_for_user(user_id)

        session_token = await _rotate_and_store_session(user_id)

        return {
            "user": {
                "user_id":       user_id,
                "email":         email,
                "name":          body.name.strip(),
                "picture":       None,
                "auth_provider": "email",
                "created_at":    created_at,
            },
            "session_token": session_token,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error during registration: {exc}")
        raise HTTPException(status_code=500, detail="Registration failed")


@router.post("/login", response_model=AuthResponse)
@limiter.limit("10/minute")
async def login_with_email(request: Request, body: EmailLoginRequest):
    """Login with email and password."""
    try:
        email = normalize_email(body.email)
        user = await db.users.find_one({"email": email}, {"_id": 0})

        if not user:
            logger.warning(
                "login failed: invalid credentials",
                extra={"request_method": request.method, "request_path": request.url.path},
            )
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not user.get("password_hash"):
            logger.warning(
                "login failed: social-only account attempted password login",
                extra={"request_method": request.method, "request_path": request.url.path},
            )
            raise HTTPException(
                status_code=401,
                detail="This account uses social sign-in. Please use that option instead.",
            )

        if not verify_password(body.password, user["password_hash"]):
            logger.warning(
                "login failed: invalid credentials",
                extra={"request_method": request.method, "request_path": request.url.path},
            )
            raise HTTPException(status_code=401, detail="Invalid email or password")

        session_token = await _rotate_and_store_session(user["user_id"])
        logger.info(
            "login success",
            extra={"request_method": request.method, "request_path": request.url.path},
        )

        user_response = {k: v for k, v in user.items() if k != "password_hash"}
        if "created_at" in user_response and hasattr(user_response["created_at"], "isoformat"):
            user_response["created_at"] = user_response["created_at"].isoformat()

        return {"user": user_response, "session_token": session_token}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error during login: {exc}")
        raise HTTPException(status_code=500, detail="Login failed")


@router.get("/me", response_model=User)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@router.post("/logout", response_model=MessageResponse)
async def logout(request: Request, current_user: dict = Depends(get_current_user)):
    """Invalidate the current session."""
    await db.user_sessions.delete_many({"user_id": current_user["user_id"]})
    logger.info(
        "logout success",
        extra={"request_method": request.method, "request_path": request.url.path},
    )
    return {"message": "Logged out successfully"}


@router.delete("/account", response_model=MessageResponse)
async def delete_account(
    payload: DeleteAccountRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Permanently delete the authenticated account and user-owned data."""
    if payload.confirmation != "DELETE":
        raise HTTPException(status_code=400, detail='Confirmation must be "DELETE"')

    user_id = current_user["user_id"]
    try:
        # TODO(apple): If/when Apple refresh tokens are stored, add token revocation before local deletion.
        await asyncio.gather(
            db.expenses.delete_many({"user_id": user_id}),
            db.budgets.delete_many({"user_id": user_id}),
            db.categories.delete_many({"user_id": user_id}),
            db.payment_methods.delete_many({"user_id": user_id}),
            db.profiles.delete_many({"user_id": user_id}),
            db.user_settings.delete_many({"user_id": user_id}),
            db.user_sessions.delete_many({"user_id": user_id}),
            db.users.delete_many({"user_id": user_id}),
        )
    except Exception as exc:
        logger.error(f"account deletion failed user_id={user_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete account")

    logger.info(
        "account deletion success",
        extra={"request_method": request.method, "request_path": request.url.path},
    )
    return {"message": "Account deleted successfully"}
