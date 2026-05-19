from typing import Any


def normalize_name(value: str) -> str:
    return value.strip().lower()


async def backfill_missing_name_normalized(db: Any) -> dict[str, int]:
    """
    Backfill missing name_normalized fields for user-scoped collections.
    Safe/idempotent: only writes documents where name_normalized is missing or non-string.
    """
    targets = [
        ("profiles", db.profiles, "profile_id"),
        ("categories", db.categories, "category_id"),
        ("payment_methods", db.payment_methods, "payment_id"),
    ]

    summary = {
        "scanned": 0,
        "updated": 0,
        "skipped": 0,
    }

    for _name, collection, id_field in targets:
        docs = await collection.find({}, {"_id": 0, id_field: 1, "name": 1, "name_normalized": 1}).to_list(100000)
        for doc in docs:
            summary["scanned"] += 1
            name = doc.get("name")
            if not isinstance(name, str) or not name.strip():
                summary["skipped"] += 1
                continue

            current = doc.get("name_normalized")
            normalized = normalize_name(name)
            if isinstance(current, str) and current == normalized:
                summary["skipped"] += 1
                continue

            await collection.update_one(
                {id_field: doc[id_field]},
                {"$set": {"name_normalized": normalized}},
            )
            summary["updated"] += 1

    return summary
