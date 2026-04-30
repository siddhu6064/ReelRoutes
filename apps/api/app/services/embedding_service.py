"""
app/services/embedding_service.py

Generates semantic embeddings for TripDocuments using OpenAI's
text-embedding-3-small model (1536 dimensions).

The embedding is built from a human-readable text fingerprint of the trip
so that semantically similar trips (same destination, vibe, stop types) end
up close together in vector space.

Design decisions:
  - Embedding generation is async and never blocks trip creation / display.
  - We skip regeneration if pins haven't changed (fingerprint hash check).
  - Falls back silently (returns None) when no OpenAI key is configured.
  - All MongoDB vector-search calls catch OperationFailure and return empty
    results when the cluster tier doesn't support $vectorSearch (M0/M2/M5).
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

from app.config.logging import get_logger
from app.config.settings import get_settings

if TYPE_CHECKING:
    from app.models.documents import TripDocument

logger = get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536
VECTOR_INDEX_NAME = "trips_embedding_index"
SIMILAR_TRIPS_CANDIDATES = 100  # num candidates for kNN
SIMILAR_TRIPS_LIMIT = 6  # results returned to client
MIN_SCORE = 0.70  # cosine similarity floor — drop weak matches


# ── Text fingerprint ───────────────────────────────────────────


def build_trip_text(trip: TripDocument) -> str:
    """
    Build a dense text representation of a trip for embedding.

    Includes: title, platform, destination, all pin names,
    cities, countries, and context quotes. This ensures that
    two trips visiting the same places end up close in vector
    space even if their titles differ.
    """
    parts: list[str] = []

    parts.append(f"Trip: {trip.title}")

    if trip.destination_text:
        parts.append(f"Destination: {trip.destination_text}")

    if trip.trip_preferences:
        parts.append(f"Travel style: {', '.join(trip.trip_preferences)}")

    pins = sorted(trip.pins, key=lambda p: p.order)
    locations: list[str] = []
    cities: set[str] = set()
    countries: set[str] = set()
    quotes: list[str] = []

    for pin in pins:
        locations.append(pin.place_name)
        if pin.city:
            cities.add(pin.city)
        if pin.country_code:
            countries.add(pin.country_code)
        if pin.context_quote:
            quotes.append(pin.context_quote[:120])

    if locations:
        parts.append(f"Places: {', '.join(locations)}")
    if cities:
        parts.append(f"Cities: {', '.join(sorted(cities))}")
    if countries:
        parts.append(f"Countries: {', '.join(sorted(countries))}")
    if quotes:
        parts.append(f"Highlights: {' | '.join(quotes[:5])}")

    return "\n".join(parts)


def fingerprint_hash(trip: TripDocument) -> str:
    """
    SHA-256 of the trip text fingerprint.
    Stored alongside the embedding so we can skip re-embedding
    when the trip hasn't meaningfully changed.
    """
    text = build_trip_text(trip)
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ── Embedding generation ───────────────────────────────────────


async def generate_embedding(text: str) -> list[float] | None:
    """
    Call OpenAI text-embedding-3-small and return a 1536-dim vector.
    Returns None if no API key is configured or on any error.
    """
    settings = get_settings()
    if not settings.openai_api_key:
        logger.debug("embedding_skipped_no_api_key")
        return None

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=text,
            dimensions=EMBEDDING_DIMS,
        )
        vector = response.data[0].embedding
        logger.info("embedding_generated", dims=len(vector))
        return vector

    except Exception as exc:
        logger.warning("embedding_generation_failed", error=str(exc))
        return None


async def embed_trip(trip: TripDocument, force: bool = False) -> bool:
    """
    Generate and persist an embedding for a trip.

    Returns True if the embedding was updated, False if skipped
    (e.g. no API key, no pins, or fingerprint unchanged).

    Args:
        trip:  The TripDocument to embed (mutated in-place if updated).
        force: Skip fingerprint check and always regenerate.
    """
    if not trip.pins:
        logger.debug("embed_trip_skipped_no_pins", trip_id=str(trip.id))
        return False

    text = build_trip_text(trip)
    new_hash = fingerprint_hash(trip)

    # Skip if nothing changed (saves OpenAI API calls)
    if not force and getattr(trip, "embedding_hash", None) == new_hash:
        logger.debug("embed_trip_skipped_unchanged", trip_id=str(trip.id))
        return False

    vector = await generate_embedding(text)
    if vector is None:
        return False

    trip.embedding = vector
    trip.embedding_hash = new_hash
    await trip.save()

    logger.info(
        "embed_trip_saved",
        trip_id=str(trip.id),
        dims=len(vector),
        hash=new_hash,
    )
    return True


# ── Vector search ──────────────────────────────────────────────


async def find_similar_trips(
    trip: TripDocument,
    public_only: bool = True,
    limit: int = SIMILAR_TRIPS_LIMIT,
    exclude_user_id: str | None = None,
) -> list[dict]:
    """
    Find trips similar to the given trip using Atlas Vector Search.

    Returns a list of trip card dicts sorted by cosine similarity (desc).
    Returns [] gracefully when:
      - The trip has no embedding yet
      - The cluster doesn't support $vectorSearch (M0/M2/M5)
      - No similar trips found above MIN_SCORE threshold

    Args:
        trip:            Source trip to find neighbors for.
        public_only:     Only return is_public=True trips.
        limit:           Max results to return.
        exclude_user_id: Exclude trips owned by this user (e.g. own trips).
    """
    if not getattr(trip, "embedding", None):
        logger.debug("similar_trips_skipped_no_embedding", trip_id=str(trip.id))
        return []

    try:
        return await _vector_search(
            query_vector=trip.embedding,
            exclude_id=str(trip.id),
            public_only=public_only,
            limit=limit,
            exclude_user_id=exclude_user_id,
        )
    except Exception as exc:
        # Catch OperationFailure (M0 cluster), index-not-found, etc.
        err = str(exc)
        if "index" in err.lower() or "vectorSearch" in err or "not supported" in err.lower():
            logger.warning(
                "vector_search_unavailable",
                error=err[:200],
                tip="Atlas Vector Search requires M10+ cluster. Returning empty results.",
            )
        else:
            logger.error("vector_search_failed", error=err[:200])
        return []


async def semantic_search_public(
    query: str,
    limit: int = SIMILAR_TRIPS_LIMIT,
) -> list[dict]:
    """
    Semantic search across public trips using a free-text query.

    Embeds the query string then runs kNN against the trips index.
    Returns [] gracefully on any error.
    """
    vector = await generate_embedding(query)
    if vector is None:
        return []

    try:
        return await _vector_search(
            query_vector=vector,
            exclude_id=None,
            public_only=True,
            limit=limit,
        )
    except Exception as exc:
        logger.warning("semantic_search_failed", error=str(exc)[:200])
        return []


async def _vector_search(
    query_vector: list[float],
    exclude_id: str | None,
    public_only: bool,
    limit: int,
    exclude_user_id: str | None = None,
) -> list[dict]:
    """
    Internal: run $vectorSearch aggregation pipeline against trips collection.

    Uses motor directly (bypassing Beanie) to access raw aggregation.
    """
    from app.models.documents import TripDocument

    # Build pre-filter (applied before kNN — must use Atlas Search syntax)
    pre_filter: dict = {}
    if public_only:
        pre_filter["is_public"] = {"$eq": True}

    pipeline: list[dict] = [
        {
            "$vectorSearch": {
                "index": VECTOR_INDEX_NAME,
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": SIMILAR_TRIPS_CANDIDATES,
                "limit": limit + 5,  # fetch extra to allow post-filter
                **({"filter": pre_filter} if pre_filter else {}),
            }
        },
        {
            "$project": {
                "_id": 1,
                "title": 1,
                "platform": 1,
                "pins": 1,
                "view_count": 1,
                "video_creator": 1,
                "video_channel": 1,
                "created_at": 1,
                "user_id": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
        # Post-filter: exclude the source trip and optionally the user's own trips
        {
            "$match": {
                **({} if exclude_id is None else {"_id": {"$ne": exclude_id}}),
                **({"score": {"$gte": MIN_SCORE}}),
            }
        },
        {"$limit": limit},
    ]

    # Use motor collection directly for raw aggregation
    collection = TripDocument.get_motor_collection()
    cursor = collection.aggregate(pipeline)
    results = await cursor.to_list(length=limit + 5)

    # Post-filter by user_id (can't do this efficiently in $vectorSearch filter)
    if exclude_user_id:
        results = [r for r in results if r.get("user_id") != exclude_user_id]

    return [_format_result(r) for r in results[:limit]]


def _format_result(raw: dict) -> dict:
    """Format a raw aggregation result into a trip card dict."""
    return {
        "id": str(raw.get("_id", "")),
        "title": raw.get("title", ""),
        "platform": raw.get("platform", "unknown"),
        "pin_count": len(raw.get("pins", [])),
        "view_count": raw.get("view_count", 0),
        "video_creator": raw.get("video_creator"),
        "video_channel": raw.get("video_channel"),
        "created_at": raw.get("created_at", "").isoformat()
        if hasattr(raw.get("created_at", ""), "isoformat")
        else "",
        "similarity_score": round(raw.get("score", 0.0), 3),
    }
