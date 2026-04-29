"""
app/utils/url_security.py

SSRF protection for the video import endpoint.

Blocks:
  - Private / loopback IP ranges (127.x, 10.x, 172.16-31.x, 192.168.x)
  - Link-local and metadata endpoints (169.254.x — AWS/GCP/Railway instance metadata)
  - URLs that don't match our supported platform allowlist
  - Non-HTTP(S) schemes (file://, ftp://, etc.)

Usage:
    from app.utils.url_security import validate_import_url, SSRFError

    try:
        validate_import_url(url)
    except SSRFError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

from app.config.logging import get_logger

logger = get_logger(__name__)

# ── Allowed platform hostnames (exact match or suffix) ────────
ALLOWED_PLATFORMS: list[str] = [
    "youtube.com",
    "youtu.be",
    "www.youtube.com",
    "m.youtube.com",
    "instagram.com",
    "www.instagram.com",
    "tiktok.com",
    "www.tiktok.com",
    "vm.tiktok.com",
    "facebook.com",
    "www.facebook.com",
    "fb.watch",
    "m.facebook.com",
    "twitter.com",
    "www.twitter.com",
    "x.com",
    "www.x.com",
]

# ── Private / reserved IP networks ────────────────────────────
_BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network("127.0.0.0/8"),  # loopback
    ipaddress.ip_network("10.0.0.0/8"),  # private class A
    ipaddress.ip_network("172.16.0.0/12"),  # private class B
    ipaddress.ip_network("192.168.0.0/16"),  # private class C
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / metadata
    ipaddress.ip_network("100.64.0.0/10"),  # shared address space (Railway)
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 unique local
    ipaddress.ip_network("fe80::/10"),  # IPv6 link-local
    ipaddress.ip_network("0.0.0.0/8"),  # unspecified
]


class SSRFError(ValueError):
    """Raised when a URL fails SSRF validation."""


def validate_import_url(url: str) -> None:
    """
    Validate that a video import URL is safe to fetch.

    Raises SSRFError with a user-safe message if the URL is:
      - Not http or https
      - Not from a supported platform
      - Resolving to a private/internal IP address

    Does NOT make a network request itself — hostname resolution
    is used only to check the resolved IP, not to fetch content.
    """
    url = url.strip()

    # ── 1. Scheme check ───────────────────────────────────────
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        logger.warning("ssrf_blocked_scheme", scheme=parsed.scheme, url=url[:100])
        raise SSRFError(
            f"Unsupported URL scheme '{parsed.scheme}'. " "Only http and https URLs are accepted."
        )

    # ── 2. Hostname must exist ────────────────────────────────
    hostname = parsed.hostname
    if not hostname:
        raise SSRFError("URL has no hostname.")

    # ── 3. Platform allowlist ─────────────────────────────────
    if not _is_allowed_host(hostname):
        logger.warning("ssrf_blocked_platform", hostname=hostname, url=url[:100])
        raise SSRFError(
            f"'{hostname}' is not a supported video platform. "
            "Paste a URL from YouTube, Instagram, TikTok, Facebook, or X."
        )

    # ── 4. Resolve hostname → check IP is not private ─────────
    try:
        resolved_ip = socket.gethostbyname(hostname)
    except socket.gaierror:
        # Can't resolve — block it; we only accept real platforms
        logger.warning("ssrf_blocked_dns_failure", hostname=hostname)
        raise SSRFError(f"Could not resolve '{hostname}'. Please check the URL and try again.")

    if _is_private_ip(resolved_ip):
        logger.warning(
            "ssrf_blocked_private_ip",
            hostname=hostname,
            resolved=resolved_ip,
        )
        # Return a generic error — don't leak internal topology
        raise SSRFError("This URL cannot be imported. Please use a public video link.")


def _is_allowed_host(hostname: str) -> bool:
    """Return True if hostname matches the platform allowlist."""
    hostname = hostname.lower().rstrip(".")
    return hostname in ALLOWED_PLATFORMS


def _is_private_ip(ip_str: str) -> bool:
    """Return True if the IP falls in a blocked (private/reserved) range."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # Can't parse → block it
    return any(addr in network for network in _BLOCKED_NETWORKS)
