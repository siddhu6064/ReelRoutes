import asyncio
from datetime import datetime, timezone

from services.insights_v2_service import generate_spend_comparison


class _FakeCursor:
    def __init__(self, docs):
        self._docs = docs

    async def to_list(self, _length):
        return list(self._docs)


class _FakeCollection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query, projection=None):
        date_q = query.get("date", {})
        gte = date_q.get("$gte")
        lt = date_q.get("$lt")

        matches = []
        for doc in self.docs:
            if doc.get("user_id") != query.get("user_id"):
                continue
            if query.get("profile_id") and doc.get("profile_id") != query.get("profile_id"):
                continue
            d = doc.get("date")
            if gte and not (d >= gte):
                continue
            if lt and not (d < lt):
                continue
            if projection:
                projected = {k: doc[k] for k, enabled in projection.items() if enabled and k in doc}
                matches.append(projected)
            else:
                matches.append(dict(doc))

        return _FakeCursor(matches)


def _run(coro):
    return asyncio.run(coro)


def _compare(expenses, budgets, *, period_type="monthly", now=None):
    return _run(
        generate_spend_comparison(
            user_id="u1",
            profile_id="p1",
            period_type=period_type,
            now=now or datetime(2026, 4, 15, 12, 0, tzinfo=timezone.utc),
            expenses_collection=_FakeCollection(expenses),
            budgets_collection=_FakeCollection(budgets),
        )
    )


def test_category_variance_positive_delta():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 180, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 3, 7, tzinfo=timezone.utc), "amount": 90, "type": "expense"},
        ],
        budgets=[],
    )
    assert result["category_comparisons"] == [
        {"category": "food", "current_total": 180.0, "previous_total": 90.0, "delta_amount": 90.0, "delta_percent": 100.0}
    ]


def test_category_variance_negative_delta():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "travel", "date": datetime(2026, 4, 10, tzinfo=timezone.utc), "amount": 50, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "travel", "date": datetime(2026, 3, 10, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[],
    )
    assert result["category_comparisons"][0]["delta_percent"] == -50.0


def test_previous_zero_handling():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 4, 5, tzinfo=timezone.utc), "amount": 55, "type": "expense"},
        ],
        budgets=[],
    )
    assert result["category_comparisons"][0]["previous_total"] == 0.0
    assert result["category_comparisons"][0]["delta_percent"] == 0.0
    assert result["delta_percent"] == 0.0


def test_stable_rounding_behavior():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 4, 5, tzinfo=timezone.utc), "amount": 10.005, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 3, 5, tzinfo=timezone.utc), "amount": 3.335, "type": "expense"},
        ],
        budgets=[],
    )
    assert result["current_total"] == 10.01
    assert result["previous_total"] == 3.33
    assert result["delta_amount"] == 6.68
    assert result["delta_percent"] == 200.6


def test_total_spend_spike_detection():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 7, tzinfo=timezone.utc), "amount": 180, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 3, 7, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[],
    )
    assert result["anomalies"]["total_spend_spike"] == {
        "detected": True,
        "threshold_percent": 50.0,
        "delta_percent": 80.0,
        "severity": "warning",
    }


def test_category_spike_detection():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 4, 7, tzinfo=timezone.utc), "amount": 180, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 3, 7, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[],
    )
    assert result["anomalies"]["category_spend_spikes"] == [
        {"category": "food", "threshold_percent": 75.0, "delta_percent": 80.0, "severity": "warning"}
    ]


def test_no_false_positive_in_normal_cases():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 4, 7, tzinfo=timezone.utc), "amount": 120, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 3, 7, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[],
    )
    assert result["anomalies"]["total_spend_spike"]["detected"] is False
    assert result["anomalies"]["category_spend_spikes"] == []


def test_elevated_budget_risk_early_in_period():
    now = datetime(2026, 4, 2, 12, 0, tzinfo=timezone.utc)
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 2, tzinfo=timezone.utc), "amount": 700, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 3, 2, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
        now=now,
    )
    assert result["budget_risk"]["risk_score"] > 70
    assert result["budget_risk"]["severity"] in {"high", "critical"}


def test_healthy_budget_state_late_in_period():
    now = datetime(2026, 4, 29, 12, 0, tzinfo=timezone.utc)
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 20, tzinfo=timezone.utc), "amount": 600, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 3, 20, tzinfo=timezone.utc), "amount": 550, "type": "expense"},
        ],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
        now=now,
    )
    assert result["budget_risk"]["severity"] == "info"


def test_no_budget_safe_handling():
    result = _compare(expenses=[], budgets=[])
    assert result["budget_risk"]["status"] == "no_budget"
    assert result["budget_risk"]["severity"] == "info"


def test_end_of_period_edge_case():
    now = datetime(2026, 4, 30, 23, 0, tzinfo=timezone.utc)
    result = _compare(
        expenses=[{"user_id": "u1", "profile_id": "p1", "date": now, "amount": 950, "type": "expense"}],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
        now=now,
    )
    assert result["budget_risk"]["remaining_days"] == 0
    assert result["budget_risk"]["risk_score"] >= 0


def test_severity_mapping_coverage_all_levels():
    low = _compare(
        expenses=[{"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 15, tzinfo=timezone.utc), "amount": 90, "type": "expense"}],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
    )
    warning = _compare(
        expenses=[{"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 15, tzinfo=timezone.utc), "amount": 500, "type": "expense"}],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
    )
    high = _compare(
        expenses=[{"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 2, tzinfo=timezone.utc), "amount": 650, "type": "expense"}],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
        now=datetime(2026, 4, 2, tzinfo=timezone.utc),
    )
    critical = _compare(
        expenses=[{"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 2, tzinfo=timezone.utc), "amount": 900, "type": "expense"}],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
        now=datetime(2026, 4, 2, tzinfo=timezone.utc),
    )

    assert low["budget_risk"]["severity"] == "info"
    assert warning["budget_risk"]["severity"] == "warning"
    assert high["budget_risk"]["severity"] == "high"
    assert critical["budget_risk"]["severity"] == "critical"


def test_stable_classification_of_anomaly_outputs():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 2, tzinfo=timezone.utc), "amount": 250, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 3, 2, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[],
        now=datetime(2026, 4, 2, tzinfo=timezone.utc),
    )
    assert result["anomalies"]["total_spend_spike"]["severity"] == "critical"


def test_strict_field_presence_in_metadata_envelope():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 180, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 3, 7, tzinfo=timezone.utc), "amount": 90, "type": "expense"},
        ],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
    )
    md = result["insight_metadata"]
    assert sorted(md.keys()) == [
        "anomalies",
        "budget_risk",
        "category_comparisons",
        "period_type",
        "schema_version",
        "total_comparison",
    ]
    assert sorted(md["total_comparison"].keys()) == [
        "current_total",
        "delta_amount",
        "delta_percent",
        "period_type",
        "previous_total",
    ]


def test_stable_payload_shape_normal_and_no_data_cases():
    normal = _compare(
        expenses=[{"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 120, "type": "expense"}],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 500}],
    )["insight_metadata"]
    empty = _compare(expenses=[], budgets=[])["insight_metadata"]

    assert set(normal.keys()) == set(empty.keys())
    assert set(normal["anomalies"].keys()) == set(empty["anomalies"].keys())
    assert set(normal["budget_risk"].keys()) == set(empty["budget_risk"].keys())
    assert isinstance(empty["category_comparisons"], list)
    assert empty["budget_risk"]["status"] == "no_budget"


def test_anomaly_metadata_consistency():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 250, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "food", "date": datetime(2026, 3, 4, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[],
    )
    anomaly = result["insight_metadata"]["anomalies"]["total_spend_spike"]
    assert sorted(anomaly.keys()) == ["delta_percent", "detected", "severity", "threshold_percent"]


def test_budget_risk_metadata_consistency():
    result = _compare(
        expenses=[{"user_id": "u1", "profile_id": "p1", "date": datetime(2026, 4, 4, tzinfo=timezone.utc), "amount": 250, "type": "expense"}],
        budgets=[{"user_id": "u1", "profile_id": "p1", "period": "monthly", "category_id": None, "amount": 1000}],
    )
    risk = result["insight_metadata"]["budget_risk"]
    assert sorted(risk.keys()) == [
        "budget_amount",
        "current_spend",
        "period_type",
        "progress_percent",
        "remaining_days",
        "risk_score",
        "severity",
        "status",
    ]


def test_deterministic_ordering_for_category_comparisons_and_spikes():
    result = _compare(
        expenses=[
            {"user_id": "u1", "profile_id": "p1", "category_id": "zeta", "date": datetime(2026, 4, 3, tzinfo=timezone.utc), "amount": 300, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "alpha", "date": datetime(2026, 4, 3, tzinfo=timezone.utc), "amount": 200, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "zeta", "date": datetime(2026, 3, 3, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
            {"user_id": "u1", "profile_id": "p1", "category_id": "alpha", "date": datetime(2026, 3, 3, tzinfo=timezone.utc), "amount": 100, "type": "expense"},
        ],
        budgets=[],
    )
    categories = [c["category"] for c in result["insight_metadata"]["category_comparisons"]]
    spikes = [c["category"] for c in result["insight_metadata"]["anomalies"]["category_spend_spikes"]]
    assert categories == sorted(categories)
    assert spikes == sorted(spikes)
