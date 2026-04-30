"""
tests/test_smoke.py

Smoke tests for staging environment validation.

These tests run against a LIVE staging API URL — not against
the in-process test client. They are skipped automatically
in unit-test runs (ENV=test) unless SMOKE_TEST_URL is set.

Usage:
    # Against staging:
    SMOKE_TEST_URL=https://reelroutes-api-staging.railway.app \\
        ENV=test poetry run pytest tests/test_smoke.py -v

    # CI (called by deploy-staging.yml after Railway deploy):
    SMOKE_TEST_URL=${{ secrets.STAGING_API_URL }} pytest tests/test_smoke.py

All tests are READ-ONLY — they never write data to the live DB.
"""

from __future__ import annotations

import os

import httpx
import pytest

SMOKE_URL = os.environ.get("SMOKE_TEST_URL", "").rstrip("/")

# Skip the entire module in normal unit-test runs
pytestmark = pytest.mark.skipif(
    not SMOKE_URL,
    reason="SMOKE_TEST_URL not set — skipping smoke tests",
)

TIMEOUT = 15  # seconds per request


@pytest.fixture(scope="module")
def client():
    """Shared httpx client for all smoke tests."""
    with httpx.Client(base_url=SMOKE_URL, timeout=TIMEOUT) as c:
        yield c


# ── 1. Core health ────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_200(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_body_has_ok(self, client):
        resp = client.get("/health")
        data = resp.json()
        assert data.get("ok") is True or "status" in data

    def test_health_ready_returns_200(self, client):
        """DB and Redis connectivity check."""
        resp = client.get("/health/ready")
        assert resp.status_code == 200

    def test_response_time_under_2s(self, client):
        import time
        start = time.perf_counter()
        client.get("/health")
        elapsed = time.perf_counter() - start
        assert elapsed < 2.0, f"Health check took {elapsed:.2f}s — cold start or overloaded"


# ── 2. Auth guards ────────────────────────────────────────────────────────────

class TestAuthGuards:
    def test_list_trips_without_auth_returns_4xx(self, client):
        resp = client.get("/api/trips")
        assert resp.status_code in (401, 422), (
            f"Expected 401/422 without auth, got {resp.status_code}"
        )

    def test_create_trip_without_auth_returns_4xx(self, client):
        resp = client.post("/api/trips", json={"source_url": "https://youtu.be/abc"})
        assert resp.status_code in (401, 422)

    def test_delete_trip_without_auth_returns_4xx(self, client):
        resp = client.delete("/api/trips/000000000000000000000000")
        assert resp.status_code in (401, 404, 422)


# ── 3. Input validation ───────────────────────────────────────────────────────

class TestInputValidation:
    def test_process_with_no_body_returns_422(self, client):
        resp = client.post("/api/process")
        assert resp.status_code == 422

    def test_process_with_ssrf_url_returns_422(self, client):
        """SSRF protection must be live on staging."""
        resp = client.post(
            "/api/process",
            json={"url": "http://localhost/admin", "user_id": "smoke_test_user"},
        )
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body

    def test_process_with_unknown_platform_returns_422(self, client):
        """Platform allowlist must be enforced."""
        resp = client.post(
            "/api/process",
            json={"url": "https://evil.com/video", "user_id": "smoke_test_user"},
        )
        assert resp.status_code == 422

    def test_nonexistent_job_returns_404(self, client):
        resp = client.get("/api/jobs/000000000000000000000000")
        assert resp.status_code == 404

    def test_nonexistent_trip_returns_404(self, client):
        resp = client.get("/api/trips/000000000000000000000000")
        assert resp.status_code in (404, 422)


# ── 4. Public endpoints (no auth needed) ─────────────────────────────────────

class TestPublicEndpoints:
    def test_explore_feed_returns_200(self, client):
        resp = client.get("/api/explore")
        assert resp.status_code == 200

    def test_explore_feed_has_items_key(self, client):
        resp = client.get("/api/explore")
        data = resp.json()
        # Either {"ok": True, "data": {"items": [...]}} or {"items": [...]}
        assert "items" in str(data), f"No 'items' key in explore response: {data}"

    def test_explore_trending_returns_200(self, client):
        resp = client.get("/api/explore/trending")
        assert resp.status_code == 200

    def test_shared_trip_nonexistent_returns_404(self, client):
        resp = client.get("/api/trips/share/nonexistent-token-xyz")
        assert resp.status_code == 404


# ── 5. Security headers ───────────────────────────────────────────────────────

class TestSecurityHeaders:
    """
    These checks hit the Vercel-hosted web app (SMOKE_WEB_URL), not the API.
    Skipped if SMOKE_WEB_URL is not set.
    """
    WEB_URL = os.environ.get("SMOKE_WEB_URL", "")

    @pytest.mark.skipif(not os.environ.get("SMOKE_WEB_URL"), reason="SMOKE_WEB_URL not set")
    def test_csp_header_present(self):
        resp = httpx.get(f"{self.WEB_URL}/", timeout=TIMEOUT)
        assert "content-security-policy" in {k.lower() for k in resp.headers}

    @pytest.mark.skipif(not os.environ.get("SMOKE_WEB_URL"), reason="SMOKE_WEB_URL not set")
    def test_x_frame_options_deny(self):
        resp = httpx.get(f"{self.WEB_URL}/", timeout=TIMEOUT)
        xfo = resp.headers.get("x-frame-options", "")
        assert xfo.upper() == "DENY"

    @pytest.mark.skipif(not os.environ.get("SMOKE_WEB_URL"), reason="SMOKE_WEB_URL not set")
    def test_hsts_header_present(self):
        resp = httpx.get(f"{self.WEB_URL}/", timeout=TIMEOUT)
        assert "strict-transport-security" in {k.lower() for k in resp.headers}


# ── 6. CORS ───────────────────────────────────────────────────────────────────

class TestCors:
    def test_staging_origin_allowed(self, client):
        resp = client.options(
            "/health",
            headers={"Origin": "https://reelroutes-staging.vercel.app",
                     "Access-Control-Request-Method": "GET"},
        )
        # 200 or 204 — as long as the origin isn't rejected
        assert resp.status_code in (200, 204)

    def test_random_origin_cors_behaviour(self, client):
        """Random origins should not get CORS access — just testing it doesn't 500."""
        resp = client.get(
            "/health",
            headers={"Origin": "https://definitely-not-allowed.evil.com"},
        )
        # Server should respond normally — CORS is a browser concern
        assert resp.status_code == 200
