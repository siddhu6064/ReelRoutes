"""Phase 4 router tests — Community Feed, Collaboration, Undo, Reservations."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient

# ── Fixtures ────────────────────────────────────────────────────────


def _make_trip(
    user_id: str = "user_abc",
    is_public: bool = False,
    pin_count: int = 2,
    **kwargs,
) -> MagicMock:
    trip = MagicMock()
    trip.id = "507f1f77bcf86cd799439011"
    trip.user_id = user_id
    trip.title = kwargs.get("title", "Tokyo Adventure")
    trip.platform = kwargs.get("platform", "youtube")
    trip.source_url = "https://youtube.com/watch?v=abc"
    trip.is_public = is_public
    trip.view_count = kwargs.get("view_count", 0)
    trip.share_count = kwargs.get("share_count", 0)
    trip.video_creator = kwargs.get("video_creator")
    trip.video_channel = kwargs.get("video_channel")
    trip.pins = [MagicMock(id=str(uuid.uuid4())) for _ in range(pin_count)]
    trip.collaborators = kwargs.get("collaborators", [])
    trip.trip_edit_history = kwargs.get("trip_edit_history", [])
    trip.reservations = kwargs.get("reservations", [])
    trip.created_at = datetime(2024, 1, 1, tzinfo=UTC)
    trip.updated_at = datetime(2024, 1, 1, tzinfo=UTC)
    trip.save = AsyncMock()
    return trip


def _make_collab(clerk_id: str = "user_xyz", role: str = "viewer") -> MagicMock:
    c = MagicMock()
    c.id = str(uuid.uuid4())
    c.clerk_id = clerk_id
    c.role = role
    c.status = "active"
    c.joined_at = datetime(2024, 6, 1, tzinfo=UTC)
    c.invite_token = str(uuid.uuid4())
    return c


# ════════════════════════════════════════════════════════════════════
#  W13 — Explore / Community Feed
# ════════════════════════════════════════════════════════════════════


class TestGetExplore:
    async def test_returns_public_trips(self, client: AsyncClient) -> None:
        public_trip = _make_trip(is_public=True)

        with patch("app.routers.explore.TripDocument.find") as mock_find:
            chain = MagicMock()
            chain.sort.return_value = chain
            chain.skip.return_value = chain
            chain.limit.return_value = chain
            chain.to_list = AsyncMock(return_value=[public_trip])
            mock_find.return_value = chain

            resp = await client.get("/api/explore")

        assert resp.status_code == 200
        data = resp.json()
        assert data["ok"] is True
        assert len(data["data"]["trips"]) == 1
        assert data["data"]["trips"][0]["title"] == "Tokyo Adventure"

    async def test_filters_by_platform(self, client: AsyncClient) -> None:
        with patch("app.routers.explore.TripDocument.find") as mock_find:
            chain = MagicMock()
            chain.sort.return_value = chain
            chain.skip.return_value = chain
            chain.limit.return_value = chain
            chain.to_list = AsyncMock(return_value=[])
            mock_find.return_value = chain

            resp = await client.get("/api/explore?platform=youtube")

        assert resp.status_code == 200
        call_args = mock_find.call_args[0][0]
        assert call_args["platform"] == "youtube"

    async def test_destination_fuzzy_filter(self, client: AsyncClient) -> None:
        tokyo_trip = _make_trip(is_public=True, title="Tokyo food guide")
        paris_trip = _make_trip(is_public=True, title="Paris highlights")

        with patch("app.routers.explore.TripDocument.find") as mock_find:
            chain = MagicMock()
            chain.sort.return_value = chain
            chain.skip.return_value = chain
            chain.limit.return_value = chain
            chain.to_list = AsyncMock(return_value=[tokyo_trip, paris_trip])
            mock_find.return_value = chain

            resp = await client.get("/api/explore?destination=tokyo")

        data = resp.json()
        assert len(data["data"]["trips"]) == 1
        assert "Tokyo" in data["data"]["trips"][0]["title"]

    async def test_pagination_params(self, client: AsyncClient) -> None:
        with patch("app.routers.explore.TripDocument.find") as mock_find:
            chain = MagicMock()
            chain.sort.return_value = chain
            chain.skip.return_value = chain
            chain.limit.return_value = chain
            chain.to_list = AsyncMock(return_value=[])
            mock_find.return_value = chain

            resp = await client.get("/api/explore?page=2&limit=10")

        assert resp.status_code == 200
        chain.skip.assert_called_with(10)  # (page-1) * limit = 10
        chain.limit.assert_called_with(10)


class TestGetTrending:
    async def test_returns_sorted_by_views(self, client: AsyncClient) -> None:
        popular = _make_trip(is_public=True, view_count=500, share_count=20)

        with patch("app.routers.explore.TripDocument.find") as mock_find:
            chain = MagicMock()
            chain.sort.return_value = chain
            chain.limit.return_value = chain
            chain.to_list = AsyncMock(return_value=[popular])
            mock_find.return_value = chain

            resp = await client.get("/api/explore/trending")

        assert resp.status_code == 200
        data = resp.json()
        assert data["data"]["trips"][0]["view_count"] == 500


class TestIncrementView:
    async def test_increments_public_trip(self, client: AsyncClient) -> None:
        trip = _make_trip(is_public=True, view_count=5)

        with patch("app.routers.explore.TripDocument.get", AsyncMock(return_value=trip)):
            resp = await client.post(f"/api/trips/{trip.id}/view")

        assert resp.status_code == 200
        assert trip.view_count == 6
        trip.save.assert_called_once()

    async def test_skips_private_trip(self, client: AsyncClient) -> None:
        trip = _make_trip(is_public=False, view_count=0)

        with patch("app.routers.explore.TripDocument.get", AsyncMock(return_value=trip)):
            resp = await client.post(f"/api/trips/{trip.id}/view")

        assert resp.status_code == 200
        assert trip.view_count == 0  # not incremented
        trip.save.assert_not_called()


class TestDuplicateTrip:
    async def test_creates_copy(self, client: AsyncClient) -> None:
        source = _make_trip(user_id="original_user", pin_count=3)

        with (
            patch("app.routers.explore.TripService.get", AsyncMock(return_value=source)),
            patch("app.routers.explore.TripDocument") as MockTripDoc,
        ):
            new_trip = MagicMock()
            new_trip.id = "507f1f77bcf86cd799439099"
            new_trip.title = "Copy of Tokyo Adventure"
            new_trip.pins = source.pins
            new_trip.insert = AsyncMock()
            MockTripDoc.return_value = new_trip

            resp = await client.post(f"/api/trips/{source.id}/duplicate?user_id=new_user")

        assert resp.status_code == 200
        assert "Copy of" in resp.json()["data"]["title"]


class TestSetVisibility:
    async def test_makes_trip_public(self, client: AsyncClient) -> None:
        trip = _make_trip(user_id="user_abc", is_public=False)

        with patch("app.routers.explore.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.patch(
                f"/api/trips/{trip.id}/visibility?user_id=user_abc&is_public=true"
            )

        assert resp.status_code == 200
        assert resp.json()["data"]["is_public"] is True
        assert trip.is_public is True


# ════════════════════════════════════════════════════════════════════
#  W14 — Collaboration
# ════════════════════════════════════════════════════════════════════


class TestCreateInvite:
    async def test_creates_invite_token(self, client: AsyncClient) -> None:
        trip = _make_trip(user_id="owner_123")

        with patch("app.routers.collaborate.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post(
                f"/api/trips/{trip.id}/invite?user_id=owner_123",
                json={"role": "editor"},
            )

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "invite_token" in data
        assert len(data["invite_token"]) == 36  # UUID format
        assert data["role"] == "editor"
        assert len(trip.collaborators) == 1
        trip.save.assert_called_once()

    async def test_invite_default_role_viewer(self, client: AsyncClient) -> None:
        trip = _make_trip(user_id="owner_123")

        with patch("app.routers.collaborate.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post(
                f"/api/trips/{trip.id}/invite?user_id=owner_123",
                json={},
            )

        assert resp.status_code == 200
        assert resp.json()["data"]["role"] == "viewer"


class TestAcceptInvite:
    async def test_links_user_to_trip(self, client: AsyncClient) -> None:
        token = str(uuid.uuid4())
        pending = MagicMock()
        pending.invite_token = token
        pending.clerk_id = None
        pending.status = "pending"
        pending.role = "editor"

        trip = _make_trip(collaborators=[pending])

        with patch(
            "app.routers.collaborate.TripDocument.find_one",
            AsyncMock(return_value=trip),
        ):
            resp = await client.get(f"/api/invite/{token}/accept?user_id=new_user_999")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["role"] == "editor"
        assert pending.clerk_id == "new_user_999"
        assert pending.status == "active"
        trip.save.assert_called_once()

    async def test_token_not_found_raises_404(self, client: AsyncClient) -> None:
        with patch(
            "app.routers.collaborate.TripDocument.find_one",
            AsyncMock(return_value=None),
        ):
            resp = await client.get("/api/invite/bad-token/accept?user_id=someone")

        assert resp.status_code == 404


class TestListCollaborators:
    async def test_returns_active_collaborators(self, client: AsyncClient) -> None:
        collab = _make_collab("user_xyz", "viewer")
        pending = MagicMock()
        pending.clerk_id = None
        pending.role = "editor"
        pending.status = "pending"

        trip = _make_trip(user_id="owner_123", collaborators=[collab, pending])

        with patch("app.routers.collaborate.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get(f"/api/trips/{trip.id}/collaborators?user_id=owner_123")

        data = resp.json()["data"]
        assert len(data["collaborators"]) == 1  # only active (status=active)
        assert data["collaborators"][0]["clerk_id"] == "user_xyz"
        assert data["pending_count"] == 1


class TestRemoveCollaborator:
    async def test_owner_removes_collaborator(self, client: AsyncClient) -> None:
        collab = _make_collab("user_xyz", "viewer")
        trip = _make_trip(user_id="owner_123", collaborators=[collab])

        with patch("app.routers.collaborate.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.delete(
                f"/api/trips/{trip.id}/collaborators/{collab.id}?user_id=owner_123"
            )

        assert resp.status_code == 200
        assert len(trip.collaborators) == 0
        trip.save.assert_called_once()


class TestCheckEditPermission:
    async def test_owner_can_write(self, client: AsyncClient) -> None:
        trip = _make_trip(user_id="owner_123")

        with patch("app.routers.collaborate.TripDocument.get", AsyncMock(return_value=trip)):
            resp = await client.get(f"/api/trips/{trip.id}/can-edit?user_id=owner_123")

        data = resp.json()["data"]
        assert data["can_write"] is True
        assert data["is_owner"] is True

    async def test_stranger_cannot_write_private_trip(self, client: AsyncClient) -> None:
        trip = _make_trip(user_id="owner_123", is_public=False)

        with patch("app.routers.collaborate.TripDocument.get", AsyncMock(return_value=trip)):
            resp = await client.get(f"/api/trips/{trip.id}/can-edit?user_id=stranger_999")

        data = resp.json()["data"]
        assert data["can_write"] is False
        assert data["can_read"] is False


# ════════════════════════════════════════════════════════════════════
#  W15 — Undo / Edit History
# ════════════════════════════════════════════════════════════════════


class TestUndoTrip:
    async def test_restores_previous_pins(self, client: AsyncClient) -> None:
        old_pin = {"id": "pin_old", "place_name": "Old Place", "lat": 35.0, "lng": 139.0}
        snapshot = MagicMock()
        snapshot.snapshot_at = datetime(2024, 6, 1, tzinfo=UTC)
        snapshot.pins_json = json.dumps([old_pin])

        trip = _make_trip(trip_edit_history=[snapshot])

        with (
            patch("app.routers.undo.TripService.get", AsyncMock(return_value=trip)),
            patch("app.routers.undo.PinDocument") as MockPin,
        ):
            MockPin.return_value = MagicMock()

            resp = await client.post(f"/api/trips/{trip.id}/undo?user_id=user_abc")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "restored_at" in data
        assert len(trip.trip_edit_history) == 0  # snapshot consumed
        trip.save.assert_called_once()

    async def test_empty_history_returns_message(self, client: AsyncClient) -> None:
        trip = _make_trip(trip_edit_history=[])

        with patch("app.routers.undo.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post(f"/api/trips/{trip.id}/undo?user_id=user_abc")

        assert resp.status_code == 200
        assert "Nothing to undo" in resp.json()["data"]["message"]
        trip.save.assert_not_called()


class TestGetHistory:
    async def test_returns_snapshot_timestamps(self, client: AsyncClient) -> None:
        snap1 = MagicMock(snapshot_at=datetime(2024, 6, 1, tzinfo=UTC), pins_json="[]")
        snap2 = MagicMock(snapshot_at=datetime(2024, 6, 2, tzinfo=UTC), pins_json="[]")

        trip = _make_trip(trip_edit_history=[snap1, snap2])

        with patch("app.routers.undo.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get(f"/api/trips/{trip.id}/history?user_id=user_abc")

        data = resp.json()["data"]
        assert len(data["snapshots"]) == 2
        assert data["max_history"] == 20


class TestPushSnapshot:
    async def test_snapshot_appended(self) -> None:
        from app.routers.undo import push_snapshot

        pin = MagicMock()
        pin.model_dump = MagicMock(return_value={"id": "p1", "place_name": "Test"})

        trip = _make_trip(trip_edit_history=[])
        trip.pins = [pin]

        await push_snapshot(trip)

        assert len(trip.trip_edit_history) == 1
        assert "p1" in trip.trip_edit_history[0].pins_json

    async def test_history_capped_at_20(self) -> None:
        from app.routers.undo import push_snapshot

        pin = MagicMock()
        pin.model_dump = MagicMock(return_value={"id": "p1", "place_name": "Test"})

        existing = [MagicMock(snapshot_at=datetime.now(UTC), pins_json="[]") for _ in range(20)]
        trip = _make_trip(trip_edit_history=existing)
        trip.pins = [pin]

        await push_snapshot(trip)

        assert len(trip.trip_edit_history) == 20


# ════════════════════════════════════════════════════════════════════
#  W16 — Reservations
# ════════════════════════════════════════════════════════════════════


class TestImportReservation:
    async def test_parses_hotel_email(self, client: AsyncClient) -> None:
        trip = _make_trip()
        parsed_result = {
            "type": "hotel",
            "title": "Park Hyatt Tokyo Check-in",
            "confirmation_number": "HTL-9988",
            "flight_number": None,
            "check_in": None,
            "check_out": None,
            "notes": "King room, 3 nights",
        }

        with (
            patch("app.routers.reservations.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.routers.reservations.parse_reservation_email",
                AsyncMock(return_value=parsed_result),
            ),
        ):
            resp = await client.post(
                f"/api/trips/{trip.id}/import-reservation?user_id=user_abc",
                json={"email_text": "Dear Guest, your reservation at Park Hyatt..."},
            )

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["type"] == "hotel"
        assert data["title"] == "Park Hyatt Tokyo Check-in"
        assert data["confirmation_number"] == "HTL-9988"
        assert len(trip.reservations) == 1
        trip.save.assert_called_once()

    async def test_parses_flight_email(self, client: AsyncClient) -> None:
        trip = _make_trip()
        parsed_result = {
            "type": "flight",
            "title": "United UA 142 SFO→NRT",
            "confirmation_number": "XKQZ99",
            "flight_number": "UA142",
            "check_in": None,
            "check_out": None,
            "notes": None,
        }

        with (
            patch("app.routers.reservations.TripService.get", AsyncMock(return_value=trip)),
            patch(
                "app.routers.reservations.parse_reservation_email",
                AsyncMock(return_value=parsed_result),
            ),
        ):
            resp = await client.post(
                f"/api/trips/{trip.id}/import-reservation?user_id=user_abc",
                json={"email_text": "Your United flight confirmation..."},
            )

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["type"] == "flight"
        assert data["flight_number"] == "UA142"


class TestListReservations:
    async def test_returns_sorted_reservations(self, client: AsyncClient) -> None:
        r1 = MagicMock()
        r1.id = "res_1"
        r1.reservation_type = "hotel"
        r1.title = "Hyatt"
        r1.confirmation_number = "H123"
        r1.check_in = datetime(2024, 7, 10, tzinfo=UTC)
        r1.check_out = datetime(2024, 7, 13, tzinfo=UTC)
        r1.flight_number = None
        r1.notes = None
        r1.created_at = datetime(2024, 6, 1, tzinfo=UTC)

        trip = _make_trip(reservations=[r1])

        with patch("app.routers.reservations.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get(f"/api/trips/{trip.id}/reservations?user_id=user_abc")

        assert resp.status_code == 200
        res = resp.json()["data"]["reservations"]
        assert len(res) == 1
        assert res[0]["title"] == "Hyatt"


class TestDeleteReservation:
    async def test_removes_reservation(self, client: AsyncClient) -> None:
        r = MagicMock()
        r.id = "res_to_delete"

        trip = _make_trip(reservations=[r])

        with patch("app.routers.reservations.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.delete(
                f"/api/trips/{trip.id}/reservations/res_to_delete?user_id=user_abc"
            )

        assert resp.status_code == 200
        assert len(trip.reservations) == 0
        trip.save.assert_called_once()

    async def test_missing_reservation_raises_404(self, client: AsyncClient) -> None:
        trip = _make_trip(reservations=[])

        with patch("app.routers.reservations.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.delete(
                f"/api/trips/{trip.id}/reservations/ghost_id?user_id=user_abc"
            )

        assert resp.status_code == 404
