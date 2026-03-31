"""
tests/adapters/test_platform_adapters.py

Tests for Instagram, TikTok, Facebook, and Twitter adapters.
All tests mock ytdlp_extract — no live network calls.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.adapters.base import CaptionsSource
from app.adapters.instagram import InstagramAdapter, extract_shortcode
from app.adapters.tiktok import TikTokAdapter, extract_tiktok_ids
from app.adapters.facebook import FacebookAdapter, extract_facebook_id
from app.adapters.twitter import TwitterAdapter, extract_tweet_id
from app.models.documents import Platform
from tests.adapters.conftest import load_fixture, mock_ytdlp_extract


# ── Instagram ──────────────────────────────────────────────────

class TestInstagramUrlParsing:
    def test_reel_url(self) -> None:
        assert extract_shortcode("https://www.instagram.com/reel/CaB123dEfGH/") == "CaB123dEfGH"

    def test_post_url(self) -> None:
        assert extract_shortcode("https://www.instagram.com/p/CaB123dEfGH/") == "CaB123dEfGH"

    def test_tv_url(self) -> None:
        assert extract_shortcode("https://www.instagram.com/tv/CaB123dEfGH/") == "CaB123dEfGH"

    def test_non_instagram_returns_none(self) -> None:
        assert extract_shortcode("https://youtube.com/watch?v=abc") is None


@pytest.mark.asyncio
class TestInstagramAdapter:
    async def _fetch(self) -> "AdapterOutput":
        with patch(
            "app.adapters.instagram.ytdlp_extract",
            mock_ytdlp_extract("instagram_bali_reel"),
        ):
            return await InstagramAdapter().fetch(
                "https://www.instagram.com/reel/CaB123dEfGH/"
            )

    async def test_platform_is_instagram(self) -> None:
        out = await self._fetch()
        assert out.platform == Platform.INSTAGRAM

    async def test_description_extracted(self) -> None:
        out = await self._fetch()
        assert out.description is not None
        assert len(out.description) > 50

    async def test_location_tag_extracted(self) -> None:
        out = await self._fetch()
        assert out.location_tag is not None
        assert "Bali" in out.location_tag or "Ubud" in out.location_tag

    async def test_hashtags_extracted(self) -> None:
        out = await self._fetch()
        assert "bali" in out.hashtags
        assert "indonesia" in out.hashtags
        assert len(out.hashtags) >= 5

    async def test_creator_handle_formatted(self) -> None:
        out = await self._fetch()
        assert out.creator_handle is not None
        assert out.creator_handle.startswith("@")

    async def test_captions_source_is_description(self) -> None:
        out = await self._fetch()
        assert out.captions_source == CaptionsSource.DESCRIPTION

    async def test_has_captions_false(self) -> None:
        """Instagram never has true CC — Whisper fallback is expected."""
        out = await self._fetch()
        assert out.has_captions is False

    async def test_transcript_is_description_text(self) -> None:
        out = await self._fetch()
        assert out.transcript is not None
        assert "Bali" in out.transcript or "Ubud" in out.transcript

    async def test_graceful_failure_on_private(self) -> None:
        from unittest.mock import AsyncMock
        with patch(
            "app.adapters.instagram.ytdlp_extract",
            AsyncMock(side_effect=Exception("This content requires login")),
        ):
            out = await InstagramAdapter().fetch("https://www.instagram.com/reel/private123/")
        assert len(out.fetch_warnings) > 0
        assert any("private" in w.lower() or "login" in w.lower() for w in out.fetch_warnings)

    async def test_graceful_failure_on_rate_limit(self) -> None:
        from unittest.mock import AsyncMock
        with patch(
            "app.adapters.instagram.ytdlp_extract",
            AsyncMock(side_effect=Exception("HTTP Error 429: Too Many Requests")),
        ):
            out = await InstagramAdapter().fetch("https://www.instagram.com/reel/abc/")
        assert len(out.fetch_warnings) > 0


# ── TikTok ─────────────────────────────────────────────────────

class TestTikTokUrlParsing:
    def test_standard_video_url(self) -> None:
        handle, vid = extract_tiktok_ids(
            "https://www.tiktok.com/@alexjamietravel/video/7384729104857362"
        )
        assert handle == "alexjamietravel"
        assert vid == "7384729104857362"

    def test_non_tiktok_returns_none(self) -> None:
        handle, vid = extract_tiktok_ids("https://instagram.com/reel/abc")
        assert handle is None
        assert vid is None


@pytest.mark.asyncio
class TestTikTokAdapter:
    async def _fetch(self) -> "AdapterOutput":
        with patch(
            "app.adapters.tiktok.ytdlp_extract",
            mock_ytdlp_extract("tiktok_morocco"),
        ):
            return await TikTokAdapter().fetch(
                "https://www.tiktok.com/@alexjamietravel/video/7384729104857362"
            )

    async def test_platform_is_tiktok(self) -> None:
        out = await self._fetch()
        assert out.platform == Platform.TIKTOK

    async def test_description_has_place_names(self) -> None:
        out = await self._fetch()
        assert out.description is not None
        assert any(
            place in out.description
            for place in ["Marrakech", "Sahara", "Chefchaouen", "Morocco"]
        )

    async def test_hashtags_contain_destinations(self) -> None:
        out = await self._fetch()
        assert "morocco" in out.hashtags
        assert "marrakech" in out.hashtags

    async def test_has_captions_false_needs_whisper(self) -> None:
        out = await self._fetch()
        assert out.has_captions is False

    async def test_captions_source_description(self) -> None:
        out = await self._fetch()
        assert out.captions_source == CaptionsSource.DESCRIPTION

    async def test_creator_handle_extracted(self) -> None:
        out = await self._fetch()
        assert out.creator_handle == "@alexjamietravel"

    async def test_graceful_on_rate_limit(self) -> None:
        from unittest.mock import AsyncMock
        with patch(
            "app.adapters.tiktok.ytdlp_extract",
            AsyncMock(side_effect=Exception("Too Many Requests 429")),
        ):
            out = await TikTokAdapter().fetch(
                "https://www.tiktok.com/@user/video/123"
            )
        assert len(out.fetch_warnings) > 0
        assert any("rate" in w.lower() or "whisper" in w.lower() for w in out.fetch_warnings)

    async def test_signal_quality_medium_with_description(self) -> None:
        out = await self._fetch()
        assert out.signal_quality in ("medium", "rich")


# ── Facebook ───────────────────────────────────────────────────

class TestFacebookUrlParsing:
    def test_watch_url(self) -> None:
        assert extract_facebook_id("https://www.facebook.com/watch/?v=10158234567891234") == "10158234567891234"

    def test_video_url(self) -> None:
        assert extract_facebook_id("https://www.facebook.com/user/videos/10158234567891234") == "10158234567891234"

    def test_reel_url(self) -> None:
        assert extract_facebook_id("https://www.facebook.com/reels/10158234567891234") == "10158234567891234"


@pytest.mark.asyncio
class TestFacebookAdapter:
    async def _fetch(self) -> "AdapterOutput":
        with patch(
            "app.adapters.facebook.ytdlp_extract",
            mock_ytdlp_extract("facebook_lisbon"),
        ):
            return await FacebookAdapter().fetch(
                "https://www.facebook.com/watch/?v=10158234567891234"
            )

    async def test_platform_is_facebook(self) -> None:
        out = await self._fetch()
        assert out.platform == Platform.FACEBOOK

    async def test_title_extracted(self) -> None:
        out = await self._fetch()
        assert "Lisbon" in out.title or "Portugal" in out.title or "Travel" in out.title

    async def test_location_tag_extracted(self) -> None:
        out = await self._fetch()
        assert out.location_tag is not None
        assert "Lisbon" in out.location_tag or "Portugal" in out.location_tag

    async def test_description_has_places(self) -> None:
        out = await self._fetch()
        assert out.description is not None
        assert any(p in out.description for p in ["Alfama", "Belém", "Sintra", "Lisbon"])

    async def test_graceful_on_login_required(self) -> None:
        from unittest.mock import AsyncMock
        with patch(
            "app.adapters.facebook.ytdlp_extract",
            AsyncMock(side_effect=Exception("login required for private content")),
        ):
            out = await FacebookAdapter().fetch("https://www.facebook.com/watch/?v=private")
        assert len(out.fetch_warnings) > 0


# ── Twitter / X ────────────────────────────────────────────────

class TestTwitterUrlParsing:
    def test_twitter_com_url(self) -> None:
        assert extract_tweet_id("https://twitter.com/user/status/1758392847562910") == "1758392847562910"

    def test_x_com_url(self) -> None:
        assert extract_tweet_id("https://x.com/user/status/1758392847562910") == "1758392847562910"

    def test_non_twitter_returns_none(self) -> None:
        assert extract_tweet_id("https://instagram.com/p/abc") is None


@pytest.mark.asyncio
class TestTwitterAdapter:
    async def _fetch(self) -> "AdapterOutput":
        with patch(
            "app.adapters.twitter.ytdlp_extract",
            mock_ytdlp_extract("twitter_iceland"),
        ):
            return await TwitterAdapter().fetch(
                "https://x.com/marcovtravel/status/1758392847562910"
            )

    async def test_platform_is_twitter(self) -> None:
        out = await self._fetch()
        assert out.platform == Platform.TWITTER

    async def test_tweet_text_as_description(self) -> None:
        out = await self._fetch()
        assert out.description is not None
        assert any(p in out.description for p in ["Iceland", "Skógafoss", "Reykjavik", "Seljalandsfoss"])

    async def test_hashtags_from_tweet(self) -> None:
        out = await self._fetch()
        assert "iceland" in out.hashtags
        assert "travel" in out.hashtags

    async def test_canonical_url_uses_x_com(self) -> None:
        out = await self._fetch()
        assert "x.com" in out.canonical_url

    async def test_signal_quality_medium_or_sparse(self) -> None:
        out = await self._fetch()
        # Twitter/X typically yields sparse-to-medium signal
        assert out.signal_quality in ("sparse", "medium")

    async def test_graceful_on_protected_account(self) -> None:
        from unittest.mock import AsyncMock
        with patch(
            "app.adapters.twitter.ytdlp_extract",
            AsyncMock(side_effect=Exception("This account's tweets are protected")),
        ):
            out = await TwitterAdapter().fetch("https://x.com/protected/status/123")
        assert len(out.fetch_warnings) > 0
        assert any("protected" in w.lower() for w in out.fetch_warnings)
