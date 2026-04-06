"""
app/services/push_notifications.py

Send push notifications to mobile users via Expo's Push API.

Used when:
  - A video processing job completes → "Your trip is ready!"
  - A job fails → "Import failed — tap to try again"

Expo Push API is free, no additional service required.
Each user's push token is stored on UserDocument after they
grant notification permissions in the mobile app.

Token format: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxxxx]
"""

from __future__ import annotations

import httpx

from app.config.logging import get_logger
from app.models.documents import UserDocument

logger = get_logger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
MAX_BATCH_SIZE = 100  # Expo API limit per request


async def send_trip_ready(
    user_id: str | None,
    trip_id: str,
    trip_title: str,
    pin_count: int,
) -> bool:
    """
    Notify the user their trip is ready to view.
    Returns True if notification was sent, False if skipped (no token).
    """
    if not user_id:
        return False  # guest users have no push token

    token = await _get_push_token(user_id)
    if not token:
        return False

    return await _send(
        token=token,
        title="Your trip is ready! 🗺",
        body=f"{trip_title} — {pin_count} stop{'s' if pin_count != 1 else ''} mapped",
        data={"screen": "trip", "tripId": trip_id},
    )


async def send_import_failed(
    user_id: str | None,
    job_id: str,  # noqa: ARG001 — kept for API symmetry with send_import_complete
    reason: str,
) -> bool:
    """
    Notify the user their import failed.
    Returns True if notification was sent.
    """
    if not user_id:
        return False

    token = await _get_push_token(user_id)
    if not token:
        return False

    return await _send(
        token=token,
        title="Import couldn't complete",
        body=reason or "Tap to try a different video",
        data={"screen": "new-trip"},
    )


async def send_trip_complete_notification(
    user_id: str,
    trip_title: str,
    trip_id: str,
    stop_count: int,
) -> bool:
    """
    Notify the user they have visited all stops on a trip.
    Triggered from GET /api/trips/:id/wrapped when visitRate == 1.0.
    Returns True if notification was sent.
    """
    token = await _get_push_token(user_id)
    if not token:
        return False

    return await _send(
        token=token,
        title="Trip complete! 🎉",
        body=f"You visited all {stop_count} stops in {trip_title}. See your stats →",
        data={"screen": "wrapped", "tripId": trip_id},
    )


async def register_push_token(user_id: str, token: str) -> None:
    """
    Store a push token on the user document.
    Called from POST /api/users/push-token (mobile registers on startup).
    """
    user = await UserDocument.find_one(UserDocument.clerk_id == user_id)
    if user:
        user.push_token = token  # type: ignore[attr-defined]
        await user.save()
        logger.info("push_token_registered", user_id=user_id, token_prefix=token[:20])


# ── Private helpers ────────────────────────────────────────────


async def _get_push_token(user_id: str) -> str | None:
    user = await UserDocument.find_one(UserDocument.clerk_id == user_id)
    if not user:
        return None
    token = getattr(user, "push_token", None)
    if not token or not token.startswith("ExponentPushToken"):
        return None
    return token


async def _send(
    token: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> bool:
    """Send one push notification via Expo Push API."""
    payload = {
        "to": token,
        "title": title,
        "body": body,
        "sound": "default",
        "data": data or {},
        "priority": "high",
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(EXPO_PUSH_URL, json=payload)
            result = resp.json()

        # Expo returns per-message status
        data_block = result.get("data", {})
        status = data_block.get("status")

        if status == "error":
            details = data_block.get("details", {})
            error = data_block.get("message", "unknown")
            if details.get("error") == "DeviceNotRegistered":
                logger.info("push_token_expired", token_prefix=token[:20])
                # Token is stale — could clear it here in a future iteration
            else:
                logger.warning("push_send_error", error=error)
            return False

        logger.info("push_sent", title=title, token_prefix=token[:20])
        return True

    except Exception as exc:
        logger.warning("push_send_failed", error=str(exc))
        return False
