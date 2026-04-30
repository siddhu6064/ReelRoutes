"""
tests/test_billing.py

Tests for billing service and endpoints:
  1. Plan status helpers (get_user_plan, is_pro, check_trip_limit)
  2. Stripe event handlers (_handle_checkout_completed, etc.)
  3. HTTP endpoints (GET /api/billing/status, POST /checkout, POST /portal)
  4. Stripe webhook endpoint
  5. Feature gates (require_pro_or_raise, suggestions endpoint)
"""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_user(
    clerk_id: str = "user_test",
    plan: str = "free",
    subscription_status: str = "inactive",
    stripe_customer_id: str | None = None,
    stripe_subscription_id: str | None = None,
):
    user = MagicMock()
    user.clerk_id = clerk_id
    user.email = f"{clerk_id}@test.com"
    user.name = "Test User"
    user.plan = plan
    user.subscription_status = subscription_status
    user.stripe_customer_id = stripe_customer_id
    user.stripe_subscription_id = stripe_subscription_id
    user.updated_at = datetime.now(UTC)
    user.save = AsyncMock()
    return user


def _app_client():
    from app.main import create_app

    return TestClient(create_app(), raise_server_exceptions=False)


# ══════════════════════════════════════════════════════════════
#  1. Plan status helpers
# ══════════════════════════════════════════════════════════════


class TestGetUserPlan:
    @pytest.mark.asyncio
    async def test_free_user_gets_free_plan(self):
        from app.services.billing_service import get_user_plan

        user = _make_user(plan="free")
        with (
            patch("app.models.documents.UserDocument") as MockUser,
            patch("app.models.documents.TripDocument") as MockTrip,
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            mock_find = MagicMock()
            mock_find.count = AsyncMock(return_value=2)
            MockTrip.find.return_value = mock_find

            result = await get_user_plan("user_test")

        assert result["plan"] == "free"
        assert result["trip_count"] == 2
        assert result["trip_limit"] == 5
        assert result["trips_remaining"] == 3
        assert result["upgrade_url"] is not None

    @pytest.mark.asyncio
    async def test_pro_user_gets_unlimited(self):
        from app.services.billing_service import get_user_plan

        user = _make_user(plan="pro", subscription_status="active")
        with (
            patch("app.models.documents.UserDocument") as MockUser,
            patch("app.models.documents.TripDocument") as MockTrip,
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            mock_find = MagicMock()
            mock_find.count = AsyncMock(return_value=42)
            MockTrip.find.return_value = mock_find

            result = await get_user_plan("user_test")

        assert result["plan"] == "pro"
        assert result["trip_limit"] is None
        assert result["trips_remaining"] is None
        assert result["upgrade_url"] is None

    @pytest.mark.asyncio
    async def test_unknown_user_returns_free(self):
        from app.services.billing_service import get_user_plan

        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=None)
            result = await get_user_plan("ghost_user")

        assert result["plan"] == "free"
        assert result["trip_count"] == 0


class TestIsPro:
    @pytest.mark.asyncio
    async def test_pro_active_returns_true(self):
        from app.services.billing_service import is_pro

        user = _make_user(plan="pro", subscription_status="active")
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)
            assert await is_pro("user_test") is True

    @pytest.mark.asyncio
    async def test_free_user_returns_false(self):
        from app.services.billing_service import is_pro

        user = _make_user(plan="free")
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)
            assert await is_pro("user_test") is False

    @pytest.mark.asyncio
    async def test_pro_past_due_returns_false(self):
        from app.services.billing_service import is_pro

        user = _make_user(plan="pro", subscription_status="past_due")
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)
            assert await is_pro("user_test") is False

    @pytest.mark.asyncio
    async def test_unknown_user_returns_false(self):
        from app.services.billing_service import is_pro

        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=None)
            assert await is_pro("ghost") is False


class TestCheckTripLimit:
    @pytest.mark.asyncio
    async def test_free_under_limit_passes(self):
        from app.services.billing_service import check_trip_limit

        user = _make_user(plan="free")
        with (
            patch("app.services.billing_service.get_settings") as ms,
            patch("app.models.documents.UserDocument") as MockUser,
            patch("app.models.documents.TripDocument") as MockTrip,
        ):
            ms.return_value.has_stripe = True
            ms.return_value.env = "production"
            ms.return_value.free_tier_max_trips = 5
            MockUser.find_one = AsyncMock(return_value=user)
            mock_find = MagicMock()
            mock_find.count = AsyncMock(return_value=3)
            MockTrip.find.return_value = mock_find

            await check_trip_limit("user_test")  # Should not raise

    @pytest.mark.asyncio
    async def test_free_at_limit_raises_402(self):
        from fastapi import HTTPException

        from app.services.billing_service import check_trip_limit

        user = _make_user(plan="free")
        with (
            patch("app.services.billing_service.get_settings") as ms,
            patch("app.models.documents.UserDocument") as MockUser,
            patch("app.models.documents.TripDocument") as MockTrip,
        ):
            ms.return_value.has_stripe = True
            ms.return_value.env = "production"
            ms.return_value.free_tier_max_trips = 5
            MockUser.find_one = AsyncMock(return_value=user)
            mock_find = MagicMock()
            mock_find.count = AsyncMock(return_value=5)  # exactly at limit
            MockTrip.find.return_value = mock_find

            with pytest.raises(HTTPException) as exc_info:
                await check_trip_limit("user_test")

        assert exc_info.value.status_code == 402
        assert exc_info.value.detail["code"] == "TRIP_LIMIT_REACHED"

    @pytest.mark.asyncio
    async def test_pro_user_bypasses_limit(self):
        from app.services.billing_service import check_trip_limit

        user = _make_user(plan="pro", subscription_status="active")
        with (
            patch("app.services.billing_service.get_settings") as ms,
            patch("app.models.documents.UserDocument") as MockUser,
        ):
            ms.return_value.has_stripe = True
            ms.return_value.env = "production"
            ms.return_value.free_tier_max_trips = 5
            MockUser.find_one = AsyncMock(return_value=user)

            await check_trip_limit("user_test")  # Should not raise

    @pytest.mark.asyncio
    async def test_local_dev_no_enforcement(self):
        from app.services.billing_service import check_trip_limit

        with patch("app.services.billing_service.get_settings") as ms:
            ms.return_value.has_stripe = False
            ms.return_value.env = "local"

            await check_trip_limit("any_user")  # Should not raise


class TestRequireProOrRaise:
    @pytest.mark.asyncio
    async def test_pro_user_passes(self):
        from app.services.billing_service import require_pro_or_raise

        with (
            patch("app.services.billing_service.get_settings") as ms,
            patch("app.services.billing_service.is_pro", AsyncMock(return_value=True)),
        ):
            ms.return_value.has_stripe = True
            ms.return_value.env = "production"
            await require_pro_or_raise("user_pro", "collaboration")  # Should not raise

    @pytest.mark.asyncio
    async def test_free_user_raises_402(self):
        from fastapi import HTTPException

        from app.services.billing_service import require_pro_or_raise

        with (
            patch("app.services.billing_service.get_settings") as ms,
            patch("app.services.billing_service.is_pro", AsyncMock(return_value=False)),
        ):
            ms.return_value.has_stripe = True
            ms.return_value.env = "production"

            with pytest.raises(HTTPException) as exc_info:
                await require_pro_or_raise("user_free", "AI suggestions")

        assert exc_info.value.status_code == 402
        assert exc_info.value.detail["code"] == "PRO_REQUIRED"

    @pytest.mark.asyncio
    async def test_local_dev_no_enforcement(self):
        from app.services.billing_service import require_pro_or_raise

        with patch("app.services.billing_service.get_settings") as ms:
            ms.return_value.has_stripe = False
            ms.return_value.env = "test"
            await require_pro_or_raise("any_user", "feature")  # Should not raise


# ══════════════════════════════════════════════════════════════
#  2. Stripe event handlers
# ══════════════════════════════════════════════════════════════


class TestStripeEventHandlers:
    @pytest.mark.asyncio
    async def test_checkout_completed_activates_pro(self):
        from app.services.billing_service import _handle_checkout_completed

        user = _make_user(plan="free")
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)

            await _handle_checkout_completed(
                {
                    "metadata": {"clerk_id": "user_test"},
                    "customer": "cus_abc",
                    "subscription": "sub_abc",
                }
            )

        assert user.plan == "pro"
        assert user.subscription_status == "active"
        assert user.stripe_customer_id == "cus_abc"
        assert user.stripe_subscription_id == "sub_abc"
        user.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_checkout_completed_no_clerk_id_skipped(self):
        from app.services.billing_service import _handle_checkout_completed

        # Should not raise, just log and return
        await _handle_checkout_completed({"metadata": {}, "customer": "cus_abc"})

    @pytest.mark.asyncio
    async def test_subscription_deleted_downgrades_to_free(self):
        from app.services.billing_service import _handle_subscription_deleted

        user = _make_user(
            plan="pro",
            subscription_status="active",
            stripe_customer_id="cus_abc",
            stripe_subscription_id="sub_abc",
        )
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)

            await _handle_subscription_deleted(
                {
                    "metadata": {"clerk_id": "user_test"},
                    "customer": "cus_abc",
                }
            )

        assert user.plan == "free"
        assert user.subscription_status == "canceled"
        assert user.stripe_subscription_id is None
        user.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_payment_failed_marks_past_due(self):
        from app.services.billing_service import _handle_payment_failed

        user = _make_user(plan="pro", subscription_status="active", stripe_customer_id="cus_abc")
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)

            await _handle_payment_failed({"customer": "cus_abc"})

        assert user.subscription_status == "past_due"
        user.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_subscription_updated_active_promotes_to_pro(self):
        from app.services.billing_service import _handle_subscription_updated

        user = _make_user(plan="free")
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)

            await _handle_subscription_updated(
                {
                    "metadata": {"clerk_id": "user_test"},
                    "status": "active",
                    "id": "sub_abc",
                    "customer": "cus_abc",
                }
            )

        assert user.plan == "pro"
        assert user.subscription_status == "active"


# ══════════════════════════════════════════════════════════════
#  3. HTTP endpoints
# ══════════════════════════════════════════════════════════════


class TestBillingStatusEndpoint:
    def test_returns_plan_info(self):
        client = _app_client()
        plan_info = {
            "plan": "free",
            "subscription_status": "inactive",
            "trip_count": 2,
            "trip_limit": 5,
            "trips_remaining": 3,
            "features": [],
            "upgrade_url": "/billing/upgrade",
        }
        with patch("app.routers.billing.get_user_plan", AsyncMock(return_value=plan_info)):
            resp = client.get(
                "/api/billing/status",
                headers={"X-Test-User-Id": "user_test"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["data"]["plan"] == "free"

    def test_requires_auth(self):
        client = _app_client()
        resp = client.get("/api/billing/status")
        assert resp.status_code in (401, 422)


class TestBillingCheckoutEndpoint:
    def test_returns_checkout_url(self):
        client = _app_client()
        user = _make_user()

        with (
            patch("app.models.documents.UserDocument") as MockUser,
            patch(
                "app.routers.billing.create_checkout_session",
                AsyncMock(return_value="https://checkout.stripe.com/test"),
            ),
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            resp = client.post(
                "/api/billing/checkout",
                json={
                    "success_url": "https://reelroutes.app/billing/success",
                    "cancel_url": "https://reelroutes.app/billing",
                },
                headers={"X-Test-User-Id": "user_test"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert "checkout_url" in data["data"]
        assert "stripe.com" in data["data"]["checkout_url"]

    def test_requires_auth(self):
        client = _app_client()
        resp = client.post(
            "/api/billing/checkout",
            json={"success_url": "https://example.com", "cancel_url": "https://example.com"},
        )
        assert resp.status_code in (401, 422)


class TestBillingPortalEndpoint:
    def test_returns_portal_url(self):
        client = _app_client()

        with patch(
            "app.routers.billing.create_portal_session",
            AsyncMock(return_value="https://billing.stripe.com/session"),
        ):
            resp = client.post(
                "/api/billing/portal",
                json={"return_url": "https://reelroutes.app/billing"},
                headers={"X-Test-User-Id": "user_test"},
            )

        assert resp.status_code == 200
        assert "portal_url" in resp.json()["data"]

    def test_requires_auth(self):
        client = _app_client()
        resp = client.post(
            "/api/billing/portal",
            json={"return_url": "https://example.com"},
        )
        assert resp.status_code in (401, 422)


# ══════════════════════════════════════════════════════════════
#  4. Stripe webhook
# ══════════════════════════════════════════════════════════════


class TestStripeWebhookEndpoint:
    def test_accepts_valid_event(self):
        import json

        client = _app_client()

        event = {
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "metadata": {"clerk_id": "user_test"},
                    "customer": "cus_abc",
                    "subscription": "sub_abc",
                }
            },
        }

        with patch(
            "app.routers.billing.handle_stripe_event",
            AsyncMock(return_value={"received": True}),
        ):
            resp = client.post(
                "/api/webhooks/stripe",
                content=json.dumps(event),
                headers={"Content-Type": "application/json"},
            )

        assert resp.status_code == 200
        assert resp.json()["received"] is True

    def test_invalid_signature_returns_400(self):
        import json

        client = _app_client()
        from fastapi import HTTPException

        with patch(
            "app.routers.billing.handle_stripe_event",
            AsyncMock(
                side_effect=HTTPException(status_code=400, detail="Invalid Stripe signature")
            ),
        ):
            resp = client.post(
                "/api/webhooks/stripe",
                content=json.dumps({"type": "test"}),
                headers={
                    "Content-Type": "application/json",
                    "Stripe-Signature": "t=bad,v1=bad",
                },
            )

        assert resp.status_code == 400


# ══════════════════════════════════════════════════════════════
#  5. Feature gate — suggestions endpoint
# ══════════════════════════════════════════════════════════════


class TestSuggestionsProGate:
    def test_free_user_gets_402(self):
        client = _app_client()
        from fastapi import HTTPException

        with (
            patch("app.routers.suggestions.TripService.get", AsyncMock()),
            patch(
                "app.services.billing_service.require_pro_or_raise",
                AsyncMock(
                    side_effect=HTTPException(
                        status_code=402,
                        detail={"code": "PRO_REQUIRED", "message": "Pro required"},
                    )
                ),
            ),
        ):
            resp = client.post(
                "/api/trips/trip_abc/suggest-spots?user_id=user_free",
            )

        assert resp.status_code == 402

    def test_pro_user_gets_suggestions(self):
        client = _app_client()
        from app.models.documents import TripDocument

        trip = MagicMock(spec=TripDocument)
        trip.id = "trip_abc"
        trip.pins = []

        with (
            patch("app.routers.suggestions.TripService.get", AsyncMock(return_value=trip)),
            patch("app.services.billing_service.require_pro_or_raise", AsyncMock()),
            patch("app.routers.suggestions.suggest_spots", AsyncMock(return_value=[])),
        ):
            resp = client.post("/api/trips/trip_abc/suggest-spots?user_id=user_pro")

        assert resp.status_code == 200
