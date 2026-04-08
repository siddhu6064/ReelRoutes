"""
Tests for AIPlannerService — GPT-4o place generation and response parsing.
All OpenAI calls are mocked; no real API calls are made.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.plan import PlanRequest, TravelMode, TripPreference
from app.services.plan.ai_planner import AIPlannerService, RawPlace

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def make_request(**kwargs) -> PlanRequest:
    defaults = {
        "starting_point": "Austin, TX",
        "destination": "New Orleans, LA",
        "days": 3,
        "preferences": [TripPreference.food, TripPreference.history],
        "travel_mode": TravelMode.driving,
    }
    defaults.update(kwargs)
    return PlanRequest(**defaults)


def make_mock_client(response_content: str) -> AsyncMock:
    """Build a mock AsyncOpenAI client that returns the given content string."""
    choice = MagicMock()
    choice.message.content = response_content

    completion = MagicMock()
    completion.choices = [choice]

    client = AsyncMock()
    client.chat.completions.create = AsyncMock(return_value=completion)
    return client


VALID_PLACES_JSON = json.dumps(
    [
        {
            "name": "French Quarter",
            "area": "New Orleans",
            "famous_for": "Jazz music and Creole architecture",
            "best_time": "Evening",
            "local_tip": "Visit on a weeknight to avoid weekend crowds",
            "category": "activity",
        },
        {
            "name": "Cafe Du Monde",
            "area": "French Quarter",
            "famous_for": "Beignets and café au lait",
            "best_time": "Morning",
            "local_tip": "Go early to avoid queues",
            "category": "food",
        },
        {
            "name": "Garden District",
            "area": "Uptown",
            "famous_for": "Antebellum mansions and oak-lined streets",
            "best_time": "Morning",
            "local_tip": "Walk Magazine Street for local shops",
            "category": "activity",
        },
    ]
)


# ---------------------------------------------------------------------------
# RawPlace unit tests
# ---------------------------------------------------------------------------


class TestRawPlace:
    def test_valid_place(self):
        place = RawPlace(
            {
                "name": "French Quarter",
                "area": "New Orleans",
                "famous_for": "Jazz music",
                "best_time": "Evening",
                "local_tip": "Go on weeknights",
                "category": "activity",
            }
        )
        assert place.is_valid()
        assert place.name == "French Quarter"
        assert place.category == "activity"

    def test_invalid_place_empty_name(self):
        place = RawPlace({"name": "", "area": "Somewhere"})
        assert not place.is_valid()

    def test_geocode_query_with_area(self):
        place = RawPlace({"name": "Cafe Du Monde", "area": "French Quarter"})
        query = place.geocode_query("New Orleans, LA")
        assert "Cafe Du Monde" in query
        assert "French Quarter" in query
        assert "New Orleans, LA" in query

    def test_geocode_query_without_area(self):
        place = RawPlace({"name": "Jackson Square", "area": ""})
        query = place.geocode_query("New Orleans, LA")
        assert "Jackson Square" in query
        assert "New Orleans, LA" in query
        # No double comma from empty area
        assert ",," not in query

    def test_defaults_for_missing_keys(self):
        place = RawPlace({"name": "Some Place"})
        assert place.famous_for == ""
        assert place.best_time is None
        assert place.local_tip is None
        assert place.category == "activity"


# ---------------------------------------------------------------------------
# AIPlannerService unit tests
# ---------------------------------------------------------------------------


class TestAIPlannerService:
    @pytest.mark.asyncio
    async def test_generate_places_returns_raw_places(self):
        client = make_mock_client(VALID_PLACES_JSON)
        service = AIPlannerService(client=client)
        req = make_request()

        places = await service.generate_places(req)

        assert len(places) == 3
        assert all(isinstance(p, RawPlace) for p in places)
        client.chat.completions.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_places_unwraps_dict_wrapper(self):
        """GPT-4o sometimes wraps the array in {"places": [...]}."""
        wrapped = json.dumps({"places": json.loads(VALID_PLACES_JSON)})
        client = make_mock_client(wrapped)
        service = AIPlannerService(client=client)

        places = await service.generate_places(make_request())
        assert len(places) == 3

    @pytest.mark.asyncio
    async def test_generate_places_unwraps_results_key(self):
        wrapped = json.dumps({"results": json.loads(VALID_PLACES_JSON)})
        client = make_mock_client(wrapped)
        service = AIPlannerService(client=client)

        places = await service.generate_places(make_request())
        assert len(places) == 3

    @pytest.mark.asyncio
    async def test_generate_places_skips_invalid_entries(self):
        data = json.loads(VALID_PLACES_JSON)
        data.append({"name": "", "area": "nowhere"})  # invalid — empty name
        data.append("not a dict")  # invalid — wrong type
        client = make_mock_client(json.dumps(data))
        service = AIPlannerService(client=client)

        places = await service.generate_places(make_request())
        assert len(places) == 3  # 2 invalid entries dropped

    @pytest.mark.asyncio
    async def test_generate_places_raises_on_invalid_json(self):
        client = make_mock_client("this is not json at all")
        service = AIPlannerService(client=client)

        with pytest.raises(ValueError, match="invalid JSON"):
            await service.generate_places(make_request())

    @pytest.mark.asyncio
    async def test_generate_places_raises_when_no_valid_places(self):
        client = make_mock_client(json.dumps([{"name": ""}, {"name": "  "}]))
        service = AIPlannerService(client=client)

        with pytest.raises(ValueError, match="no valid places"):
            await service.generate_places(make_request())

    @pytest.mark.asyncio
    async def test_generate_places_raises_when_list_not_found(self):
        client = make_mock_client(json.dumps({"error": "something went wrong"}))
        service = AIPlannerService(client=client)

        with pytest.raises(ValueError, match="did not contain a list"):
            await service.generate_places(make_request())

    @pytest.mark.asyncio
    async def test_prompt_includes_destination_and_days(self):
        client = make_mock_client(VALID_PLACES_JSON)
        service = AIPlannerService(client=client)
        req = make_request(destination="Tokyo, Japan", days=5)

        await service.generate_places(req)

        call_args = client.chat.completions.create.call_args
        user_message = next(
            m["content"] for m in call_args.kwargs["messages"] if m["role"] == "user"
        )
        assert "Tokyo, Japan" in user_message
        assert "5" in user_message

    @pytest.mark.asyncio
    async def test_prompt_includes_preferences(self):
        client = make_mock_client(VALID_PLACES_JSON)
        service = AIPlannerService(client=client)
        req = make_request(preferences=[TripPreference.art, TripPreference.nature])

        await service.generate_places(req)

        call_args = client.chat.completions.create.call_args
        user_message = next(
            m["content"] for m in call_args.kwargs["messages"] if m["role"] == "user"
        )
        assert "art" in user_message
        assert "nature" in user_message

    @pytest.mark.asyncio
    async def test_prompt_uses_general_sightseeing_when_no_preferences(self):
        client = make_mock_client(VALID_PLACES_JSON)
        service = AIPlannerService(client=client)
        req = make_request(preferences=[])

        await service.generate_places(req)

        call_args = client.chat.completions.create.call_args
        user_message = next(
            m["content"] for m in call_args.kwargs["messages"] if m["role"] == "user"
        )
        assert "general sightseeing" in user_message

    @pytest.mark.asyncio
    async def test_uses_gpt4o_model(self):
        client = make_mock_client(VALID_PLACES_JSON)
        service = AIPlannerService(client=client)

        await service.generate_places(make_request())

        call_kwargs = client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "gpt-4o"

    @pytest.mark.asyncio
    async def test_uses_json_object_response_format(self):
        client = make_mock_client(VALID_PLACES_JSON)
        service = AIPlannerService(client=client)

        await service.generate_places(make_request())

        call_kwargs = client.chat.completions.create.call_args.kwargs
        assert call_kwargs.get("response_format") == {"type": "json_object"}
