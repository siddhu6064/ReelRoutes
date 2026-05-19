from uuid import uuid4


def _register(client, email=None, password="secret123", name="Tester"):
    if email is None:
        email = f"goal_tester_{uuid4().hex[:10]}@example.com"
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


def _goal_payload(profile_id, **overrides):
    payload = {
        "profile_id": profile_id,
        "title": "Emergency Fund",
        "target_amount": 5000,
        "current_amount": 1000,
        "deadline": "2026-12-31T00:00:00+00:00",
        "category": "Emergency",
        "status": "active",
    }
    payload.update(overrides)
    return payload


def test_create_goal_success(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.post("/api/savings-goals", headers=headers, json=_goal_payload(profile_id))

    assert response.status_code == 200
    body = response.json()
    assert body["title"] == "Emergency Fund"
    assert body["target_amount"] == 5000
    assert body["profile_id"] == profile_id
    assert body["goal_id"].startswith("goal_")


def test_list_goals_returns_only_profile_scoped_owned_goals(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    profile_resp = client.post("/api/profiles", headers=headers, json={"name": "Vacation"})
    assert profile_resp.status_code == 200
    other_profile_id = profile_resp.json()["profile_id"]

    first = client.post("/api/savings-goals", headers=headers, json=_goal_payload(profile_id, title="Goal A"))
    second = client.post("/api/savings-goals", headers=headers, json=_goal_payload(other_profile_id, title="Goal B"))
    assert first.status_code == 200
    assert second.status_code == 200

    scoped = client.get(f"/api/savings-goals?profile_id={profile_id}", headers=headers)
    assert scoped.status_code == 200
    items = scoped.json()
    assert len(items) == 1
    assert items[0]["title"] == "Goal A"
    assert items[0]["profile_id"] == profile_id


def test_get_goal_by_id_success_for_owned_goal(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    created = client.post("/api/savings-goals", headers=headers, json=_goal_payload(profile_id))
    assert created.status_code == 200
    goal_id = created.json()["goal_id"]

    response = client.get(f"/api/savings-goals/{goal_id}", headers=headers)

    assert response.status_code == 200
    assert response.json()["goal_id"] == goal_id


def test_update_goal_success_for_owned_goal(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    created = client.post("/api/savings-goals", headers=headers, json=_goal_payload(profile_id))
    assert created.status_code == 200
    goal_id = created.json()["goal_id"]

    response = client.put(
        f"/api/savings-goals/{goal_id}",
        headers=headers,
        json={"current_amount": 2500, "status": "paused", "title": "Emergency Reserve"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current_amount"] == 2500
    assert body["status"] == "paused"
    assert body["title"] == "Emergency Reserve"


def test_delete_goal_success_for_owned_goal(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    created = client.post("/api/savings-goals", headers=headers, json=_goal_payload(profile_id))
    assert created.status_code == 200
    goal_id = created.json()["goal_id"]

    deleted = client.delete(f"/api/savings-goals/{goal_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["message"] == "Savings goal deleted"

    get_after_delete = client.get(f"/api/savings-goals/{goal_id}", headers=headers)
    assert get_after_delete.status_code == 404


def test_access_to_another_users_goal_is_blocked(client):
    owner = _register(client)
    owner_headers = _auth_headers(owner["session_token"])
    owner_profile_id = _default_profile_id(client, owner_headers)

    other = _register(client)
    other_headers = _auth_headers(other["session_token"])

    created = client.post("/api/savings-goals", headers=owner_headers, json=_goal_payload(owner_profile_id))
    assert created.status_code == 200
    goal_id = created.json()["goal_id"]

    read_attempt = client.get(f"/api/savings-goals/{goal_id}", headers=other_headers)
    update_attempt = client.put(f"/api/savings-goals/{goal_id}", headers=other_headers, json={"title": "Hacked"})
    delete_attempt = client.delete(f"/api/savings-goals/{goal_id}", headers=other_headers)

    assert read_attempt.status_code == 404
    assert update_attempt.status_code == 404
    assert delete_attempt.status_code == 404


def test_ownership_isolation_preserved_end_to_end(client):
    user_one = _register(client)
    user_one_headers = _auth_headers(user_one["session_token"])
    user_one_profile_id = _default_profile_id(client, user_one_headers)

    user_two = _register(client)
    user_two_headers = _auth_headers(user_two["session_token"])
    user_two_profile_id = _default_profile_id(client, user_two_headers)

    first_goal = client.post(
        "/api/savings-goals",
        headers=user_one_headers,
        json=_goal_payload(user_one_profile_id, title="User One Goal"),
    )
    second_goal = client.post(
        "/api/savings-goals",
        headers=user_two_headers,
        json=_goal_payload(user_two_profile_id, title="User Two Goal"),
    )
    assert first_goal.status_code == 200
    assert second_goal.status_code == 200

    user_one_list = client.get("/api/savings-goals", headers=user_one_headers)
    user_two_list = client.get("/api/savings-goals", headers=user_two_headers)
    assert user_one_list.status_code == 200
    assert user_two_list.status_code == 200

    assert [g["title"] for g in user_one_list.json()] == ["User One Goal"]
    assert [g["title"] for g in user_two_list.json()] == ["User Two Goal"]

    openapi = client.get("/openapi.json")
    assert openapi.status_code == 200
    assert "/api/savings-goals" in openapi.json()["paths"]


def test_savings_goal_crud_behavior_remains_intact_after_response_enrichment(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    created = client.post("/api/savings-goals", headers=headers, json=_goal_payload(profile_id))
    assert created.status_code == 200
    create_body = created.json()
    assert create_body["title"] == "Emergency Fund"
    assert "progress_percentage" in create_body
    assert "monthly_savings_recommendation" in create_body
    assert "projected_completion" in create_body

    listed = client.get("/api/savings-goals", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["goal_id"] == create_body["goal_id"]

    fetched = client.get(f"/api/savings-goals/{create_body['goal_id']}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["goal_id"] == create_body["goal_id"]

    updated = client.put(
        f"/api/savings-goals/{create_body['goal_id']}",
        headers=headers,
        json={"status": "completed", "current_amount": 5000},
    )
    assert updated.status_code == 200
    update_body = updated.json()
    assert update_body["status"] == "completed"
    assert update_body["progress_percentage"] == 100.0
    assert update_body["monthly_savings_recommendation"] == 0.0
    assert update_body["projected_completion"]["basis"] == "already_completed"

    deleted = client.delete(f"/api/savings-goals/{create_body['goal_id']}", headers=headers)
    assert deleted.status_code == 200


def test_create_goal_rejects_empty_title(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.post(
        "/api/savings-goals",
        headers=headers,
        json=_goal_payload(profile_id, title="   "),
    )
    assert response.status_code == 422


def test_create_goal_rejects_invalid_target_amount(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.post(
        "/api/savings-goals",
        headers=headers,
        json=_goal_payload(profile_id, target_amount=0),
    )
    assert response.status_code == 422


def test_create_goal_rejects_past_deadline(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.post(
        "/api/savings-goals",
        headers=headers,
        json=_goal_payload(profile_id, deadline="2020-01-01T00:00:00+00:00"),
    )
    assert response.status_code == 422


def test_update_goal_rejects_invalid_title_target_and_deadline(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    created = client.post("/api/savings-goals", headers=headers, json=_goal_payload(profile_id))
    assert created.status_code == 200
    goal_id = created.json()["goal_id"]

    invalid_title = client.put(
        f"/api/savings-goals/{goal_id}",
        headers=headers,
        json={"title": "   "},
    )
    invalid_target = client.put(
        f"/api/savings-goals/{goal_id}",
        headers=headers,
        json={"target_amount": 0},
    )
    invalid_deadline = client.put(
        f"/api/savings-goals/{goal_id}",
        headers=headers,
        json={"deadline": "2020-01-01T00:00:00+00:00"},
    )

    assert invalid_title.status_code == 422
    assert invalid_target.status_code == 422
    assert invalid_deadline.status_code == 422
