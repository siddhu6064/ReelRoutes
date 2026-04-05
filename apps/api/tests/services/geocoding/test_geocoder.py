"""
tests/services/geocoding/test_geocoder.py

Tests for the geocoding service — mocked Google Places API responses.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.extraction.parser import ExtractedLocation
from app.services.geocoding.geocoder import (
    GeocodingResult,
    geocode_locations,
    haversine_metres,
)

# ── Fixture helpers ────────────────────────────────────────────


def _ext(name: str, conf: float = 0.9, order: int = 0) -> ExtractedLocation:
    return ExtractedLocation(
        place_name=name,
        context_quote=f"{name} context",
        confidence=conf,
        order=order,
    )


def _places_response(results: list[dict]) -> dict:
    return {"status": "OK", "results": results}


def _place_result(
    name: str,
    place_id: str,
    lat: float,
    lng: float,
    address: str = "Tokyo, Japan",
    country_code: str = "JP",
    city: str = "Tokyo",
) -> dict:
    return {
        "place_id": place_id,
        "name": name,
        "formatted_address": address,
        "geometry": {"location": {"lat": lat, "lng": lng}},
        "address_components": [
            {"types": ["country"], "short_name": country_code, "long_name": country_code},
            {"types": ["locality"], "short_name": city, "long_name": city},
        ],
    }


def _mock_http(response_data: dict):
    """Helper: patch httpx.AsyncClient to return the given dict."""
    mock = MagicMock()
    mock.json = lambda: response_data
    mock.raise_for_status = lambda: None
    return mock


# ── geocode_locations ──────────────────────────────────────────


@pytest.mark.asyncio
class TestGeocodeLocations:
    async def test_returns_geocoding_result(self) -> None:
        extracted = [_ext("Shibuya Crossing")]
        resp = _places_response([_place_result("Shibuya Crossing", "ChIJabc", 35.6595, 139.7004)])

        with (
            patch("app.services.geocoding.geocoder.httpx.AsyncClient") as mc,
            patch("app.services.geocoding.geocoder.get_settings") as ms,
        ):
            ms.return_value.google_places_api_key = "fake-key"
            mc.return_value.__aenter__.return_value.get = AsyncMock(return_value=_mock_http(resp))
            result = await geocode_locations(extracted)

        assert isinstance(result, GeocodingResult)
        assert len(result.locations) == 1
        assert result.geocoded_count == 1
        assert result.unresolved_count == 0

    async def test_populates_coordinates(self) -> None:
        extracted = [_ext("Shibuya Crossing")]
        resp = _places_response([_place_result("Shibuya Crossing", "ChIJabc", 35.6595, 139.7004)])

        with (
            patch("app.services.geocoding.geocoder.httpx.AsyncClient") as mc,
            patch("app.services.geocoding.geocoder.get_settings") as ms,
        ):
            ms.return_value.google_places_api_key = "fake-key"
            mc.return_value.__aenter__.return_value.get = AsyncMock(return_value=_mock_http(resp))
            result = await geocode_locations(extracted)

        loc = result.locations[0]
        assert loc.lat == pytest.approx(35.6595)
        assert loc.lng == pytest.approx(139.7004)
        assert loc.place_id == "ChIJabc"
        assert loc.country_code == "JP"
        assert loc.city == "Tokyo"
        assert loc.geocoded is True

    async def test_zero_results_marks_unresolved(self) -> None:
        extracted = [_ext("Nonexistent Place")]
        resp = {"status": "ZERO_RESULTS", "results": []}

        with (
            patch("app.services.geocoding.geocoder.httpx.AsyncClient") as mc,
            patch("app.services.geocoding.geocoder.get_settings") as ms,
        ):
            ms.return_value.google_places_api_key = "fake-key"
            mc.return_value.__aenter__.return_value.get = AsyncMock(return_value=_mock_http(resp))
            result = await geocode_locations(extracted)

        assert result.unresolved_count == 1
        assert result.locations[0].unresolved is True
        assert result.locations[0].geocoded is False

    async def test_multiple_results_marks_ambiguous_and_stores_candidates(self) -> None:
        """Task 4 — ambiguous results store up to 5 candidates."""
        extracted = [_ext("Springfield")]
        resp = _places_response(
            [
                _place_result(
                    "Springfield, IL",
                    "p1",
                    39.7817,
                    -89.6501,
                    country_code="US",
                    city="Springfield",
                ),
                _place_result(
                    "Springfield, MO",
                    "p2",
                    37.2090,
                    -93.2923,
                    country_code="US",
                    city="Springfield",
                ),
            ]
        )

        with (
            patch("app.services.geocoding.geocoder.httpx.AsyncClient") as mc,
            patch("app.services.geocoding.geocoder.get_settings") as ms,
        ):
            ms.return_value.google_places_api_key = "fake-key"
            mc.return_value.__aenter__.return_value.get = AsyncMock(return_value=_mock_http(resp))
            result = await geocode_locations(extracted)

        loc = result.locations[0]
        assert loc.ambiguous is True
        assert len(loc.candidates) == 2
        assert result.ambiguous_count == 1

    async def test_empty_input_returns_empty_result(self) -> None:
        result = await geocode_locations([])
        assert result.locations == []
        assert result.geocoded_count == 0

    async def test_multiple_locations_geocoded(self) -> None:
        extracted = [_ext("Shibuya", order=0), _ext("Senso-ji", order=1)]

        def _make_resp(name: str, lat: float, lng: float):
            return _mock_http(_places_response([_place_result(name, f"id_{name}", lat, lng)]))

        responses = [_make_resp("Shibuya", 35.66, 139.70), _make_resp("Senso-ji", 35.71, 139.80)]
        # Empty details response — _enrich_with_details makes a second call per pin
        empty_details = _mock_http({"status": "OK", "result": {}})
        call_idx = [0]

        async def mock_get(*a, **kw):
            url = a[0] if a else kw.get("url", "")
            # Details API calls return empty so coords stay from text search
            if "details" in str(url):
                return empty_details
            r = responses[call_idx[0] % len(responses)]
            call_idx[0] += 1
            return r

        with (
            patch("app.services.geocoding.geocoder.httpx.AsyncClient") as mc,
            patch("app.services.geocoding.geocoder.get_settings") as ms,
        ):
            ms.return_value.google_places_api_key = "fake-key"
            mc.return_value.__aenter__.return_value.get = mock_get
            result = await geocode_locations(extracted)

        assert len(result.locations) == 2

    async def test_timeout_marks_unresolved(self) -> None:
        import httpx

        extracted = [_ext("Slow Place")]

        with (
            patch("app.services.geocoding.geocoder.httpx.AsyncClient") as mc,
            patch("app.services.geocoding.geocoder.get_settings") as ms,
        ):
            ms.return_value.google_places_api_key = "fake-key"
            mc.return_value.__aenter__.return_value.get = AsyncMock(
                side_effect=httpx.TimeoutException("timeout")
            )
            result = await geocode_locations(extracted)

        assert result.locations[0].unresolved is True

    async def test_mock_geocoding_used_without_api_key(self) -> None:
        """When no API key, mock geocoding returns plausible coords."""
        extracted = [_ext("Shibuya Crossing Tokyo", order=0), _ext("Kyoto Temple", order=1)]

        with patch("app.services.geocoding.geocoder.get_settings") as ms:
            ms.return_value.google_places_api_key = ""
            result = await geocode_locations(extracted)

        assert len(result.locations) > 0
        assert all(loc.geocoded for loc in result.locations)

    async def test_deduplication_applied_after_geocoding(self) -> None:
        """Task 5 — close pins are merged during geocoding."""
        extracted = [_ext("Shibuya Station", order=0), _ext("Shibuya Crossing", order=1)]

        # Both geocode to nearly identical coords (~14m apart)
        resp_a = _places_response([_place_result("Shibuya Station", "p1", 35.65800, 139.70160)])
        resp_b = _places_response([_place_result("Shibuya Crossing", "p2", 35.65810, 139.70155)])

        call_idx = [0]
        resps = [_mock_http(resp_a), _mock_http(resp_b)]

        async def mock_get(*a, **kw):
            r = resps[call_idx[0] % 2]
            call_idx[0] += 1
            return r

        with (
            patch("app.services.geocoding.geocoder.httpx.AsyncClient") as mc,
            patch("app.services.geocoding.geocoder.get_settings") as ms,
        ):
            ms.return_value.google_places_api_key = "fake-key"
            mc.return_value.__aenter__.return_value.get = mock_get
            result = await geocode_locations(extracted)

        # ~14m apart → within 200m threshold → deduped to 1
        assert len(result.locations) == 1
        assert result.dedup_removed == 1


# ── Haversine ──────────────────────────────────────────────────


class TestHaversineMetres:
    def test_same_point_is_zero(self) -> None:
        assert haversine_metres(35.0, 135.0, 35.0, 135.0) == pytest.approx(0.0)

    def test_tokyo_to_kyoto_approx_360km(self) -> None:
        dist = haversine_metres(35.6762, 139.6503, 35.0116, 135.7681)
        assert 340_000 < dist < 390_000

    def test_50m_apart(self) -> None:
        dist = haversine_metres(35.6595, 139.7004, 35.6599, 139.7004)
        assert 40 < dist < 60

    def test_north_south_hemisphere(self) -> None:
        dist = haversine_metres(-33.8688, 151.2093, 51.5074, -0.1278)
        assert 16_000_000 < dist < 17_500_000
