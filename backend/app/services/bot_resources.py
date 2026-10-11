"""Nearby resources over text: lists, MORE, and numbered details. Plain text (SMS).

The session keeps the last list (`BotSession.last_results`) so "2" and "MORE" refer
back to it. Recovery (addiction) is only searched when the client asks for it.
"""

import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import maps
from app.services import resources as svc
from app.services.bot_keywords import strip_accents
from app.services.bot_messages import EN_STRINGS, Strings
from app.services.bot_types import BotImage
from app.services.places import lookup
from app.services.timeutil import aware, local_tz
from app.tables import BotSession, Client

PAGE = 3
MAX_REMEMBERED = 30  # numbered items kept for "N" replies

# Words a client might text -> category. Recovery words map only to explicit asks.
CATEGORY_WORDS = {
    "food": "food", "meal": "food", "meals": "food", "eat": "food", "pantry": "food", "groceries": "food",
    "shelter": "shelter", "bed": "shelter", "beds": "shelter", "housing": "shelter",
    "jobs": "jobs", "job": "jobs", "work": "jobs",
    "classes": "classes", "class": "classes", "ged": "classes",
    "events": "events", "event": "events",
    "recovery": "addiction", "treatment": "addiction", "rehab": "addiction", "detox": "addiction",
    # Spanish (accents stripped before lookup)
    "comida": "food", "comer": "food", "despensa": "food", "alimentos": "food",
    "refugio": "shelter", "refugios": "shelter", "albergue": "shelter", "cama": "shelter", "vivienda": "shelter",
    "trabajo": "jobs", "trabajos": "jobs", "empleo": "jobs",
    "clases": "classes", "clase": "classes",
    "eventos": "events", "evento": "events",
    "recuperacion": "addiction", "tratamiento": "addiction", "rehabilitacion": "addiction",
    "desintoxicacion": "addiction",
}

_FAST = re.compile(
    r"^\s*(?P<cat>[a-z]+)(?:\s+(?:near|by|around|in|at|close to|cerca de|por|en)\s+(?P<place>.+?))?\s*[.!?]?\s*$",
    re.IGNORECASE,
)


@dataclass
class ResourceAsk:
    category: str
    place: Optional[str] = None  # what the client typed after "near"
    text: Optional[str] = None   # optional keyword filter, e.g. "warehouse"


def parse_fast(text: str) -> Optional[ResourceAsk]:
    """'FOOD', 'shelter near West End', 'jobs by five points' -> ResourceAsk."""
    m = _FAST.match(strip_accents(text or "").replace("¿", "").replace("¡", ""))
    if not m:
        return None
    cat = CATEGORY_WORDS.get(m.group("cat").lower())
    if not cat:
        return None
    return ResourceAsk(category=cat, place=m.group("place"))


def _miles(m: Optional[float]) -> Optional[str]:
    if m is None:
        return None
    mi = m / 1609.34
    return f"{mi:.1f} mi" if mi < 10 else f"{mi:.0f} mi"


def _line(n: int, item: dict, L: Strings = EN_STRINGS) -> str:
    bits = [b for b in (
        _miles(item["distance_m"]),
        L.RES_OPEN if item["open_now"] else L.RES_CLOSED if item["open_now"] is False else None,
        L.RES_NEAR_TRANSIT if item["near_transit"] else None,
    ) if b]
    if item["starts_at"]:
        starts = aware(datetime.fromisoformat(item["starts_at"])).astimezone(local_tz())
        bits.insert(0, L.day(starts.date()) + starts.strftime(" %I:%M %p").replace(" 0", " "))
    if item["verification"] != "verified":
        bits.append(L.RES_UNVERIFIED)
    return f"{n}. {item['name']}" + (f" - {', '.join(bits)}" if bits else "")


async def search_reply(
    db: AsyncSession, client: Client, s: BotSession, ask: ResourceAsk, now: datetime, L: Strings = EN_STRINGS
) -> str:
    q = svc.ResourceQuery(categories=[ask.category], q=ask.text)
    if client.has_transportation is False:
        q.near_transit = True  # same as the profile mapping; unknown still passes
    place_label = None
    origin = await resolve_origin(ask.place, client)
    if origin:
        place_label, (q.origin_lat, q.origin_lng) = origin
    if ask.category in svc.EVENT_CATEGORIES:
        q.starts_within_days = 14

    res = await svc.search(db, q, now, limit=PAGE)
    label = L.get(f"CAT_{ask.category}")
    if place_label == "you":
        title = L.get("RES_NEAR_YOU", title=label)
    elif place_label:
        title = L.get("RES_NEAR", title=label, place=place_label)
    else:
        title = label
    if not res["items"]:
        s.last_results = None
        return L.get("RES_NONE", title=title)

    ids = [i["id"] for i in res["items"]]
    s.last_results = {
        "kind": "resources", "title": title, "ids": ids,
        "query": svc.stored(q), "next_cursor": res["next_cursor"],
    }
    lines = [f"{title}:"] + [_line(n, i, L) for n, i in enumerate(res["items"], 1)]
    if ask.place and (not place_label or place_label == "you"):
        lines.append(L.get("RES_UNKNOWN_PLACE", place=ask.place[:40]))
    elif not place_label:
        lines.append(L.RES_HINT_NEAR)
    lines.append(_footer(len(ids), res["next_cursor"], L) + (L.RES_FOOT_MAP if maps.configured() else ""))
    return "\n".join(lines)


async def resolve_origin(place: Optional[str], client: Client) -> Optional[tuple[str, tuple[float, float]]]:
    """(label, (lat, lng)) to measure from: a named place (built-in list, then Google),
    else the client's home address. The home is used for sorting only; its label is
    "you" and it never appears in a map or link."""
    if place:
        found = lookup(place)
        if found:
            return found
        point = await maps.geocode(f"{place}, Atlanta, GA")
        if point:
            return place.strip()[:40], point
    address = maps.client_address(client)
    if address:
        point = await maps.geocode(address)
        if point:
            return "you", point
    return None


def _footer(count: int, more: Optional[str], L: Strings = EN_STRINGS) -> str:
    pick = L.RES_FOOT_ONE if count == 1 else L.get("RES_FOOT_MANY", n=count)
    return pick + (L.RES_FOOT_MORE if more else L.RES_FOOT_END)


async def more_reply(db: AsyncSession, s: BotSession, now: datetime, L: Strings = EN_STRINGS) -> str:
    last = s.last_results or {}
    if last.get("kind") != "resources":
        return L.RES_NO_LIST
    if not last.get("next_cursor"):
        return L.RES_ALL_SHOWN
    q = svc.ResourceQuery(**last["query"], cursor=last["next_cursor"])
    res = await svc.search(db, q, now, limit=PAGE)
    start = len(last["ids"]) + 1
    ids = (last["ids"] + [i["id"] for i in res["items"]])[-MAX_REMEMBERED:]
    s.last_results = {**last, "ids": ids, "next_cursor": res["next_cursor"]}
    title = last["title"]
    lines = [L.get("RES_MORE_HEAD", title=title[0].lower() + title[1:])]
    lines += [_line(start + k, i, L) for k, i in enumerate(res["items"])]
    lines.append(_footer(len(ids), res["next_cursor"], L))
    return "\n".join(lines)




def _clock(hhmm: str) -> str:
    h, m = map(int, hhmm.split(":"))
    return f"{h % 12 or 12}{':%02d' % m if m else ''} {'AM' if h < 12 else 'PM'}"


def _hours_today(r: dict, now: datetime, L: Strings = EN_STRINGS) -> Optional[str]:
    today = now.astimezone(local_tz()).weekday()
    spans = [h for h in r["hours"] if h["day"] == today]
    if not spans:
        return L.RES_CLOSED_TODAY if r["hours"] else None
    return L.get("RES_TODAY_HOURS", spans=", ".join(f"{_clock(h['opens'])}-{_clock(h['closes'])}" for h in spans))


def _phone(e164: str) -> str:
    d = e164[-10:]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}" if e164.startswith("+1") and len(e164) == 12 else e164


async def detail_reply(
    db: AsyncSession, client: Client, s: BotSession, n: int, now: datetime, L: Strings = EN_STRINGS
) -> str:
    last = s.last_results or {}
    ids = last.get("ids") or []
    if last.get("kind") != "resources" or not ids:
        return L.RES_NEED_LIST
    if not 1 <= n <= len(ids):
        return L.RES_PICK_ONE if len(ids) == 1 else L.get("RES_PICK_N", n=len(ids))
    r = await svc.get_resource(db, uuid.UUID(ids[n - 1]))
    if r is None:
        return L.RES_GONE
    checks = {c["document"]: c["status"] for c in await svc.document_checks(db, client.id, r)}
    d = svc.detail(r)
    category = r.category.value

    lines = [d["name"]]
    if d["address"]:
        a = d["address"]
        lines.append(f"{a['street']}, {a['city']}")
    if d["phone"]:
        lines.append(L.get("RES_CALL", phone=_phone(d["phone"])))
    hours = _hours_today(d, now, L)
    if hours:
        lines.append(hours)
    if d["hours_note"]:
        lines.append(d["hours_note"])

    serves = []
    if d["gender"] in ("men", "women"):
        serves.append(L.get(f"SERVES_{d['gender']}"))
    if d["families_welcome"] == "yes":
        serves.append(L.SERVES_FAMILIES)
    if d["records_policy"] == "accepted":
        serves.append(L.SERVES_RECORDS_OK)
    elif d["records_policy"] == "case_by_case":
        serves.append(L.SERVES_RECORDS_CASE)
    if d["cost_type"] == "free" and category != "jobs":
        serves.append(L.SERVES_FREE)
    if serves:
        lines.append((L.RES_HIRING if category == "jobs" else L.RES_SERVES) + ", ".join(serves))

    details = d["details"]
    if category == "jobs":
        for k in ("pay_note", "shift_note"):
            if details.get(k):
                lines.append(details[k])
    if category in svc.EVENT_CATEGORIES and details.get("recurrence"):
        lines.append(details["recurrence"])

    if d["required_documents"]:
        parts = []
        for doc in d["required_documents"]:
            try:
                name = L.get(f"DOC_{doc}")
            except KeyError:
                name = doc.replace("_", " ")
            status = checks.get(doc)
            if status == "missing":
                name += L.DOC_MISSING
            elif status == "expired":
                name += L.DOC_EXPIRED
            parts.append(name)
        lines.append(L.RES_BRING + "; ".join(parts))

    if d["location"]:
        lines.append(L.RES_DIRECTIONS + maps.directions_url(d["location"]["lat"], d["location"]["lng"]))
    if d["nearest_stops"]:
        stop = d["nearest_stops"][0]
        lines.append(L.get("RES_NEAREST_STOP", stop=stop["stop_name"], dist=_miles(stop["distance_m"])))

    if d["verification"] == "verified":
        if d["last_verified_at"]:
            v = aware(datetime.fromisoformat(d["last_verified_at"])).astimezone(local_tz())
            lines.append(L.get("RES_CHECKED_ON", date=L.short_date(v.date())))
        else:
            lines.append(L.RES_CHECKED)
    else:
        lines.append(L.RES_UNVERIFIED_LONG)
    return "\n".join(lines)


async def map_reply(db: AsyncSession, s: BotSession, L: Strings = EN_STRINGS) -> list:
    """Map of the current list (numbered like the list) plus a directions link each."""
    last = s.last_results or {}
    ids = (last.get("ids") or [])[: maps.MAX_MARKERS]
    if last.get("kind") != "resources" or not ids:
        return [L.MAP_NEED_LIST]
    points, stops, lines, no_address = [], [], [L.get("MAP_HEAD", title=last["title"])], []
    for n, rid in enumerate(ids, 1):
        r = await svc.get_resource(db, uuid.UUID(rid))
        if r is None or r.lat is None or r.lng is None:
            no_address.append(str(n))
            continue
        points.append(maps.MapPoint(str(n), r.lat, r.lng))
        stops += [(st["lat"], st["lng"]) for st in (r.nearest_stops or [])[:1]]
        lines.append(f"{n}. {r.name}: {maps.directions_url(r.lat, r.lng)}")
    if not points:
        return [L.MAP_NONE]
    if no_address:
        lines.append(L.get("MAP_NO_ADDRESS", nums=", ".join(no_address)))
    if len(last.get("ids") or []) > maps.MAX_MARKERS:
        lines.append(L.get("MAP_FIRST_N", n=maps.MAX_MARKERS))
    png = await maps.static_map_png(points, list(dict.fromkeys(stops)))
    if png is None:
        lines.insert(1, L.MAP_NO_PICTURE)
        return ["\n".join(lines)]
    return ["\n".join(lines), BotImage(png)]
