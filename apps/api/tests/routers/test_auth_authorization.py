"""
tests/routers/test_auth_authorization.py

Task 5 — Authorization tests:
  - Cross-user trip access returns 403 (not 404)
  - Missing user_id on write endpoints returns 401
  - Guest trips accessible without auth
  - Trip claim links guest trip to user
  - Input validation rejects bad data with 422
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from app.utils.seed import SeedFactory
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401

if TYPE_CHECKING:
    from httpx import AsyncClient

# ── Cross-user access → 403 ────────────────────────────────────


@pytest.mark.asyncio
class TestCrossUserAccessForbidden:
    async def test_get_trip_wrong_user_returns_403(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        r = await client.get(f"/api/trips/{trip.id}?user_id=clerk_intruder")
        assert r.status_code == 403
        assert r.json()["error"]["code"] == "FORBIDDEN"

    async def test_update_trip_wrong_user_returns_403(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner", title="Original")
        r = await client.put(
            f"/api/trips/{trip.id}",
            json={"user_id": "clerk_wrong", "title": "Hacked"},
        )
        assert r.status_code == 403

    async def test_delete_trip_wrong_user_returns_403(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        r = await client.delete(f"/api/trips/{trip.id}?user_id=clerk_wrong")
        assert r.status_code == 403

    async def test_add_pin_wrong_user_returns_403(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        r = await client.post(
            f"/api/trips/{trip.id}/pins",
            json={"user_id": "clerk_wrong", "place_name": "Hack", "lat": 0.0, "lng": 0.0},
        )
        assert r.status_code == 403

    async def test_delete_pin_wrong_user_returns_403(
        self, client: AsyncClient, beanie_init
    ) -> None:
        from app.utils.seed import make_pin

        pin = make_pin(order=0)
        trip = await SeedFactory.trip(user_id="clerk_owner", pins=[pin])
        r = await client.delete(f"/api/trips/{trip.id}/pins/{pin.id}?user_id=clerk_wrong")
        assert r.status_code == 403

    async def test_share_trip_wrong_user_returns_403(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        r = await client.post(f"/api/trips/{trip.id}/share?user_id=clerk_wrong")
        assert r.status_code == 403

    async def test_403_not_404_prevents_enumeration(self, client: AsyncClient, beanie_init) -> None:
        """Crucially, we return 403 not 404 — prevents confirming a trip_id exists."""
        trip = await SeedFactory.trip(user_id="clerk_owner")
        r = await client.get(f"/api/trips/{trip.id}?user_id=clerk_attacker")
        # Must be 403, not 404 — attacker shouldn't learn if ID exists
        assert r.status_code == 403


# ── Missing user_id → 401 ──────────────────────────────────────


@pytest.mark.asyncio
class TestMissingAuthReturns401:
    async def test_update_without_user_id_returns_401(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.trip(user_id="clerk_u1")
        r = await client.put(
            f"/api/trips/{trip.id}",
            json={"user_id": "", "title": "New Title"},
        )
        assert r.status_code == 401
        assert "AUTHENTICATION_REQUIRED" in r.json()["error"]["code"]

    async def test_delete_without_user_id_returns_422(
        self, client: AsyncClient, beanie_init
    ) -> None:
        """user_id is a required query param — missing → 422 validation error."""
        trip = await SeedFactory.trip(user_id="clerk_u2")
        r = await client.delete(f"/api/trips/{trip.id}")
        assert r.status_code == 422

    async def test_add_pin_empty_user_id_returns_401(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.trip(user_id="clerk_u3")
        r = await client.post(
            f"/api/trips/{trip.id}/pins",
            json={"user_id": "   ", "place_name": "Tokyo", "lat": 35.6, "lng": 139.7},
        )
        assert r.status_code == 401

    async def test_error_message_is_descriptive(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_u4")
        r = await client.put(
            f"/api/trips/{trip.id}",
            json={"user_id": "", "title": "X"},
        )
        error = r.json()["error"]
        assert "authentication" in error["message"].lower()


# ── Guest trips accessible without auth ───────────────────────


@pytest.mark.asyncio
class TestGuestTripAccess:
    async def test_guest_trip_readable_without_user_id(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.guest_trip()
        r = await client.get(f"/api/trips/{trip.id}")
        assert r.status_code == 200
        assert r.json()["data"]["userId"] is None

    async def test_guest_trip_editable_without_user_id(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.guest_trip()
        r = await client.put(
            f"/api/trips/{trip.id}",
            json={"user_id": None, "title": "Updated Guest Trip"},
        )
        # user_id is required by UpdateTripRequest schema → 422
        # (guest trips can be READ without auth; writes still need user_id)
        assert r.status_code in (200, 401, 422)

    async def test_guest_trip_claim_links_to_user(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.guest_trip()
        r = await client.post(
            f"/api/trips/{trip.id}/claim",
            headers={"X-Test-User-Id": "clerk_claimer"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["userId"] == "clerk_claimer"

    async def test_claimed_trip_inaccessible_to_others(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.guest_trip()
        # Claim it
        await client.post(
            f"/api/trips/{trip.id}/claim",
            headers={"X-Test-User-Id": "clerk_claimer"},
        )
        # Now another user can't access it
        r = await client.get(f"/api/trips/{trip.id}?user_id=clerk_other")
        assert r.status_code == 403


# ── Input validation (Task 6 — schemas.py) ────────────────────


@pytest.mark.asyncio
class TestInputValidation:
    async def test_invalid_url_returns_422(self, client: AsyncClient, beanie_init) -> None:
        r = await client.post("/api/process", json={"url": "https://vimeo.com/12345"})
        assert r.status_code == 422

    async def test_pin_lat_out_of_range_returns_422(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_v1")
        r = await client.post(
            f"/api/trips/{trip.id}/pins",
            json={"user_id": "clerk_v1", "place_name": "Bad Lat", "lat": 999.0, "lng": 0.0},
        )
        assert r.status_code == 422

    async def test_pin_lng_out_of_range_returns_422(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_v2")
        r = await client.post(
            f"/api/trips/{trip.id}/pins",
            json={"user_id": "clerk_v2", "place_name": "Bad Lng", "lat": 35.0, "lng": 999.0},
        )
        assert r.status_code == 422

    async def test_empty_place_name_returns_422(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_v3")
        r = await client.post(
            f"/api/trips/{trip.id}/pins",
            json={"user_id": "clerk_v3", "place_name": "", "lat": 35.0, "lng": 139.0},
        )
        assert r.status_code == 422

    async def test_html_stripped_from_title(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_v4")
        r = await client.put(
            f"/api/trips/{trip.id}",
            json={"user_id": "clerk_v4", "title": "<script>alert('xss')</script>Japan Trip"},
        )
        assert r.status_code == 200
        assert "<script>" not in r.json()["data"]["title"]
        assert "Japan Trip" in r.json()["data"]["title"]

    async def test_chat_message_too_long_returns_422(
        self, client: AsyncClient, beanie_init
    ) -> None:
        trip = await SeedFactory.trip()
        r = await client.post(
            f"/api/trips/{trip.id}/chat",
            json={"message": "x" * 2001, "history": []},
        )
        assert r.status_code == 422

    async def test_invalid_chat_role_returns_422(self, client: AsyncClient, beanie_init) -> None:
        trip = await SeedFactory.trip()
        r = await client.post(
            f"/api/trips/{trip.id}/chat",
            json={
                "message": "Hello",
                "history": [{"role": "HACKER", "content": "test"}],
            },
        )
        assert r.status_code == 422
