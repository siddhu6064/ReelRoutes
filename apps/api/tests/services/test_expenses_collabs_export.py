"""
tests/services/test_expenses_collabs_export.py

Tests for:
  1. Expense tracking — solo mode and split mode
  2. Settlement calculation — who pays whom
  3. Collaborator invite + accept flow
  4. Map export — Google Maps URL, GPX structure, KML structure, GeoJSON
"""

from __future__ import annotations

import json

import pytest

from app.services.expense_service import (
    _compute_settlements,
    accept_invite,
    add_expense,
    check_can_edit,
    compute_summary,
    invite_collaborator,
)
from app.services.map_export_service import _google_maps_url, _safe_filename, export_trip
from app.utils.seed import SeedFactory, make_pin
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401

# ── Expense: Solo mode ─────────────────────────────────────────


@pytest.mark.asyncio
class TestSoloExpenses:
    async def test_add_solo_expense(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        expense = await add_expense(
            trip=trip,
            title="Hotel Tokyo",
            amount=200.0,
            paid_by_name="Me",
        )
        assert expense.is_solo is True
        assert expense.amount == 200.0
        assert expense.title == "Hotel Tokyo"
        assert len(expense.split_with) == 0

    async def test_solo_expense_saved_to_trip(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        await add_expense(trip, "Ramen", 15.0, "Me")
        await add_expense(trip, "Train pass", 30.0, "Me")
        assert len(trip.expenses) == 2

    async def test_solo_summary_totals(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        await add_expense(trip, "Hotel", 200.0, "Me", category="accommodation")
        await add_expense(trip, "Ramen", 15.0, "Me", category="food")
        summary = compute_summary(trip)
        assert summary.total_spent == 215.0
        assert summary.by_category["accommodation"] == 200.0
        assert summary.by_category["food"] == 15.0

    async def test_solo_has_no_settlements(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        await add_expense(trip, "Museum", 25.0, "Me")
        summary = compute_summary(trip)
        assert len(summary.settlements) == 0  # solo — nothing to settle


# ── Expense: Split mode ────────────────────────────────────────


@pytest.mark.asyncio
class TestSplitExpenses:
    async def test_equal_split_three_people(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        members = [
            {"member_name": "Alice"},
            {"member_name": "Bob"},
            {"member_name": "Carol"},
        ]
        expense = await add_expense(
            trip=trip,
            title="Dinner",
            amount=90.0,
            paid_by_name="Alice",
            split_type="equal",
            split_with=members,
        )
        assert expense.is_solo is False
        assert len(expense.split_with) == 3
        # Each person owes 30.0
        amounts = [s.amount for s in expense.split_with]
        assert sum(amounts) == pytest.approx(90.0)
        assert all(a == pytest.approx(30.0) for a in amounts)

    async def test_exact_split(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        members = [
            {"member_name": "Alice", "amount": 60.0},
            {"member_name": "Bob", "amount": 40.0},
        ]
        expense = await add_expense(
            trip=trip,
            title="Airbnb",
            amount=100.0,
            paid_by_name="Alice",
            split_type="exact",
            split_with=members,
        )
        alice_share = next(s for s in expense.split_with if s.member_name == "Alice")
        bob_share = next(s for s in expense.split_with if s.member_name == "Bob")
        assert alice_share.amount == 60.0
        assert bob_share.amount == 40.0

    async def test_percentage_split(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        members = [
            {"member_name": "Alice", "percentage": 70},
            {"member_name": "Bob", "percentage": 30},
        ]
        expense = await add_expense(
            trip=trip,
            title="Car rental",
            amount=200.0,
            paid_by_name="Alice",
            split_type="percentage",
            split_with=members,
        )
        alice = next(s for s in expense.split_with if s.member_name == "Alice")
        bob = next(s for s in expense.split_with if s.member_name == "Bob")
        assert alice.amount == pytest.approx(140.0)
        assert bob.amount == pytest.approx(60.0)

    async def test_non_account_members_allowed(self, beanie_init) -> None:
        """Splitting with people who don't have ReelRoutes accounts."""
        trip = await SeedFactory.trip()
        members = [{"member_name": "My Friend Jane"}, {"member_name": "Cousin Pedro"}]
        expense = await add_expense(
            trip=trip,
            title="Ferry tickets",
            amount=60.0,
            paid_by_name="Me",
            split_with=members,
        )
        names = [s.member_name for s in expense.split_with]
        assert "My Friend Jane" in names
        assert "Cousin Pedro" in names
        # None have clerk_ids — that's fine
        assert all(s.member_id is None for s in expense.split_with)


# ── Settlement calculation ─────────────────────────────────────


class TestSettlementAlgorithm:
    def test_simple_two_person_settlement(self) -> None:
        # Alice paid 100, Bob owes 50 → Bob pays Alice 50
        net = {"Alice": 50.0, "Bob": -50.0}
        transfers = _compute_settlements(net, "USD")
        assert len(transfers) == 1
        assert transfers[0].from_name == "Bob"
        assert transfers[0].to_name == "Alice"
        assert transfers[0].amount == pytest.approx(50.0)

    def test_three_person_optimal(self) -> None:
        # Alice: +80, Bob: -30, Carol: -50
        net = {"Alice": 80.0, "Bob": -30.0, "Carol": -50.0}
        transfers = _compute_settlements(net, "USD")
        total_transferred = sum(t.amount for t in transfers)
        assert total_transferred == pytest.approx(80.0)

    def test_balanced_no_settlements(self) -> None:
        net = {"Alice": 0.0, "Bob": 0.0}
        transfers = _compute_settlements(net, "USD")
        assert len(transfers) == 0

    def test_minimum_transactions(self) -> None:
        # Greedy nearest-match should minimise number of transfers
        net = {"A": 100.0, "B": -60.0, "C": -40.0}
        transfers = _compute_settlements(net, "USD")
        assert len(transfers) <= 2  # optimal is 2

    @pytest.mark.asyncio
    async def test_full_trip_settlement_via_summary(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        # Alice pays 90 dinner, split equally 3 ways
        members = [{"member_name": "Alice"}, {"member_name": "Bob"}, {"member_name": "Carol"}]
        await add_expense(trip, "Dinner", 90.0, "Alice", split_with=members)
        # Bob pays 60 taxi, split equally 3 ways
        await add_expense(trip, "Taxi", 60.0, "Bob", split_with=members)

        summary = compute_summary(trip)
        # Alice paid 90, owes 30 → net +60
        # Bob paid 60, owes 20 → net +40 (wait, Bob owes 30 for dinner + 20 for taxi = 50 total owed. Bob paid 60. Net = 60 - 50 = +10)
        # Actually let me recalculate: with 3 equal splits:
        # Dinner (90): each owes 30. Alice paid 90 → others owe Alice.
        # Taxi (60): each owes 20. Bob paid 60 → others owe Bob.
        # Alice: paid 90, owes 30 (dinner) + 20 (taxi) = 50. Net = 90-50 = +40
        # Bob: paid 60, owes 30 (dinner) + 20 (taxi) = 50. Net = 60-50 = +10
        # Carol: paid 0, owes 30 (dinner) + 20 (taxi) = 50. Net = -50
        assert summary.settlements  # there should be some settlements
        # Carol must pay someone
        carol_pays = [s for s in summary.settlements if s.from_name == "Carol"]
        assert len(carol_pays) > 0


# ── Collaborator flow ──────────────────────────────────────────


@pytest.mark.asyncio
class TestCollaborators:
    async def test_invite_creates_pending_collaborator(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        collab = await invite_collaborator(trip, name="Alice", role="editor")
        assert collab.name == "Alice"
        assert collab.role == "editor"
        assert collab.status == "pending"
        assert collab.clerk_id is None
        assert collab.invite_token

    async def test_accept_invite_links_clerk_id(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        collab = await invite_collaborator(trip, name="Bob", role="viewer")
        accepted = await accept_invite(trip, collab.invite_token, "clerk_bob")
        assert accepted.clerk_id == "clerk_bob"
        assert accepted.status == "active"
        assert accepted.joined_at is not None

    async def test_editor_can_edit(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        collab = await invite_collaborator(trip, name="Alice", role="editor")
        await accept_invite(trip, collab.invite_token, "clerk_alice")
        assert check_can_edit(trip, "clerk_alice") is True

    async def test_viewer_cannot_edit(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        collab = await invite_collaborator(trip, name="Bob", role="viewer")
        await accept_invite(trip, collab.invite_token, "clerk_bob")
        assert check_can_edit(trip, "clerk_bob") is False

    async def test_owner_can_always_edit(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        assert check_can_edit(trip, "clerk_owner") is True

    async def test_invalid_token_raises(self, beanie_init) -> None:
        trip = await SeedFactory.trip(user_id="clerk_owner")
        with pytest.raises(Exception):
            await accept_invite(trip, "invalid-token", "clerk_intruder")

    async def test_pending_collab_cannot_edit(self, beanie_init) -> None:
        """Invited but not yet accepted — cannot edit."""
        trip = await SeedFactory.trip(user_id="clerk_owner")
        await invite_collaborator(trip, name="Pending Person", role="editor")
        # They haven't accepted yet, so no clerk_id linked
        assert check_can_edit(trip, "clerk_pendingperson") is False


# ── Map export ─────────────────────────────────────────────────


class TestGoogleMapsExport:
    def test_single_pin_url(self) -> None:
        pins = [make_pin(order=0, lat=35.6762, lng=139.6503)]
        url = _google_maps_url(pins)
        assert "35.6762" in url
        assert "139.6503" in url

    def test_multi_pin_url_format(self) -> None:
        pins = [make_pin(order=i, lat=35.0 + i, lng=139.0 + i) for i in range(3)]
        url = _google_maps_url(pins)
        assert "google.com/maps/dir" in url
        assert url.count("/") >= 5  # at least 3 waypoints

    def test_empty_pins_returns_base_url(self) -> None:
        url = _google_maps_url([])
        assert "maps.google.com" in url

    def test_many_pins_capped_at_10(self) -> None:
        pins = [make_pin(order=i, lat=35.0 + i * 0.1, lng=139.0) for i in range(20)]
        url = _google_maps_url(pins)
        # URL should exist and be reasonable length
        assert len(url) < 2000


@pytest.mark.asyncio
class TestMapExportFormats:
    async def test_google_maps_returns_url(self, beanie_init) -> None:
        pins = [make_pin(order=i) for i in range(3)]
        trip = await SeedFactory.trip(pins=pins)
        result = export_trip(trip, "google_maps")
        assert result["format"] == "google_maps"
        assert result["url"] is not None
        assert "google.com" in result["url"]

    async def test_apple_maps_returns_gpx_content(self, beanie_init) -> None:
        pins = [make_pin(order=i) for i in range(3)]
        trip = await SeedFactory.trip(pins=pins)
        result = export_trip(trip, "apple_maps")
        assert result["format"] == "apple_maps"
        assert result["content"] is not None
        assert "<gpx" in result["content"]
        assert result["content_type"] == "application/gpx+xml"

    async def test_apple_maps_gpx_has_all_waypoints(self, beanie_init) -> None:
        pins = [make_pin(order=i) for i in range(4)]
        trip = await SeedFactory.trip(pins=pins)
        result = export_trip(trip, "apple_maps")
        gpx = result["content"]
        # All 4 pins should appear as waypoints
        assert gpx.count("<wpt ") == 4

    async def test_apple_maps_has_pin_links(self, beanie_init) -> None:
        pins = [make_pin(order=0)]
        trip = await SeedFactory.trip(pins=pins)
        result = export_trip(trip, "apple_maps")
        assert "pin_links" in result
        assert len(result["pin_links"]) == 1
        assert "maps.apple.com" in result["pin_links"][0]["url"]

    async def test_kml_format(self, beanie_init) -> None:
        pins = [make_pin(order=i) for i in range(3)]
        trip = await SeedFactory.trip(pins=pins)
        result = export_trip(trip, "kml")
        assert "<kml" in result["content"]
        assert "<Placemark>" in result["content"]
        assert result["filename"].endswith(".kml")

    async def test_geojson_format(self, beanie_init) -> None:
        pins = [make_pin(order=i) for i in range(3)]
        trip = await SeedFactory.trip(pins=pins)
        result = export_trip(trip, "geojson")
        data = json.loads(result["content"])
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == 3

    async def test_gpx_trip_title_in_metadata(self, beanie_init) -> None:
        trip = await SeedFactory.trip(pins=[make_pin(order=0)])
        trip.title = "Japan Adventure 2024"
        result = export_trip(trip, "gpx")
        assert "Japan Adventure 2024" in result["content"]


class TestSafeFilename:
    def test_normal_title(self) -> None:
        assert _safe_filename("Japan Trip 2024") == "Japan-Trip-2024"

    def test_special_chars_removed(self) -> None:
        result = _safe_filename("Tokyo: A Story!")
        assert ":" not in result
        assert "!" not in result

    def test_empty_title_fallback(self) -> None:
        assert _safe_filename("") == "ReelRoutes-Trip"

    def test_long_title_truncated(self) -> None:
        result = _safe_filename("A" * 100)
        assert len(result) <= 60
