"""
tests/fixtures/places_fixtures.py

Local fixtures for Google Places API responses.
Used in geocoding tests to avoid live API calls and ensure deterministic results.
All data is realistic but synthetic.
"""
from __future__ import annotations

# ── Single place responses ─────────────────────────────────────

SHIBUYA_CROSSING = {
    "place_id": "ChIJAQS2-TB9GGARsZnKeJiMRYU",
    "name": "Shibuya Crossing",
    "formatted_address": "Shibuya, Tokyo 150-0002, Japan",
    "geometry": {
        "location": {"lat": 35.6595, "lng": 139.7004},
        "viewport": {
            "northeast": {"lat": 35.6608, "lng": 139.7017},
            "southwest": {"lat": 35.6582, "lng": 139.6991},
        },
    },
    "address_components": [
        {"long_name": "Shibuya", "short_name": "Shibuya", "types": ["sublocality"]},
        {"long_name": "Tokyo", "short_name": "Tokyo", "types": ["administrative_area_level_1"]},
        {"long_name": "Japan", "short_name": "JP", "types": ["country"]},
    ],
    "types": ["tourist_attraction", "point_of_interest"],
    "rating": 4.6,
    "user_ratings_total": 42831,
}

SENSO_JI = {
    "place_id": "ChIJ8T1GpMGOGGAR6RIQaAn3bJc",
    "name": "Senso-ji Temple",
    "formatted_address": "2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan",
    "geometry": {
        "location": {"lat": 35.7148, "lng": 139.7967},
        "viewport": {
            "northeast": {"lat": 35.7162, "lng": 139.7981},
            "southwest": {"lat": 35.7134, "lng": 139.7953},
        },
    },
    "address_components": [
        {"long_name": "Asakusa", "short_name": "Asakusa", "types": ["sublocality"]},
        {"long_name": "Taito City", "short_name": "Taito City", "types": ["locality"]},
        {"long_name": "Tokyo", "short_name": "Tokyo", "types": ["administrative_area_level_1"]},
        {"long_name": "Japan", "short_name": "JP", "types": ["country"]},
    ],
    "types": ["tourist_attraction", "place_of_worship", "point_of_interest"],
    "rating": 4.7,
    "user_ratings_total": 61204,
}

FUSHIMI_INARI = {
    "place_id": "ChIJsWoKZy_8AGARqkTQNbCjkE4",
    "name": "Fushimi Inari Taisha",
    "formatted_address": "68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto, 612-0882, Japan",
    "geometry": {
        "location": {"lat": 34.9672, "lng": 135.7727},
        "viewport": {
            "northeast": {"lat": 34.9686, "lng": 135.7741},
            "southwest": {"lat": 34.9658, "lng": 135.7713},
        },
    },
    "address_components": [
        {"long_name": "Fushimi Ward", "short_name": "Fushimi Ward", "types": ["sublocality"]},
        {"long_name": "Kyoto", "short_name": "Kyoto", "types": ["locality"]},
        {"long_name": "Kyoto Prefecture", "short_name": "Kyoto Prefecture", "types": ["administrative_area_level_1"]},
        {"long_name": "Japan", "short_name": "JP", "types": ["country"]},
    ],
    "types": ["tourist_attraction", "place_of_worship", "point_of_interest"],
    "rating": 4.8,
    "user_ratings_total": 78432,
}

EIFFEL_TOWER = {
    "place_id": "ChIJLU7jZClu5kcR4PcOOO6p3I0",
    "name": "Eiffel Tower",
    "formatted_address": "Champ de Mars, 5 Av. Anatole France, 75007 Paris, France",
    "geometry": {
        "location": {"lat": 48.8584, "lng": 2.2945},
        "viewport": {
            "northeast": {"lat": 48.8598, "lng": 2.2958},
            "southwest": {"lat": 48.8570, "lng": 2.2932},
        },
    },
    "address_components": [
        {"long_name": "7th arrondissement", "short_name": "7th", "types": ["sublocality"]},
        {"long_name": "Paris", "short_name": "Paris", "types": ["locality"]},
        {"long_name": "Île-de-France", "short_name": "IDF", "types": ["administrative_area_level_1"]},
        {"long_name": "France", "short_name": "FR", "types": ["country"]},
    ],
    "types": ["tourist_attraction", "point_of_interest"],
    "rating": 4.7,
    "user_ratings_total": 298432,
}

CENTRAL_PARK = {
    "place_id": "ChIJ4zGFAZpYwokRGUGph3Mf37k",
    "name": "Central Park",
    "formatted_address": "New York, NY, USA",
    "geometry": {
        "location": {"lat": 40.7829, "lng": -73.9654},
        "viewport": {
            "northeast": {"lat": 40.8008, "lng": -73.9496},
            "southwest": {"lat": 40.7644, "lng": -73.9813},
        },
    },
    "address_components": [
        {"long_name": "Manhattan", "short_name": "Manhattan", "types": ["sublocality"]},
        {"long_name": "New York", "short_name": "New York", "types": ["locality"]},
        {"long_name": "New York State", "short_name": "NY", "types": ["administrative_area_level_1"]},
        {"long_name": "United States", "short_name": "US", "types": ["country"]},
    ],
    "types": ["park", "tourist_attraction", "point_of_interest"],
    "rating": 4.8,
    "user_ratings_total": 183621,
}

# ── Search result collections ──────────────────────────────────

JAPAN_PLACES_RESULTS = {
    "Shibuya Crossing": {"status": "OK", "results": [SHIBUYA_CROSSING]},
    "Senso-ji Temple": {"status": "OK", "results": [SENSO_JI]},
    "Fushimi Inari": {"status": "OK", "results": [FUSHIMI_INARI]},
}

MULTI_COUNTRY_RESULTS = {
    "Eiffel Tower": {"status": "OK", "results": [EIFFEL_TOWER]},
    "Central Park": {"status": "OK", "results": [CENTRAL_PARK]},
    "Shibuya Crossing": {"status": "OK", "results": [SHIBUYA_CROSSING]},
}

# ── Ambiguous / zero results ───────────────────────────────────

AMBIGUOUS_RESULT = {
    "status": "OK",
    "results": [SHIBUYA_CROSSING, SENSO_JI],  # multiple matches → needs manual selection
}

ZERO_RESULTS = {
    "status": "ZERO_RESULTS",
    "results": [],
}

NOT_FOUND_RESULT = {
    "status": "NOT_FOUND",
    "results": [],
}

# ── Helper ─────────────────────────────────────────────────────

def fixture_for(place_name: str) -> dict:
    """Return a Places API-like fixture for a known place name."""
    all_fixtures = {
        **JAPAN_PLACES_RESULTS,
        **MULTI_COUNTRY_RESULTS,
        "Eiffel Tower Paris": {"status": "OK", "results": [EIFFEL_TOWER]},
        "Central Park New York": {"status": "OK", "results": [CENTRAL_PARK]},
    }
    return all_fixtures.get(place_name, ZERO_RESULTS)


def extract_country_code(place: dict) -> str | None:
    """Extract ISO country code from a Places API result."""
    for component in place.get("address_components", []):
        if "country" in component.get("types", []):
            return component.get("short_name")
    return None


def extract_city(place: dict) -> str | None:
    """Extract city name from a Places API result."""
    for component in place.get("address_components", []):
        if "locality" in component.get("types", []):
            return component.get("long_name")
    return None
