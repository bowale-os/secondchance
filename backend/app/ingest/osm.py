"""
OpenStreetMap (Overpass API): shelters, food banks and soup kitchens -> SHELTER / FOOD resources.

Free and keyless. Volunteer-edited, so every field it fills is marked LOW confidence.
    POST https://overpass-api.de/api/interpreter
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.ingest.common import IngestError, clean, normalize_phone, normalize_url, to_float
from app.schemas import Address, FieldMeta, FoodDetails, LatLng, OpeningHours, ResourceUpsert, ShelterDetails
from app.tables import (
    Confidence,
    CostType,
    FieldSource,
    FoodKind,
    Gender,
    ResourceCategory,
    ScrapeSource,
    Tri,
)

logger = logging.getLogger(__name__)

SOURCE = ScrapeSource.OSM
URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
SOURCE_URL = "https://www.openstreetmap.org/"

FOOD_FACILITIES = {"food_bank", "soup_kitchen"}
FACILITIES = FOOD_FACILITIES | {"shelter"}
CHILD_ONLY = {"child", "juvenile", "orphan"}
DAYS = ["mo", "tu", "we", "th", "fr", "sa", "su"]


def build_query(lat: str, lng: str, radius_m: float) -> str:
    around = f"(around:{int(radius_m)},{lat},{lng})"
    return (
        "[out:json][timeout:60];("
        f'nwr{around}["amenity"="social_facility"]["social_facility"~"^(shelter|food_bank|soup_kitchen)$"];'
        f'nwr{around}["amenity"="food_bank"];'
        ");out center tags;"
    )


async def fetch(http: httpx.AsyncClient) -> list[dict[str, Any]]:
    s = get_settings()
    lat, lng = (p.strip() for p in s.ingest_center.split(","))
    resp = None
    for url in URLS:  # the public servers are often busy (429/504), so try the next mirror
        resp = await http.post(
            url,
            data={"data": build_query(lat, lng, s.ingest_radius_m)},
            headers={"user-agent": s.ingest_user_agent, "accept": "application/json"},
            timeout=90,
        )
        if resp.status_code == 200 and "json" in resp.headers.get("content-type", "").lower():
            break
        logger.warning("Overpass %s returned HTTP %s", url, resp.status_code)
    else:
        raise IngestError(f"Overpass returned HTTP {resp.status_code}: {resp.text[:120]!r}")
    data = resp.json()
    if not isinstance(data, dict) or not isinstance(data.get("elements"), list):
        raise IngestError("Overpass response has no 'elements' list")
    return data["elements"]


def parse_hours(text: str) -> list[OpeningHours]:
    """The common cases of OSM opening_hours ("Mo-Fr 09:00-17:00; Sa 10:00-14:00").
    Anything fancier (holidays, "sunrise", week numbers) returns [] and the raw text is kept as a note."""
    out: list[OpeningHours] = []
    for rule in text.lower().split(";"):
        m = re.fullmatch(r"\s*([a-z, -]+?)\s+((?:\d{1,2}:\d{2}-\d{1,2}:\d{2}\s*,?\s*)+)", rule)
        if not m:
            return []
        days: set[int] = set()
        for part in m.group(1).replace(" ", "").split(","):
            a, _, b = part.partition("-")
            if a not in DAYS or (b and b not in DAYS):
                return []
            i, j = DAYS.index(a), DAYS.index(b or a)
            days.update(range(i, j + 1) if i <= j else [*range(i, 7), *range(0, j + 1)])
        for span in re.findall(r"(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})", m.group(2)):
            oh, om, ch, cm = (int(x) for x in span)
            if oh > 23 or ch > 24 or om > 59 or cm > 59:
                return []
            closes = "23:59" if (ch, cm) in ((24, 0), (0, 0)) else f"{ch:02d}:{cm:02d}"
            for d in sorted(days):
                out.append(OpeningHours(day=d, opens=f"{oh:02d}:{om:02d}", closes=closes))
    return out


def normalize(el: dict[str, Any], now: Optional[datetime] = None) -> Optional[ResourceUpsert]:
    """One Overpass element -> ResourceUpsert, or None if it is not useful to our clients."""
    tags: dict[str, str] = el.get("tags") or {}
    name = clean(tags.get("name"), 255)
    if not name:
        return None
    facility = tags.get("social_facility") or tags.get("amenity")
    if facility not in FACILITIES:
        return None

    audience = {a.strip() for a in re.split(r"[;,]", tags.get("social_facility:for", "").lower()) if a.strip()}
    if audience and audience <= CHILD_ONLY:
        return None

    meta: dict[str, FieldMeta] = {}
    low = lambda field: meta.__setitem__(field, FieldMeta(FieldSource.SCRAPED, Confidence.LOW))

    is_food = facility in FOOD_FACILITIES
    category = ResourceCategory.FOOD if is_food else ResourceCategory.SHELTER
    details = (FoodDetails(kind=[FoodKind.HOT_MEAL if facility == "soup_kitchen" else FoodKind.PANTRY])
               if is_food else ShelterDetails())

    gender = Gender.UNKNOWN
    if "woman" in audience or "women" in audience or tags.get("female") == "yes":
        gender = Gender.WOMEN
    elif "male" in audience or "men" in audience or tags.get("male") == "yes":
        gender = Gender.MEN
    if gender is not Gender.UNKNOWN:
        low("gender")

    families = Tri.YES if "family" in audience or "families" in audience else Tri.UNKNOWN
    if families is Tri.YES:
        low("families_welcome")

    fee = tags.get("fee")
    cost = CostType.FREE if fee == "no" else CostType.FEE if fee == "yes" else CostType.UNKNOWN
    if cost is not CostType.UNKNOWN:
        low("cost_type")

    hours_text = clean(tags.get("opening_hours"), 255)
    hours = parse_hours(hours_text) if hours_text else []
    if hours:
        low("hours")

    street = " ".join(p for p in (clean(tags.get("addr:housenumber")), clean(tags.get("addr:street"))) if p)
    address = (
        Address(street=street[:255], city=clean(tags.get("addr:city"), 100) or "",
                state=(clean(tags.get("addr:state")) or "GA")[:2].upper(),
                zip=(clean(tags.get("addr:postcode")) or "")[:10])
        if street else None
    )

    center = el.get("center") or el
    lat, lng = to_float(center.get("lat")), to_float(center.get("lon"))

    return ResourceUpsert(
        name=name,
        category=category,
        source=SOURCE,
        description=clean(tags.get("description"), 300),
        address=address,
        location=LatLng(lat, lng) if lat is not None and lng is not None else None,
        phone=normalize_phone(tags.get("phone") or tags.get("contact:phone")),
        website=normalize_url(tags.get("website") or tags.get("contact:website")),
        hours=hours,
        hours_note=None if hours else hours_text,
        gender=gender,
        families_welcome=families,
        cost_type=cost,
        details=details,
        source_url=f"https://www.openstreetmap.org/{el.get('type', 'node')}/{el.get('id')}",
        scraped_at=now or datetime.now(timezone.utc),
        field_meta=meta,
    )


async def collect(http: httpx.AsyncClient) -> tuple[list[ResourceUpsert], int]:
    """Fetch and normalize. Returns (resources, elements fetched)."""
    elements = await fetch(http)
    now = datetime.now(timezone.utc)
    items = []
    for el in elements:
        try:
            item = normalize(el, now)
        except Exception:
            logger.exception("Could not normalize OSM element %s/%s", el.get("type"), el.get("id"))
            continue
        if item:
            items.append(item)
    return items, len(elements)
