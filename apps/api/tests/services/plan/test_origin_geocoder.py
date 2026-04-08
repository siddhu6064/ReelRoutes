"""
Tests for OriginGeocoderService — resolves starting_point string to lat/lng.
"""

from __future__ import annotations

import httpx
import pytest
import respx

from app.services.plan.origin_geocoder import OriginGeocoderService

PLACES_URL = "https://maps.googleapis.com/maps/api/place/textsearch/json"


def places_response(lat: float = 30.2672, lng: float = -97.7431) -> dict:
    return {
        "results": [
            {
                "name": "Austin, TX, USA",
                "geometry": {"location": {"lat": lat, "lng": lng}},
                "formatted_address": "Austin, TX, USA",
            }
        ],
        "status": "OK",
    }


class TestOriginGeocoderService:
    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_returns_lat_lng(self):
        respx.get(PLACES_URL).mock(return_value=httpx.Response(200, json=places_response()))
        service = OriginGeocoderService(api_key="test-key")
        result = await service.resolve("Austin, TX")
        await service.aclose()

        assert result is not None
        lat, lng = result
        assert lat == pytest.approx(30.2672)
        assert lng == pytest.approx(-97.7431)

    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_returns_none_on_empty_results(self):
        respx.get(PLACES_URL).mock(
            return_value=httpx.Response(200, json={"results": [], "status": "ZERO_RESULTS"})
        )
        service = OriginGeocoderService(api_key="test-key")
        result = await service.resolve("Nonexistent Place XYZ")
        await service.aclose()

        assert result is None

    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_returns_none_on_http_error(self):
        respx.get(PLACES_URL).mock(return_value=httpx.Response(500))
        service = OriginGeocoderService(api_key="test-key")
        result = await service.resolve("Austin, TX")
        await service.aclose()

        assert result is None

    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_passes_query_to_api(self):
        captured = []

        def capture(request):
            captured.append(str(request.url))
            return httpx.Response(200, json=places_response())

        respx.get(PLACES_URL).mock(side_effect=capture)
        service = OriginGeocoderService(api_key="test-key")
        await service.resolve("Austin, TX")
        await service.aclose()

        assert len(captured) == 1
        assert "Austin" in captured[0]

    @pytest.mark.asyncio
    @respx.mock
    async def test_resolve_returns_none_on_missing_coordinates(self):
        bad_response = {
            "results": [{"name": "Austin", "geometry": {"location": {}}}],
            "status": "OK",
        }
        respx.get(PLACES_URL).mock(return_value=httpx.Response(200, json=bad_response))
        service = OriginGeocoderService(api_key="test-key")
        result = await service.resolve("Austin, TX")
        await service.aclose()

        assert result is None
