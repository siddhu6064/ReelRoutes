"""
app/routers/billing.py

Billing endpoints for ReelRoutes Pro.

GET  /api/billing/status    → current plan + usage for the logged-in user
POST /api/billing/checkout  → create Stripe Checkout Session → return URL
POST /api/billing/portal    → create Stripe Customer Portal session → return URL
POST /api/webhooks/stripe   → Stripe webhook (signature-verified)
"""

from __future__ import annotations

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from app.auth.clerk import RequiredUser
from app.config.logging import get_logger
from app.services.billing_service import (
    create_checkout_session,
    create_portal_session,
    get_user_plan,
    handle_stripe_event,
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])
webhook_router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


# ── Request schemas ────────────────────────────────────────────


class CheckoutRequest(BaseModel):
    success_url: str  # redirect after successful payment
    cancel_url: str  # redirect if user cancels checkout


class PortalRequest(BaseModel):
    return_url: str  # redirect after portal session ends


# ── Endpoints ──────────────────────────────────────────────────


@router.get("/status", summary="Get current billing plan and usage")
async def billing_status(clerk_id: RequiredUser) -> dict:
    """
    Returns the user's current plan, trip count, remaining quota,
    and which Pro features are unlocked.

    Response shape:
    {
        "ok": true,
        "data": {
            "plan": "free" | "pro",
            "subscription_status": "inactive" | "active" | "canceled" | "past_due",
            "trip_count": 3,
            "trip_limit": 5,        // null for Pro
            "trips_remaining": 2,   // null for Pro
            "features": [...],      // Pro feature names
            "upgrade_url": "/billing/upgrade"  // null for Pro
        }
    }
    """
    plan_info = await get_user_plan(clerk_id)
    return {"ok": True, "data": plan_info}


@router.post("/checkout", summary="Create Stripe Checkout Session for Pro upgrade")
async def create_checkout(body: CheckoutRequest, clerk_id: RequiredUser) -> dict:
    """
    Creates a Stripe Checkout Session and returns the hosted payment URL.

    The client should redirect the user to checkout_url immediately.
    After payment:
      - success_url is loaded (e.g. /billing/success)
      - Stripe fires a checkout.session.completed webhook
      - Webhook activates Pro for the user

    In local dev without STRIPE_SECRET_KEY, returns a mock URL.
    """
    from app.models.documents import UserDocument

    user = await UserDocument.find_one(UserDocument.clerk_id == clerk_id)
    email = user.email if user else f"{clerk_id}@reelroutes.app"

    checkout_url = await create_checkout_session(
        clerk_id=clerk_id,
        email=email,
        success_url=body.success_url,
        cancel_url=body.cancel_url,
    )
    logger.info("billing_checkout_session_requested", clerk_id=clerk_id)
    return {"ok": True, "data": {"checkout_url": checkout_url}}


@router.post("/portal", summary="Create Stripe Customer Portal session")
async def billing_portal(body: PortalRequest, clerk_id: RequiredUser) -> dict:
    """
    Creates a Stripe Customer Portal session for subscription management.
    Users can cancel, update their card, or view invoices.

    Returns portal_url to redirect the user.
    """
    portal_url = await create_portal_session(
        clerk_id=clerk_id,
        return_url=body.return_url,
    )
    return {"ok": True, "data": {"portal_url": portal_url}}


# ── Stripe Webhook ─────────────────────────────────────────────


@webhook_router.post("/stripe", summary="Stripe event webhook (signature-verified)")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
) -> dict:
    """
    Receives Stripe webhook events and updates subscription state.

    Security: Stripe signs every event with STRIPE_WEBHOOK_SECRET.
    The signature is verified before processing any event.
    Invalid signatures return HTTP 400 immediately.

    Handled events:
      checkout.session.completed   → activate Pro
      customer.subscription.updated → sync status
      customer.subscription.deleted → downgrade to free
      invoice.payment_failed        → mark past_due
    """
    raw_body = await request.body()

    if not stripe_signature:
        # Allow unsigned events in local dev (no webhook secret configured)
        from app.config.settings import get_settings

        if get_settings().stripe_webhook_secret:
            raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    result = await handle_stripe_event(
        raw_body=raw_body,
        stripe_signature=stripe_signature or "",
    )
    return result
