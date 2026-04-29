"""
tests/test_security.py

Tests for the 4 security fixes:
  1. SSRF URL validation (url_security.py)
  2. GDPR user.deleted purge (clerk webhook)
  3. Sentry consecutive failure alert (extraction service)
  4. CSP headers presence (vercel.json sanity check)
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.utils.url_security import SSRFError, _is_private_ip, validate_import_url

# ══════════════════════════════════════════════════════════════
#  1. SSRF — url_security.py
# ══════════════════════════════════════════════════════════════


class TestIsPrivateIp:
    def test_loopback(self):
        assert _is_private_ip("127.0.0.1") is True

    def test_localhost_ipv6(self):
        assert _is_private_ip("::1") is True

    def test_private_class_a(self):
        assert _is_private_ip("10.0.0.1") is True

    def test_private_class_b(self):
        assert _is_private_ip("172.16.0.1") is True
        assert _is_private_ip("172.31.255.255") is True

    def test_private_class_c(self):
        assert _is_private_ip("192.168.1.1") is True

    def test_link_local_metadata(self):
        # AWS/GCP/Railway instance metadata
        assert _is_private_ip("169.254.169.254") is True

    def test_public_ip_allowed(self):
        assert _is_private_ip("142.250.80.78") is False  # google.com

    def test_unparseable_blocked(self):
        assert _is_private_ip("not-an-ip") is True


class TestValidateImportUrl:
    def _patch_dns(self, ip: str = "142.250.80.78"):
        """Patch socket.gethostbyname to return a known public IP."""
        return patch("app.utils.url_security.socket.gethostbyname", return_value=ip)

    # ── Scheme checks ─────────────────────────────────────────
    def test_file_scheme_blocked(self):
        with pytest.raises(SSRFError, match="scheme"):
            validate_import_url("file:///etc/passwd")

    def test_ftp_scheme_blocked(self):
        with pytest.raises(SSRFError, match="scheme"):
            validate_import_url("ftp://youtube.com/video")

    def test_no_scheme_blocked(self):
        with pytest.raises(SSRFError):
            validate_import_url("youtube.com/watch?v=abc")

    # ── Platform allowlist ────────────────────────────────────
    def test_unknown_host_blocked(self):
        with pytest.raises(SSRFError, match="not a supported"):
            validate_import_url("https://evil.com/video")

    def test_internal_admin_blocked(self):
        with pytest.raises(SSRFError, match="not a supported"):
            validate_import_url("http://localhost/admin")

    def test_railway_internal_blocked(self):
        with pytest.raises(SSRFError, match="not a supported"):
            validate_import_url("http://api.railway.internal/jobs")

    # ── Allowed platforms pass ────────────────────────────────
    @pytest.mark.parametrize(
        "url",
        [
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://www.instagram.com/reel/abc123/",
            "https://www.tiktok.com/@user/video/123",
            "https://vm.tiktok.com/short",
            "https://www.facebook.com/video/123",
            "https://fb.watch/abc",
            "https://twitter.com/user/status/123",
            "https://x.com/user/status/123",
        ],
    )
    def test_allowed_platforms_pass(self, url):
        with self._patch_dns():
            validate_import_url(url)  # should not raise

    # ── IP checks ─────────────────────────────────────────────
    def test_private_ip_resolution_blocked(self):
        with (
            patch("app.utils.url_security.socket.gethostbyname", return_value="192.168.1.1"),
            pytest.raises(SSRFError, match="cannot be imported"),
        ):
            validate_import_url("https://www.youtube.com/watch?v=abc")

    def test_loopback_resolution_blocked(self):
        with (
            patch("app.utils.url_security.socket.gethostbyname", return_value="127.0.0.1"),
            pytest.raises(SSRFError, match="cannot be imported"),
        ):
            validate_import_url("https://www.youtube.com/watch?v=abc")

    def test_dns_failure_blocked(self):
        import socket as _socket

        with (
            patch(
                "app.utils.url_security.socket.gethostbyname",
                side_effect=_socket.gaierror("NXDOMAIN"),
            ),
            pytest.raises(SSRFError, match="Could not resolve"),
        ):
            validate_import_url("https://www.youtube.com/watch?v=abc")


# ══════════════════════════════════════════════════════════════
#  2. GDPR user.deleted purge
# ══════════════════════════════════════════════════════════════


class TestGdprPurge:
    @pytest.mark.asyncio
    async def test_purge_user_data_deletes_trips_jobs_user(self):
        from app.routers.users import _purge_user_data

        mock_trip_find = MagicMock()
        mock_trip_find.delete = AsyncMock(return_value=MagicMock(deleted_count=3))

        mock_job_find = MagicMock()
        mock_job_find.delete = AsyncMock(return_value=MagicMock(deleted_count=1))

        mock_user = MagicMock()
        mock_user.delete = AsyncMock()

        with (
            patch("app.routers.users.TripDocument") as MockTrip,
            patch("app.routers.users.JobDocument") as MockJob,
            patch("app.routers.users.UserDocument") as MockUser,
        ):
            MockTrip.find.return_value = mock_trip_find
            MockTrip.user_id = "user_id"
            MockJob.find.return_value = mock_job_find
            MockJob.user_id = "user_id"
            MockUser.find_one = AsyncMock(return_value=mock_user)
            MockUser.clerk_id = "clerk_id"

            await _purge_user_data("user_abc123")

            MockTrip.find.assert_called_once()
            mock_trip_find.delete.assert_awaited_once()
            MockJob.find.assert_called_once()
            mock_job_find.delete.assert_awaited_once()
            MockUser.find_one.assert_awaited_once()
            mock_user.delete.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_purge_swallows_errors(self):
        """Purge must not raise — webhook must return 200 even on DB error."""
        from app.routers.users import _purge_user_data

        with patch("app.routers.users.TripDocument") as MockTrip:
            MockTrip.find.side_effect = Exception("DB connection lost")
            # Should not raise — errors are logged and swallowed
            await _purge_user_data("user_abc123")

    @pytest.mark.asyncio
    async def test_purge_no_user_document(self):
        """Should still complete cleanly when user doc doesn't exist."""
        from app.routers.users import _purge_user_data

        mock_find = MagicMock()
        mock_find.delete = AsyncMock(return_value=MagicMock(deleted_count=0))

        with (
            patch("app.routers.users.TripDocument") as MockTrip,
            patch("app.routers.users.JobDocument") as MockJob,
            patch("app.routers.users.UserDocument") as MockUser,
        ):
            MockTrip.find.return_value = mock_find
            MockJob.find.return_value = mock_find
            MockUser.find_one = AsyncMock(return_value=None)  # no user doc
            MockUser.clerk_id = "clerk_id"
            MockTrip.user_id = "user_id"
            MockJob.user_id = "user_id"

            await _purge_user_data("ghost_user")  # should not raise


# ══════════════════════════════════════════════════════════════
#  3. Sentry consecutive failure alert
# ══════════════════════════════════════════════════════════════


class TestSentryFailureAlert:
    def setup_method(self):
        """Reset the global counter before each test."""
        import app.services.extraction.service as svc

        svc._consecutive_gpt4o_failures = 0

    def test_success_resets_counter(self):
        import app.services.extraction.service as svc

        svc._consecutive_gpt4o_failures = 2
        svc._record_gpt4o_success()
        assert svc._consecutive_gpt4o_failures == 0

    def test_failure_increments_counter(self):
        import app.services.extraction.service as svc

        svc._record_gpt4o_failure("test_reason")
        assert svc._consecutive_gpt4o_failures == 1

    def test_alert_fires_at_threshold(self):
        import app.services.extraction.service as svc

        with patch("app.services.extraction.service._fire_sentry_alert") as mock_alert:
            svc._record_gpt4o_failure("reason_1")
            svc._record_gpt4o_failure("reason_2")
            mock_alert.assert_not_called()
            svc._record_gpt4o_failure("reason_3")  # threshold = 3
            mock_alert.assert_called_once_with(3, "reason_3")

    def test_alert_fires_on_every_failure_above_threshold(self):
        import app.services.extraction.service as svc

        with patch("app.services.extraction.service._fire_sentry_alert") as mock_alert:
            for _i in range(5):
                svc._record_gpt4o_failure("sustained_outage")
            assert mock_alert.call_count == 3  # calls 3, 4, 5

    def test_fire_sentry_alert_calls_capture_message(self):
        import app.services.extraction.service as svc

        mock_sdk = MagicMock()
        with patch.dict("sys.modules", {"sentry_sdk": mock_sdk}):
            svc._fire_sentry_alert(3, "APIStatusError 503")
            mock_sdk.capture_message.assert_called_once()
            call_args = mock_sdk.capture_message.call_args
            assert "3" in call_args[0][0]
            assert call_args[1]["level"] == "fatal"

    def test_fire_sentry_alert_swallows_import_error(self):
        import app.services.extraction.service as svc

        # Sentry not installed — should not raise
        with patch.dict("sys.modules", {"sentry_sdk": None}):
            svc._fire_sentry_alert(3, "test")  # no exception


# ══════════════════════════════════════════════════════════════
#  4. CSP headers — vercel.json sanity check
# ══════════════════════════════════════════════════════════════


class TestVercelConfig:
    def _load_vercel(self) -> dict:
        # tests/ is at apps/api/tests/ → repo root is 4 levels up
        path = Path(__file__).parent.parent.parent.parent / "vercel.json"
        return json.loads(path.read_text())

    def test_vercel_json_exists(self):
        path = Path(__file__).parent.parent.parent.parent / "vercel.json"
        assert path.exists(), "vercel.json not found at repo root"

    def test_csp_header_present(self):
        config = self._load_vercel()
        all_headers = []
        for block in config.get("headers", []):
            all_headers.extend(block.get("headers", []))
        keys = [h["key"] for h in all_headers]
        assert "Content-Security-Policy" in keys, "CSP header missing from vercel.json"

    def test_x_frame_options_present(self):
        config = self._load_vercel()
        all_headers = []
        for block in config.get("headers", []):
            all_headers.extend(block.get("headers", []))
        keys = [h["key"] for h in all_headers]
        assert "X-Frame-Options" in keys

    def test_hsts_present(self):
        config = self._load_vercel()
        all_headers = []
        for block in config.get("headers", []):
            all_headers.extend(block.get("headers", []))
        keys = [h["key"] for h in all_headers]
        assert "Strict-Transport-Security" in keys

    def test_csp_blocks_frame_src(self):
        config = self._load_vercel()
        all_headers = []
        for block in config.get("headers", []):
            all_headers.extend(block.get("headers", []))
        csp = next(h["value"] for h in all_headers if h["key"] == "Content-Security-Policy")
        assert "frame-src 'none'" in csp, "CSP should block all iframes"

    def test_csp_blocks_object_src(self):
        config = self._load_vercel()
        all_headers = []
        for block in config.get("headers", []):
            all_headers.extend(block.get("headers", []))
        csp = next(h["value"] for h in all_headers if h["key"] == "Content-Security-Policy")
        assert "object-src 'none'" in csp, "CSP should block plugins/Flash"
