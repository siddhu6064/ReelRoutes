import asyncio
from types import SimpleNamespace
from uuid import uuid4

import pytest


from services import openai_client


def _register(client, email=None, password="secret123", name="Tester"):
    if email is None:
        email = f"openai_migration_{uuid4().hex[:10]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={"email": email, "password": password, "name": name},
    )
    assert response.status_code == 200
    return response.json()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


class _FakeResponses:
    def __init__(self, output_text=None, error=None):
        self._output_text = output_text
        self._error = error

    async def create(self, **_kwargs):
        if self._error:
            raise self._error
        return SimpleNamespace(output_text=self._output_text)


class _FakeAsyncOpenAI:
    def __init__(self, output_text=None, error=None):
        self.responses = _FakeResponses(output_text=output_text, error=error)


def test_analyze_receipt_image_parses_json_fenced_output(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_payload = """```json
{\"amount\": 25.5, \"merchant\": \"Cafe\", \"date\": null, \"time\": null, \"category_suggestion\": \"Food & Dining\", \"items\": [\"Coffee\"], \"confidence\": 0.88}
```"""

    monkeypatch.setattr(openai_client, "_get_async_openai_cls", lambda: (lambda api_key: _FakeAsyncOpenAI(output_text=fake_payload)))

    result = asyncio.run(openai_client.analyze_receipt_image("data:image/png;base64,abcd"))
    assert result["merchant"] == "Cafe"
    assert result["amount"] == 25.5


def test_analyze_receipt_image_raises_on_malformed_output(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(openai_client, "_get_async_openai_cls", lambda: (lambda api_key: _FakeAsyncOpenAI(output_text="not json")))

    with pytest.raises(openai_client.OpenAIClientError):
        asyncio.run(openai_client.analyze_receipt_image("abcd"))


def test_generate_spending_insights_parses_json_array(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    fake_payload = '[{"icon":"bulb","text":"Tip","type":"tip"}]'
    monkeypatch.setattr(openai_client, "_get_async_openai_cls", lambda: (lambda api_key: _FakeAsyncOpenAI(output_text=fake_payload)))

    result = asyncio.run(openai_client.generate_spending_insights({"this_week_total": 10}))
    assert isinstance(result, list)
    assert result[0]["type"] == "tip"


def test_generate_spending_insights_rejects_non_list_output(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(openai_client, "_get_async_openai_cls", lambda: (lambda api_key: _FakeAsyncOpenAI(output_text='{"icon":"x"}')))

    with pytest.raises(openai_client.OpenAIClientError):
        asyncio.run(openai_client.generate_spending_insights({"this_week_total": 10}))


def test_generate_spending_insights_rejects_invalid_item_shape(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(openai_client, "_get_async_openai_cls", lambda: (lambda api_key: _FakeAsyncOpenAI(output_text='[{"icon":"x"}]')))

    with pytest.raises(openai_client.OpenAIClientError):
        asyncio.run(openai_client.generate_spending_insights({"this_week_total": 10}))


def test_insights_provider_failure_preserves_deterministic_fallback(client, monkeypatch):
    from routers import ai

    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    async def _boom(_stats):
        raise openai_client.OpenAIClientError("provider down")

    monkeypatch.setattr(ai, "generate_spending_insights", _boom)

    response = client.get("/api/insights", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    assert "stats" in payload
    assert "insights" in payload
    assert isinstance(payload["insights"], list)
    assert len(payload["insights"]) >= 1


def test_scan_receipt_returns_fallback_on_invalid_model_output(client, monkeypatch):
    from routers import ai

    auth = _register(client)
    headers = _auth_headers(auth["session_token"])

    async def _invalid(_image_data_url):
        raise openai_client.OpenAIClientError("invalid output")

    monkeypatch.setattr(ai, "analyze_receipt_image", _invalid)

    response = client.post(
        "/api/scan-receipt",
        headers=headers,
        json={"image": "data:image/png;base64,abcd"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "amount": None,
        "merchant": None,
        "date": None,
        "time": None,
        "category_suggestion": "Other",
        "items": [],
        "confidence": 0.0,
    }
