"""
app/services/itinerary_service.py

Feature 2 — Day-by-day itinerary generation.

Given a trip and a number of days, GPT-4o clusters the pins into
geographically logical day groups so the user isn't zig-zagging.

Strategy:
  1. Sort pins by geographic proximity using a simple greedy nearest-
     neighbour pass (same as route optimisation but per-cluster).
  2. Pass the ordered list to GPT-4o with the trip context and ask it
     to split into N days, with a label and rationale per day.
  3. Return structured TripDay objects that are saved on the trip.

This keeps the heavy spatial logic in Python (cheap, deterministic)
and uses GPT-4o only for the human-readable grouping labels and notes.
"""

from __future__ import annotations

import json
import math

from app.config.logging import get_logger
from app.config.settings import get_settings
from app.middleware.error_handler import AppError
from app.models.documents import TripDay, TripDocument

logger = get_logger(__name__)


async def generate_itinerary(
    trip: TripDocument,
    trip_length_days: int,
) -> list[TripDay]:
    """
    Main entry point.
    Returns a list of TripDay objects (not yet saved — caller saves).
    """
    if not trip.pins:
        raise AppError("Trip has no pins to build an itinerary from.", status_code=422)

    if trip_length_days < 1 or trip_length_days > 30:
        raise AppError("Trip length must be between 1 and 30 days.", status_code=422)

    sorted_pins = _geo_sort_pins(trip)
    days = await _gpt_group_into_days(trip, sorted_pins, trip_length_days)
    return days


def _geo_sort_pins(trip: TripDocument) -> list:
    """
    Greedy nearest-neighbour sort: starting from the first pin,
    repeatedly visit the closest unvisited pin. O(n²) — fine for ≤500 pins.
    """
    pins = list(trip.pins)
    if len(pins) <= 1:
        return pins

    visited = [False] * len(pins)
    result = []
    current = 0

    for _ in range(len(pins)):
        visited[current] = True
        result.append(pins[current])

        best_dist = float("inf")
        best_next = -1
        for j, p in enumerate(pins):
            if not visited[j]:
                d = _haversine(pins[current].lat, pins[current].lng, p.lat, p.lng)
                if d < best_dist:
                    best_dist = d
                    best_next = j

        if best_next == -1:
            break
        current = best_next

    return result


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in km between two lat/lng points."""
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _gpt_group_into_days(
    trip: TripDocument,
    sorted_pins,
    trip_length_days: int,
) -> list[TripDay]:
    """
    Ask GPT-4o to split geo-sorted pins into N days.
    Returns a list of TripDay with labels and pin assignments.
    """
    settings = get_settings()

    if settings.is_test or not settings.openai_api_key:
        # Simple deterministic fallback for tests
        return _fallback_split(sorted_pins, trip_length_days)

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    pin_list = "\n".join(
        f"{i+1}. {p.place_name} ({p.city or ''}) — id:{p.id}" for i, p in enumerate(sorted_pins)
    )

    prompt = f"""You are a travel itinerary planner.

Trip: "{trip.title}"
Duration: {trip_length_days} day(s)
Platform: {trip.platform}

Locations (already geographically sorted — do not reorder):
{pin_list}

Split these {len(sorted_pins)} locations into exactly {trip_length_days} day(s).
Keep geographically close locations in the same day.
Return ONLY valid JSON — no markdown, no preamble.

Format:
{{
  "days": [
    {{
      "day_number": 1,
      "label": "Day 1 — <area or theme>",
      "pin_ids": ["<id>", ...],
      "notes": "<one sentence on why these spots are grouped>"
    }}
  ]
}}"""

    try:
        response = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=1500,
        )
        raw = response.choices[0].message.content or ""
        # Strip markdown code fences that GPT sometimes wraps JSON in
        import re

        raw = re.sub(r"^```(?:json)?\s*", "", raw.strip())
        raw = re.sub(r"\s*```$", "", raw).strip()
        data = json.loads(raw)

        days = []
        for d in data.get("days", []):
            days.append(
                TripDay(
                    day_number=d["day_number"],
                    label=d.get("label"),
                    pin_ids=d.get("pin_ids", []),
                    notes=d.get("notes"),
                )
            )
        return days

    except Exception as exc:
        logger.warning("itinerary_gpt_failed", error=str(exc))
        return _fallback_split(sorted_pins, trip_length_days)


def _fallback_split(sorted_pins, trip_length_days: int) -> list[TripDay]:
    """
    Deterministic fallback: split pins evenly across days.
    Used in tests and when GPT-4o is unavailable.
    """
    n = len(sorted_pins)
    chunk = max(1, math.ceil(n / trip_length_days))
    days = []
    for day_num in range(1, trip_length_days + 1):
        start = (day_num - 1) * chunk
        end = min(start + chunk, n)
        day_pins = sorted_pins[start:end]
        if not day_pins:
            break
        days.append(
            TripDay(
                day_number=day_num,
                label=f"Day {day_num}",
                pin_ids=[p.id for p in day_pins],
            )
        )
    return days
