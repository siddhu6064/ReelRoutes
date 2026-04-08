"""
Tests for PlanGeocoderService — Google Places geocoding for plan places.
All HTTP calls are mocked via httpx.MockTransport.
"""

from __future__ import annotations

from urllib.parse import unquote

import httpx
import pytest
import respx

from app.services.plan.ai_planner import RawPlace
from app.services.plan.plan_geocoder import GeocodedPlace, PlanGeocoderService

PLACES_TEXT_SEARCH_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


def make_raw_place(name="French Quarter", area="New Orleans", category="activity") -> RawPlace:
    return RawPlace(
        {
            "name": name,
            "area": area,
            "famous_for": "Jazz music",
            "best_time": "Evening",
            "local_tip": "Go on weeknights",
            "category": category,
        }
    )


def places_response(lat=29.9584, lng=-90.0644, name="French Quarter") -> dict:
    return {
        "results": [
            {
                "name": name,
                "place_id": "ChIJtest123",
                "formatted_address": "French Quarter, New Orleans, LA",
                "geometry": {"location": {"lat": lat, "lng": lng}},
                "photos": [{"photo_reference": "ref123"}],
            }
        ],
        "status": "OK",
    }


class TestPlanGeocoderService:
    @pytest.mark.asyncio
    @respx.mock
    async def test_geocode_single_place_success(self):
        respx.get(PLACES_TEXT_SEARCH_URL).mock(
            return_value=httpx.Response(200, json=places_response())
        )
        service = PlanGeocoderService(api_key="test-key")
        result = await service.geocode_places([make_raw_place()], "New Orleans, LA")
        await service.aclose()

        assert len(result) == 1
        assert isinstance(result[0], GeocodedPlace)
        assert result[0].name == "French Quarter"
        assert result[0].lat == pytest.approx(29.9584)
        assert result[0].lng == pytest.approx(-90.0644)
        assert result[0].place_id == "ChIJtest123"

    @pytest.mark.asyncio
    @respx.mock
    async def test_geocode_attaches_metadata(self):
        respx.get(PLACES_TEXT_SEARCH_URL).mock(
            return_value=httpx.Response(200, json=places_response())
        )
        service = PlanGeocoderService(api_key="test-key")
        place = make_raw_place()
        result = await service.geocode_places([place], "New Orleans, LA")
        await service.aclose()

        g = result[0]
        assert g.famous_for == "Jazz music"
        assert g.best_time == "Evening"
        assert g.local_tip == "Go on weeknights"
        assert g.category == "activity"

    @pytest.mark.asyncio
    @respx.mock
    async def test_geocode_builds_photo_url(self):
        respx.get(PLACES_TEXT_SEARCH_URL).mock(
            return_value=httpx.Response(200, json=places_response())
        )
        service = PlanGeocoderService(api_key="test-key")
        result = await service.geocode_places([make_raw_place()], "New Orleans, LA")
        await service.aclose()

        assert result[0].photo_url is not None
        assert "ref123" in result[0].photo_url
        assert "test-key" in result[0].photo_url

    @pytest.mark.asyncio
    @respx.mock
    async def test_geocode_skips_place_with_no_results(self):
        respx.get(PLACES_TEXT_SEARCH_URL).mock(
            return_value=httpx.Response(200, json={"results": [], "status": "ZERO_RESULTS"})
        )
        service = PlanGeocoderService(api_key="test-key")
        result = await service.geocode_places([make_raw_place()], "New Orleans, LA")
        await service.aclose()

        assert result == []

    @pytest.mark.asyncio
    @respx.mock
    async def test_geocode_skips_failed_places_continues_rest(self):
        """One failure should not abort the entire batch."""
        good_place = make_raw_place("Garden District")
        bad_place = make_raw_place("Nonexistent Xyzzy Place")

        call_count = 0

        def side_effect(request):
            nonlocal call_count
            call_count += 1
            if "Nonexistent" in str(request.url):
                return httpx.Response(200, json={"results": [], "status": "ZERO_RESULTS"})
            return httpx.Response(200, json=places_response(name="Garden District"))

        respx.get(PLACES_TEXT_SEARCH_URL).mock(side_effect=side_effect)
        service = PlanGeocoderService(api_key="test-key")
        result = await service.geocode_places([good_place, bad_place], "New Orleans, LA")
        await service.aclose()

        assert len(result) == 1
        assert result[0].name == "Garden District"

    @pytest.mark.asyncio
    @respx.mock
    async def test_geocode_handles_missing_photo(self):
        response = places_response()
        response["results"][0].pop("photos")
        respx.get(PLACES_TEXT_SEARCH_URL).mock(return_value=httpx.Response(200, json=response))
        service = PlanGeocoderService(api_key="test-key")
        result = await service.geocode_places([make_raw_place()], "New Orleans, LA")
        await service.aclose()

        assert result[0].photo_url is None

    @pytest.mark.asyncio
    @respx.mock
    async def test_geocode_query_includes_area_and_destination(self):
        captured_urls = []

        def capture(request):
            captured_urls.append(str(request.url))
            return httpx.Response(200, json=places_response())

        respx.get(PLACES_TEXT_SEARCH_URL).mock(side_effect=capture)
        service = PlanGeocoderService(api_key="test-key")
        place = make_raw_place(name="Cafe Du Monde", area="French Quarter")
        await service.geocode_places([place], "New Orleans, LA")
        await service.aclose()

        assert len(captured_urls) == 1
        decoded = unquote(captured_urls[0])
        assert "Cafe Du Monde" in decoded
