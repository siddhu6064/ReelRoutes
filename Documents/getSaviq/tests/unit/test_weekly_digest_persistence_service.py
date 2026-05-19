import asyncio
from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[2] / "backend"))

from services.weekly_digest_service import dismiss_newest_persisted_digest, fetch_newest_persisted_digest


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _length):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query):
        filtered = [
            doc for doc in self.docs
            if doc.get("user_id") == query.get("user_id") and doc.get("profile_id") == query.get("profile_id")
        ]
        return _FakeCursor(filtered)

    async def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if (
                doc.get("user_id") == query.get("user_id")
                and doc.get("profile_id") == query.get("profile_id")
                and doc.get("week_start") == query.get("week_start")
                and doc.get("week_end") == query.get("week_end")
            ):
                doc.update(update.get("$set", {}))
                return


def _dt(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


def _run(coro):
    return asyncio.run(coro)


def test_newest_digest_selection_is_deterministic_for_active_profile_scope():
    docs = [
        {
            "user_id": "u1",
            "profile_id": "p1",
            "week_start": _dt(2026, 4, 6),
            "week_end": _dt(2026, 4, 12),
            "updated_at": _dt(2026, 4, 13),
            "digest_payload": {"narrative": {"summary": "older"}},
        },
        {
            "user_id": "u1",
            "profile_id": "p1",
            "week_start": _dt(2026, 4, 13),
            "week_end": _dt(2026, 4, 19),
            "updated_at": _dt(2026, 4, 20),
            "digest_payload": {"narrative": {"summary": "newest"}},
        },
        {
            "user_id": "u1",
            "profile_id": "p2",
            "week_start": _dt(2026, 4, 13),
            "week_end": _dt(2026, 4, 19),
            "updated_at": _dt(2026, 4, 20),
            "digest_payload": {"narrative": {"summary": "other profile"}},
        },
    ]

    newest = _run(
        fetch_newest_persisted_digest(
            digest_collection=_FakeCollection(docs),
            user_id="u1",
            profile_id="p1",
        )
    )

    assert newest["digest_payload"]["narrative"]["summary"] == "newest"


def test_dismiss_archive_is_idempotent_and_persists_hidden_state():
    docs = [
        {
            "user_id": "u1",
            "profile_id": "p1",
            "week_start": _dt(2026, 4, 13),
            "week_end": _dt(2026, 4, 19),
            "updated_at": _dt(2026, 4, 20),
            "digest_payload": {"narrative": {"summary": "newest"}},
        }
    ]
    collection = _FakeCollection(docs)

    first = _run(
        dismiss_newest_persisted_digest(
            digest_collection=collection,
            user_id="u1",
            profile_id="p1",
        )
    )
    second = _run(
        dismiss_newest_persisted_digest(
            digest_collection=collection,
            user_id="u1",
            profile_id="p1",
        )
    )

    latest_visible = _run(
        fetch_newest_persisted_digest(
            digest_collection=collection,
            user_id="u1",
            profile_id="p1",
        )
    )
    latest_any = _run(
        fetch_newest_persisted_digest(
            digest_collection=collection,
            user_id="u1",
            profile_id="p1",
            include_dismissed=True,
        )
    )

    assert first is True
    assert second is True
    assert latest_visible is None
    assert latest_any.get("banner_dismissed_at") is not None
