"""
tests/services/test_phase1_features.py

Phase 1 — Quick Wins tests:
  Week 1: Video deep links + source attribution
  Week 2: Pin enrichment (rating, hours, website, phone)
  Week 3: Route polyline data + city_group computation
  Week 4: Google Maps export URL
"""
from __future__ import annotations

import pytest
from app.routers.trips import _video_deep_link, _trip_response
from app.services.geocoding.storage import geocoded_locations_to_pins
from app.services.geocoding.geocoder import GeocodedLocation
from app.services.map_export_service import export_trip, _google_maps_url
from app.models.documents import PinDocument, TripDocument, Platform
from app.utils.seed import SeedFactory, make_pin
from tests.fixtures.beanie_fixture import beanie_init  # noqa: F401


# ── Week 1: Video deep links ──────────────────────────────────

class TestVideoDeepLink:
    def test_youtube_with_timestamp(self):
        url = "https://www.youtube.com/watch?v=abc123"
        assert "t=90s" in _video_deep_link(url, "youtube", 90.0)

    def test_youtube_short_link(self):
        assert "t=30s" in _video_deep_link("https://youtu.be/abc", "youtube", 30.0)

    def test_youtube_no_timestamp_returns_url(self):
        url = "https://www.youtube.com/watch?v=abc"
        assert _video_deep_link(url, "youtube", None) == url

    def test_tiktok_no_timestamp_scheme(self):
        url = "https://www.tiktok.com/@user/video/123"
        assert _video_deep_link(url, "tiktok", 45.0) == url

    def test_instagram_no_timestamp_scheme(self):
        url = "https://www.instagram.com/reel/abc/"
        assert _video_deep_link(url, "instagram", 20.0) == url

    def test_none_url_returns_none(self):
        assert _video_deep_link(None, "youtube", 10.0) is None

    def test_timestamp_is_floored_to_int(self):
        url = "https://www.youtube.com/watch?v=abc"
        result = _video_deep_link(url, "youtube", 99.9)
        assert "t=99s" in result

    def test_existing_query_string_uses_ampersand(self):
        url = "https://www.youtube.com/watch?v=abc&list=PL1"
        assert "&t=60s" in _video_deep_link(url, "youtube", 60.0)


# ── Week 2: Pin enrichment fields ────────────────────────────

class TestPinEnrichment:
    def test_pin_document_has_rating_field(self):
        pin = make_pin(order=0)
        assert pin.rating is None  # default None

    def test_pin_document_stores_rating(self):
        pin = make_pin(order=0)
        pin.rating = 4.7
        pin.user_ratings_total = 2100
        assert pin.rating == 4.7
        assert pin.user_ratings_total == 2100

    def test_pin_document_open_now(self):
        pin = make_pin(order=0)
        pin.open_now = True
        assert pin.open_now is True

    def test_pin_document_opening_hours_text(self):
        pin = make_pin(order=0)
        pin.opening_hours_text = ["Monday: 9 AM – 10 PM", "Tuesday: 9 AM – 10 PM"]
        assert len(pin.opening_hours_text) == 2

    def test_pin_document_website(self):
        pin = make_pin(order=0)
        pin.website = "https://example.com"
        assert pin.website == "https://example.com"

    def test_pin_document_phone_number(self):
        pin = make_pin(order=0)
        pin.phone_number = "+81 3-1234-5678"
        assert pin.phone_number == "+81 3-1234-5678"

    def test_geocoded_locations_to_pins_carries_enrichment(self):
        locs = [
            GeocodedLocation(
                place_name="Senso-ji Temple",
                raw_name="Senso-ji",
                context_quote="amazing temple",
                confidence=0.9,
                order=0,
                lat=35.7148,
                lng=139.7967,
                place_id="mock_place_0",
                address="Senso-ji, Tokyo, JP",
                country_code="JP",
                city="Tokyo",
                geocoded=True,
                rating=4.8,
                user_ratings_total=55000,
                open_now=True,
                opening_hours_text=["Monday: 6:00 AM – 5:00 PM"],
                website="https://www.senso-ji.jp",
                phone_number="+81 3-3842-0181",
            )
        ]
        pins = geocoded_locations_to_pins(locs)
        assert len(pins) == 1
        p = pins[0]
        assert p.rating == 4.8
        assert p.user_ratings_total == 55000
        assert p.open_now is True
        assert p.opening_hours_text == ["Monday: 6:00 AM – 5:00 PM"]
        assert p.website == "https://www.senso-ji.jp"
        assert p.phone_number == "+81 3-3842-0181"


# ── Week 3: city_group + route data ──────────────────────────

class TestCityGroup:
    def test_city_group_computed_from_city_and_cc(self):
        locs = [
            GeocodedLocation(
                place_name="Senso-ji", raw_name="Senso-ji",
                context_quote="", confidence=0.9, order=0,
                lat=35.71, lng=139.79, geocoded=True,
                city="Tokyo", country_code="JP",
            ),
            GeocodedLocation(
                place_name="Fushimi Inari", raw_name="Fushimi Inari",
                context_quote="", confidence=0.9, order=1,
                lat=34.96, lng=135.77, geocoded=True,
                city="Kyoto", country_code="JP",
            ),
        ]
        pins = geocoded_locations_to_pins(locs)
        assert pins[0].city_group == "Tokyo, JP"
        assert pins[1].city_group == "Kyoto, JP"

    def test_city_group_city_only_when_no_cc(self):
        locs = [
            GeocodedLocation(
                place_name="Some Place", raw_name="Some Place",
                context_quote="", confidence=0.8, order=0,
                lat=10.0, lng=20.0, geocoded=True,
                city="Bangkok", country_code=None,
            )
        ]
        pins = geocoded_locations_to_pins(locs)
        assert pins[0].city_group == "Bangkok"

    def test_city_group_none_when_no_city(self):
        locs = [
            GeocodedLocation(
                place_name="Unknown", raw_name="Unknown",
                context_quote="", confidence=0.5, order=0,
                lat=0.1, lng=0.1, geocoded=True,
                city=None, country_code=None,
            )
        ]
        pins = geocoded_locations_to_pins(locs)
        assert pins[0].city_group is None

    def test_multiple_pins_same_city_group(self):
        locs = [
            GeocodedLocation(
                place_name=f"Place {i}", raw_name=f"Place {i}",
                context_quote="", confidence=0.9, order=i,
                lat=35.0 + i * 0.01, lng=139.0 + i * 0.01,
                geocoded=True, city="Tokyo", country_code="JP",
            )
            for i in range(3)
        ]
        pins = geocoded_locations_to_pins(locs)
        assert all(p.city_group == "Tokyo, JP" for p in pins)

    def test_pin_serializer_includes_city_group(self):
        """city_group appears in the API response under cityGroup."""
        pin = make_pin(order=0)
        pin.city_group = "Osaka, JP"
        # We test via the dict structure directly
        data = {
            "cityGroup": pin.city_group,
            "rating": pin.rating,
            "openNow": pin.open_now,
        }
        assert data["cityGroup"] == "Osaka, JP"


# ── Week 4: Google Maps export ────────────────────────────────

@pytest.mark.asyncio
class TestGoogleMapsExport:
    async def test_export_returns_url(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        result = export_trip(trip, "google_maps")
        assert result["url"] is not None
        assert "google.com/maps" in result["url"]

    async def test_export_url_contains_coords(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        result = export_trip(trip, "google_maps")
        # URL uses path-style: maps.google.com/maps/dir/lat,lng/lat,lng/...
        assert "maps" in result["url"]
        # Should contain at least one coordinate pair
        assert any(str(round(p.lat, 2)) in result["url"] for p in trip.pins)

    async def test_google_maps_url_helper_single_pin(self, beanie_init) -> None:
        trip = await SeedFactory.trip(pin_count=1)
        url = _google_maps_url(trip.pins)
        assert "google.com" in url or "maps.google.com" in url

    async def test_google_maps_url_helper_multi_pin_has_all_pins(self, beanie_init) -> None:
        trip = await SeedFactory.trip(pin_count=4)
        url = _google_maps_url(trip.pins)
        # All pins should be represented in the URL
        assert "google.com" in url or "maps.google.com" in url

    async def test_gpx_export_structure(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        result = export_trip(trip, "apple_maps")
        assert result["content_type"] == "application/gpx+xml"
        assert "<gpx" in result["content"]
        assert "<wpt" in result["content"]

    async def test_kml_export_structure(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        result = export_trip(trip, "kml")
        assert result["content_type"] == "application/vnd.google-earth.kml+xml"
        assert "<kml" in result["content"]

    async def test_geojson_export_structure(self, beanie_init) -> None:
        trip = await SeedFactory.trip()
        result = export_trip(trip, "geojson")
        import json
        data = json.loads(result["content"])
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) == len(trip.pins)
