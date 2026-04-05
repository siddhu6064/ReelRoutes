"""W20 — Book generation router + service tests."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from httpx import AsyncClient


def _make_pin(order: int, name: str = "Place", visited: bool = False) -> MagicMock:
    p = MagicMock()
    p.id = f"pin_{order}"
    p.order = order
    p.place_name = name
    p.lat = 35.0 + order * 0.01
    p.lng = 139.0
    p.address = f"{name} Address"
    p.context_quote = f"We visited {name}"
    p.rating = 4.5
    p.website = None
    p.category = "landmark"
    p.visited_at = datetime.now(UTC) if visited else None
    p.diary_entry = None
    return p


def _make_trip(pins: list, has_itinerary: bool = False) -> MagicMock:
    t = MagicMock()
    t.title = "Tokyo Adventure"
    t.platform = "youtube"
    t.source_url = "https://youtube.com/watch?v=abc"
    t.video_creator = "@travelcreator"
    t.pins = pins
    t.itinerary = (
        []
        if not has_itinerary
        else [
            MagicMock(
                day_number=1,
                label="Day 1 — Shinjuku",
                notes="Start here",
                pin_ids=["pin_1", "pin_2"],
            ),
            MagicMock(day_number=2, label="Day 2 — Asakusa", notes=None, pin_ids=["pin_3"]),
        ]
    )
    return t


class TestGenerateBook:
    async def test_returns_book_layout(self, client: AsyncClient) -> None:
        pins = [_make_pin(i, f"Place {i}") for i in range(1, 6)]
        trip = _make_trip(pins)

        with patch("app.routers.book.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post("/api/trips/trip1/book")

        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["title"] == "Tokyo Adventure"
        assert data["page_count"] > 0
        assert "print_specs" in data
        assert data["print_specs"]["suggested_vendor"] == "Lulu"

    async def test_layout_has_expected_pages(self, client: AsyncClient) -> None:
        pins = [_make_pin(i, f"Stop {i}") for i in range(1, 4)]
        trip = _make_trip(pins)

        with patch("app.routers.book.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post("/api/trips/trip1/book")

        layout = resp.json()["data"]["layout"]
        page_types = [p["type"] for p in layout["pages"]]
        assert "title" in page_types
        assert "introduction" in page_types
        assert "day" in page_types
        assert "map" in page_types
        assert "credits" in page_types

    async def test_layout_credits_include_creator(self, client: AsyncClient) -> None:
        pins = [_make_pin(1)]
        trip = _make_trip(pins)

        with patch("app.routers.book.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post("/api/trips/trip1/book")

        layout = resp.json()["data"]["layout"]
        credits = next(p for p in layout["pages"] if p["type"] == "credits")
        assert credits["video_creator"] == "@travelcreator"

    async def test_itinerary_based_day_pages(self, client: AsyncClient) -> None:
        pins = [_make_pin(i) for i in range(1, 4)]
        trip = _make_trip(pins, has_itinerary=True)

        with patch("app.routers.book.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.post("/api/trips/trip1/book")

        layout = resp.json()["data"]["layout"]
        day_pages = [p for p in layout["pages"] if p["type"] == "day"]
        assert len(day_pages) == 2
        assert day_pages[0]["title"] == "Day 1 — Shinjuku"

    async def test_get_layout_endpoint(self, client: AsyncClient) -> None:
        pins = [_make_pin(1)]
        trip = _make_trip(pins)

        with patch("app.routers.book.TripService.get", AsyncMock(return_value=trip)):
            resp = await client.get("/api/trips/trip1/book/layout")

        assert resp.status_code == 200
        assert "pages" in resp.json()["data"]


class TestBuildBookLayout:
    def test_fallback_chunking_without_itinerary(self) -> None:
        from app.services.book_service import build_book_layout

        pins = [_make_pin(i) for i in range(1, 13)]  # 12 pins → 3 day chunks of 4
        trip = _make_trip(pins, has_itinerary=False)

        layout = build_book_layout(trip)
        day_pages = [p for p in layout["pages"] if p["type"] == "day"]
        assert len(day_pages) == 3  # ceil(12/5) = 3

    def test_visited_pins_flagged(self) -> None:
        from app.services.book_service import build_book_layout

        pins = [_make_pin(1, visited=True), _make_pin(2, visited=False)]
        trip = _make_trip(pins)

        layout = build_book_layout(trip)
        title_page = next(p for p in layout["pages"] if p["type"] == "title")
        assert title_page["visited_count"] == 1
        assert title_page["stop_count"] == 2


class TestExtractionPromptNonEnglish:
    def test_system_prompt_includes_non_english_rules(self) -> None:
        from app.services.extraction.prompt import SYSTEM_PROMPT

        assert "NON-ENGLISH" in SYSTEM_PROMPT
        assert "TRANSLITERATED" in SYSTEM_PROMPT
        assert "English form" in SYSTEM_PROMPT
