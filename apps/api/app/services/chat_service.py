"""
app/services/chat_service.py

AI travel assistant backed by GPT-4o.
Each request includes the full trip context in the system prompt so the
assistant can answer precise questions about the specific trip.
"""
from __future__ import annotations

from app.config.logging import get_logger
from app.config.settings import get_settings
from app.models.documents import TripDocument

logger = get_logger(__name__)

SUGGESTION_CHIPS = [
    "Build a day-by-day itinerary",
    "How long at each stop?",
    "Best time of year to go",
    "Nearby places to add",
    "Packing list",
    "Rough budget estimate",
]

_SYSTEM_TEMPLATE = """You are an expert travel assistant for ReelRoutes — a tool that extracts travel itineraries from video content.

The user is viewing a trip called "{title}" sourced from {platform} ({source_url}).
It has {pin_count} stops:

{stops_list}

Help the user plan, refine, and enjoy this trip. Be specific, warm, and concise.
When asked for an itinerary, day-by-day plan, or schedule, format it clearly with days and times.
When suggesting additional places, explain briefly why they complement the existing stops.
Never fabricate specific facts about prices or hours — suggest the user verify locally.
"""


def _build_system_prompt(trip: TripDocument) -> str:
    stops = "\n".join(
        f"{i + 1}. {p.place_name}"
        + (f", {p.city}" if p.city else "")
        + (f" ({p.country_code})" if p.country_code else "")
        + (f' — "{p.context_quote[:80]}…"' if p.context_quote and len(p.context_quote) > 80 else f' — "{p.context_quote}"' if p.context_quote else "")
        for i, p in enumerate(sorted(trip.pins, key=lambda p: p.order))
    )
    return _SYSTEM_TEMPLATE.format(
        title=trip.title,
        platform=trip.platform,
        source_url=trip.source_url,
        pin_count=len(trip.pins),
        stops_list=stops or "(No stops yet)",
    )


async def chat(
    trip: TripDocument,
    message: str,
    history: list[dict[str, str]],
) -> str:
    """
    Send a message to GPT-4o with full trip context.
    Returns the assistant reply as a plain string.

    history: list of {role: "user"|"assistant", content: str}
    """
    settings = get_settings()

    if not settings.openai_api_key:
        # Dev fallback — return a canned response without hitting the API
        logger.warning("openai_api_key_not_set_using_mock_response")
        return _mock_response(message, trip)

    try:
        from openai import AsyncOpenAI  # lazy import — not needed until chat is called
        client = AsyncOpenAI(api_key=settings.openai_api_key)

        messages: list[dict] = [{"role": "system", "content": _build_system_prompt(trip)}]
        # Keep last 10 turns to stay within context limits
        messages.extend(history[-20:])
        messages.append({"role": "user", "content": message})

        response = await client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=messages,  # type: ignore[arg-type]
            max_tokens=800,
            temperature=0.7,
        )
        reply = response.choices[0].message.content or ""
        logger.info("chat_response_generated", trip_id=str(trip.id), tokens=response.usage.total_tokens if response.usage else 0)
        return reply

    except Exception as exc:
        logger.error("chat_error", error=str(exc))
        return "Sorry, I'm having trouble connecting right now. Please try again in a moment."


def _mock_response(message: str, trip: TripDocument) -> str:
    """Canned response used in local dev when no OpenAI key is set."""
    msg_lower = message.lower()
    stops = [p.place_name for p in sorted(trip.pins, key=lambda p: p.order)]

    if any(w in msg_lower for w in ["itinerary", "day", "schedule", "plan"]):
        days = []
        for i in range(0, len(stops), 2):
            day_stops = stops[i:i+2]
            days.append(f"**Day {i//2 + 1}:** {' → '.join(day_stops)}")
        return "Here's a suggested itinerary:\n\n" + "\n".join(days) + "\n\nAllow 2-3 hours per stop."

    if any(w in msg_lower for w in ["budget", "cost", "money", "price"]):
        return f"For a trip to {stops[0] if stops else 'this destination'}, budget roughly $100-150/day for mid-range travel (accommodation, meals, transport). Entry fees are typically $5-20 per attraction."

    if any(w in msg_lower for w in ["pack", "bring", "wear", "clothes"]):
        return "Packing essentials: comfortable walking shoes, layers for varying temperatures, a compact daypack, reusable water bottle, portable charger, and a camera. Check local weather before you go!"

    if any(w in msg_lower for w in ["season", "time", "when", "best"]):
        return f"Spring (March-May) and autumn (September-November) tend to offer the best balance of weather and fewer crowds for this type of trip. Avoid major local holidays if you prefer quieter experiences."

    return f"Great question about your {trip.title} trip! With {len(stops)} stops including {', '.join(stops[:3])}{'...' if len(stops) > 3 else ''}, you have a fantastic itinerary. What specific aspect would you like to explore?"
