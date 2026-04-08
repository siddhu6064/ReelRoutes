"""
AI Planner Service
Calls GPT-4o to generate a structured list of recommended places
for a "Plan from Scratch" itinerary request.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI

from app.schemas.plan import PlanRequest

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internal model for a raw place returned by GPT-4o
# ---------------------------------------------------------------------------


class RawPlace:
    """Lightweight container for a GPT-4o suggested place before geocoding."""

    def __init__(self, data: dict[str, Any]) -> None:
        self.name: str = data.get("name", "").strip()
        self.area: str = data.get("area", "").strip()  # neighbourhood / district hint for geocoding
        self.famous_for: str = data.get("famous_for", "").strip()
        self.best_time: str | None = data.get("best_time")
        self.local_tip: str | None = data.get("local_tip")
        self.category: str = data.get("category", "activity")  # "activity" | "food"

    def is_valid(self) -> bool:
        return bool(self.name)

    def geocode_query(self, destination: str) -> str:
        """Build a precise query string for the Google Places API."""
        parts = [self.name]
        if self.area:
            parts.append(self.area)
        parts.append(destination)
        return ", ".join(parts)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def _build_system_prompt() -> str:
    return (
        "You are an expert travel planner. "
        "When given a destination, number of days, and user preferences, "
        "you return a structured JSON list of recommended places to visit. "
        "Return ONLY valid JSON — no markdown, no preamble, no explanation. "
        "Every place must include: name, area, famous_for, best_time, local_tip, category. "
        "category must be exactly 'activity' (sightseeing/experience) or 'food' (restaurant/cafe/bar). "
        "Do not include generic hotel or accommodation entries. "
        "Prioritise variety across the trip — mix well-known highlights with hidden gems. "
        "famous_for should be a short, vivid phrase, e.g. 'Jazz music and Creole architecture'. "
        "local_tip should be a single actionable sentence a local would share."
    )


def _build_user_prompt(req: PlanRequest) -> str:
    prefs = (
        ", ".join(p.value for p in req.preferences) if req.preferences else "general sightseeing"
    )

    # Target place count: 3–4 activities per day + 1 food per day as a seed
    activity_count = req.days * 4
    food_count = req.days * 2

    return (
        f"Plan a {req.days}-day trip to {req.destination} "
        f"starting from {req.starting_point}. "
        f"Travel mode: {req.travel_mode.value}. "
        f"User interests: {prefs}. "
        f"\n\n"
        f"Return a JSON array of exactly {activity_count + food_count} places. "
        f"Include {activity_count} activity places and {food_count} food places. "
        f"Spread places naturally across the destination — do not cluster everything in one area. "
        f"\n\n"
        f"Each object in the array must have these keys:\n"
        f"  name        (string) — official place name\n"
        f"  area        (string) — neighbourhood or district, helps with geocoding\n"
        f"  famous_for  (string) — what this place is known for, max 12 words\n"
        f"  best_time   (string) — e.g. 'Morning', 'Evening', 'Year-round'\n"
        f"  local_tip   (string) — one practical tip from a local\n"
        f"  category    (string) — exactly 'activity' or 'food'\n"
        f"\n"
        f"Return ONLY the JSON array. No markdown, no backticks, no explanation."
    )


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class AIPlannerService:
    """
    Wraps the GPT-4o call that generates the initial flat list of places.
    Keeps the service stateless and easily mockable in tests.
    """

    def __init__(self, client: AsyncOpenAI) -> None:
        self._client = client

    async def generate_places(self, req: PlanRequest) -> list[RawPlace]:
        """
        Call GPT-4o and return a list of RawPlace objects.
        Raises ValueError if the response cannot be parsed.
        """
        logger.info(
            "Generating places for %s → %s (%d days)",
            req.starting_point,
            req.destination,
            req.days,
        )

        response = await self._client.chat.completions.create(
            model="gpt-4o",
            temperature=0.7,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": _build_system_prompt()},
                {"role": "user", "content": _build_user_prompt(req)},
            ],
            response_format={"type": "json_object"},
        )

        raw_text = response.choices[0].message.content or ""
        return self._parse_response(raw_text, req)

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _parse_response(self, raw_text: str, _req: PlanRequest) -> list[RawPlace]:
        """
        Parse GPT-4o JSON output into RawPlace objects.
        GPT-4o with json_object mode sometimes wraps the array in a key —
        this method handles both shapes:
          - {"places": [...]}
          - [...]
        """
        try:
            parsed = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            logger.error("GPT-4o returned invalid JSON: %s", raw_text[:200])
            raise ValueError(f"AI returned invalid JSON: {exc}") from exc

        # Unwrap if GPT-4o wrapped the array in an object
        if isinstance(parsed, dict):
            # Try common wrapper keys
            for key in ("places", "results", "itinerary", "locations", "items"):
                if key in parsed and isinstance(parsed[key], list):
                    parsed = parsed[key]
                    break
            else:
                # Take the first list value found
                for v in parsed.values():
                    if isinstance(v, list):
                        parsed = v
                        break
                else:
                    raise ValueError("AI response did not contain a list of places")

        if not isinstance(parsed, list):
            raise ValueError("Expected a JSON array of places from AI")

        places: list[RawPlace] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            place = RawPlace(item)
            if place.is_valid():
                places.append(place)
            else:
                logger.warning("Skipping invalid place entry: %s", item)

        if not places:
            raise ValueError("AI returned no valid places for the requested trip")

        logger.info("GPT-4o returned %d valid places", len(places))
        return places
