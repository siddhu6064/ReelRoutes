"""
app/services/billing_service.py

Stripe billing integration for ReelRoutes Pro.

Free tier:  5 saved trips total. All core features included.
Pro tier:   $9.99/month. Unlimited trips + Pro features.

Pro features (gated server-side):
  - Unlimited trips (beyond the free tier cap of 5)
  - Collaboration (invite links + roles)
  - AI spot suggestions
  - All exports (KML, GeoJSON, GPX, Google Maps link)
  - GPS breadcrumb tracking
  - CarPlay
  - Email reservation import
  - Travel book export

Stripe integration:
  - Checkout Session  →  /api/billing/checkout  →  Stripe-hosted payment page
  - Customer Portal   →  /api/billing/portal    →  self-serve cancel / update card
  - Webhooks          →  /api/webhooks/stripe   →  subscription lifecycle events

Local dev (no Stripe key):
  All billing endpoints return mock data. Feature gates pass through.
  Set STRIPE_SECRET_KEY=sk_test_... to enable real Stripe in local dev.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.config.logging import get_logger
from app.config.settings import get_settings

logger = get_logger(__name__)

# ── Plan constants ─────────────────────────────────────────────
PLAN_FREE = "free"
PLAN_PRO = "pro"

PRO_FEATURES = [
    "unlimited_trips",
    "collaboration",
    "ai_suggestions",
    "exports",
    "gps_tracking",
    "carplay",
    "reservation_import",
    "travel_book",
]


# ══════════════════════════════════════════════════════════════
#  Plan status helpers
# ══════════════════════════════════════════════════════════════


async def get_user_plan(clerk_id: str) -> dict:
    """
    Return the billing plan and usage info for a user.

    Returns a dict that is safe to send directly to the client:
    {
        "plan": "free" | "pro",
        "subscription_status": "inactive" | "active" | "canceled" | "past_due",
        "trip_count": int,
        "trip_limit": int | None,  # None = unlimited
        "trips_remaining": int | None,
        "features": list[str],     # enabled Pro features
        "upgrade_url": str | None, # only present for free users
    }
    """
    from app.models.documents import TripDocument, UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if not user:
        return _free_plan_response(trip_count=0)

    trip_count = await TripDocument.find(TripDocument.user_id == clerk_id).count()

    if user.plan == PLAN_PRO and user.subscription_status == "active":
        return {
            "plan": PLAN_PRO,
            "subscription_status": user.subscription_status,
            "trip_count": trip_count,
            "trip_limit": None,
            "trips_remaining": None,
            "features": PRO_FEATURES,
            "upgrade_url": None,
        }

    # Free or lapsed Pro
    settings = get_settings()
    limit = settings.free_tier_max_trips
    remaining = max(0, limit - trip_count)

    return {
        "plan": PLAN_FREE,
        "subscription_status": user.subscription_status if user else "inactive",
        "trip_count": trip_count,
        "trip_limit": limit,
        "trips_remaining": remaining,
        "features": [],
        "upgrade_url": "/billing/upgrade",
    }


def _free_plan_response(trip_count: int) -> dict:
    settings = get_settings()
    limit = settings.free_tier_max_trips
    return {
        "plan": PLAN_FREE,
        "subscription_status": "inactive",
        "trip_count": trip_count,
        "trip_limit": limit,
        "trips_remaining": max(0, limit - trip_count),
        "features": [],
        "upgrade_url": "/billing/upgrade",
    }


async def is_pro(clerk_id: str) -> bool:
    """Return True if the user has an active Pro subscription."""
    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if not user:
        return False
    return user.plan == PLAN_PRO and user.subscription_status == "active"


async def require_pro_or_raise(clerk_id: str, feature: str = "this feature") -> None:
    """
    Raise HTTP 402 if the user is not Pro.
    Used as a guard in endpoint handlers for Pro-only features.
    """
    from fastapi import HTTPException

    settings = get_settings()
    # In dev/test with no Stripe key configured, skip enforcement
    if not settings.has_stripe and settings.env in ("local", "test"):
        return

    if not await is_pro(clerk_id):
        raise HTTPException(
            status_code=402,
            detail={
                "code": "PRO_REQUIRED",
                "feature": feature,
                "message": f"{feature.title()} is a Pro feature. Upgrade to ReelRoutes Pro for $9.99/month.",
                "upgrade_url": "/billing/upgrade",
            },
        )


async def check_trip_limit(clerk_id: str) -> None:
    """
    Raise HTTP 402 if a free user has reached their trip limit.
    Called before creating a new trip.
    """
    from fastapi import HTTPException

    from app.models.documents import TripDocument, UserDocument

    settings = get_settings()
    if not settings.has_stripe and settings.env in ("local", "test"):
        return  # No enforcement in local dev without Stripe

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if user and user.plan == PLAN_PRO and user.subscription_status == "active":
        return  # Pro users: unlimited

    trip_count = await TripDocument.find(TripDocument.user_id == clerk_id).count()

    if trip_count >= settings.free_tier_max_trips:
        raise HTTPException(
            status_code=402,
            detail={
                "code": "TRIP_LIMIT_REACHED",
                "message": (
                    f"Free plan allows {settings.free_tier_max_trips} saved trips. "
                    "Delete a trip to make space, or upgrade to Pro for unlimited trips."
                ),
                "trip_count": trip_count,
                "trip_limit": settings.free_tier_max_trips,
                "upgrade_url": "/billing/upgrade",
            },
        )


# ══════════════════════════════════════════════════════════════
#  Stripe Checkout + Portal
# ══════════════════════════════════════════════════════════════


async def create_checkout_session(
    clerk_id: str,
    email: str,
    success_url: str,
    cancel_url: str,
) -> str:
    """
    Create a Stripe Checkout Session for Pro subscription.
    Returns the Stripe-hosted checkout URL.

    If Stripe is not configured, returns a mock URL for local dev.
    """
    settings = get_settings()
    if not settings.has_stripe:
        logger.warning("stripe_not_configured_returning_mock_checkout_url")
        return "https://checkout.stripe.com/mock-session"

    import stripe  # type: ignore[import]

    stripe.api_key = settings.stripe_secret_key

    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)

    # Get or create Stripe customer
    customer_id = user.stripe_customer_id if user else None
    if not customer_id:
        customer = stripe.Customer.create(
            email=email,
            metadata={"clerk_id": clerk_id},
        )
        customer_id = customer.id
        if user:
            user.stripe_customer_id = customer_id
            user.updated_at = datetime.now(UTC)
            await user.save()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{"price": settings.stripe_pro_price_id, "quantity": 1}],
        mode="subscription",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"clerk_id": clerk_id},
        subscription_data={
            "metadata": {"clerk_id": clerk_id},
        },
        allow_promotion_codes=True,
    )

    logger.info("stripe_checkout_session_created", clerk_id=clerk_id, session_id=session.id)
    return session.url


async def create_portal_session(clerk_id: str, return_url: str) -> str:
    """
    Create a Stripe Customer Portal session so the user can manage
    their subscription (cancel, update card, view invoices).

    Returns the portal URL. Returns mock URL if Stripe not configured.
    """
    settings = get_settings()
    if not settings.has_stripe:
        return "https://billing.stripe.com/mock-portal"

    import stripe  # type: ignore[import]

    stripe.api_key = settings.stripe_secret_key

    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if not user or not user.stripe_customer_id:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=404,
            detail="No billing account found. Please subscribe first.",
        )

    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url=return_url,
    )
    logger.info("stripe_portal_session_created", clerk_id=clerk_id)
    return session.url


# ══════════════════════════════════════════════════════════════
#  Stripe Webhook event handlers
# ══════════════════════════════════════════════════════════════


async def handle_stripe_event(raw_body: bytes, stripe_signature: str) -> dict:
    """
    Verify and dispatch a Stripe webhook event.

    Handles:
      checkout.session.completed   → activate Pro after successful payment
      customer.subscription.updated → sync plan status changes (cancel, pause)
      customer.subscription.deleted → downgrade to free
      invoice.payment_failed        → mark subscription as past_due

    Returns {"received": True} on success.
    Raises HTTPException(400) on signature verification failure.
    """
    settings = get_settings()

    if not settings.has_stripe:
        # Dev fallback: parse the body as-is (no signature verification)
        import json

        try:
            event = json.loads(raw_body)
        except Exception:
            return {"received": True, "note": "stripe_not_configured"}
        await _dispatch_event(event)
        return {"received": True}

    import stripe  # type: ignore[import]

    stripe.api_key = settings.stripe_secret_key

    try:
        event = stripe.Webhook.construct_event(
            raw_body, stripe_signature, settings.stripe_webhook_secret
        )
    except stripe.SignatureVerificationError as exc:
        from fastapi import HTTPException

        logger.warning("stripe_webhook_signature_invalid", error=str(exc))
        raise HTTPException(status_code=400, detail="Invalid Stripe signature") from exc

    await _dispatch_event(event)
    return {"received": True}


async def _dispatch_event(event: dict) -> None:
    """Route a Stripe event to the correct handler."""
    event_type = event.get("type", "")
    obj = event.get("data", {}).get("object", {})

    logger.info("stripe_event_received", event_type=event_type)

    handlers = {
        "checkout.session.completed": _handle_checkout_completed,
        "customer.subscription.updated": _handle_subscription_updated,
        "customer.subscription.deleted": _handle_subscription_deleted,
        "invoice.payment_failed": _handle_payment_failed,
    }

    handler = handlers.get(event_type)
    if handler:
        await handler(obj)
    else:
        logger.debug("stripe_event_ignored", event_type=event_type)


async def _handle_checkout_completed(session: dict) -> None:
    """
    Fired when a user completes the Stripe Checkout flow.
    Activates Pro for the Clerk user.
    """
    clerk_id = session.get("metadata", {}).get("clerk_id")
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")

    if not clerk_id:
        logger.warning("stripe_checkout_completed_no_clerk_id", session_id=session.get("id"))
        return

    await _activate_pro(
        clerk_id=clerk_id,
        customer_id=customer_id,
        subscription_id=subscription_id,
    )


async def _handle_subscription_updated(subscription: dict) -> None:
    """Syncs subscription status changes (e.g. reactivation after cancel)."""
    clerk_id = subscription.get("metadata", {}).get("clerk_id")
    status = subscription.get("status", "")
    subscription_id = subscription.get("id")
    customer_id = subscription.get("customer")

    if not clerk_id:
        # Fall back to customer_id lookup
        from app.models.documents import UserDocument

        user = await UserDocument.find_one(UserDocument.stripe_customer_id == customer_id)
        if not user:
            logger.warning("stripe_sub_updated_clerk_id_not_found", customer_id=customer_id)
            return
        clerk_id = user.clerk_id

    if status == "active":
        await _activate_pro(
            clerk_id=clerk_id,
            customer_id=customer_id,
            subscription_id=subscription_id,
        )
    else:
        await _update_subscription_status(clerk_id, status)


async def _handle_subscription_deleted(subscription: dict) -> None:
    """Downgrade user to free when subscription is canceled/deleted."""
    clerk_id = subscription.get("metadata", {}).get("clerk_id")
    customer_id = subscription.get("customer")

    if not clerk_id:
        from app.models.documents import UserDocument

        user = await UserDocument.find_one(UserDocument.stripe_customer_id == customer_id)
        if not user:
            return
        clerk_id = user.clerk_id

    await _downgrade_to_free(clerk_id)


async def _handle_payment_failed(invoice: dict) -> None:
    """Mark subscription as past_due when a payment fails."""
    customer_id = invoice.get("customer")
    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.stripe_customer_id == customer_id)
    if user:
        user.subscription_status = "past_due"
        user.updated_at = datetime.now(UTC)
        await user.save()
        logger.warning("stripe_payment_failed_user_marked_past_due", clerk_id=user.clerk_id)


# ── Internal state mutations ───────────────────────────────────


async def _activate_pro(
    clerk_id: str,
    customer_id: str | None,
    subscription_id: str | None,
) -> None:
    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if not user:
        logger.error("stripe_activate_pro_user_not_found", clerk_id=clerk_id)
        return

    user.plan = PLAN_PRO
    user.subscription_status = "active"
    if customer_id:
        user.stripe_customer_id = customer_id
    if subscription_id:
        user.stripe_subscription_id = subscription_id
    user.updated_at = datetime.now(UTC)
    await user.save()

    logger.info("stripe_user_upgraded_to_pro", clerk_id=clerk_id)


async def _update_subscription_status(clerk_id: str, status: str) -> None:
    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if not user:
        return

    user.subscription_status = status
    if status != "active":
        user.plan = PLAN_FREE
    user.updated_at = datetime.now(UTC)
    await user.save()

    logger.info("stripe_subscription_status_updated", clerk_id=clerk_id, status=status)


async def _downgrade_to_free(clerk_id: str) -> None:
    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    if not user:
        return

    user.plan = PLAN_FREE
    user.subscription_status = "canceled"
    user.stripe_subscription_id = None
    user.updated_at = datetime.now(UTC)
    await user.save()

    logger.info("stripe_user_downgraded_to_free", clerk_id=clerk_id)
