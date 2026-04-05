"""W16 — GPT-4o email reservation parser."""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime

import openai

log = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are a travel reservation parser. Extract structured data from forwarded \
travel confirmation emails or booking summaries.

Respond ONLY with valid JSON — no preamble, no markdown fences. Use this schema:
{
  "type": "flight|hotel|activity|car_rental|other",
  "title": "concise human-readable title (e.g. 'United UA 142 SFO→NRT')",
  "confirmation_number": "string or null",
  "flight_number": "IATA code e.g. UA142 — null for non-flights",
  "check_in": "ISO 8601 datetime string or null",
  "check_out": "ISO 8601 datetime string or null (hotels/car rentals)",
  "notes": "1-2 sentence summary of any other key details, or null"
}

Rules:
- Always return valid JSON even if the email is unclear.
- If the type is ambiguous, use "other".
- Dates must be full ISO 8601 strings. If only a date is given, use T00:00:00.
- Keep title concise (< 60 chars).
"""

_VALID_TYPES = {"flight", "hotel", "activity", "car_rental", "other"}


async def parse_reservation_email(email_text: str) -> dict:
    """Parse a raw email body and return a normalised reservation dict.

    Returns a dict with keys: type, title, confirmation_number,
    flight_number, check_in (datetime|None), check_out (datetime|None), notes.
    """
    client = openai.AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", ""))

    try:
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": email_text[:6000],  # cap at 6K chars for safety
                },
            ],
            temperature=0,
            response_format={"type": "json_object"},
            max_tokens=512,
        )
        raw = response.choices[0].message.content or "{}"
    except openai.OpenAIError as exc:
        log.warning("OpenAI error parsing reservation email: %s", exc)
        raw = '{"type": "other", "title": "Imported Reservation"}'

    try:
        parsed: dict = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {"type": "other", "title": "Imported Reservation"}

    # ── Normalise type ────────────────────────────────────────────
    if parsed.get("type") not in _VALID_TYPES:
        parsed["type"] = "other"

    # ── Parse datetime strings ───────────────────────────────────
    for dt_field in ("check_in", "check_out"):
        val = parsed.get(dt_field)
        if val and isinstance(val, str):
            try:
                parsed[dt_field] = datetime.fromisoformat(val.replace("Z", "+00:00"))
            except ValueError:
                log.debug("Could not parse %s value: %s", dt_field, val)
                parsed[dt_field] = None
        else:
            parsed[dt_field] = None

    # ── Ensure title is always present ───────────────────────────
    if not parsed.get("title"):
        parsed["title"] = "Imported Reservation"

    return parsed
