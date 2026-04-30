"""
tests/test_coverage_gaps.py

Targeted tests for the modules with the lowest coverage:
  - config/sentry.py               (was 0%)
  - services/push_notifications.py (was 47%)
  - routers/collaborate.py         (was 53%)
  - routers/jobs.py                (was 53%)
  - routers/trip_extras.py         (was 54%)
  - routers/users.py               (was 46%)
  - services/billing_service.py    (was 56%)
  - services/expense_service.py    (was 73%)
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Helpers ────────────────────────────────────────────────────────────────────


def _client():
    from app.main import create_app

    return TestClient(create_app(), raise_server_exceptions=False)


def _make_trip(
    trip_id="trip_abc",
    user_id="user_test",
    is_public=False,
    pins=None,
    expenses=None,
):
    trip = MagicMock()
    trip.id = trip_id
    trip.title = "Test Trip"
    trip.user_id = user_id
    trip.platform = "youtube"
    trip.source_url = "https://youtu.be/abc"
    trip.is_public = is_public
    trip.pins = pins or []
    trip.expenses = expenses or []
    trip.expense_budget = None
    trip.expense_currency = "USD"
    trip.collaborators = []
    trip.itinerary = []
    trip.share_token = None
    trip.is_shared = False
    trip.save = AsyncMock()
    return trip


def _make_user(clerk_id="user_test", push_token=None, plan="free"):
    user = MagicMock()
    user.clerk_id = clerk_id
    user.email = f"{clerk_id}@test.com"
    user.name = "Test User"
    user.push_token = push_token
    user.plan = plan
    user.save = AsyncMock()
    return user


# ══════════════════════════════════════════════════════════════
#  1. config/sentry.py
# ══════════════════════════════════════════════════════════════


class TestSentryConfig:
    def test_init_sentry_no_op_when_no_dsn(self):
        """No DSN configured → silently skips initialisation."""
        from app.config.sentry import init_sentry

        with patch("app.config.settings.get_settings") as ms:
            ms.return_value.sentry_dsn = ""
            init_sentry()  # Must not raise

    def test_init_sentry_calls_sdk_when_dsn_set(self):
        """DSN configured → calls sentry_sdk.init."""
        from app.config.sentry import init_sentry

        with (
            patch("app.config.settings.get_settings") as ms,
            patch("sentry_sdk.init") as mock_init,
        ):
            ms.return_value.sentry_dsn = "https://test@sentry.io/123"
            ms.return_value.sentry_environment = "test"
            ms.return_value.sentry_traces_rate = 0.0
            init_sentry()

        mock_init.assert_called_once()
        call_kwargs = mock_init.call_args[1]
        assert call_kwargs["dsn"] == "https://test@sentry.io/123"
        assert call_kwargs["environment"] == "test"
        assert call_kwargs["send_default_pii"] is False

    def test_before_send_drops_app_error_4xx(self):
        """AppError with 4xx status is filtered out (returns None)."""
        from app.config.sentry import _before_send
        from app.middleware.error_handler import AppError

        exc = AppError("not found", status_code=404)
        hint = {"exc_info": (type(exc), exc, None)}
        result = _before_send({"type": "error"}, hint)
        assert result is None

    def test_before_send_passes_5xx_errors(self):
        """5xx errors (real bugs) should be sent to Sentry."""
        from app.config.sentry import _before_send
        from app.middleware.error_handler import AppError

        exc = AppError("server error", status_code=500)
        hint = {"exc_info": (type(exc), exc, None)}
        event = {"type": "error"}
        result = _before_send(event, hint)
        assert result == event

    def test_before_send_passes_non_app_errors(self):
        """Generic exceptions are always sent to Sentry."""
        from app.config.sentry import _before_send

        exc = ValueError("something broke")
        hint = {"exc_info": (ValueError, exc, None)}
        event = {"type": "error"}
        result = _before_send(event, hint)
        assert result == event

    def test_before_send_no_exc_info_passes_event(self):
        """Events without exc_info are sent through unchanged."""
        from app.config.sentry import _before_send

        event = {"type": "message", "message": "hello"}
        result = _before_send(event, {})
        assert result == event

    def test_capture_exception_swallows_sentry_errors(self):
        """If sentry_sdk raises, capture_exception does not propagate."""
        from app.config.sentry import capture_exception

        with patch("sentry_sdk.push_scope", side_effect=RuntimeError("sentry down")):
            capture_exception(ValueError("test"))  # Must not raise

    def test_capture_exception_passes_context(self):
        """Context dict is attached as Sentry extras."""
        from app.config.sentry import capture_exception

        mock_scope = MagicMock()
        with (
            patch("sentry_sdk.push_scope") as mock_push,
            patch("sentry_sdk.capture_exception") as mock_cap,
        ):
            mock_push.return_value.__enter__ = MagicMock(return_value=mock_scope)
            mock_push.return_value.__exit__ = MagicMock(return_value=False)
            capture_exception(ValueError("test"), context={"trip_id": "abc"})

        mock_scope.set_extra.assert_called_with("trip_id", "abc")
        mock_cap.assert_called_once()

    def test_set_user_context_attaches_clerk_id(self):
        """clerk_id is attached to Sentry user context."""
        from app.config.sentry import set_user_context

        with patch("sentry_sdk.set_user") as mock_set:
            set_user_context("user_123")

        mock_set.assert_called_once_with({"id": "user_123"})

    def test_set_user_context_skips_none(self):
        """None clerk_id does not call set_user."""
        from app.config.sentry import set_user_context

        with patch("sentry_sdk.set_user") as mock_set:
            set_user_context(None)

        mock_set.assert_not_called()


# ══════════════════════════════════════════════════════════════
#  2. services/push_notifications.py
# ══════════════════════════════════════════════════════════════


class TestPushNotifications:
    @pytest.mark.asyncio
    async def test_send_trip_ready_sends_to_valid_token(self):
        """send_trip_ready calls _send when user has a valid push token."""
        from app.services.push_notifications import send_trip_ready

        user = _make_user(push_token="ExponentPushToken[abc123]")
        with (
            patch("app.services.push_notifications.UserDocument") as MockUser,
            patch(
                "app.services.push_notifications._send", AsyncMock(return_value=True)
            ) as mock_send,
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            result = await send_trip_ready("user_test", "trip_1", "Tokyo Trip", 5)

        assert result is True
        mock_send.assert_awaited_once()
        call_kwargs = mock_send.call_args[1]
        assert "Tokyo Trip" in call_kwargs["body"]
        assert "5 stops" in call_kwargs["body"]

    @pytest.mark.asyncio
    async def test_send_trip_ready_singular_stop(self):
        """'1 stop' not '1 stops'."""
        from app.services.push_notifications import send_trip_ready

        user = _make_user(push_token="ExponentPushToken[abc123]")
        with (
            patch("app.services.push_notifications.UserDocument") as MockUser,
            patch(
                "app.services.push_notifications._send", AsyncMock(return_value=True)
            ) as mock_send,
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            await send_trip_ready("user_test", "trip_1", "Solo Trip", 1)

        body = mock_send.call_args[1]["body"]
        assert "1 stop" in body
        assert "1 stops" not in body

    @pytest.mark.asyncio
    async def test_send_import_failed_sends_notification(self):
        """send_import_failed notifies user with failure reason."""
        from app.services.push_notifications import send_import_failed

        user = _make_user(push_token="ExponentPushToken[abc123]")
        with (
            patch("app.services.push_notifications.UserDocument") as MockUser,
            patch(
                "app.services.push_notifications._send", AsyncMock(return_value=True)
            ) as mock_send,
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            result = await send_import_failed("user_test", "job_1", "Video is private")

        assert result is True
        assert "Video is private" in mock_send.call_args[1]["body"]

    @pytest.mark.asyncio
    async def test_send_import_failed_empty_reason_uses_default(self):
        """Empty reason string uses fallback message."""
        from app.services.push_notifications import send_import_failed

        user = _make_user(push_token="ExponentPushToken[abc123]")
        with (
            patch("app.services.push_notifications.UserDocument") as MockUser,
            patch(
                "app.services.push_notifications._send", AsyncMock(return_value=True)
            ) as mock_send,
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            await send_import_failed("user_test", "job_1", "")

        body = mock_send.call_args[1]["body"]
        assert len(body) > 0  # fallback used

    @pytest.mark.asyncio
    async def test_send_trip_complete_notification(self):
        """send_trip_complete_notification formats body correctly."""
        from app.services.push_notifications import send_trip_complete_notification

        user = _make_user(push_token="ExponentPushToken[abc123]")
        with (
            patch("app.services.push_notifications.UserDocument") as MockUser,
            patch(
                "app.services.push_notifications._send", AsyncMock(return_value=True)
            ) as mock_send,
        ):
            MockUser.find_one = AsyncMock(return_value=user)
            result = await send_trip_complete_notification("user_test", "Kyoto Trip", "trip_1", 8)

        assert result is True
        body = mock_send.call_args[1]["body"]
        assert "8" in body
        assert "Kyoto Trip" in body

    @pytest.mark.asyncio
    async def test_send_expo_api_error_returns_false(self):
        """Expo API returning error status returns False."""
        from app.services.push_notifications import _send

        mock_resp = MagicMock()
        mock_resp.json.return_value = {
            "data": {
                "status": "error",
                "message": "DeviceNotRegistered",
                "details": {"error": "DeviceNotRegistered"},
            }
        }
        with patch("httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(
                return_value=MagicMock(post=AsyncMock(return_value=mock_resp))
            )
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await _send(
                token="ExponentPushToken[abc]",
                title="Test",
                body="Hello",
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_send_network_error_returns_false(self):
        """Network failure does not raise, returns False."""
        from app.services.push_notifications import _send

        with patch("httpx.AsyncClient") as MockClient:
            MockClient.return_value.__aenter__ = AsyncMock(
                side_effect=Exception("connection refused")
            )
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            result = await _send(
                token="ExponentPushToken[abc]",
                title="Test",
                body="Hello",
            )

        assert result is False

    @pytest.mark.asyncio
    async def test_register_push_token_saves_to_user(self):
        """register_push_token stores the token on UserDocument."""
        from app.services.push_notifications import register_push_token

        user = _make_user()
        with patch("app.services.push_notifications.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)
            await register_push_token("user_test", "ExponentPushToken[newtoken]")

        assert user.push_token == "ExponentPushToken[newtoken]"
        user.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_register_push_token_skips_missing_user(self):
        """register_push_token does not raise when user not found."""
        from app.services.push_notifications import register_push_token

        with patch("app.services.push_notifications.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=None)
            await register_push_token("ghost_user", "ExponentPushToken[x]")  # No raise


# ══════════════════════════════════════════════════════════════
#  3. routers/users.py — uncovered endpoints
# ══════════════════════════════════════════════════════════════


class TestUsersEndpoints:
    def test_list_my_trips_returns_paginated(self):
        """GET /api/users/me/trips returns paginated trip list."""
        client = _client()
        trip = _make_trip()

        with (
            patch(
                "app.services.trip_service.TripService.list_for_user",
                AsyncMock(return_value=([trip], 1)),
            ),
        ):
            resp = client.get(
                "/api/users/me/trips",
                headers={"X-Test-User-Id": "user_test"},
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["data"]["total"] == 1
        assert data["data"]["page"] == 1

    def test_list_my_trips_pagination_has_next_page(self):
        """hasNextPage is True when more pages exist."""
        client = _client()
        trips = [_make_trip(trip_id=f"trip_{i}") for i in range(5)]

        with patch(
            "app.services.trip_service.TripService.list_for_user",
            AsyncMock(return_value=(trips, 25)),
        ):
            resp = client.get(
                "/api/users/me/trips?page=1&page_size=5",
                headers={"X-Test-User-Id": "user_test"},
            )

        data = resp.json()
        assert data["data"]["hasNextPage"] is True

    def test_list_my_trips_requires_auth(self):
        """Unauthenticated request returns 401/422."""
        client = _client()
        resp = client.get("/api/users/me/trips")
        assert resp.status_code in (401, 422)

    def test_register_push_token_returns_registered(self):
        """POST /api/users/me/push-token stores token and returns ok."""
        client = _client()

        with patch(
            "app.services.push_notifications.register_push_token",
            AsyncMock(),
        ):
            resp = client.post(
                "/api/users/me/push-token",
                json={"token": "ExponentPushToken[abc123]"},
                headers={"X-Test-User-Id": "user_test"},
            )

        assert resp.status_code == 200
        assert resp.json()["data"]["registered"] is True

    def test_register_push_token_requires_auth(self):
        """Unauthenticated push token registration returns 401/422."""
        client = _client()
        resp = client.post(
            "/api/users/me/push-token",
            json={"token": "ExponentPushToken[abc123]"},
        )
        assert resp.status_code in (401, 422)


# ══════════════════════════════════════════════════════════════
#  4. routers/collaborate.py — uncovered endpoints
# ══════════════════════════════════════════════════════════════


class TestCollaborateEndpoints:
    def test_accept_invite_by_token_activates_collab(self):
        """GET /invite/{token}/accept activates pending collaborator."""
        client = _client()

        from app.models.documents import CollaboratorRole

        collab = MagicMock()
        collab.invite_token = "tok_abc"
        collab.status = "pending"
        collab.role = CollaboratorRole.EDITOR
        collab.clerk_id = None
        collab.joined_at = None

        trip = _make_trip()
        trip.collaborators = [collab]

        with patch("app.models.documents.TripDocument.find_one", AsyncMock(return_value=trip)):
            resp = client.get(
                "/api/invite/tok_abc/accept?user_id=user_abc",
            )

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["data"]["trip_id"] == "trip_abc"

    def test_accept_invite_already_used_returns_false(self):
        """Accepting an already-used invite returns ok=False."""
        client = _client()

        collab = MagicMock()
        collab.invite_token = "tok_used"
        collab.status = "active"

        trip = _make_trip()
        trip.collaborators = [collab]

        with patch("app.models.documents.TripDocument.find_one", AsyncMock(return_value=trip)):
            resp = client.get("/api/invite/tok_used/accept?user_id=user_abc")

        assert resp.status_code == 200
        assert resp.json()["ok"] is False

    def test_accept_invite_not_found_returns_404(self):
        """Unknown invite token returns 404."""
        client = _client()

        with patch("app.models.documents.TripDocument.find_one", AsyncMock(return_value=None)):
            resp = client.get("/api/invite/unknown_token/accept")

        assert resp.status_code == 404

    def test_update_collaborator_role_requires_trip(self):
        """PATCH /trips/:id/collaborators/:collab_id/role returns 404 for missing trip."""
        client = _client()

        from app.middleware.error_handler import NotFoundError

        with patch(
            "app.services.trip_service.TripService.get",
            AsyncMock(side_effect=NotFoundError("Trip", "trip_abc")),
        ):
            resp = client.patch(
                "/api/trips/trip_abc/collaborators/collab_1/role" "?user_id=user_test&role=editor",
            )

        assert resp.status_code == 404


# ══════════════════════════════════════════════════════════════
#  5. routers/jobs.py — WebSocket endpoint
# ══════════════════════════════════════════════════════════════


class TestJobsWebSocket:
    def test_websocket_sends_job_status(self):
        """WS /ws/jobs/:id sends job payload then closes on terminal state."""
        client = _client()
        from datetime import UTC, datetime

        from app.models.documents import JobStatus

        job = MagicMock()
        job.id = "job_abc"
        job.status = JobStatus.COMPLETED  # Use enum value so __contains__ works
        job.progress = 100
        job.progress_message = "Done"
        job.current_step = "finalizing"
        job.error = None
        job.error_code = None
        job.completed_at = datetime(2026, 1, 1, tzinfo=UTC)

        with (
            patch("app.services.job_service.JobService.get", AsyncMock(return_value=job)),
            client.websocket_connect("/ws/jobs/job_abc") as ws,
        ):
            data = ws.receive_json()

        assert data["ok"] is True
        assert data["data"]["status"] == "completed"

    def test_websocket_sends_error_on_missing_job(self):
        """WS /ws/jobs/:id sends error message when job not found."""
        client = _client()

        from app.middleware.error_handler import NotFoundError

        with (
            patch(
                "app.services.job_service.JobService.get",
                AsyncMock(side_effect=NotFoundError("Job", "unknown")),
            ),
            client.websocket_connect("/ws/jobs/unknown") as ws,
        ):
            data = ws.receive_json()

        assert data["ok"] is False
        assert data["error"]["code"] == "JOB_NOT_FOUND"


# ══════════════════════════════════════════════════════════════
#  6. routers/trip_extras.py — expense CRUD
# ══════════════════════════════════════════════════════════════


class TestTripExtrasExpenses:
    def _expense_dict(self):
        return {
            "title": "Lunch",
            "amount": 25.50,
            "paid_by_name": "Alice",
            "category": "food",
            "currency": "USD",
            "split_type": "equal",
            "split_with": [],
        }

    def test_list_expenses_returns_empty(self):
        """GET /trips/:id/expenses returns expenses list."""
        client = _client()
        trip = _make_trip()

        with patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)):
            resp = client.get("/api/trips/trip_abc/expenses?user_id=user_test")

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert data["data"]["expenses"] == []

    def test_list_expenses_no_user_id_works_for_public(self):
        """Public trip expenses accessible without user_id."""
        client = _client()
        trip = _make_trip(is_public=True)

        with patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)):
            resp = client.get("/api/trips/trip_abc/expenses")

        assert resp.status_code == 200

    def test_update_expense_returns_updated(self):
        """PUT /trips/:id/expenses/:expense_id returns updated expense."""
        client = _client()
        trip = _make_trip()

        from datetime import UTC, datetime

        from app.models.documents import TripExpense

        expense = MagicMock(spec=TripExpense)
        expense.id = "exp_1"
        expense.title = "Dinner Updated"
        expense.amount = 55.0
        expense.paid_by_name = "Bob"
        expense.paid_by_id = None
        expense.category = "food"
        expense.currency = "USD"
        expense.split_type = "equal"
        expense.split_with = []
        expense.settled_by = []
        expense.is_solo = True
        expense.notes = None
        expense.pin_id = None
        expense.date = datetime(2026, 1, 1, tzinfo=UTC)
        expense.created_at = datetime(2026, 1, 1, tzinfo=UTC)

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.auth.authorization.assert_can_modify", AsyncMock()),
            patch("app.routers.trip_extras.update_expense", AsyncMock(return_value=expense)),
        ):
            resp = client.put(
                "/api/trips/trip_abc/expenses/exp_1",
                json={"user_id": "user_test", "title": "Dinner Updated", "amount": 55.0},
            )

        assert resp.status_code == 200
        assert resp.json()["data"]["amount"] == 55.0

    def test_delete_expense_returns_deleted(self):
        """DELETE /trips/:id/expenses/:expense_id returns deleted=True."""
        client = _client()
        trip = _make_trip()

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.auth.authorization.assert_can_modify", AsyncMock()),
            patch("app.routers.trip_extras.delete_expense", AsyncMock()),
        ):
            resp = client.delete(
                "/api/trips/trip_abc/expenses/exp_1?user_id=user_test",
            )

        assert resp.status_code == 200
        assert resp.json()["data"]["deleted"] is True

    def test_expense_summary_returns_totals(self):
        """GET /trips/:id/expenses/summary returns computed totals."""
        client = _client()
        trip = _make_trip()

        from app.services.expense_service import ExpenseSummary

        summary = MagicMock(spec=ExpenseSummary)
        summary.total_spent = 100.0
        summary.currency = "USD"
        summary.by_category = {}
        summary.per_person = {}
        summary.settlements = []

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.routers.trip_extras.compute_summary", return_value=summary),
        ):
            resp = client.get("/api/trips/trip_abc/expenses/summary?user_id=user_test")

        assert resp.status_code == 200
        assert resp.json()["data"]["totalSpent"] == 100.0

    def test_settle_expense_updates_member(self):
        """POST /expenses/:id/settle marks a member settled."""
        client = _client()
        trip = _make_trip()

        from datetime import UTC, datetime

        from app.models.documents import TripExpense

        expense = MagicMock(spec=TripExpense)
        expense.id = "exp_1"
        expense.title = "Hotel"
        expense.amount = 200.0
        expense.paid_by_name = "Alice"
        expense.paid_by_id = None
        expense.category = "accommodation"
        expense.currency = "USD"
        expense.split_type = "equal"
        expense.split_with = []
        expense.settled_by = ["Bob"]
        expense.is_solo = True
        expense.notes = None
        expense.pin_id = None
        expense.date = datetime(2026, 1, 1, tzinfo=UTC)
        expense.created_at = datetime(2026, 1, 1, tzinfo=UTC)

        with (
            patch("app.services.trip_service.TripService.get", AsyncMock(return_value=trip)),
            patch("app.auth.authorization.assert_can_modify", AsyncMock()),
            patch("app.routers.trip_extras.mark_settled", AsyncMock(return_value=expense)),
        ):
            resp = client.post(
                "/api/trips/trip_abc/expenses/exp_1/settle" "?member_name=Bob&user_id=user_test",
            )

        assert resp.status_code == 200


# ══════════════════════════════════════════════════════════════
#  7. services/billing_service.py — Stripe flows
# ══════════════════════════════════════════════════════════════


class TestBillingServiceStripe:
    @pytest.mark.asyncio
    async def test_create_checkout_no_stripe_returns_mock_url(self):
        """No Stripe key → returns mock checkout URL."""
        from app.services.billing_service import create_checkout_session

        with patch("app.services.billing_service.get_settings") as ms:
            ms.return_value.has_stripe = False
            url = await create_checkout_session(
                "user_1",
                "test@test.com",
                "https://app.com/success",
                "https://app.com/cancel",
            )

        assert "stripe.com" in url or "mock" in url

    @pytest.mark.asyncio
    async def test_create_portal_no_stripe_returns_mock_url(self):
        """No Stripe key → returns mock portal URL."""
        from app.services.billing_service import create_portal_session

        with patch("app.services.billing_service.get_settings") as ms:
            ms.return_value.has_stripe = False
            url = await create_portal_session("user_1", "https://app.com/billing")

        assert "stripe.com" in url or "mock" in url

    @pytest.mark.asyncio
    async def test_handle_stripe_event_no_stripe_parses_body(self):
        """No Stripe key → parse raw body without signature verification."""
        import json

        from app.services.billing_service import handle_stripe_event

        event = {
            "type": "checkout.session.completed",
            "data": {"object": {"metadata": {}, "customer": None, "subscription": None}},
        }

        with patch("app.services.billing_service.get_settings") as ms:
            ms.return_value.has_stripe = False
            result = await handle_stripe_event(
                raw_body=json.dumps(event).encode(),
                stripe_signature="",
            )

        assert result.get("received") is True

    @pytest.mark.asyncio
    async def test_activate_pro_updates_user(self):
        """_activate_pro sets plan=pro and subscription_status=active."""
        from app.services.billing_service import _activate_pro

        user = _make_user()
        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)
            await _activate_pro("user_test", "cus_abc", "sub_abc")

        assert user.plan == "pro"
        assert user.subscription_status == "active"
        assert user.stripe_customer_id == "cus_abc"
        assert user.stripe_subscription_id == "sub_abc"

    @pytest.mark.asyncio
    async def test_downgrade_to_free_clears_subscription(self):
        """_downgrade_to_free sets plan=free and clears subscription ID."""
        from app.services.billing_service import _downgrade_to_free

        user = _make_user(plan="pro")
        user.subscription_status = "active"
        user.stripe_subscription_id = "sub_abc"

        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)
            await _downgrade_to_free("user_test")

        assert user.plan == "free"
        assert user.subscription_status == "canceled"
        assert user.stripe_subscription_id is None

    @pytest.mark.asyncio
    async def test_update_subscription_status_past_due(self):
        """_update_subscription_status sets plan=free when status is past_due."""
        from app.services.billing_service import _update_subscription_status

        user = _make_user(plan="pro")
        user.subscription_status = "active"

        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=user)
            await _update_subscription_status("user_test", "past_due")

        assert user.plan == "free"
        assert user.subscription_status == "past_due"

    @pytest.mark.asyncio
    async def test_activate_pro_missing_user_logs_warning(self):
        """_activate_pro handles user-not-found gracefully."""
        from app.services.billing_service import _activate_pro

        with patch("app.models.documents.UserDocument") as MockUser:
            MockUser.find_one = AsyncMock(return_value=None)
            await _activate_pro("ghost_user", "cus_abc", "sub_abc")  # No raise


# ══════════════════════════════════════════════════════════════
#  8. services/expense_service.py — settlement and split logic
# ══════════════════════════════════════════════════════════════


class TestExpenseServiceSettlement:
    def _make_expense(
        self, expense_id="exp_1", amount=100.0, paid_by="Alice", split_with=None, settled_by=None
    ):
        from app.models.documents import TripExpense

        expense = MagicMock(spec=TripExpense)
        expense.id = expense_id
        expense.title = "Hotel"
        expense.amount = amount
        expense.paid_by_name = paid_by
        expense.category = "accommodation"
        expense.currency = "USD"
        expense.split_type = "equal"
        expense.split_with = split_with or []
        expense.settled_by = settled_by or []
        expense.notes = None
        expense.pin_id = None
        expense.created_at = MagicMock()
        expense.created_at.isoformat.return_value = "2026-01-01T00:00:00"
        return expense

    @pytest.mark.asyncio
    async def test_delete_expense_removes_from_trip(self):
        """delete_expense removes the expense from trip.expenses."""
        from app.services.expense_service import delete_expense

        expense = self._make_expense()
        trip = _make_trip(expenses=[expense])

        await delete_expense(trip, "exp_1")

        assert expense not in trip.expenses
        trip.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_delete_expense_missing_raises_404(self):
        """delete_expense raises NotFoundError for unknown ID."""
        from app.middleware.error_handler import NotFoundError
        from app.services.expense_service import delete_expense

        trip = _make_trip(expenses=[])

        with pytest.raises(NotFoundError):
            await delete_expense(trip, "nonexistent_id")

    @pytest.mark.asyncio
    async def test_mark_settled_marks_split_member(self):
        """mark_settled sets settled=True on the matching split member."""
        from app.services.expense_service import mark_settled

        split = MagicMock()
        split.member_name = "Bob"
        split.settled = False

        expense = self._make_expense()
        expense.split_with = [split]
        trip = _make_trip(expenses=[expense])

        await mark_settled(trip, "exp_1", "Bob")

        assert split.settled is True
        trip.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_mark_settled_case_insensitive(self):
        """mark_settled matches member_name case-insensitively."""
        from app.services.expense_service import mark_settled

        split = MagicMock()
        split.member_name = "bob"
        split.settled = False

        expense = self._make_expense()
        expense.split_with = [split]
        trip = _make_trip(expenses=[expense])

        await mark_settled(trip, "exp_1", "BOB")

        assert split.settled is True

    @pytest.mark.asyncio
    async def test_update_expense_changes_amount(self):
        """update_expense modifies expense fields."""
        from app.services.expense_service import update_expense

        expense = self._make_expense(amount=50.0)
        trip = _make_trip(expenses=[expense])

        result = await update_expense(trip, "exp_1", amount=75.0)

        assert result.amount == 75.0
        trip.save.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_expense_missing_raises_404(self):
        """update_expense raises NotFoundError for unknown ID."""
        from app.middleware.error_handler import NotFoundError
        from app.services.expense_service import update_expense

        trip = _make_trip(expenses=[])

        with pytest.raises(NotFoundError):
            await update_expense(trip, "nope", amount=50.0)
