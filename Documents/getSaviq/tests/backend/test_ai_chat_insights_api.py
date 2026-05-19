from uuid import uuid4


def _register(client, email=None, password="secret123", name="Tester"):
    if email is None:
        email = f"chat_insights_{uuid4().hex[:10]}@example.com"
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


def test_chat_insights_endpoint_authenticated_success(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.post(
        "/api/ai/chat-insights",
        headers=headers,
        json={"profile_id": profile_id, "recent_days": 30},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["profile_id"] == profile_id
    assert "generated_at" in body
    assert set(body["context"].keys()) == {"recent_spend", "trends", "top_categories", "budgets", "forecast"}
    assert body["prompt_template"]["intent"] in {"why_spend_more", "how_save_more", "general_finance_insight"}
    assert "actions" in body["recommendation"]


def test_chat_insights_rate_limit_is_applied(client):
    from routers import ai

    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    previous_enabled = ai.limiter.enabled
    ai.limiter.enabled = True
    try:
        statuses = []
        for _ in range(11):
            response = client.post(
                "/api/ai/chat-insights",
                headers=headers,
                json={"profile_id": profile_id, "recent_days": 30, "question": "How can I save more?"},
            )
            statuses.append(response.status_code)
        assert 429 in statuses
    finally:
        ai.limiter.enabled = previous_enabled


def test_chat_insights_invalid_payload_rejected_safely(client):
    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    response = client.post(
        "/api/ai/chat-insights",
        headers=headers,
        json={"profile_id": profile_id, "recent_days": 30, "question": " "},
    )

    assert response.status_code == 422


def test_chat_insights_endpoint_blocks_unauthenticated_access(client):
    response = client.post(
        "/api/ai/chat-insights",
        json={"profile_id": "profile_x", "recent_days": 30},
    )

    assert response.status_code in {401, 403}


def test_chat_insights_endpoint_blocks_wrong_profile_access(client):
    owner = _register(client)
    owner_headers = _auth_headers(owner["session_token"])

    other = _register(client)
    other_headers = _auth_headers(other["session_token"])
    other_profile_id = _default_profile_id(client, other_headers)

    response = client.post(
        "/api/ai/chat-insights",
        headers=owner_headers,
        json={"profile_id": other_profile_id, "recent_days": 30},
    )

    assert response.status_code == 404


def test_chat_insights_route_wired_into_openapi(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    assert "/api/ai/chat-insights" in response.json()["paths"]


def test_chat_insights_failure_logs_non_sensitive_diagnostics(client, monkeypatch, caplog):
    from routers import ai

    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    async def _boom(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(ai, "build_chat_transaction_context", _boom)

    with caplog.at_level("ERROR"):
        response = client.post(
            "/api/ai/chat-insights",
            headers=headers,
            json={"profile_id": profile_id, "recent_days": 30, "question": "How can I save more?"},
        )

    assert response.status_code == 500
    assert response.json()["detail"] == "Unable to generate chat insights right now."
    assert "chat_insights_request_failed" in caplog.text


def test_chat_insights_failure_logs_do_not_include_sensitive_context_payload(client, monkeypatch, caplog):
    from routers import ai

    auth = _register(client)
    headers = _auth_headers(auth["session_token"])
    profile_id = _default_profile_id(client, headers)

    async def _boom(**_kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(ai, "build_chat_transaction_context", _boom)

    with caplog.at_level("ERROR"):
        response = client.post(
            "/api/ai/chat-insights",
            headers=headers,
            json={"profile_id": profile_id, "recent_days": 30, "question": "How can I save more?"},
        )

    assert response.status_code == 500
    assert "top_categories" not in caplog.text
    assert "recent_spend" not in caplog.text
