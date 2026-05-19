from datetime import datetime, timedelta, timezone
from uuid import uuid4

from pymongo.errors import DuplicateKeyError

from utils.integrity_checks import run_integrity_checks
from utils.normalized_fields_backfill import backfill_missing_name_normalized


def _register(client, email=None, password="secret123", name="Tester"):
    if email is None:
        email = f"tester_{uuid4().hex[:10]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "name": name},
    )
    assert response.status_code == 200
    return response.json()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_get_api_root(client):
    response = client.get("/api")

    assert response.status_code == 200
    payload = response.json()
    assert payload["message"] == "SAVIQ API"


def test_healthz_returns_200(client):
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz_returns_200(client):
    response = client.get("/readyz")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readyz_returns_503_when_dependency_check_fails(client, monkeypatch):
    import main

    async def _not_ready():
        return False

    monkeypatch.setattr(main, "_dependencies_ready", _not_ready)
    response = client.get("/readyz")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "SERVICE_UNAVAILABLE"


def test_delete_account_unauthorized_rejected(client):
    response = client.request("DELETE", "/api/auth/account", json={"confirmation": "DELETE"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


def test_delete_account_removes_user_data_and_invalidates_session(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]

    # Seed user-scoped docs to ensure account deletion wipes all owned data.
    fake_db.user_settings.docs.append({"user_id": user_id, "currency": "USD"})
    fake_db.budgets.docs.append({"user_id": user_id, "budget_id": "b1", "profile_id": "p1", "amount": 100})
    fake_db.expenses.docs.append({"user_id": user_id, "expense_id": "e1", "profile_id": "p1", "amount": 10})

    delete_resp = client.request("DELETE", "/api/auth/account", headers=headers, json={"confirmation": "DELETE"})
    assert delete_resp.status_code == 200
    assert delete_resp.json()["message"] == "Account deleted successfully"

    # Session is invalid after deletion.
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 401
    assert me_resp.json()["error"]["code"] == "UNAUTHORIZED"

    # User-owned data removed.
    collections = [
        fake_db.users.docs,
        fake_db.user_sessions.docs,
        fake_db.profiles.docs,
        fake_db.categories.docs,
        fake_db.payment_methods.docs,
        fake_db.expenses.docs,
        fake_db.budgets.docs,
        fake_db.user_settings.docs,
    ]
    assert all(not any(d.get("user_id") == user_id for d in docs) for docs in collections)


def test_expenses_negative_pagination_rejected(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get("/api/expenses?limit=-1", headers=headers)

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_expenses_invalid_date_filter_rejected(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get("/api/expenses?start_date=not-a-date", headers=headers)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_expenses_invalid_date_range_rejected(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get(
        "/api/expenses",
        headers=headers,
        params={
            "start_date": "2026-03-10T00:00:00+00:00",
            "end_date": "2026-03-01T00:00:00+00:00",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_expenses_search_type_and_payment_filters(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    alt_payment = client.post(
        "/api/payment-methods",
        headers=headers,
        json={"name": "Alt PM", "type": "debit_card", "last_four": "2222", "is_default": False},
    )
    assert alt_payment.status_code == 200
    alt_payment_id = alt_payment.json()["payment_id"]

    cases = [
        {"description": "Groceries market", "type": "expense", "payment_method_id": payment_id},
        {"description": "Salary paycheck", "type": "income", "payment_method_id": payment_id},
        {"description": "Coffee shop", "type": "expense", "payment_method_id": alt_payment_id},
    ]
    for payload in cases:
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "amount": 50.0,
                "category_id": category_id,
                "date": datetime.now(timezone.utc).isoformat(),
                **payload,
            },
        )
        assert resp.status_code == 200

    filtered = client.get(
        "/api/expenses",
        headers=headers,
        params={
            "q": "coffee",
            "type": "expense",
            "payment_method_id": alt_payment_id,
        },
    )
    assert filtered.status_code == 200
    items = filtered.json()
    assert len(items) == 1
    assert items[0]["description"] == "Coffee shop"


def test_expenses_list_order_is_deterministic_desc_by_date(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    older = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 10.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Older expense",
            "date": "2024-01-01T00:00:00+00:00",
        },
    )
    newer = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 20.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Newer expense",
            "date": "2024-01-02T00:00:00+00:00",
        },
    )
    assert older.status_code == 200
    assert newer.status_code == 200

    list_response = client.get(f"/api/expenses?profile_id={profile_id}", headers=headers)
    assert list_response.status_code == 200
    items = list_response.json()

    assert items[0]["description"] == "Newer expense"
    assert items[1]["description"] == "Older expense"


def test_analytics_summary_values(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    now = datetime.now(timezone.utc)
    this_month = now.replace(day=5)
    prev_month = (now.replace(day=1) - timedelta(days=2)).replace(day=5)

    for payload in [
        {
            "profile_id": profile_id,
            "type": "expense",
            "amount": 200.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Current month spend",
            "date": this_month.isoformat(),
        },
        {
            "profile_id": profile_id,
            "type": "expense",
            "amount": 100.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Previous month spend",
            "date": prev_month.isoformat(),
        },
        {
            "profile_id": profile_id,
            "type": "income",
            "amount": 500.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Salary",
            "date": this_month.isoformat(),
        },
    ]:
        resp = client.post("/api/expenses", headers=headers, json=payload)
        assert resp.status_code == 200

    summary = client.get("/api/analytics/summary", headers=headers)
    assert summary.status_code == 200
    body = summary.json()
    assert body["total_spend"] == 300.0
    assert body["total_income"] == 500.0
    assert body["net_balance"] == 200.0
    assert body["current_month_spend"] == 200.0
    assert body["previous_month_spend"] == 100.0
    assert body["month_over_month_change_pct"] == 100.0


def test_analytics_category_breakdown_sorted(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, default_category_id, payment_id = _first_ids_for_user(fake_db, user_id)
    second_category = client.post(
        "/api/categories",
        headers=headers,
        json={"name": "Analytics Cat", "color": "#22c55e", "icon": "flash"},
    )
    assert second_category.status_code == 200
    second_category_id = second_category.json()["category_id"]

    for payload in [
        {"category_id": default_category_id, "amount": 120.0, "description": "A"},
        {"category_id": second_category_id, "amount": 40.0, "description": "B"},
    ]:
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "type": "expense",
                "amount": payload["amount"],
                "category_id": payload["category_id"],
                "payment_method_id": payment_id,
                "description": payload["description"],
                "date": datetime.now(timezone.utc).isoformat(),
            },
        )
        assert resp.status_code == 200

    breakdown = client.get("/api/analytics/category-breakdown", headers=headers)
    assert breakdown.status_code == 200
    items = breakdown.json()["items"]
    assert items[0]["amount"] == 120.0
    assert items[1]["amount"] == 40.0
    assert items[0]["percentage"] == 75.0
    assert items[1]["percentage"] == 25.0


def test_analytics_monthly_trend_ordering(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])
    now = datetime.now(timezone.utc).replace(day=10)

    for months_ago, amount in [(5, 10.0), (2, 20.0), (0, 30.0)]:
        month_anchor = now.replace(day=1)
        target_month = month_anchor
        for _ in range(months_ago):
            target_month = (target_month - timedelta(days=1)).replace(day=1)
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "type": "expense",
                "amount": amount,
                "category_id": category_id,
                "payment_method_id": payment_id,
                "description": f"m-{months_ago}",
                "date": target_month.replace(day=10).isoformat(),
            },
        )
        assert resp.status_code == 200

    trend = client.get("/api/analytics/monthly-trend", headers=headers)
    assert trend.status_code == 200
    months = [item["month"] for item in trend.json()["items"]]
    assert months == sorted(months)
    assert len(months) == 6


def test_analytics_empty_data_safe_response(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    summary = client.get("/api/analytics/summary", headers=headers)
    category = client.get("/api/analytics/category-breakdown", headers=headers)
    payment = client.get("/api/analytics/payment-method-breakdown", headers=headers)
    trend = client.get("/api/analytics/monthly-trend", headers=headers)

    assert summary.status_code == 200
    assert summary.json()["total_spend"] == 0.0
    assert category.status_code == 200
    assert category.json()["items"] == []
    assert payment.status_code == 200
    assert payment.json()["items"] == []
    assert trend.status_code == 200
    assert len(trend.json()["items"]) == 6


def test_analytics_invalid_date_range_rejected(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get(
        "/api/analytics/summary",
        headers=headers,
        params={
            "start_date": "2026-03-10T00:00:00+00:00",
            "end_date": "2026-03-01T00:00:00+00:00",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "BAD_REQUEST"


def test_analytics_summary_respects_date_range(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    inside = datetime.now(timezone.utc) - timedelta(days=10)
    outside = datetime.now(timezone.utc) - timedelta(days=120)

    for amount, date_val in [(50.0, inside), (200.0, outside)]:
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "type": "expense",
                "amount": amount,
                "category_id": category_id,
                "payment_method_id": payment_id,
                "description": f"range-{amount}",
                "date": date_val.isoformat(),
            },
        )
        assert resp.status_code == 200

    start = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    end = datetime.now(timezone.utc).isoformat()
    summary = client.get("/api/analytics/summary", headers=headers, params={"start_date": start, "end_date": end})
    assert summary.status_code == 200
    assert summary.json()["total_spend"] == 50.0


def test_insights_overview_respects_date_range(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    now = datetime.now(timezone.utc)
    recent = now - timedelta(days=5)
    old = now - timedelta(days=180)

    for amount, date_val in [(120.0, recent), (400.0, old)]:
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "type": "expense",
                "amount": amount,
                "category_id": category_id,
                "payment_method_id": payment_id,
                "description": f"insight-{amount}",
                "date": date_val.isoformat(),
            },
        )
        assert resp.status_code == 200

    start = (now - timedelta(days=30)).isoformat()
    end = now.isoformat()
    response = client.get("/api/insights/overview", headers=headers, params={"start_date": start, "end_date": end})
    assert response.status_code == 200
    top_category = next((i for i in response.json()["insights"] if i["type"] == "top_category"), None)
    assert top_category is not None
    assert top_category["metric"]["share_pct"] == 100.0


def test_insights_overview_rising_spend(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    now = datetime.now(timezone.utc)
    this_month = now.replace(day=10)
    prev_month = (now.replace(day=1) - timedelta(days=2)).replace(day=10)

    for amount, date_val in [(100.0, prev_month), (250.0, this_month)]:
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "type": "expense",
                "amount": amount,
                "category_id": category_id,
                "payment_method_id": payment_id,
                "description": f"amount-{amount}",
                "date": date_val.isoformat(),
            },
        )
        assert resp.status_code == 200

    response = client.get("/api/insights/overview", headers=headers)
    assert response.status_code == 200
    assert any(i["type"] == "trend" and i["severity"] == "warning" for i in response.json()["insights"])


def test_insights_overview_top_category_concentration(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, primary_cat, payment_id = _first_ids_for_user(fake_db, user_id)
    second_category = client.post(
        "/api/categories",
        headers=headers,
        json={"name": "Low Share Cat", "color": "#22c55e", "icon": "flash"},
    )
    assert second_category.status_code == 200
    second_cat = second_category.json()["category_id"]

    for cid, amount in [(primary_cat, 180.0), (second_cat, 20.0)]:
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "type": "expense",
                "amount": amount,
                "category_id": cid,
                "payment_method_id": payment_id,
                "description": f"c-{amount}",
                "date": datetime.now(timezone.utc).isoformat(),
            },
        )
        assert resp.status_code == 200

    response = client.get("/api/insights/overview", headers=headers)
    assert response.status_code == 200
    assert any(i["type"] == "concentration" for i in response.json()["insights"])


def test_insights_empty_state_safe_behavior(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    overview = client.get("/api/insights/overview", headers=headers)
    recommendations = client.get("/api/insights/recommendations", headers=headers)

    assert overview.status_code == 200
    assert recommendations.status_code == 200
    assert overview.json()["insights"][0]["type"] == "empty_state"
    assert recommendations.json()["insights"][0]["type"] == "getting_started"


def test_insights_recommendations_are_deterministic(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, user_id)

    # Add an entertainment category and corresponding budget to trigger deterministic recommendations.
    ent = client.post(
        "/api/categories",
        headers=headers,
        json={"name": "Entertainment Plus", "color": "#22c55e", "icon": "flash"},
    )
    assert ent.status_code == 200
    ent_id = ent.json()["category_id"]
    budget = client.post(
        "/api/budgets",
        headers=headers,
        json={"profile_id": profile_id, "category_id": ent_id, "amount": 100.0, "period": "monthly"},
    )
    assert budget.status_code == 200

    for payload in [
        {"type": "expense", "amount": 90.0, "category_id": ent_id, "payment_method_id": payment_id, "description": "ent"},
        {"type": "expense", "amount": 30.0, "category_id": category_id, "payment_method_id": payment_id, "description": "other"},
        {"type": "income", "amount": 500.0, "category_id": category_id, "payment_method_id": payment_id, "description": "income"},
    ]:
        resp = client.post(
            "/api/expenses",
            headers=headers,
            json={
                "profile_id": profile_id,
                "date": datetime.now(timezone.utc).isoformat(),
                **payload,
            },
        )
        assert resp.status_code == 200

    first = client.get("/api/insights/recommendations", headers=headers)
    second = client.get("/api/insights/recommendations", headers=headers)
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()


def test_insights_v2_profile_scoped_success(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, user_id)

    create = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 125.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "V2 Insights test",
            "type": "expense",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert create.status_code == 200

    response = client.get("/api/insights/v2", headers=headers, params={"profile_id": profile_id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile_id"] == profile_id
    assert "weekly" in payload
    assert "monthly" in payload
    assert "insight_metadata" in payload["weekly"]
    assert "insight_metadata" in payload["monthly"]


def test_insights_v2_invalid_or_unauthorized_profile_rejected(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    missing_param = client.get("/api/insights/v2", headers=headers)
    assert missing_param.status_code == 400
    assert missing_param.json()["error"]["code"] == "BAD_REQUEST"

    missing = client.get("/api/insights/v2", headers=headers, params={"profile_id": "profile_missing"})
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "NOT_FOUND"


def test_insights_v2_stable_response_shape(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, _, _ = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    response = client.get("/api/insights/v2", headers=headers, params={"profile_id": profile_id})
    assert response.status_code == 200

    payload = response.json()
    for period_key in ("weekly", "monthly"):
        period_payload = payload[period_key]
        assert {"period_type", "current_total", "previous_total", "delta_amount", "delta_percent", "category_comparisons", "anomalies", "budget_risk", "insight_metadata"} <= set(period_payload.keys())
        assert {"schema_version", "period_type", "total_comparison", "category_comparisons", "anomalies", "budget_risk"} <= set(period_payload["insight_metadata"].keys())


def test_insights_v2_no_data_response_shape(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, _, _ = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    response = client.get("/api/insights/v2", headers=headers, params={"profile_id": profile_id})
    assert response.status_code == 200
    payload = response.json()

    assert payload["weekly"]["current_total"] == 0
    assert payload["weekly"]["previous_total"] == 0
    assert payload["weekly"]["insight_metadata"]["budget_risk"]["status"] == "no_budget"
    assert isinstance(payload["monthly"]["category_comparisons"], list)


def test_auth_register_success(client):
    payload = _register(client)

    assert payload["user"]["email"].endswith("@example.com")
    assert payload["session_token"]


def test_auth_login_success(client):
    auth = _register(client)

    response = client.post(
        "/api/auth/login",
        json={"email": auth["user"]["email"], "password": "secret123"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["email"].endswith("@example.com")
    assert payload["session_token"]


def test_profile_duplicate_create_rejected(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    first = client.post("/api/profiles", headers=headers, json={"name": "Work"})
    second = client.post("/api/profiles", headers=headers, json={"name": " work "})

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "CONFLICT"


def test_profile_response_model_hides_internal_fields(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.post("/api/profiles", headers=headers, json={"name": "Typed Model Profile"})

    assert response.status_code == 200
    payload = response.json()
    assert "name_normalized" not in payload
    assert payload["profile_type"] == "personal"


def test_profile_create_accepts_explicit_profile_type(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.post("/api/profiles", headers=headers, json={"name": "Roommates", "profile_type": "shared"})

    assert response.status_code == 200
    assert response.json()["profile_type"] == "shared"


def test_profile_create_rejects_invalid_profile_type(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.post("/api/profiles", headers=headers, json={"name": "Invalid", "profile_type": "enterprise"})

    assert response.status_code == 422


def test_seeded_profiles_have_explicit_profile_types(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get("/api/profiles", headers=headers)

    assert response.status_code == 200
    by_name = {p["name"]: p for p in response.json()}
    assert by_name["Personal"]["profile_type"] == "personal"
    assert by_name["Business"]["profile_type"] == "business"


def test_profiles_response_always_includes_profile_type(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get("/api/profiles", headers=headers)

    assert response.status_code == 200
    profiles = response.json()
    assert profiles
    assert all("profile_type" in profile for profile in profiles)


def test_profile_type_contract_stability_for_seed_and_shared_create(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    seeded = client.get("/api/profiles", headers=headers)
    assert seeded.status_code == 200
    seeded_by_name = {p["name"]: p for p in seeded.json()}
    assert seeded_by_name["Personal"]["profile_type"] == "personal"
    assert seeded_by_name["Business"]["profile_type"] == "business"

    created = client.post("/api/profiles", headers=headers, json={"name": "Roommates Shared", "profile_type": "shared"})
    assert created.status_code == 200
    assert created.json()["profile_type"] == "shared"


def test_profile_update_refreshes_name_normalized_field(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]

    created = client.post("/api/profiles", headers=headers, json={"name": "Original Name"})
    assert created.status_code == 200
    profile_id = created.json()["profile_id"]

    update = client.put(f"/api/profiles/{profile_id}", headers=headers, json={"name": "  Renamed Profile  "})
    assert update.status_code == 200
    assert "name_normalized" not in update.json()

    stored = next(p for p in fake_db.profiles.docs if p["profile_id"] == profile_id and p["user_id"] == user_id)
    assert stored["name_normalized"] == "renamed profile"


def test_name_normalized_backfill_is_idempotent(fake_db):
    fake_db.profiles.docs.append({"profile_id": "profile_1", "user_id": "u1", "name": " Work "})
    fake_db.categories.docs.append({"category_id": "cat_1", "user_id": "u1", "name": " Utilities "})
    fake_db.payment_methods.docs.append({"payment_id": "pm_1", "user_id": "u1", "name": " Travel Card "})

    import asyncio

    first = asyncio.run(backfill_missing_name_normalized(fake_db))
    second = asyncio.run(backfill_missing_name_normalized(fake_db))

    assert first["updated"] == 3
    assert second["updated"] == 0
    assert fake_db.profiles.docs[0]["name_normalized"] == "work"
    assert fake_db.categories.docs[0]["name_normalized"] == "utilities"
    assert fake_db.payment_methods.docs[0]["name_normalized"] == "travel card"


def test_integrity_check_reports_reference_and_normalization_issues(fake_db):
    from datetime import datetime, timezone, timedelta
    import asyncio

    fake_db.expenses.docs.append(
        {
            "expense_id": "exp_1",
            "user_id": "u1",
            "profile_id": "missing_profile",
            "category_id": "missing_cat",
            "payment_method_id": "missing_pm",
            "to_payment_method_id": "missing_pm_2",
        }
    )
    fake_db.budgets.docs.append(
        {
            "budget_id": "budget_1",
            "user_id": "u1",
            "profile_id": "missing_profile",
            "category_id": "missing_cat",
        }
    )
    fake_db.profiles.docs.extend(
        [
            {"profile_id": "profile_a", "user_id": "u1", "name": " Work "},
            {"profile_id": "profile_b", "user_id": "u1", "name": "Work", "name_normalized": "work"},
            {"profile_id": "profile_c", "user_id": "u1", "name": "work", "name_normalized": "work"},
        ]
    )
    fake_db.user_sessions.docs.append(
        {
            "session_id": "sess_1",
            "user_id": "u1",
            "expires_at": datetime.now(timezone.utc) - timedelta(days=1),
        }
    )

    result = asyncio.run(run_integrity_checks(fake_db, sample_size=5))

    assert result["overall_status"] == "issues_found"
    assert result["issues"]["expenses_missing_profile_ref"]["count"] == 1
    assert result["issues"]["expenses_missing_category_ref"]["count"] == 1
    assert result["issues"]["expenses_missing_payment_ref"]["count"] == 1
    assert result["issues"]["expenses_missing_to_payment_ref"]["count"] == 1
    assert result["issues"]["budgets_missing_profile_ref"]["count"] == 1
    assert result["issues"]["budgets_missing_category_ref"]["count"] == 1
    assert result["issues"]["profiles_missing_name_normalized"]["count"] == 1
    assert result["issues"]["profiles_duplicate_normalized_name"]["count"] == 1
    assert result["issues"]["expired_sessions_present"]["count"] == 1


def test_category_duplicate_create_rejected_same_scope(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    first = client.post(
        "/api/categories",
        headers=headers,
        json={"name": "Utilities", "color": "#22c55e", "icon": "flash", "profile_id": None},
    )
    second = client.post(
        "/api/categories",
        headers=headers,
        json={"name": " utilities ", "color": "#22c55e", "icon": "flash", "profile_id": None},
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "CONFLICT"


def test_payment_method_exact_duplicate_rejected(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    first = client.post(
        "/api/payment-methods",
        headers=headers,
        json={"name": "Travel Card", "type": "credit_card", "last_four": "1234", "is_default": False},
    )
    second = client.post(
        "/api/payment-methods",
        headers=headers,
        json={"name": " travel card ", "type": "credit_card", "last_four": "1234", "is_default": False},
    )

    assert first.status_code == 200
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "CONFLICT"


def test_profile_duplicate_key_error_translated_to_conflict(client, fake_db, monkeypatch):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    async def _raise_duplicate(_doc):
        raise DuplicateKeyError("E11000 duplicate key")

    monkeypatch.setattr(fake_db.profiles, "insert_one", _raise_duplicate)

    response = client.post("/api/profiles", headers=headers, json={"name": "Race Duplicate"})

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_category_duplicate_key_error_translated_to_conflict(client, fake_db, monkeypatch):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    async def _raise_duplicate(_doc):
        raise DuplicateKeyError("E11000 duplicate key")

    monkeypatch.setattr(fake_db.categories, "insert_one", _raise_duplicate)

    response = client.post(
        "/api/categories",
        headers=headers,
        json={"name": "Race Category", "color": "#22c55e", "icon": "flash", "profile_id": None},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_payment_method_duplicate_key_error_translated_to_conflict(client, fake_db, monkeypatch):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    async def _raise_duplicate(_doc):
        raise DuplicateKeyError("E11000 duplicate key")

    monkeypatch.setattr(fake_db.payment_methods, "insert_one", _raise_duplicate)

    response = client.post(
        "/api/payment-methods",
        headers=headers,
        json={"name": "Race PM", "type": "credit_card", "last_four": "1234", "is_default": False},
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_delete_referenced_profile_blocked(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    _, category_id, payment_id = _first_ids_for_user(fake_db, user_id)

    profile_create = client.post("/api/profiles", headers=headers, json={"name": "Delete Blocked Profile"})
    assert profile_create.status_code == 200
    profile_id = profile_create.json()["profile_id"]

    expense_create = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 15.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Profile reference",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert expense_create.status_code == 200

    delete_response = client.delete(f"/api/profiles/{profile_id}", headers=headers)
    assert delete_response.status_code == 409
    assert delete_response.json()["error"]["code"] == "CONFLICT"


def test_delete_referenced_category_blocked(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, _, payment_id = _first_ids_for_user(fake_db, user_id)

    category_create = client.post(
        "/api/categories",
        headers=headers,
        json={"name": "Delete Blocked Category", "color": "#22c55e", "icon": "flash"},
    )
    assert category_create.status_code == 200
    category_id = category_create.json()["category_id"]

    expense_create = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 25.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Category reference",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert expense_create.status_code == 200

    delete_response = client.delete(f"/api/categories/{category_id}", headers=headers)
    assert delete_response.status_code == 409
    assert delete_response.json()["error"]["code"] == "CONFLICT"


def test_delete_referenced_payment_method_blocked(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, category_id, _ = _first_ids_for_user(fake_db, user_id)

    payment_create = client.post(
        "/api/payment-methods",
        headers=headers,
        json={"name": "Delete Blocked PM", "type": "credit_card", "last_four": "4444", "is_default": False},
    )
    assert payment_create.status_code == 200
    payment_id = payment_create.json()["payment_id"]

    expense_create = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 35.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Payment method reference",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert expense_create.status_code == 200

    delete_response = client.delete(f"/api/payment-methods/{payment_id}", headers=headers)
    assert delete_response.status_code == 409
    assert delete_response.json()["error"]["code"] == "CONFLICT"


def test_delete_unreferenced_non_default_resources_succeeds(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    profile = client.post("/api/profiles", headers=headers, json={"name": "Disposable Profile"})
    category = client.post(
        "/api/categories",
        headers=headers,
        json={"name": "Disposable Category", "color": "#3b82f6", "icon": "tag"},
    )
    payment = client.post(
        "/api/payment-methods",
        headers=headers,
        json={"name": "Disposable PM", "type": "debit_card", "last_four": "6789", "is_default": False},
    )

    assert profile.status_code == 200
    assert category.status_code == 200
    assert payment.status_code == 200

    assert client.delete(f"/api/profiles/{profile.json()['profile_id']}", headers=headers).status_code == 200
    assert client.delete(f"/api/categories/{category.json()['category_id']}", headers=headers).status_code == 200
    assert client.delete(f"/api/payment-methods/{payment.json()['payment_id']}", headers=headers).status_code == 200


def test_auth_me_success(client):
    auth = _register(client)

    response = client.get("/api/auth/me", headers=_auth_headers(auth["session_token"]))

    assert response.status_code == 200
    assert response.json()["email"] == auth["user"]["email"]


def test_auth_logout_success(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.post("/api/auth/logout", headers=headers)
    assert response.status_code == 200

    me_after_logout = client.get("/api/auth/me", headers=headers)
    assert me_after_logout.status_code == 401


def test_expense_crud(client, fake_db):
    auth = _register(client)
    user_id = auth["user"]["user_id"]
    headers = _auth_headers(auth["session_token"])

    profile_id = fake_db.profiles.docs[0]["profile_id"]
    category_id = fake_db.categories.docs[0]["category_id"]
    payment_id = fake_db.payment_methods.docs[0]["payment_id"]

    create_response = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "type": "expense",
            "amount": 35.5,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Lunch",
            "merchant": "Cafe",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()
    expense_id = created["expense_id"]

    list_response = client.get(f"/api/expenses?profile_id={profile_id}", headers=headers)
    assert list_response.status_code == 200
    expenses = list_response.json()
    assert any(item["expense_id"] == expense_id for item in expenses)
    assert all(item["user_id"] == user_id for item in expenses)

    get_response = client.get(f"/api/expenses/{expense_id}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.json()["description"] == "Lunch"

    update_response = client.put(
        f"/api/expenses/{expense_id}",
        headers=headers,
        json={"description": "Lunch Updated", "amount": 40.0},
    )
    assert update_response.status_code == 200
    assert update_response.json()["description"] == "Lunch Updated"
    assert update_response.json()["amount"] == 40.0

    delete_response = client.delete(f"/api/expenses/{expense_id}", headers=headers)
    assert delete_response.status_code == 200

    missing_after_delete = client.get(f"/api/expenses/{expense_id}", headers=headers)
    assert missing_after_delete.status_code == 404


def test_budget_progress_success(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    profile_id = fake_db.profiles.docs[0]["profile_id"]
    category_id = fake_db.categories.docs[0]["category_id"]
    payment_id = fake_db.payment_methods.docs[0]["payment_id"]

    expense_response = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "type": "expense",
            "amount": 50.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Groceries",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert expense_response.status_code == 200

    budget_response = client.post(
        "/api/budgets",
        headers=headers,
        json={
            "profile_id": profile_id,
            "category_id": category_id,
            "amount": 100.0,
            "period": "monthly",
        },
    )
    assert budget_response.status_code == 200

    progress_response = client.get(f"/api/budgets/progress?profile_id={profile_id}", headers=headers)

    assert progress_response.status_code == 200
    progress = progress_response.json()
    assert len(progress["budgets"]) == 1
    assert progress["budgets"][0]["spent"] == 50.0
    assert progress["budgets"][0]["remaining"] == 50.0
    assert progress["budgets"][0]["percentage"] == 50.0


def _first_ids_for_user(fake_db, user_id):
    profile_id = next(p["profile_id"] for p in fake_db.profiles.docs if p["user_id"] == user_id)
    category_id = next(c["category_id"] for c in fake_db.categories.docs if c["user_id"] == user_id)
    payment_id = next(pm["payment_id"] for pm in fake_db.payment_methods.docs if pm["user_id"] == user_id)
    return profile_id, category_id, payment_id


def test_auth_invalid_login_returns_401(client):
    auth = _register(client)

    response = client.post(
        "/api/auth/login",
        json={"email": auth["user"]["email"], "password": "wrong-password"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.json()["error"]["message"] == "Invalid email or password"


def test_auth_me_missing_token_returns_401(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_auth_me_invalid_session_returns_401(client):
    response = client.get("/api/auth/me", headers=_auth_headers("not-a-real-session"))

    assert response.status_code == 401


def test_expense_ownership_enforced(client, fake_db):
    user1 = _register(client)
    user2 = _register(client)

    user1_headers = _auth_headers(user1["session_token"])
    user2_headers = _auth_headers(user2["session_token"])

    p1, c1, pm1 = _first_ids_for_user(fake_db, user1["user"]["user_id"])

    created = client.post(
        "/api/expenses",
        headers=user1_headers,
        json={
            "profile_id": p1,
            "type": "expense",
            "amount": 11.0,
            "category_id": c1,
            "payment_method_id": pm1,
            "description": "User1 only",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert created.status_code == 200
    expense_id = created.json()["expense_id"]

    assert client.get(f"/api/expenses/{expense_id}", headers=user2_headers).status_code == 404
    assert client.put(f"/api/expenses/{expense_id}", headers=user2_headers, json={"amount": 20}).status_code == 404
    assert client.delete(f"/api/expenses/{expense_id}", headers=user2_headers).status_code == 404


def test_user_scoped_resources_for_profiles_categories_payment_methods_and_budgets(client, fake_db):
    user1 = _register(client)
    user2 = _register(client)

    user1_headers = _auth_headers(user1["session_token"])
    user2_headers = _auth_headers(user2["session_token"])

    user1_id = user1["user"]["user_id"]
    user2_id = user2["user"]["user_id"]

    user1_profiles = client.get("/api/profiles", headers=user1_headers)
    user2_profiles = client.get("/api/profiles", headers=user2_headers)
    assert user1_profiles.status_code == 200
    assert user2_profiles.status_code == 200
    assert all(p["user_id"] == user1_id for p in user1_profiles.json())
    assert all(p["user_id"] == user2_id for p in user2_profiles.json())

    user1_categories = client.get("/api/categories", headers=user1_headers)
    user2_categories = client.get("/api/categories", headers=user2_headers)
    assert all(c["user_id"] == user1_id for c in user1_categories.json())
    assert all(c["user_id"] == user2_id for c in user2_categories.json())

    user1_methods = client.get("/api/payment-methods", headers=user1_headers)
    user2_methods = client.get("/api/payment-methods", headers=user2_headers)
    assert all(pm["user_id"] == user1_id for pm in user1_methods.json())
    assert all(pm["user_id"] == user2_id for pm in user2_methods.json())

    p1, c1, _ = _first_ids_for_user(fake_db, user1_id)
    budget = client.post(
        "/api/budgets",
        headers=user1_headers,
        json={"profile_id": p1, "category_id": c1, "amount": 77.0, "period": "monthly"},
    )
    assert budget.status_code == 200
    budget_id = budget.json()["budget_id"]

    user1_budgets = client.get(f"/api/budgets?profile_id={p1}", headers=user1_headers)
    user2_budgets = client.get("/api/budgets", headers=user2_headers)
    assert len(user1_budgets.json()) == 1
    assert user2_budgets.json() == []
    assert client.delete(f"/api/budgets/{budget_id}", headers=user2_headers).status_code == 404


def test_empty_update_payload_returns_400_for_expense_and_budget(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, user_id)

    expense = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 9.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Update target",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert expense.status_code == 200

    budget = client.post(
        "/api/budgets",
        headers=headers,
        json={"profile_id": profile_id, "category_id": category_id, "amount": 30.0, "period": "monthly"},
    )
    assert budget.status_code == 200

    assert client.put(f"/api/expenses/{expense.json()['expense_id']}", headers=headers, json={}).status_code == 400
    assert client.put(f"/api/budgets/{budget.json()['budget_id']}", headers=headers, json={}).status_code == 400


def test_invalid_inputs_return_expected_errors(client):
    assert client.post(
        "/api/auth/register",
        json={"email": "not-an-email", "password": "secret123", "name": "Bad Email"},
    ).status_code == 400

    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    # missing required fields (profile_id, payment_method_id, description, date)
    response = client.post("/api/expenses", headers=headers, json={"amount": 10.0})
    assert response.status_code == 422


def test_export_csv_and_json_success_with_user_profile_filtering(client, fake_db):
    user1 = _register(client)
    user2 = _register(client)

    h1 = _auth_headers(user1["session_token"])
    h2 = _auth_headers(user2["session_token"])

    u1_profile_ids = [p["profile_id"] for p in fake_db.profiles.docs if p["user_id"] == user1["user"]["user_id"]]
    u1_cat = next(c["category_id"] for c in fake_db.categories.docs if c["user_id"] == user1["user"]["user_id"])
    u1_pm = next(pm["payment_id"] for pm in fake_db.payment_methods.docs if pm["user_id"] == user1["user"]["user_id"])

    u2_profile, u2_cat, u2_pm = _first_ids_for_user(fake_db, user2["user"]["user_id"])

    # user1 expense in profile A
    assert client.post(
        "/api/expenses",
        headers=h1,
        json={
            "profile_id": u1_profile_ids[0],
            "amount": 12.5,
            "category_id": u1_cat,
            "payment_method_id": u1_pm,
            "description": "U1-A",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    ).status_code == 200

    # user1 expense in profile B
    assert client.post(
        "/api/expenses",
        headers=h1,
        json={
            "profile_id": u1_profile_ids[1],
            "amount": 30.0,
            "category_id": u1_cat,
            "payment_method_id": u1_pm,
            "description": "U1-B",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    ).status_code == 200

    # user2 expense (must not appear in user1 export)
    assert client.post(
        "/api/expenses",
        headers=h2,
        json={
            "profile_id": u2_profile,
            "amount": 99.0,
            "category_id": u2_cat,
            "payment_method_id": u2_pm,
            "description": "U2",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    ).status_code == 200

    csv_response = client.get(f"/api/export/csv?profile_id={u1_profile_ids[0]}", headers=h1)
    assert csv_response.status_code == 200
    csv_body = csv_response.text
    assert "Date,Type,Description,Amount,Category,Payment Method,Merchant,Notes" in csv_body
    assert "U1-A" in csv_body
    assert "U1-B" not in csv_body
    assert "U2" not in csv_body

    json_response = client.get(f"/api/export/json?profile_id={u1_profile_ids[0]}", headers=h1)
    assert json_response.status_code == 200
    payload = json_response.json()
    assert len(payload["expenses"]) == 1
    assert payload["expenses"][0]["description"] == "U1-A"
    assert payload["expenses"][0]["profile_id"] == u1_profile_ids[0]
    assert payload["expenses"][0]["user_id"] == user1["user"]["user_id"]


def test_export_ordering_is_deterministic_desc_by_date(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    older = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 10.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Older export item",
            "date": "2024-01-01T00:00:00+00:00",
        },
    )
    newer = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 20.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Newer export item",
            "date": "2024-01-02T00:00:00+00:00",
        },
    )
    assert older.status_code == 200
    assert newer.status_code == 200

    json_export = client.get(f"/api/export/json?profile_id={profile_id}", headers=headers)
    assert json_export.status_code == 200
    assert json_export.json()["expenses"][0]["description"] == "Newer export item"
    assert json_export.json()["expenses"][1]["description"] == "Older export item"


def test_export_malformed_date_filter_rejected(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, _, _ = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    csv_response = client.get(
        f"/api/export/csv?profile_id={profile_id}&start_date=not-a-date",
        headers=headers,
    )
    json_response = client.get(
        f"/api/export/json?profile_id={profile_id}&start_date=not-a-date",
        headers=headers,
    )

    assert csv_response.status_code == 400
    assert csv_response.json()["error"]["code"] == "BAD_REQUEST"
    assert json_response.status_code == 400
    assert json_response.json()["error"]["code"] == "BAD_REQUEST"


def test_export_invalid_date_range_rejected(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, _, _ = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    csv_response = client.get(
        f"/api/export/csv?profile_id={profile_id}&start_date=2026-03-10T00:00:00+00:00&end_date=2026-03-01T00:00:00+00:00",
        headers=headers,
    )
    json_response = client.get(
        f"/api/export/json?profile_id={profile_id}&start_date=2026-03-10T00:00:00+00:00&end_date=2026-03-01T00:00:00+00:00",
        headers=headers,
    )

    assert csv_response.status_code == 400
    assert csv_response.json()["error"]["code"] == "BAD_REQUEST"
    assert json_response.status_code == 400
    assert json_response.json()["error"]["code"] == "BAD_REQUEST"


def test_empty_export_succeeds_safely(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, _, _ = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    csv_response = client.get(f"/api/export/csv?profile_id={profile_id}", headers=headers)
    json_response = client.get(f"/api/export/json?profile_id={profile_id}", headers=headers)

    assert csv_response.status_code == 200
    lines = [line for line in csv_response.text.strip().splitlines() if line]
    assert len(lines) == 1
    assert lines[0].startswith("Date,Type,Description,Amount")

    assert json_response.status_code == 200
    payload = json_response.json()
    assert payload["expenses"] == []
    assert payload["summary"]["transaction_count"] == 0


def test_invalid_expense_amount_returns_422(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    response = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "Invalid amount",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )

    assert response.status_code == 422


def test_invalid_budget_period_returns_422(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, _ = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    response = client.post(
        "/api/budgets",
        headers=headers,
        json={
            "profile_id": profile_id,
            "category_id": category_id,
            "amount": 100.0,
            "period": "quarterly",
        },
    )

    assert response.status_code == 422


def test_blank_expense_description_returns_422(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, auth["user"]["user_id"])

    response = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "amount": 10.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "description": "   ",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )

    assert response.status_code == 422


def test_foreign_owned_category_or_payment_method_returns_404(client, fake_db):
    user1 = _register(client)
    user2 = _register(client)

    user1_headers = _auth_headers(user1["session_token"])
    user1_profile, _, _ = _first_ids_for_user(fake_db, user1["user"]["user_id"])
    _, user2_category, user2_payment_method = _first_ids_for_user(fake_db, user2["user"]["user_id"])

    with_foreign_category = client.post(
        "/api/expenses",
        headers=user1_headers,
        json={
            "profile_id": user1_profile,
            "amount": 10.0,
            "category_id": user2_category,
            "payment_method_id": user2_payment_method,
            "description": "Should fail",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert with_foreign_category.status_code == 404

    _, user1_category, user1_payment = _first_ids_for_user(fake_db, user1["user"]["user_id"])
    with_foreign_payment_method = client.post(
        "/api/expenses",
        headers=user1_headers,
        json={
            "profile_id": user1_profile,
            "amount": 10.0,
            "category_id": user1_category,
            "payment_method_id": user2_payment_method,
            "description": "Should fail",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert with_foreign_payment_method.status_code == 404

    assert user1_payment != user2_payment_method


def test_expired_session_returns_401_and_session_deleted(client, fake_db):
    auth = _register(client)
    token = auth["session_token"]

    for session in fake_db.user_sessions.docs:
        if session["session_token"] == token:
            session["expires_at"] = datetime(2000, 1, 1, tzinfo=timezone.utc)

    response = client.get("/api/auth/me", headers=_auth_headers(token))

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.json()["error"]["message"] == "Session expired"
    assert all(session["session_token"] != token for session in fake_db.user_sessions.docs)


def test_password_hash_not_exposed_in_auth_responses(client):
    auth = _register(client)
    email = auth["user"]["email"]

    register_user = auth["user"]
    assert "password_hash" not in register_user

    login_response = client.post(
        "/api/auth/login",
        json={"email": email, "password": "secret123"},
    )
    assert login_response.status_code == 200
    login_token = login_response.json()["session_token"]
    assert "password_hash" not in login_response.json()["user"]

    me_response = client.get("/api/auth/me", headers=_auth_headers(login_token))
    assert me_response.status_code == 200
    assert "password_hash" not in me_response.json()


def test_social_only_account_login_message_is_controlled(client, fake_db):
    social_email = f"social_{uuid4().hex[:8]}@example.com"
    user_id = f"user_{uuid4().hex[:12]}"
    fake_db.users.docs.append(
        {
            "user_id": user_id,
            "email": social_email,
            "name": "Social User",
            "picture": None,
            "auth_provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    response = client.post(
        "/api/auth/login",
        json={"email": social_email, "password": "secret123"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"
    assert response.json()["error"]["message"] == "This account uses social sign-in. Please use that option instead."


def test_budget_update_rejects_budget_with_foreign_references(client, fake_db):
    owner = _register(client)
    other = _register(client)

    owner_headers = _auth_headers(owner["session_token"])
    owner_profile, owner_category, _ = _first_ids_for_user(fake_db, owner["user"]["user_id"])
    _, other_category, _ = _first_ids_for_user(fake_db, other["user"]["user_id"])

    created_budget = client.post(
        "/api/budgets",
        headers=owner_headers,
        json={
            "profile_id": owner_profile,
            "category_id": owner_category,
            "amount": 80.0,
            "period": "monthly",
        },
    )
    assert created_budget.status_code == 200
    budget_id = created_budget.json()["budget_id"]

    # Simulate stale/corrupt reference to another user's category.
    for budget in fake_db.budgets.docs:
        if budget["budget_id"] == budget_id:
            budget["category_id"] = other_category

    response = client.put(f"/api/budgets/{budget_id}", headers=owner_headers, json={"amount": 90.0})

    assert response.status_code == 404


def test_expense_partial_update_rejects_invalid_merged_transfer_state(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    user_id = auth["user"]["user_id"]
    profile_id, category_id, payment_id = _first_ids_for_user(fake_db, user_id)
    second_payment_id = next(
        pm["payment_id"]
        for pm in fake_db.payment_methods.docs
        if pm["user_id"] == user_id and pm["payment_id"] != payment_id
    )

    transfer = client.post(
        "/api/expenses",
        headers=headers,
        json={
            "profile_id": profile_id,
            "type": "transfer",
            "amount": 25.0,
            "category_id": category_id,
            "payment_method_id": payment_id,
            "to_payment_method_id": second_payment_id,
            "description": "Valid transfer",
            "date": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert transfer.status_code == 200
    expense_id = transfer.json()["expense_id"]

    # Partial update would make source == destination for a transfer.
    response = client.put(
        f"/api/expenses/{expense_id}",
        headers=headers,
        json={"payment_method_id": second_payment_id},
    )

    assert response.status_code == 422
