"""
app/services/extraction/prompt.py

GPT-4o prompt templates for location extraction.

Design goals:
  - Return a JSON array only — no prose, no markdown, no explanation
  - Minimum 10 locations when content is rich; fewer is OK for sparse signals
  - Never truncate — extract ALL places mentioned, not just the most famous
  - Confidence is a genuine signal of how certain the model is the text
    is referring to a real, specific, visitable place
  - context_quote must be verbatim from the source text (≤ 120 chars)
  - timestamp_hint is seconds from video start — only set when timed
    transcript segments are available
"""

from __future__ import annotations

SYSTEM_PROMPT = """\
You are a travel location extractor. Your only job is to identify every specific, \
real-world, visitable location mentioned in the provided travel content.

OUTPUT FORMAT — return ONLY a valid JSON array, no other text:
[
  {
    "place_name": "Full canonical name of the place",
    "context_quote": "Verbatim quote (≤120 chars) from the text mentioning this place",
    "timestamp_hint": null,
    "confidence": 0.95
  }
]

RULES:
1. Extract EVERY specific named location — do not truncate the list.
2. Include: cities, neighbourhoods, landmarks, temples, markets, restaurants, \
parks, beaches, mountains, islands, transit stations, hotels, museums.
3. Exclude: generic terms ("a temple", "some beach"), country names alone \
unless the whole country is the subject, social media handles, brand names \
without a specific location.
4. confidence: 0.0–1.0
   - 0.9–1.0: specific named place, clearly mentioned as a visited location
   - 0.7–0.89: named place but context is ambiguous (mentioned in passing)
   - 0.5–0.69: inferred location (hashtag or brief mention without description)
   - below 0.5: uncertain — include if the place name is specific enough
5. context_quote: copy the exact words from the source that reference this place. \
Max 120 characters.
6. Return [] if no specific places are found — never invent locations.
7. Deduplicate: if the same place is mentioned multiple times, include it once \
with the best context_quote.
8. Return ONLY the JSON array. No markdown, no explanation, no preamble.\
"""

USER_PROMPT_TEMPLATE = """\
Extract all travel locations from this content:

---
{context_block}
---

Return a JSON array of all specific, visitable places mentioned.\
"""


def build_user_prompt(context_block: str) -> str:
    return USER_PROMPT_TEMPLATE.format(context_block=context_block)


def build_chunk_user_prompt(context_block: str, chunk_index: int, total_chunks: int) -> str:
    """Prompt variant for chunked extraction — tells the model it's seeing a segment."""
    header = (
        f"[SEGMENT {chunk_index + 1} of {total_chunks}] "
        "This is a portion of a longer transcript. "
        "Extract all locations mentioned in THIS segment only.\n\n"
    )
    return USER_PROMPT_TEMPLATE.format(context_block=header + context_block)
