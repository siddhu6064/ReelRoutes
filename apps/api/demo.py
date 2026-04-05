"""
apps/api/demo.py

Task 8 — End-to-end local demo: paste a URL, get a geocoded pin list.

Runs the full Phase 3 pipeline locally:
  URL → Platform adapter → Signals → GPT-4o extraction → Google Places geocoding → Pins

Usage:
    # YouTube (richest signal — has CC):
    poetry run python demo.py https://www.youtube.com/watch?v=dQw4w9WgXcQ

    # Instagram Reel (description + hashtags signal):
    poetry run python demo.py https://www.instagram.com/reel/CaB123dEfGH/

    # TikTok (hashtags + Whisper fallback):
    poetry run python demo.py https://www.tiktok.com/@user/video/1234567890

    # Skip geocoding (extraction only, no Places API key needed):
    poetry run python demo.py https://youtube.com/watch?v=abc --no-geocode

    # Verbose mode (shows full signals and raw GPT-4o output):
    poetry run python demo.py https://youtube.com/watch?v=abc --verbose

Prerequisites:
    - Copy .env.example → .env and fill in OPENAI_API_KEY
    - Optionally add GOOGLE_PLACES_API_KEY for geocoding
    - YOUTUBE_API_KEY for YouTube metadata (optional — works without it)
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

# Add apps/api to path so we can import app modules directly
sys.path.insert(0, str(Path(__file__).parent))

# Load .env before importing app modules
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).parent / ".env")
except ImportError:
    pass  # python-dotenv optional — env vars may already be set


async def run_demo(url: str, no_geocode: bool = False, verbose: bool = False) -> None:
    from app.adapters.registry import fetch_from_url
    from app.config.settings import get_settings
    from app.routers.process import detect_platform as detect_platform_fn
    from app.services.extraction.service import ExtractionService
    from app.services.geocoding.geocoder import geocode_locations

    settings = get_settings()

    _banner("ReelRoutes — End-to-End Demo")
    print(f"URL:     {url}")
    print(f"OpenAI:  {'✓ key set' if settings.openai_api_key else '✗ missing — mock extraction'}")
    print(
        f"Places:  {'✓ key set' if settings.google_places_api_key else '✗ missing — mock geocoding'}"
    )
    print()

    # ── Step 1: Detect platform ────────────────────────────────
    platform = detect_platform_fn(url)
    print(f"[1/4] Platform detected: {platform.upper()}")

    # ── Step 2: Fetch signals via adapter ──────────────────────
    print("[2/4] Fetching video metadata and signals…")
    t0 = time.perf_counter()
    adapter_output = await fetch_from_url(url, platform)
    elapsed = round(time.perf_counter() - t0, 2)

    print(f"      Title:   {adapter_output.title[:70]}")
    print(f"      Signal:  {adapter_output.captions_source} ({adapter_output.signal_quality})")
    print(f"      Tokens:  {_count_tokens(adapter_output.best_signal_text):,} (estimated)")
    print(f"      Hashtags:{len(adapter_output.hashtags)}")
    if adapter_output.location_tag:
        print(f"      Location tag: {adapter_output.location_tag}")
    if adapter_output.fetch_warnings:
        for w in adapter_output.fetch_warnings:
            print(f"      ⚠ {w}")
    print(f"      Done in {elapsed}s")

    if verbose:
        print("\n--- Best signal text (first 500 chars) ---")
        print(adapter_output.best_signal_text[:500])
        print("---\n")

    # ── Step 3: AI extraction ──────────────────────────────────
    print("\n[3/4] Extracting locations with GPT-4o…")
    t0 = time.perf_counter()
    extraction_result = await ExtractionService.extract(adapter_output)
    elapsed = round(time.perf_counter() - t0, 2)

    print(f"      Locations found: {len(extraction_result.locations)}")
    print(f"      Tokens used:     {extraction_result.total_tokens:,}")
    print(f"      Signal type:     {extraction_result.signal_type}")
    print(f"      Chunks:          {extraction_result.chunk_count}")
    print(f"      Done in {elapsed}s")

    if not extraction_result.locations:
        print("\n⚠ No locations extracted. Try a video with more place name mentions.")
        return

    if verbose:
        print("\n--- Raw GPT-4o output (first 800 chars) ---")
        print(extraction_result.raw_response[:800])
        print("---\n")

    # ── Step 4: Geocoding ──────────────────────────────────────
    if no_geocode:
        print("\n[4/4] Geocoding skipped (--no-geocode)")
        _print_extracted(extraction_result.locations)
        return

    print(f"\n[4/4] Geocoding {len(extraction_result.locations)} places…")
    t0 = time.perf_counter()
    geo_result = await geocode_locations(extraction_result.locations)
    elapsed = round(time.perf_counter() - t0, 2)

    print(f"      Geocoded:    {geo_result.geocoded_count}")
    print(f"      Unresolved:  {geo_result.unresolved_count}")
    print(f"      Ambiguous:   {geo_result.ambiguous_count}")
    print(f"      Dedup removed: {geo_result.dedup_removed}")
    print(f"      Done in {elapsed}s")

    # ── Results ────────────────────────────────────────────────
    _banner("Extracted Trip Stops")
    for i, loc in enumerate(geo_result.locations):
        status = "✓" if loc.geocoded else ("?" if loc.ambiguous else "✗")
        print(f"  {status} {i+1:2d}. {loc.place_name}")
        if loc.geocoded:
            print(f"          {loc.lat:.4f}, {loc.lng:.4f}  |  {loc.address}")
        if loc.unresolved:
            print("          ⚠ Unresolved — will appear as editable pin")
        if verbose and loc.context_quote:
            print(f'          "{loc.context_quote[:80]}"')
        if verbose and loc.ambiguous:
            print(f"          {len(loc.candidates)} candidates stored for manual selection")

    print()
    print(
        f"✅ Pipeline complete: {geo_result.geocoded_count}/{len(geo_result.locations)} pins geocoded"
    )
    print(f"   Ready to create Trip with {len(geo_result.locations)} stops.")


# ── Helpers ────────────────────────────────────────────────────


def _banner(title: str) -> None:
    width = 60
    print(f"\n{'─' * width}")
    print(f"  {title}")
    print(f"{'─' * width}")


def _count_tokens(text: str) -> int:
    try:
        import tiktoken

        return len(tiktoken.get_encoding("cl100k_base").encode(text))
    except Exception:
        return len(text.split())


def _print_extracted(locations) -> None:
    _banner("Extracted Locations (no geocoding)")
    for loc in locations:
        conf_bar = "█" * int(loc.confidence * 10)
        print(f"  {loc.order+1:2d}. [{conf_bar:<10}] {loc.confidence:.0%}  {loc.place_name}")
        if loc.context_quote:
            print(f'       "{loc.context_quote[:80]}"')


# ── CLI entry point ────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="ReelRoutes end-to-end demo — URL to geocoded pin list"
    )
    parser.add_argument("url", help="Social video URL (YouTube, Instagram, TikTok, Facebook, X)")
    parser.add_argument("--no-geocode", action="store_true", help="Skip geocoding step")
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show full signals and raw output"
    )
    args = parser.parse_args()

    asyncio.run(run_demo(args.url, no_geocode=args.no_geocode, verbose=args.verbose))
