import asyncio
from datetime import datetime, timezone

from services.chat_insights_service import build_chat_transaction_context


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _length):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query, projection=None):
        matches = []
        for doc in self.docs:
            if query.get("user_id") and doc.get("user_id") != query.get("user_id"):
                continue
            if query.get("profile_id") and doc.get("profile_id") != query.get("profile_id"):
                continue
            if query.get("period") and doc.get("period") != query.get("period"):
                continue

            date_query = query.get("date")
            if date_query and doc.get("date") is not None:
                gte = date_query.get("$gte")
                lte = date_query.get("$lte")
                lt = date_query.get("$lt")
                if gte and doc["date"] < gte:
                    continue
                if lte and doc["date"] > lte:
                    continue
                if lt and doc["date"] >= lt:
                    continue

            if projection:
                matches.append({k: doc.get(k) for k, enabled in projection.items() if enabled})
            else:
                matches.append(dict(doc))

        return _FakeCursor(matches)


def _run(coro):
    return asyncio.run(coro)


def test_context_builder_includes_recent_spend_summary_and_top_categories():
    now = datetime(2026, 4, 20, tzinfo=timezone.utc)
    expenses = _FakeCollection([
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 18, tzinfo=timezone.utc), "amount": 50, "type": "expense", "category_id": "cat_food"},
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 17, tzinfo=timezone.utc), "amount": 30, "type": "expense", "category_id": "cat_food"},
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 16, tzinfo=timezone.utc), "amount": 20, "type": "expense", "category_id": "cat_transport"},
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 19, tzinfo=timezone.utc), "amount": 100, "type": "income", "category_id": "cat_salary"},
    ])
    categories = _FakeCollection([
        {"user_id": "u1", "category_id": "cat_food", "name": "Food"},
        {"user_id": "u1", "category_id": "cat_transport", "name": "Transport"},
    ])
    budgets = _FakeCollection([
        {"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 500},
    ])

    context = _run(
        build_chat_transaction_context(
            user_id="u1",
            profile_id="p1",
            recent_days=30,
            expenses_collection=expenses,
            categories_collection=categories,
            budgets_collection=budgets,
            now=now,
        )
    )

    assert context["recent_spend"]["total"] == 100.0
    assert context["recent_spend"]["transaction_count"] == 3
    assert context["top_categories"][0]["category_name"] == "Food"


def test_context_builder_includes_budget_and_forecast_summaries():
    now = datetime(2026, 4, 20, tzinfo=timezone.utc)
    expenses = _FakeCollection([
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 5, tzinfo=timezone.utc), "amount": 60, "type": "expense", "category_id": "cat_misc"},
        {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 10, tzinfo=timezone.utc), "amount": 75, "type": "expense", "category_id": "cat_misc"},
    ])
    categories = _FakeCollection([
        {"user_id": "u1", "category_id": "cat_misc", "name": "Misc"},
    ])
    budgets = _FakeCollection([
        {"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 400},
    ])

    context = _run(
        build_chat_transaction_context(
            user_id="u1",
            profile_id="p1",
            recent_days=30,
            expenses_collection=expenses,
            categories_collection=categories,
            budgets_collection=budgets,
            now=now,
        )
    )

    assert "risk" in context["budgets"]
    assert context["budgets"]["risk"].get("period_type") == "monthly"
    assert "summary" in context["forecast"]
    assert "projections" in context["forecast"]
