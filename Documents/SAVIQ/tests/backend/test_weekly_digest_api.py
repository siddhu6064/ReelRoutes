from uuid import uuid4


def _register(client, email=None, password="secret123", name="Tester"):
    if email is None:
        email = f"digest_tester_{uuid4().hex[:10]}@example.com"
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


def test_weekly_digest_success_for_valid_scope_and_week(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=500, tx_type="income", date="2026-04-07T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=120, tx_type="expense", date="2026-04-08T00:00:00+00:00")

    response = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["summary"]["income_total"] == 500.0
    assert body["summary"]["expense_total"] == 120.0
    assert body["summary"]["transaction_count"] == 2
    assert "comparisons" in body
    assert "highlights" in body
    assert "narrative" in body
    assert "recommendations" in body

    assert len(fake_db.weekly_digests.docs) == 1
    stored = fake_db.weekly_digests.docs[0]
    assert stored["user_id"] == auth["user"]["user_id"]
    assert stored["profile_id"] == profile_id
    assert stored["digest_payload"]["summary"]["transaction_count"] == 2


def test_weekly_digest_persistence_repeated_generation_updates_existing_record(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=250, tx_type="expense", date="2026-04-10T00:00:00+00:00")

    first = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )
    second = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(fake_db.weekly_digests.docs) == 1


def test_weekly_digest_missing_required_scope_returns_400(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    response = client.get("/api/weekly-digest", headers=headers)
    assert response.status_code == 400


def test_weekly_digest_invalid_date_range_returns_400(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-12&week_end=2026-04-06",
        headers=headers,
    )
    assert response.status_code == 400


def test_weekly_digest_empty_data_week_returns_safe_payload(client, fake_db):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["summary"] == {
        "income_total": 0.0,
        "expense_total": 0.0,
        "net_total": 0.0,
        "transaction_count": 0,
    }
    assert body["signals"]["largest_expense"] is None
    assert body["comparisons"]["previous_week_expense_delta"] == 0.0
    assert body["highlights"]["top_category_name"] is None
    assert body["highlights"]["top_category_amount"] == 0.0
    assert body["narrative"]["summary"] == "Not enough activity this week for a detailed digest yet."
    assert isinstance(body["recommendations"], list)
    assert len(body["recommendations"]) == 1

    assert len(fake_db.weekly_digests.docs) == 1
    stored = fake_db.weekly_digests.docs[0]["digest_payload"]
    assert stored["narrative"]["summary"] == "Not enough activity this week for a detailed digest yet."


def test_weekly_digest_response_includes_explicit_terminal_state(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    empty_response = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )
    assert empty_response.status_code == 200
    assert empty_response.json()["state"] == "empty"

    _create_expense(client, headers, profile_id=profile_id, amount=100, tx_type="expense", date="2026-04-09T00:00:00+00:00")

    success_response = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )
    assert success_response.status_code == 200
    success_body = success_response.json()
    assert success_body["state"] == "success"
    assert "summary" in success_body
    assert "net_total" in success_body["summary"]
    assert "comparisons" in success_body
    assert "previous_week_net_delta" in success_body["comparisons"]


def test_get_weekly_digest_route_remains_backward_compatible_for_frontend_consumer(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.get(
        f"/api/weekly-digest?profile_id={profile_id}",
        headers=headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "summary" in body
    assert "breakdown" in body
    assert "signals" in body
    assert "comparisons" in body
    assert "highlights" in body



def test_latest_digest_banner_route_returns_newest_persisted_digest(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=700, tx_type="income", date="2026-04-14T00:00:00+00:00")
    _create_expense(client, headers, profile_id=profile_id, amount=150, tx_type="expense", date="2026-04-15T00:00:00+00:00")

    generate = client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-13&week_end=2026-04-19",
        headers=headers,
    )
    assert generate.status_code == 200

    latest = client.get(
        f"/api/weekly-digest/latest?profile_id={profile_id}",
        headers=headers,
    )
    assert latest.status_code == 200
    body = latest.json()
    assert body["digest"] is not None
    assert body["digest"]["narrative"]["summary"]


def test_latest_digest_banner_route_safe_when_no_digest_exists(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    latest = client.get(
        f"/api/weekly-digest/latest?profile_id={profile_id}",
        headers=headers,
    )

    assert latest.status_code == 200
    body = latest.json()
    assert body["digest"] is None


def test_dismiss_latest_digest_hides_banner_and_persists_after_refetch(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=450, tx_type="expense", date="2026-04-08T00:00:00+00:00")

    client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )

    dismiss = client.post(
        f"/api/weekly-digest/latest/dismiss?profile_id={profile_id}",
        headers=headers,
    )
    assert dismiss.status_code == 200
    assert dismiss.json()["dismissed"] is True

    latest = client.get(
        f"/api/weekly-digest/latest?profile_id={profile_id}",
        headers=headers,
    )
    assert latest.status_code == 200
    assert latest.json()["digest"] is None


def test_dismiss_latest_digest_is_idempotent_safe_on_repeated_action(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    _create_expense(client, headers, profile_id=profile_id, amount=300, tx_type="expense", date="2026-04-09T00:00:00+00:00")

    client.get(
        f"/api/weekly-digest?profile_id={profile_id}&week_start=2026-04-06&week_end=2026-04-12",
        headers=headers,
    )

    first = client.post(
        f"/api/weekly-digest/latest/dismiss?profile_id={profile_id}",
        headers=headers,
    )
    second = client.post(
        f"/api/weekly-digest/latest/dismiss?profile_id={profile_id}",
        headers=headers,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["dismissed"] is True
    assert second.json()["dismissed"] is True

def test_existing_routes_remain_available_after_weekly_digest_route_added(client):
    root = client.get("/api")
    health = client.get("/healthz")
    assert root.status_code == 200
    assert health.status_code == 200
