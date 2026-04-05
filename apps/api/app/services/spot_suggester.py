"""
app/services/spot_suggester.py  —  W11: GPT-4o nearby spot suggestion service

Called by app/routers/suggestions.py.
Raises SpotSuggesterError on upstream or parsing failures.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from openai import AsyncOpenAI

from app.models.documents import TripDocument

logger = logging.getLogger(__name__)

_client = AsyncOpenAI()  # reads OPENAI_API_KEY from env

_SYSTEM = (
    "You are an expert travel guide with deep knowledge of destinations worldwide. "
    "Respond ONLY with valid JSON — no markdown, no preamble."
)

_USER_TEMPLATE = """\
A traveler has these stops in their itinerary:

{pin_list}

The trip is centred around approximately ({lat:.4f}, {lng:.4f}).

Suggest exactly 5 interesting nearby places NOT already in the list that complement this itinerary. \
Prioritise a mix of categories.

Return a JSON object with key "suggestions", an array of 5 objects each with:
  name      — place name
  address   — full street address
  lat       — latitude (float)
  lng       — longitude (float)
  category  — one of: restaurant, museum, park, landmark, market, gallery, cafe, bar, other
  reason    — one sentence explaining why this place complements the trip\
"""


class SpotSuggesterError(RuntimeError):
    """Raised when GPT-4o cannot be reached or returns unusable output."""


def _build_pin_list(trip: TripDocument) -> str:
    lines = []
    for p in trip.pins:
        loc = f" ({p.address})" if p.address else f" [{p.lat:.4f}, {p.lng:.4f}]"
        lines.append(f"- {p.place_name}{loc}")
    return "\n".join(lines) or "(no pins yet)"


def _centroid(trip: TripDocument) -> tuple[float, float]:
    if not trip.pins:
        return 0.0, 0.0
    return (
        sum(p.lat for p in trip.pins) / len(trip.pins),
        sum(p.lng for p in trip.pins) / len(trip.pins),
    )


def _parse_suggestions(raw: str) -> list[dict[str, Any]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SpotSuggesterError(f"Invalid JSON from GPT-4o: {exc}") from exc
    suggestions = data.get("suggestions")
    if not isinstance(suggestions, list):
        raise SpotSuggesterError("GPT-4o response missing 'suggestions' array")
    return suggestions  # type: ignore[return-value]


async def suggest_spots(trip: TripDocument) -> list[dict[str, Any]]:
    """Return up to 5 AI-suggested spots for the given trip.

    Each item is a plain dict matching the SpotSuggestion shape.
    Raises SpotSuggesterError on failure.
    """
    lat, lng = _centroid(trip)
    prompt = _USER_TEMPLATE.format(
        pin_list=_build_pin_list(trip),
        lat=lat,
        lng=lng,
    )

    try:
        response = await _client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=900,
            timeout=20.0,
        )
    except Exception as exc:
        logger.exception("GPT-4o request failed for trip %s", trip.id)
        raise SpotSuggesterError(f"GPT-4o request failed: {exc}") from exc

    raw = response.choices[0].message.content or "{}"
    items = _parse_suggestions(raw)

    # Validate and cap at 5
    valid: list[dict[str, Any]] = []
    required = {"name", "address", "lat", "lng", "category", "reason"}
    for item in items[:5]:
        if isinstance(item, dict) and required.issubset(item.keys()):
            valid.append(item)
        else:
            logger.warning("Skipping malformed suggestion: %s", item)

    return valid
