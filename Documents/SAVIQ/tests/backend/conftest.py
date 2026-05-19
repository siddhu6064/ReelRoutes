import os
import sys
from copy import deepcopy
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Ensure required env vars exist before backend imports database.py
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "expense_tracker_test")

# Ensure backend source is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))


class FakeResult:
    def __init__(self, deleted_count: int = 0):
        self.deleted_count = deleted_count


class FakeCursor:
    def __init__(self, docs):
        self._docs = docs
        self._skip = 0
        self._limit = None

    def sort(self, field, direction):
        reverse = direction == -1
        self._docs.sort(key=lambda d: d.get(field), reverse=reverse)
        return self

    def skip(self, amount):
        self._skip = amount
        return self

    def limit(self, amount):
        self._limit = amount
        return self

    async def to_list(self, length):
        docs = self._docs[self._skip :]
        if self._limit is not None:
            docs = docs[: self._limit]
        if length is not None:
            docs = docs[:length]
        return [deepcopy(d) for d in docs]


class FakeCollection:
    def __init__(self):
        self.docs = []

    def _matches(self, doc, query):
        if not query:
            return True

        for key, expected in query.items():
            if key == "$or":
                if not any(self._matches(doc, part) for part in expected):
                    return False
                continue

            actual = doc.get(key)
            if isinstance(expected, dict):
                for op, value in expected.items():
                    if op == "$gte" and not (actual >= value):
                        return False
                    if op == "$lte" and not (actual <= value):
                        return False
                    if op == "$lt" and not (actual < value):
                        return False
            else:
                if actual != expected:
                    return False
        return True

    def _project(self, doc, projection):
        if projection is None:
            return deepcopy(doc)

        include_keys = {k for k, v in projection.items() if v}
        if include_keys:
            return {k: deepcopy(doc[k]) for k in include_keys if k in doc}

        # exclusion projection
        out = deepcopy(doc)
        for key, include in projection.items():
            if not include and key in out:
                out.pop(key)
        return out

    async def insert_one(self, doc):
        self.docs.append(deepcopy(doc))

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if self._matches(doc, query):
                return self._project(doc, projection)
        return None

    def find(self, query, projection=None):
        matches = [self._project(d, projection) for d in self.docs if self._matches(d, query)]
        return FakeCursor(matches)

    async def delete_many(self, query):
        before = len(self.docs)
        self.docs = [d for d in self.docs if not self._matches(d, query)]
        return FakeResult(deleted_count=before - len(self.docs))

    async def delete_one(self, query):
        for idx, doc in enumerate(self.docs):
            if self._matches(doc, query):
                self.docs.pop(idx)
                return FakeResult(deleted_count=1)
        return FakeResult(deleted_count=0)

    async def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(update.get("$set", {}))
                return

        if upsert:
            inserted = {**query, **update.get("$set", {})}
            self.docs.append(inserted)

    async def find_one_and_update(self, query, update, projection=None, return_document=None, upsert=False):
        for doc in self.docs:
            if self._matches(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                return self._project(doc, projection)

        if upsert and "$setOnInsert" in update:
            inserted = deepcopy(update["$setOnInsert"])
            self.docs.append(inserted)
            return self._project(inserted, projection)

        return None

    def aggregate(self, pipeline):
        match_stage = pipeline[0].get("$match", {})
        group_stage = pipeline[1].get("$group", {})
        group_field = group_stage.get("_id", "").lstrip("$")

        grouped = {}
        for doc in self.docs:
            if not self._matches(doc, match_stage):
                continue
            key = doc.get(group_field)
            grouped[key] = grouped.get(key, 0) + doc.get("amount", 0)

        docs = [{"_id": key, "total": total} for key, total in grouped.items()]
        return FakeCursor(docs)


class FakeDB:
    def __init__(self):
        self.users = FakeCollection()
        self.user_sessions = FakeCollection()
        self.profiles = FakeCollection()
        self.categories = FakeCollection()
        self.payment_methods = FakeCollection()
        self.expenses = FakeCollection()
        self.budgets = FakeCollection()
        self.savings_goals = FakeCollection()
        self.user_settings = FakeCollection()
        self.weekly_digests = FakeCollection()

    async def command(self, command_name):
        if command_name == "ping":
            return {"ok": 1}
        return {"ok": 0}


@pytest.fixture
def fake_db(monkeypatch):
    import database
    from routers import auth, analytics, insights, budgets, expenses, profiles, categories, misc, savings_goals, forecast, ai, subscriptions, weekly_digest, dashboard_metrics
    import deps
    import main

    db = FakeDB()

    # patch db in all modules that imported it directly
    monkeypatch.setattr(database, "db", db)
    monkeypatch.setattr(main, "db", db)
    monkeypatch.setattr(auth, "db", db)
    monkeypatch.setattr(expenses, "db", db)
    monkeypatch.setattr(budgets, "db", db)
    monkeypatch.setattr(analytics, "db", db)
    monkeypatch.setattr(insights, "db", db)
    monkeypatch.setattr(profiles, "db", db)
    monkeypatch.setattr(categories, "db", db)
    monkeypatch.setattr(misc, "db", db)
    monkeypatch.setattr(savings_goals, "db", db)
    monkeypatch.setattr(forecast, "db", db)
    monkeypatch.setattr(ai, "db", db)
    monkeypatch.setattr(subscriptions, "db", db)
    monkeypatch.setattr(weekly_digest, "db", db)
    monkeypatch.setattr(dashboard_metrics, "db", db)
    monkeypatch.setattr(deps, "db", db)

    async def _noop():
        return None

    monkeypatch.setattr(main, "create_indexes", _noop)
    monkeypatch.setattr(main, "close_db", _noop)

    return db


@pytest.fixture
def client(fake_db):
    import main
    from routers import auth

    app_limiter = main.app.state.limiter
    app_limiter_previous = getattr(app_limiter, "enabled", True)
    app_limiter.enabled = False

    auth_limiter = auth.limiter
    auth_limiter_previous = getattr(auth_limiter, "enabled", True)
    auth_limiter.enabled = False

    with TestClient(main.app) as test_client:
        yield test_client

    auth_limiter.enabled = auth_limiter_previous
    app_limiter.enabled = app_limiter_previous
