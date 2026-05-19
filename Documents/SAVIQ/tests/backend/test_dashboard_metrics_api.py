from uuid import uuid4


def _register(client, email=None, password="secret123", name="Tester"):
    if email is None:
        email = f"metrics_tester_{uuid4().hex[:10]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "name": name},
    )
    assert response.status_code == 200
    return response.json()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _default_profile_id(client, headers):
    response = client.get("/api/profiles", headers=headers)
    assert response.status_code == 200
    return response.json()[0]["profile_id"]


def _create_expense(client, headers, *, profile_id, amount, tx_type, date):
    categories = client.get("/api/categories", headers=headers)
    payment_methods = client.get("/api/payment-methods", headers=headers)
    payload = {
        "profile_id": profile_id,
        "amount": amount,
        "category_id": categories.json()[0]["category_id"],
        "payment_method_id": payment_methods.json()[0]["payment_id"],
        "description": f"{tx_type}-{amount}",
        "merchant": "Merchant",
        "date": date,
        "type": tx_type,
    }
    response = client.post("/api/expenses", headers=headers, json=payload)
    assert response.status_code == 200


def _create_monthly_budget(client, headers, *, profile_id, amount):
    response = client.post(
        "/api/budgets",
        headers=headers,
        json={
            "profile_id": profile_id,
            "category_id": None,
            "amount": amount,
            "period": "monthly",
        },
    )
    assert response.status_code == 200


def _create_goal(client, headers, *, profile_id, target_amount, current_amount):
    response = client.post(
        "/api/savings-goals",
        headers=headers,
        json={
            "profile_id": profile_id,
            "title": "Emergency Fund",
            "target_amount": target_amount,
            "current_amount": current_amount,
        },
    )
    assert response.status_code == 200


def test_dashboard_metrics_valid_scoped_request_returns_expected_bundle(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=1000, tx_type="income", date="2026-04-05T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=250, tx_type="expense", date="2026-04-06T00:00:00+00:00")
    _create_monthly_budget(client, headers, profile_id=profile_id, amount=1200)
    _create_goal(client, headers, profile_id=profile_id, target_amount=1000, current_amount=400)

    response = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert "savings_score" in body
    assert "spend_velocity" in body
    assert "financial_health_score" in body
    assert "budget_confidence" in body
    assert "top_category_summary" in body
    assert "projected_savings_summary" in body


def test_dashboard_metrics_missing_required_scope_returns_400(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get("/api/dashboard/metrics", headers=headers)
    assert response.status_code == 400


def test_dashboard_metrics_no_data_scenario_returns_safe_explicit_structures(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["savings_score"]["has_sufficient_data"] is False
    assert body["spend_velocity"]["has_sufficient_data"] is False
    assert body["financial_health_score"]["has_sufficient_data"] is False
    assert body["budget_confidence"]["has_sufficient_data"] is False
    assert body["top_category_summary"]["has_sufficient_data"] is False
    assert body["projected_savings_summary"]["has_sufficient_data"] is False


def test_dashboard_metrics_additive_route_keeps_existing_analytics_payload_compatible(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    summary = client.get(
        f"/api/analytics/summary?profile_id={profile_id}&start_date=2026-04-01T00:00:00+00:00&end_date=2026-04-30T23:59:59+00:00",
        headers=headers,
    )
    metrics = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)

    assert summary.status_code == 200
    assert metrics.status_code == 200
    assert "total_spend" in summary.json()


def test_dashboard_metrics_bundle_includes_all_six_week13_outputs(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)
    assert response.status_code == 200
    body = response.json()

    required = {
        "savings_score",
        "spend_velocity",
        "financial_health_score",
        "budget_confidence",
        "top_category_summary",
        "projected_savings_summary",
    }
    assert required.issubset(body.keys())



def test_dashboard_metrics_repeatability_is_deterministic_for_same_input_set(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=900, tx_type="income", date="2026-04-03T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=200, tx_type="expense", date="2026-04-04T00:00:00+00:00")

    first = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)
    second = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()


def test_dashboard_metrics_mixed_partial_data_case_returns_consistent_safe_mix(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=200, tx_type="expense", date="2026-04-05T00:00:00+00:00")

    response = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)
    assert response.status_code == 200
    body = response.json()

    assert body["spend_velocity"]["has_sufficient_data"] is True
    assert body["top_category_summary"]["has_sufficient_data"] is True
    assert body["projected_savings_summary"]["has_sufficient_data"] is True
    assert body["savings_score"]["has_sufficient_data"] is False


def test_dashboard_metrics_shape_remains_complete_when_values_are_null_safe(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.get(f"/api/dashboard/metrics?profile_id={profile_id}", headers=headers)
    assert response.status_code == 200

    body = response.json()
    assert set(body.keys()) == {
        "savings_score",
        "spend_velocity",
        "financial_health_score",
        "budget_confidence",
        "top_category_summary",
        "projected_savings_summary",
    }
