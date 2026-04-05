"""
tests/routers/test_health.py

Tests for GET /health and GET /version.

Covers:
  - Happy path: healthy MongoDB → 200 with ok: true
  - Degraded path: MongoDB unreachable → 200 with ok: false, status: "degraded"
  - Response shape matches ApiResponse contract
  - X-Request-Id header is present on all responses
  - /version always returns 200 regardless of DB state
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from httpx import AsyncClient


@pytest.mark.asyncio
class TestHealthEndpoint:
    async def test_health_returns_200_when_db_healthy(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_ok_true_when_db_healthy(self, client: AsyncClient) -> None:
        data = (await client.get("/health")).json()
        assert data["ok"] is True
        assert data["status"] == "ok"

    async def test_health_includes_mongodb_service(self, client: AsyncClient) -> None:
        data = (await client.get("/health")).json()
        assert "services" in data
        assert "mongodb" in data["services"]
        assert data["services"]["mongodb"]["status"] == "ok"

    async def test_health_mongodb_includes_latency(self, client: AsyncClient) -> None:
        data = (await client.get("/health")).json()
        latency = data["services"]["mongodb"].get("latency_ms")
        assert latency is not None
        assert isinstance(latency, float | int)
        assert latency >= 0

    async def test_health_includes_version(self, client: AsyncClient) -> None:
        data = (await client.get("/health")).json()
        assert "version" in data
        assert isinstance(data["version"], str)
        assert len(data["version"]) > 0

    async def test_health_includes_environment(self, client: AsyncClient) -> None:
        data = (await client.get("/health")).json()
        assert data["environment"] == "test"

    async def test_health_attaches_request_id_header(self, client: AsyncClient) -> None:
        response = await client.get("/health")
        assert "x-request-id" in response.headers
        request_id = response.headers["x-request-id"]
        assert len(request_id) > 0

    async def test_health_request_id_is_unique_per_request(self, client: AsyncClient) -> None:
        r1 = await client.get("/health")
        r2 = await client.get("/health")
        assert r1.headers["x-request-id"] != r2.headers["x-request-id"]

    async def test_health_degraded_when_mongodb_unreachable(
        self, client_unhealthy_db: AsyncClient
    ) -> None:
        data = (await client_unhealthy_db.get("/health")).json()
        # Still returns 200 — a 503 would break load balancer health checks
        assert data["ok"] is False
        assert data["status"] == "degraded"
        assert data["services"]["mongodb"]["status"] == "error"
        assert "error" in data["services"]["mongodb"]

    async def test_health_degraded_mongodb_error_message(
        self, client_unhealthy_db: AsyncClient
    ) -> None:
        data = (await client_unhealthy_db.get("/health")).json()
        assert "Connection refused" in data["services"]["mongodb"]["error"]


@pytest.mark.asyncio
class TestVersionEndpoint:
    async def test_version_returns_200(self, client: AsyncClient) -> None:
        response = await client.get("/version")
        assert response.status_code == 200

    async def test_version_shape(self, client: AsyncClient) -> None:
        data = (await client.get("/version")).json()
        assert data["ok"] is True
        assert "data" in data
        assert "version" in data["data"]
        assert "environment" in data["data"]

    async def test_version_environment_is_test(self, client: AsyncClient) -> None:
        data = (await client.get("/version")).json()
        assert data["data"]["environment"] == "test"

    async def test_version_always_200_even_with_no_db(
        self, client_unhealthy_db: AsyncClient
    ) -> None:
        # /version doesn't touch DB — must always respond
        response = await client_unhealthy_db.get("/version")
        assert response.status_code == 200


@pytest.mark.asyncio
class TestErrorHandling:
    async def test_404_returns_consistent_shape(self, client: AsyncClient) -> None:
        response = await client.get("/this-route-does-not-exist")
        assert response.status_code == 404
        data = response.json()
        assert data["ok"] is False
        assert "error" in data
        assert "code" in data["error"]
        assert "message" in data["error"]
        assert data["error"]["code"] == "NOT_FOUND"

    async def test_404_includes_request_id(self, client: AsyncClient) -> None:
        response = await client.get("/nonexistent")
        assert response.status_code == 404
        assert "x-request-id" in response.headers
        # request_id in response body should match header
        data = response.json()
        assert data["error"]["request_id"] == response.headers["x-request-id"]

    async def test_method_not_allowed_returns_405(self, client: AsyncClient) -> None:
        response = await client.post("/health")
        assert response.status_code == 405
        data = response.json()
        assert data["ok"] is False
        assert data["error"]["code"] == "METHOD_NOT_ALLOWED"
