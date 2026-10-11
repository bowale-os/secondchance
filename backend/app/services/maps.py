"""Google Maps Platform: geocoding, static map images, and directions links.

Privacy rules (from the text-bot plan):
- The client's home is geocoded server-side only, to sort results by distance. It is
  never drawn on a map image and never put in a link.
- Static maps show only the resources (numbered to match the text list), auto-fitted,
  so the map is centered on the results, not on the client.
- Directions links set only the destination; the phone fills in "current location".

Everything degrades gracefully: with no MAPS_API_KEY or on any API error, geocoding
returns None and maps return None, and callers fall back to text.
"""

import logging
import re
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlencode

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
STATIC_URL = "https://maps.googleapis.com/maps/api/staticmap"
# Bias results to metro Atlanta.
ATL_BOUNDS = "33.50,-84.65|34.05,-84.10"
CACHE_TTL_S = 24 * 3600
MAX_MARKERS = 9  # single-character labels 1-9 match the list numbers

_cache: dict[str, tuple[float, Optional[tuple[float, float]]]] = {}


def configured() -> bool:
    return bool(get_settings().maps_api_key.get_secret_value())


def _key() -> str:
    return get_settings().maps_api_key.get_secret_value()


def _norm(address: str) -> str:
    return " ".join(re.sub(r"[^\w ]", " ", address.lower()).split())


async def geocode(address: str, http: Optional[httpx.AsyncClient] = None) -> Optional[tuple[float, float]]:
    """(lat, lng) for an address or place in Georgia, or None. Cached for a day."""
    if not configured() or not address.strip():
        return None
    k = _norm(address)
    hit = _cache.get(k)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    params = {
        "address": address,
        "components": "country:US|administrative_area:GA",
        "bounds": ATL_BOUNDS,
        "key": _key(),
    }
    result: Optional[tuple[float, float]] = None
    try:
        async with (http or httpx.AsyncClient(timeout=6)) as client:
            r = await client.get(GEOCODE_URL, params=params)
            r.raise_for_status()
            data = r.json()
        if data.get("status") == "OK" and data.get("results"):
            loc = data["results"][0]["geometry"]["location"]
            result = (float(loc["lat"]), float(loc["lng"]))
        elif data.get("status") not in ("ZERO_RESULTS",):
            logger.warning("Geocoding status %s", data.get("status"))
            return None  # don't cache errors (quota, bad key)
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        logger.warning("Geocoding failed: %s", type(exc).__name__)
        return None
    _cache[k] = (time.monotonic() + CACHE_TTL_S, result)
    return result


def client_address(client) -> Optional[str]:
    parts = [client.address_line, client.city, client.zip_code]
    if not client.address_line:
        return None
    return ", ".join(p for p in parts if p) + (", GA" if client.state == "GA" else "")


@dataclass
class MapPoint:
    label: str        # "1".."9"
    lat: float
    lng: float


def static_map_url(points: list[MapPoint], stops: list[tuple[float, float]] = ()) -> str:
    """Numbered red markers for resources, small blue dots for transit stops. No center
    or zoom: Google fits the view to the markers, so the client's home never anchors it."""
    params: list[tuple[str, str]] = [
        ("size", "640x640"), ("scale", "2"), ("maptype", "roadmap"),
        ("style", "feature:poi|visibility:off"),
    ]
    for p in points[:MAX_MARKERS]:
        params.append(("markers", f"color:red|label:{p.label}|{p.lat:.5f},{p.lng:.5f}"))
    if stops:
        params.append(("markers", "size:tiny|color:blue|" + "|".join(f"{a:.5f},{b:.5f}" for a, b in stops[:15])))
    params.append(("key", _key()))
    return f"{STATIC_URL}?{urlencode(params)}"


async def static_map_png(
    points: list[MapPoint], stops: list[tuple[float, float]] = (), http: Optional[httpx.AsyncClient] = None
) -> Optional[bytes]:
    """PNG bytes, or None if maps aren't configured or the request fails. Fetched
    server-side so the API key never leaves the backend."""
    if not configured() or not points:
        return None
    try:
        async with (http or httpx.AsyncClient(timeout=10)) as client:
            r = await client.get(static_map_url(points, stops))
            r.raise_for_status()
            if not r.headers.get("content-type", "").startswith("image/"):
                return None
            return r.content
    except httpx.HTTPError as exc:
        logger.warning("Static map failed: %s", type(exc).__name__)
        return None


def directions_url(lat: float, lng: float) -> str:
    """Transit directions from the phone's current location. No origin on purpose."""
    return "https://www.google.com/maps/dir/?" + urlencode(
        {"api": "1", "destination": f"{lat:.5f},{lng:.5f}", "travelmode": "transit"}
    )
