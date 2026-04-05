"""
app/services/map_export_service.py

Export trip pins to major mapping platforms.
Very few travel apps support Apple Maps — this is a genuine differentiator.

Supported exports:
  1. Google Maps URL   — opens maps.google.com with all stops as waypoints
  2. Apple Maps URL    — opens maps.apple.com (or the Maps app on iOS/macOS)
  3. KML file          — import into Google My Maps or any GIS tool
  4. GPX file          — import into Apple Maps, Garmin, Komoot, any map app
  5. GeoJSON           — for developers / custom map tools

Apple Maps notes:
  - Apple Maps doesn't support multi-stop routes via URL (unlike Google Maps)
  - Best approach: GPX file — Apple Maps on iOS opens .gpx files natively
  - On iOS: share the .gpx file → "Open in Maps" → it imports all pins
  - On macOS: double-click the .gpx — Maps opens it directly
  - Individual pin links use https://maps.apple.com/?q=name&ll=lat,lng
"""

from __future__ import annotations

import urllib.parse
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from typing import Literal

from app.models.documents import PinDocument, TripDocument

ExportFormat = Literal["google_maps", "apple_maps", "kml", "gpx", "geojson"]


def export_trip(
    trip: TripDocument,
    format: ExportFormat,
) -> dict:
    """
    Main entry point. Returns a dict with url and/or content depending on format.

    Returns:
        {
            "format": "gpx",
            "filename": "Japan-Trip-2024.gpx",
            "content": "<gpx>...",       # for file downloads
            "url": None,                  # for direct opens
            "content_type": "application/gpx+xml",
        }
    """
    pins = sorted(trip.pins, key=lambda p: p.order)
    safe_title = _safe_filename(trip.title)

    if format == "google_maps":
        return {
            "format": format,
            "filename": None,
            "url": _google_maps_url(pins),
            "content": None,
            "content_type": None,
            "tip": "Opens Google Maps with all stops as waypoints. On mobile, tap the link to open the Maps app.",
        }

    if format == "apple_maps":
        return {
            "format": format,
            "filename": f"{safe_title}.gpx",
            "url": None,
            "content": _gpx(trip, pins),
            "content_type": "application/gpx+xml",
            "tip": (
                "Download the .gpx file, then: "
                "iOS — tap to open → 'Open in Maps'. "
                "macOS — double-click → Maps imports automatically. "
                "Also works in Garmin, Komoot, and most navigation apps."
            ),
            "pin_links": _apple_maps_pin_links(pins),
        }

    if format == "kml":
        return {
            "format": format,
            "filename": f"{safe_title}.kml",
            "url": None,
            "content": _kml(trip, pins),
            "content_type": "application/vnd.google-earth.kml+xml",
            "tip": "Import into Google My Maps at mymaps.google.com or any GIS tool.",
        }

    if format == "gpx":
        return {
            "format": format,
            "filename": f"{safe_title}.gpx",
            "url": None,
            "content": _gpx(trip, pins),
            "content_type": "application/gpx+xml",
            "tip": "Works in Apple Maps, Garmin GPS, Komoot, Strava, and most navigation apps.",
        }

    if format == "geojson":
        return {
            "format": format,
            "filename": f"{safe_title}.geojson",
            "url": None,
            "content": _geojson(trip, pins),
            "content_type": "application/geo+json",
            "tip": "For developers. Import into QGIS, Mapbox, or any GIS tool.",
        }

    raise ValueError(f"Unknown export format: {format}")


# ── Format builders ────────────────────────────────────────────


def _google_maps_url(pins: list[PinDocument]) -> str:
    """
    Builds a Google Maps URL with all pins as ordered waypoints.
    Google Maps supports up to ~10 waypoints in a URL.
    For larger trips we use the first + last as start/end and rest as waypoints.
    """
    if not pins:
        return "https://maps.google.com"

    if len(pins) == 1:
        p = pins[0]
        return f"https://maps.google.com/?q={p.lat},{p.lng}"

    # Google Maps directions URL format:
    # https://www.google.com/maps/dir/lat1,lng1/lat2,lng2/lat3,lng3
    MAX_WAYPOINTS = 10
    if len(pins) > MAX_WAYPOINTS:
        # Keep first, last, and evenly sample middle stops
        step = max(1, len(pins) // MAX_WAYPOINTS)
        sampled = pins[::step]
        if pins[-1] not in sampled:
            sampled.append(pins[-1])
        pins = sampled[:MAX_WAYPOINTS]

    waypoints = "/".join(f"{p.lat},{p.lng}" for p in pins)
    return f"https://www.google.com/maps/dir/{waypoints}"


def _apple_maps_pin_links(pins: list[PinDocument]) -> list[dict]:
    """
    Individual Apple Maps links for each pin.
    These open Maps.app on iOS/macOS when tapped.
    """
    links = []
    for p in pins:
        name_encoded = urllib.parse.quote(p.place_name)
        # maps.apple.com links work as universal links — iOS opens Maps.app directly
        url = f"https://maps.apple.com/?q={name_encoded}&ll={p.lat},{p.lng}"
        links.append(
            {
                "name": p.place_name,
                "url": url,
                "address": p.address,
            }
        )
    return links


def _gpx(trip: TripDocument, pins: list[PinDocument]) -> str:
    """
    GPX (GPS Exchange Format) — the universal standard for waypoints.
    Supported natively by Apple Maps, Garmin, Komoot, Strava, OSMAnd.

    On iOS: tap a .gpx file → share → 'Open in Maps' → all pins appear.
    On macOS: double-click → Maps imports automatically.
    """
    root = ET.Element(
        "gpx",
        {
            "version": "1.1",
            "creator": "ReelRoutes",
            "xmlns": "http://www.topografix.com/GPX/1/1",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xsi:schemaLocation": "http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd",
        },
    )

    metadata = ET.SubElement(root, "metadata")
    ET.SubElement(metadata, "name").text = trip.title
    ET.SubElement(metadata, "time").text = datetime.now(UTC).isoformat()
    if trip.source_url:
        link = ET.SubElement(metadata, "link", href=trip.source_url)
        ET.SubElement(link, "text").text = f"Source video — {trip.title}"

    for pin in pins:
        wpt = ET.SubElement(root, "wpt", lat=str(pin.lat), lon=str(pin.lng))
        ET.SubElement(wpt, "name").text = pin.place_name
        if pin.address:
            ET.SubElement(wpt, "desc").text = _build_gpx_desc(pin)
        if pin.place_id:
            ET.SubElement(wpt, "link", href=f"https://maps.google.com/?cid={pin.place_id}")
        ET.SubElement(wpt, "type").text = "Waypoint"

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")


def _build_gpx_desc(pin: PinDocument) -> str:
    parts = []
    if pin.address:
        parts.append(pin.address)
    if pin.context_quote:
        parts.append(f'"{pin.context_quote}"')
    if pin.notes:
        parts.append(pin.notes)
    return " | ".join(parts)


def _kml(trip: TripDocument, pins: list[PinDocument]) -> str:
    """
    KML (Keyhole Markup Language) — native format for Google My Maps.
    Import at mymaps.google.com → Create → Import.
    """
    root = ET.Element("kml", xmlns="http://www.opengis.net/kml/2.2")
    doc = ET.SubElement(root, "Document")
    ET.SubElement(doc, "name").text = trip.title
    ET.SubElement(doc, "description").text = (
        f"Trip exported from ReelRoutes\n"
        f"Source: {trip.source_url or 'Unknown'}\n"
        f"Platform: {trip.platform}"
    )

    # Style for numbered pins
    style = ET.SubElement(doc, "Style", id="reelroutes-pin")
    icon_style = ET.SubElement(style, "IconStyle")
    icon = ET.SubElement(icon_style, "Icon")
    ET.SubElement(icon, "href").text = "https://maps.google.com/mapfiles/ms/icons/red-dot.png"

    for i, pin in enumerate(pins):
        pm = ET.SubElement(doc, "Placemark")
        ET.SubElement(pm, "name").text = f"{i+1}. {pin.place_name}"
        ET.SubElement(pm, "styleUrl").text = "#reelroutes-pin"

        desc_parts = []
        if pin.address:
            desc_parts.append(f"📍 {pin.address}")
        if pin.context_quote:
            desc_parts.append(f'💬 "{pin.context_quote}"')
        if pin.notes:
            desc_parts.append(f"📝 {pin.notes}")
        if trip.source_url:
            desc_parts.append(f"🎥 Source: {trip.source_url}")
        ET.SubElement(pm, "description").text = "\n".join(desc_parts)

        point = ET.SubElement(pm, "Point")
        ET.SubElement(point, "coordinates").text = f"{pin.lng},{pin.lat},0"

    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode")


def _geojson(trip: TripDocument, pins: list[PinDocument]) -> str:
    """GeoJSON FeatureCollection — for developers and GIS tools."""
    import json

    features = []
    for i, pin in enumerate(pins):
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [pin.lng, pin.lat],
                },
                "properties": {
                    "order": i + 1,
                    "name": pin.place_name,
                    "address": pin.address,
                    "city": pin.city,
                    "country_code": pin.country_code,
                    "context_quote": pin.context_quote,
                    "timestamp_hint": pin.timestamp_hint,
                    "confidence": pin.confidence,
                    "notes": pin.notes,
                    "tags": pin.tags,
                },
            }
        )

    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "title": trip.title,
            "source_url": trip.source_url,
            "platform": trip.platform,
            "exported_at": datetime.now(UTC).isoformat(),
            "generated_by": "ReelRoutes",
        },
        "features": features,
    }
    return json.dumps(collection, indent=2, ensure_ascii=False)


def _safe_filename(title: str) -> str:
    """Convert a trip title to a safe filename."""
    import re

    safe = re.sub(r"[^\w\s-]", "", title)
    safe = re.sub(r"[\s]+", "-", safe.strip())
    return safe[:60] or "ReelRoutes-Trip"
