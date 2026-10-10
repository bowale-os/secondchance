"""
Feed America (feedam.org): food pantries, food banks, soup kitchens, mobile pantries and
community fridges -> FOOD resources.

Public JSON API, keyless, published under CC BY 4.0 with its robots.txt allowing the data
endpoints. Attribution is kept in `source_url` (each resource links to its feedam.org page).
    GET https://feedam.org/api/resources/bulk?state=GA&type=food_pantry&limit=1000&page=1

Feed America itself aggregates other directories (211, Plentiful, FoodPantries.org), so every
field it fills is marked LOW confidence; only a case worker's check raises that.
"""

import json
import logging
import math
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.ingest.common import IngestError, clean, normalize_phone, normalize_url, to_float
from app.schemas import Address, FieldMeta, FoodDetails, LatLng, OpeningHours, ResourceUpsert
from app.tables import Confidence, FieldSource, FoodKind, ResourceCategory, ScrapeSource

logger = logging.getLogger(__name__)

SOURCE = ScrapeSource.FEED_AMERICA
URL = "https://feedam.org/api/resources/bulk"
RESOURCE_URL = "https://feedam.org/resource/{id}"
PAGE_SIZE = 1000  # the API's maximum
MAX_PAGES = 10

# Feed America resource_type -> what kind of food help it is
TYPES = {
    "food_pantry": FoodKind.PANTRY,
    "food_bank": FoodKind.PANTRY,
    "mobile_pantry": FoodKind.PANTRY,
    "community_fridge": FoodKind.PANTRY,
    "soup_kitchen": FoodKind.HOT_MEAL,
}

DAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
TIME = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?"
SPAN = re.compile(rf"{TIME}\s*(?:-|–|to)\s*{TIME}", re.I)


async def fetch(http: httpx.AsyncClient) -> list[dict[str, Any]]:
    """Every listing of each food type in the configured state, following the pagination."""
    s = get_settings()
    rows: list[dict[str, Any]] = []
    for rtype in TYPES:
        for page in range(1, MAX_PAGES + 1):
            resp = await http.get(
                URL,
                params={"state": s.ingest_state.upper(), "type": rtype, "limit": PAGE_SIZE, "page": page},
                headers={"user-agent": s.ingest_user_agent, "accept": "application/json"},
                timeout=60,
            )
            if resp.status_code != 200 or "json" not in resp.headers.get("content-type", "").lower():
                raise IngestError(f"Feed America returned HTTP {resp.status_code}: {resp.text[:120]!r}")
            data = resp.json()
            if not isinstance(data, dict) or not isinstance(data.get("resources"), list):
                raise IngestError("Feed America response has no 'resources' list")
            rows.extend(data["resources"])
            if len(data["resources"]) < PAGE_SIZE:
                break
    return rows


def _day_range(key: str) -> Optional[list[int]]:
    """"wednesday" -> [2]; "mon-fri" -> [0..4]; "daily" -> all seven. None if not a day."""
    key = key.strip().lower()
    if key in ("daily", "everyday", "every day"):
        return list(range(7))
    a, _, b = key.partition("-")
    a, b = a.strip(), b.strip()
    if a[:3] not in DAY_NAMES or (b and b[:3] not in DAY_NAMES):
        return None
    i, j = DAY_NAMES.index(a[:3]), DAY_NAMES.index((b or a)[:3])
    return list(range(i, j + 1)) if i <= j else [*range(i, 7), *range(0, j + 1)]


def _clock(hour: str, minute: Optional[str], mer: Optional[str]) -> Optional[tuple[int, int, bool]]:
    """(hour 0-23, minute, had am/pm), or None if it is not a real time."""
    h, m = int(hour), int(minute or 0)
    meridiem = mer.lower().replace(".", "") if mer else None
    if m > 59 or h > 24 or (meridiem and not 1 <= h <= 12):
        return None
    if meridiem == "pm" and h != 12:
        h += 12
    elif meridiem == "am" and h == 12:
        h = 0
    return h, m, meridiem is not None


def parse_hours(raw: Any) -> list[OpeningHours]:
    """Feed America's hours_json ({"mon-fri": "9am-2pm", "thursday": "10:00-14:00, 16:00-18:00"}).
    Anything it cannot read in full returns [] and the caller keeps the raw text as a note."""
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except ValueError:
        return []
    if not isinstance(data, dict):
        return []
    out: list[OpeningHours] = []
    for key, value in data.items():
        days = _day_range(str(key))
        spans = SPAN.findall(str(value))
        if days is None or not spans:
            return []
        for span in spans:
            start, end = _clock(*span[:3]), _clock(*span[3:])
            if not start or not end:
                return []
            oh, om, _ = start
            ch, cm, end_has_mer = end[0], end[1], end[2]
            # "9-5" with no am/pm: a closing hour before the opening one means the afternoon
            if not start[2] and not end_has_mer and ch < oh and ch < 12:
                ch += 12
            if (oh, om) == (ch, cm):
                return []
            closes = "23:59" if ch >= 24 else f"{ch:02d}:{cm:02d}"
            out.extend(OpeningHours(day=d, opens=f"{oh:02d}:{om:02d}", closes=closes) for d in days)
    return out


def _meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1) * math.cos(math.radians((lat1 + lat2) / 2))
    return 6371000 * math.hypot(dlat, dlng)


def _hours_note(raw: Any) -> Optional[str]:
    """What the listing said about hours, for when the times could not be read."""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return clean(raw, 255)
    return clean("; ".join(f"{k}: {v}" for k, v in data.items()), 255) if isinstance(data, dict) else None


def normalize(row: dict[str, Any], now: Optional[datetime] = None) -> Optional[ResourceUpsert]:
    """One Feed America listing -> ResourceUpsert, or None if it is not useful to our clients."""
    kind = TYPES.get(str(row.get("resource_type")))
    name = clean(row.get("name"), 255)
    if kind is None or not name or row.get("id") is None:
        return None

    meta: dict[str, FieldMeta] = {}
    hours = parse_hours(row.get("hours_json"))
    if hours:
        meta["hours"] = FieldMeta(FieldSource.SCRAPED, Confidence.LOW)
    hours_note = None if hours or not row.get("hours_json") else _hours_note(row["hours_json"])

    street = clean(row.get("address"), 255)
    address = (
        Address(street=street, city=clean(row.get("city"), 100) or "",
                state=(clean(row.get("state")) or "GA")[:2].upper(), zip=(clean(row.get("zip")) or "")[:10])
        if street else None
    )
    lat, lng = to_float(row.get("lat")), to_float(row.get("lng"))

    return ResourceUpsert(
        name=name,
        category=ResourceCategory.FOOD,
        source=SOURCE,
        address=address,
        location=LatLng(lat, lng) if lat is not None and lng is not None else None,
        phone=normalize_phone(row.get("phone")),
        website=normalize_url(row.get("website")),
        hours=hours,
        hours_note=hours_note,
        details=FoodDetails(kind=[kind]),
        source_url=RESOURCE_URL.format(id=row["id"]),
        scraped_at=now or datetime.now(timezone.utc),
        field_meta=meta,
    )


async def collect(http: httpx.AsyncClient) -> tuple[list[ResourceUpsert], int]:
    """Fetch and normalize, keeping places inside the configured radius. Returns (resources, rows fetched)."""
    s = get_settings()
    clat, clng = (float(p) for p in s.ingest_center.split(","))
    rows = await fetch(http)
    now = datetime.now(timezone.utc)
    items = []
    for row in rows:
        try:
            item = normalize(row, now)
        except Exception:
            logger.exception("Could not normalize Feed America row %s", row.get("id"))
            continue
        if item is None:
            continue
        if item.location and _meters(clat, clng, item.location.lat, item.location.lng) > s.ingest_radius_m:
            continue
        items.append(item)
    return items, len(rows)
