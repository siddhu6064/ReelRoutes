from uuid import uuid4


def _register(client, email=None, password="secret123", name="Tester"):
    if email is None:
        email = f"subs_tester_{uuid4().hex[:10]}@example.com"
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


def _create_expense(client, headers, *, profile_id, amount, merchant, date):
    categories = client.get("/api/categories", headers=headers)
    payment_methods = client.get("/api/payment-methods", headers=headers)
    assert categories.status_code == 200
    assert payment_methods.status_code == 200

    payload = {
        "profile_id": profile_id,
        "amount": amount,
        "category_id": categories.json()[0]["category_id"],
        "payment_method_id": payment_methods.json()[0]["payment_id"],
        "description": merchant,
        "merchant": merchant,
        "date": date,
        "type": "expense",
    }
    response = client.post("/api/expenses", headers=headers, json=payload)
    assert response.status_code == 200


def test_subscriptions_summary_success_case(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=10, merchant="Spotify", date="2026-01-02T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=10, merchant="Spotify", date="2026-02-02T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=10, merchant="Spotify", date="2026-03-02T00:00:00+00:00")

    response = client.get(f"/api/subscriptions/summary?profile_id={profile_id}", headers=headers)
    assert response.status_code == 200

    body = response.json()
    assert body["user_id"] == auth["user"]["user_id"]
    assert body["profile_id"] == profile_id
    assert body["totals"]["monthly_recurring_total"] == 10.0
    assert body["totals"]["annual_recurring_estimate"] == 120.0
    assert body["totals"]["candidate_count"] == 1


def test_subscriptions_summary_unauthenticated_access_blocked(client):
    response = client.get("/api/subscriptions/summary?profile_id=profile_123")
    assert response.status_code == 401


def test_subscriptions_summary_wrong_profile_access_blocked(client):
    owner = _register(client)
    owner_headers = _auth_headers(owner["session_token"])
    owner_profile_id = _default_profile_id(client, owner_headers)

    other = _register(client)
    other_headers = _auth_headers(other["session_token"])

    response = client.get(f"/api/subscriptions/summary?profile_id={owner_profile_id}", headers=other_headers)
    assert response.status_code == 404


def test_subscriptions_summary_response_shape_is_stable(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=12.5, merchant="Netflix", date="2026-01-05T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=12.5, merchant="Netflix", date="2026-02-05T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=12.5, merchant="Netflix", date="2026-03-05T00:00:00+00:00")

    response = client.get(f"/api/subscriptions/summary?profile_id={profile_id}", headers=headers)
    assert response.status_code == 200

    body = response.json()
    assert sorted(body.keys()) == ["candidates", "profile_id", "totals", "user_id"]
    assert sorted(body["totals"].keys()) == [
        "annual_recurring_estimate",
        "candidate_count",
        "monthly_recurring_total",
    ]
    assert isinstance(body["candidates"], list)
