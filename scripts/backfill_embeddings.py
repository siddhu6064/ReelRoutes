#!/usr/bin/env python3
"""
scripts/backfill_embeddings.py

Backfill semantic embeddings for all existing TripDocuments that
don't have one yet (embedding is None).

Run this ONCE after creating the Atlas Vector Search index.
Subsequent trips get embeddings automatically via the job worker.

Usage:
    MONGODB_URL="..." MONGODB_DB="reelroutes_production" \\
    OPENAI_API_KEY="sk-..." \\
        python scripts/backfill_embeddings.py

    # Limit to first 100 trips (useful for testing):
    MAX_TRIPS=100 python scripts/backfill_embeddings.py

    # Dry run — count trips that need embedding:
    DRY_RUN=1 python scripts/backfill_embeddings.py

Rate limiting:
  - text-embedding-3-small: 3,000 RPM on tier 1, 1,000,000 TPM
  - The script processes 20 trips per second with a 0.05s delay
  - For 10,000 trips this takes ~8 minutes
"""

from __future__ import annotations

import asyncio
import os
import sys
import time

DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
MAX_TRIPS = int(os.environ.get("MAX_TRIPS", "0")) or None
BATCH_DELAY = 0.05  # seconds between embedding calls (avoid rate limits)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "api"))

os.environ.setdefault("ENV", "production")


async def backfill() -> None:
    import motor.motor_asyncio
    from beanie import init_beanie

    from app.models.documents import TripDocument
    from app.services.embedding_service import embed_trip

    mongodb_url = os.environ.get("MONGODB_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("MONGODB_DB", "reelroutes_production")

    client = motor.motor_asyncio.AsyncIOMotorClient(mongodb_url)
    await init_beanie(database=client[db_name], document_models=[TripDocument])

    print(f"\n{'DRY RUN — ' if DRY_RUN else ''}Embedding Backfill")
    print(f"  Database: {db_name}")

    # Find trips without embeddings that have at least 1 pin
    query = {"embedding": None, "pins.0": {"$exists": True}}
    total = await TripDocument.find(query).count()
    print(f"  Trips needing embedding: {total}")

    if MAX_TRIPS:
        print(f"  Limit: {MAX_TRIPS}")
    print()

    if DRY_RUN or total == 0:
        if total == 0:
            print("✅ All trips already have embeddings — nothing to do.")
        else:
            print(f"✅ Dry run complete — would process {total} trips.")
        client.close()
        return

    cursor = TripDocument.find(query)
    if MAX_TRIPS:
        cursor = cursor.limit(MAX_TRIPS)

    trips = await cursor.to_list(length=MAX_TRIPS or total)

    updated = 0
    skipped = 0
    failed = 0
    start = time.perf_counter()

    for i, trip in enumerate(trips, 1):
        try:
            result = await embed_trip(trip)
            if result:
                updated += 1
            else:
                skipped += 1

            # Progress every 10 trips
            if i % 10 == 0 or i == len(trips):
                elapsed = time.perf_counter() - start
                rate = i / elapsed
                remaining = (len(trips) - i) / rate if rate > 0 else 0
                print(
                    f"  [{i:>5}/{len(trips)}] ✓ {updated} embedded  "
                    f"⊘ {skipped} skipped  ✗ {failed} failed  "
                    f"~{remaining:.0f}s remaining"
                )

            await asyncio.sleep(BATCH_DELAY)

        except Exception as exc:
            failed += 1
            print(f"  [{i:>5}] ✗ trip {str(trip.id)[:8]} failed: {exc}")

    elapsed = time.perf_counter() - start
    print()
    print(f"{'=' * 50}")
    print(f"  Total:    {len(trips)}")
    print(f"  Embedded: {updated}")
    print(f"  Skipped:  {skipped} (no pins or unchanged)")
    print(f"  Failed:   {failed}")
    print(f"  Time:     {elapsed:.1f}s")
    print()
    if failed == 0:
        print("✅ Backfill complete!")
    else:
        print(f"⚠  Backfill complete with {failed} failures — check logs.")

    client.close()


if __name__ == "__main__":
    asyncio.run(backfill())
