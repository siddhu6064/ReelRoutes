#!/usr/bin/env python3
"""
scripts/create_vector_index.py

One-time setup: creates the Atlas Vector Search index on the trips collection.

Run this ONCE after deploying to a new MongoDB Atlas M10+ cluster.
The index is required for:
  - GET /api/trips/:id/similar
  - GET /api/explore/semantic

Prerequisites:
  - MongoDB Atlas M10+ cluster (M0/M2/M5 do NOT support Vector Search)
  - MONGODB_URL env var pointing at the target cluster
  - pymongo >= 4.6 (supports createSearchIndex)

Usage:
    # Production:
    MONGODB_URL="mongodb+srv://..." MONGODB_DB=reelroutes_production \\
        python scripts/create_vector_index.py

    # Staging (M10+ required):
    MONGODB_URL="mongodb+srv://..." MONGODB_DB=reelroutes_staging \\
        python scripts/create_vector_index.py

    # Dry run — show what would be created:
    DRY_RUN=1 python scripts/create_vector_index.py

Safety:
  - Idempotent: skips creation if the index already exists.
  - Never modifies existing data.
"""

from __future__ import annotations

import os
import sys

DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
MONGODB_URL = os.environ.get("MONGODB_URL", "")
MONGODB_DB = os.environ.get("MONGODB_DB", "")

if not MONGODB_URL:
    print("❌ MONGODB_URL environment variable is required.")
    sys.exit(1)

if not MONGODB_DB:
    print("❌ MONGODB_DB environment variable is required.")
    sys.exit(1)

INDEX_NAME = "trips_embedding_index"
COLLECTION = "trips"
FIELD_PATH = "embedding"
NUM_DIMENSIONS = 1536
SIMILARITY = "cosine"

INDEX_DEFINITION = {
    "name": INDEX_NAME,
    "type": "vectorSearch",
    "definition": {
        "fields": [
            {
                "type": "vector",
                "path": FIELD_PATH,
                "numDimensions": NUM_DIMENSIONS,
                "similarity": SIMILARITY,
            },
            # Pre-filter fields — must be listed here to use in $vectorSearch filter
            {
                "type": "filter",
                "path": "is_public",
            },
            {
                "type": "filter",
                "path": "user_id",
            },
        ]
    },
}


def main() -> None:
    import pymongo

    print(f"\n{'DRY RUN — ' if DRY_RUN else ''}Atlas Vector Search Index Setup")
    print(f"  Database:   {MONGODB_DB}")
    print(f"  Collection: {COLLECTION}")
    print(f"  Index name: {INDEX_NAME}")
    print(f"  Dimensions: {NUM_DIMENSIONS}")
    print(f"  Similarity: {SIMILARITY}")
    print()

    if DRY_RUN:
        import json
        print("Would create index:")
        print(json.dumps(INDEX_DEFINITION, indent=2))
        print("\n✅ Dry run complete — no changes made.")
        return

    client = pymongo.MongoClient(MONGODB_URL)
    db = client[MONGODB_DB]
    collection = db[COLLECTION]

    # Check if index already exists
    try:
        existing = list(collection.list_search_indexes())
        existing_names = [idx.get("name", "") for idx in existing]
        if INDEX_NAME in existing_names:
            print(f"✅ Index '{INDEX_NAME}' already exists — nothing to do.")
            client.close()
            return
    except Exception as exc:
        err = str(exc)
        if "not supported" in err.lower() or "AtlasError" in err:
            print(
                f"❌ Vector Search is not available on this cluster tier.\n"
                f"   Atlas Vector Search requires M10 or higher.\n"
                f"   Current cluster returned: {err[:200]}"
            )
            client.close()
            sys.exit(1)
        # Other errors — proceed and let createSearchIndex surface them
        print(f"⚠  Could not list existing indexes ({err[:100]}) — proceeding anyway.")

    # Create the index
    try:
        result = collection.create_search_index(INDEX_DEFINITION)
        print(f"✅ Index creation initiated: {result}")
        print()
        print("⏳ Atlas builds the index in the background (usually 1–5 minutes).")
        print("   Monitor progress: Atlas UI → Search Indexes → trips_embedding_index")
        print()
        print("Next steps:")
        print("  1. Wait for index status to show 'READY' in Atlas UI")
        print("  2. Run: python scripts/backfill_embeddings.py")
        print("     (generates embeddings for all existing trips)")
    except Exception as exc:
        print(f"❌ Failed to create index: {exc}")
        client.close()
        sys.exit(1)

    client.close()


if __name__ == "__main__":
    main()
