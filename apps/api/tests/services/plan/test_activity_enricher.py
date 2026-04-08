"""
Tests for ActivityEnricherService (Phase 3 — task t12).
"""

from __future__ import annotations

import httpx
import pytest
import respx

from app.schemas.plan import ActivityStop
from app.services.plan.activity_enricher import ActivityEnricherService

DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"


def make_stop(
    name: str = "French Quarter",
    place_id: str = "place-123",
    famous_for: str = "Jazz music",
) -> ActivityStop:
    return ActivityStop(
        name=name,
        lat=29.958,
        lng=-90.064,
        place_id=place_id,
        famous_for=famous_for,
    )


def details_response(
    editorial: str | None = None,
    opening_hours: list | None = None,
    website: str = "https://example.com",
    phone: str = "+1 555-0100",
    rating: float = 4.5,
    price_level: int = 2,
) -> dict:
    result: dict = {
        "website": website,
        "formatted_phone_number": phone,
        "rating": rating,
        "price_level": price_level,
    }
    if editorial:
        result["editorial_summary"] = {"overview": editorial}
    if opening_hours is not None:
        result["opening_hours"] = {"weekday_text": opening_hours}
    return {"result": result, "status": "OK"}


class TestActivityEnricherService:
    @pytest.mark.asyncio
    @respx.mock
    async def test_enriches_website_and_phone(self):
        respx.get(DETAILS_URL).mock(return_value=httpx.Response(200, json=details_response()))
        svc = ActivityEnricherService(api_key="test-key")
        enriched = await svc.enrich([make_stop()])
        await svc.aclose()

        assert enriched[0].website == "https://example.com"
        assert enriched[0].phone == "+1 555-0100"

    @pytest.mark.asyncio
    @respx.mock
    async def test_enriches_rating_and_price_level(self):
        respx.get(DETAILS_URL).mock(return_value=httpx.Response(200, json=details_response()))
        svc = ActivityEnricherService(api_key="test-key")
        enriched = await svc.enrich([make_stop()])
        await svc.aclose()

        assert enriched[0].rating == pytest.approx(4.5)
        assert enriched[0].price_level == 2

    @pytest.mark.asyncio
    @respx.mock
    async def test_editorial_summary_overrides_short_famous_for(self):
        long_editorial = (
            "A vibrant historic district famous for jazz, Creole cuisine, and stunning architecture"
        )
        respx.get(DETAILS_URL).mock(
            return_value=httpx.Response(200, json=details_response(editorial=long_editorial))
        )
        svc = ActivityEnricherService(api_key="test-key")
        stop = make_stop(famous_for="Jazz music")  # shorter than editorial
        enriched = await svc.enrich([stop])
        await svc.aclose()

        assert enriched[0].famous_for == long_editorial

    @pytest.mark.asyncio
    @respx.mock
    async def test_short_editorial_does_not_override_longer_famous_for(self):
        respx.get(DETAILS_URL).mock(
            return_value=httpx.Response(200, json=details_response(editorial="Short"))
        )
        svc = ActivityEnricherService(api_key="test-key")
        long_famous_for = "Jazz music and Creole architecture and amazing food"
        stop = make_stop(famous_for=long_famous_for)
        enriched = await svc.enrich([stop])
        await svc.aclose()

        assert enriched[0].famous_for == long_famous_for

    @pytest.mark.asyncio
    @respx.mock
    async def test_opening_hours_formatted_correctly(self):
        hours = [
            "Monday: 9:00 AM – 5:00 PM",
            "Tuesday: 9:00 AM – 5:00 PM",
        ]
        respx.get(DETAILS_URL).mock(
            return_value=httpx.Response(200, json=details_response(opening_hours=hours))
        )
        svc = ActivityEnricherService(api_key="test-key")
        enriched = await svc.enrich([make_stop()])
        await svc.aclose()

        assert enriched[0].opening_hours is not None
        assert "Monday" in enriched[0].opening_hours
        assert "Tuesday" in enriched[0].opening_hours
        assert "|" in enriched[0].opening_hours

    @pytest.mark.asyncio
    async def test_skips_stop_without_place_id(self):
        stop = ActivityStop(name="Unknown", lat=0.0, lng=0.0)
        svc = ActivityEnricherService(api_key="test-key")
        enriched = await svc.enrich([stop])
        await svc.aclose()
        assert enriched[0] == stop

    @pytest.mark.asyncio
    @respx.mock
    async def test_returns_original_stop_on_api_failure(self):
        respx.get(DETAILS_URL).mock(return_value=httpx.Response(500))
        svc = ActivityEnricherService(api_key="test-key")
        stop = make_stop()
        enriched = await svc.enrich([stop])
        await svc.aclose()

        assert enriched[0].name == stop.name
        assert enriched[0].famous_for == stop.famous_for

    @pytest.mark.asyncio
    @respx.mock
    async def test_enriches_multiple_stops_concurrently(self):
        respx.get(DETAILS_URL).mock(return_value=httpx.Response(200, json=details_response()))
        svc = ActivityEnricherService(api_key="test-key")
        stops = [make_stop(f"Stop {i}", place_id=f"pid-{i}") for i in range(5)]
        enriched = await svc.enrich(stops)
        await svc.aclose()

        assert len(enriched) == 5
        assert all(e.website == "https://example.com" for e in enriched)

    @pytest.mark.asyncio
    @respx.mock
    async def test_returns_none_opening_hours_when_not_present(self):
        respx.get(DETAILS_URL).mock(
            return_value=httpx.Response(200, json=details_response(opening_hours=None))
        )
        svc = ActivityEnricherService(api_key="test-key")
        enriched = await svc.enrich([make_stop()])
        await svc.aclose()

        assert enriched[0].opening_hours is None

    @pytest.mark.asyncio
    @respx.mock
    async def test_place_id_passed_to_api(self):
        captured = []

        def capture(request):
            captured.append(dict(request.url.params))
            return httpx.Response(200, json=details_response())

        respx.get(DETAILS_URL).mock(side_effect=capture)
        svc = ActivityEnricherService(api_key="test-key")
        await svc.enrich([make_stop(place_id="special-place-id")])
        await svc.aclose()

        assert captured[0]["place_id"] == "special-place-id"

    @pytest.mark.asyncio
    @respx.mock
    async def test_fields_param_includes_required_fields(self):
        captured = []

        def capture(request):
            captured.append(dict(request.url.params))
            return httpx.Response(200, json=details_response())

        respx.get(DETAILS_URL).mock(side_effect=capture)
        svc = ActivityEnricherService(api_key="test-key")
        await svc.enrich([make_stop()])
        await svc.aclose()

        fields = captured[0].get("fields", "")
        assert "editorial_summary" in fields
        assert "opening_hours" in fields
        assert "website" in fields
