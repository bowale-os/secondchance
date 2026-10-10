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
}
LABEL = {
    "food": "Food", "shelter": "Shelters", "jobs": "Fair-chance jobs", "classes": "Classes",
    "events": "Events", "addiction": "Recovery help",
}

_FAST = re.compile(
    r"^\s*(?P<cat>[a-z]+)(?:\s+(?:near|by|around|in|at|close to)\s+(?P<place>.+?))?\s*[.!?]?\s*$",
    re.IGNORECASE,
)


@dataclass
class ResourceAsk:
    category: str
    place: Optional[str] = None  # what the client typed after "near"
    text: Optional[str] = None   # optional keyword filter, e.g. "warehouse"


def parse_fast(text: str) -> Optional[ResourceAsk]:
    """'FOOD', 'shelter near West End', 'jobs by five points' -> ResourceAsk."""
    m = _FAST.match(text or "")
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


def _line(n: int, item: dict) -> str:
    bits = [b for b in (
        _miles(item["distance_m"]),
        "open now" if item["open_now"] else "closed now" if item["open_now"] is False else None,
        "near rail/bus" if item["near_transit"] else None,
    ) if b]
    if item["starts_at"]:
        starts = aware(datetime.fromisoformat(item["starts_at"])).astimezone(local_tz())
        bits.insert(0, starts.strftime("%a %b ") + str(starts.day) + starts.strftime(" %I:%M %p").replace(" 0", " "))
    if item["verification"] != "verified":
        bits.append("not verified yet")
    return f"{n}. {item['name']}" + (f" - {', '.join(bits)}" if bits else "")


async def search_reply(
    db: AsyncSession, client: Client, s: BotSession, ask: ResourceAsk, now: datetime
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
    title = LABEL[ask.category] + (f" near {place_label}" if place_label else "")
    if not res["items"]:
        s.last_results = None
        return f"{title}: I couldn't find any right now. Reply MENU for other options or ask your case worker."

    ids = [i["id"] for i in res["items"]]
    s.last_results = {
        "kind": "resources", "title": title, "ids": ids,
        "query": _store(q), "next_cursor": res["next_cursor"],
    }
    lines = [f"{title}:"] + [_line(n, i) for n, i in enumerate(res["items"], 1)]
    if ask.place and (not place_label or place_label == "you"):
        lines.append(f"(I couldn't find \"{ask.place[:40]}\", so these aren't sorted from there. Try a MARTA station name.)")
    elif not place_label:
        lines.append("Add \"near\" and a MARTA station to sort by distance, like FOOD near West End.")
    lines.append(_footer(len(ids), res["next_cursor"]) + (" MAP for a map." if maps.configured() else ""))
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


def _footer(count: int, more: Optional[str]) -> str:
    pick = "Reply 1 for details" if count == 1 else f"Reply 1-{count} for details"
    return pick + (", MORE for more." if more else ".")


def _store(q: svc.ResourceQuery) -> dict:
    return {k: getattr(q, k) for k in q.__dataclass_fields__ if k != "cursor"}


async def more_reply(db: AsyncSession, s: BotSession, now: datetime) -> str:
    last = s.last_results or {}
    if last.get("kind") != "resources":
        return "There's no list to continue. Try FOOD, SHELTER or JOBS."
    if not last.get("next_cursor"):
        return "That's everything I found. Reply MENU for other options."
    q = svc.ResourceQuery(**last["query"], cursor=last["next_cursor"])
    res = await svc.search(db, q, now, limit=PAGE)
    start = len(last["ids"]) + 1
    ids = (last["ids"] + [i["id"] for i in res["items"]])[-MAX_REMEMBERED:]
    s.last_results = {**last, "ids": ids, "next_cursor": res["next_cursor"]}
    title = last["title"]
    lines = [f"More {title[0].lower()}{title[1:]}:"] + [_line(start + k, i) for k, i in enumerate(res["items"])]
    lines.append(_footer(len(ids), res["next_cursor"]))
    return "\n".join(lines)


_DOC_NAMES = {
    "photo_id": "a photo ID", "ssn_card": "your Social Security card", "birth_certificate": "your birth certificate",
    "proof_of_income": "proof of income", "proof_of_address": "proof of address",
    "release_papers": "your release papers", "referral_letter": "a referral letter",
}
_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _clock(hhmm: str) -> str:
    h, m = map(int, hhmm.split(":"))
    return f"{h % 12 or 12}{':%02d' % m if m else ''} {'AM' if h < 12 else 'PM'}"


def _hours_today(r: dict, now: datetime) -> Optional[str]:
    today = now.astimezone(local_tz()).weekday()
    spans = [h for h in r["hours"] if h["day"] == today]
    if not spans:
        return "Closed today" if r["hours"] else None
    return "Today " + ", ".join(f"{_clock(h['opens'])}-{_clock(h['closes'])}" for h in spans)


def _phone(e164: str) -> str:
    d = e164[-10:]
    return f"({d[:3]}) {d[3:6]}-{d[6:]}" if e164.startswith("+1") and len(e164) == 12 else e164


async def detail_reply(db: AsyncSession, client: Client, s: BotSession, n: int, now: datetime) -> str:
    last = s.last_results or {}
    ids = last.get("ids") or []
    if last.get("kind") != "resources" or not ids:
        return "Send FOOD, SHELTER or JOBS first, then a number for details."
    if not 1 <= n <= len(ids):
        return "Reply 1 for details." if len(ids) == 1 else f"Pick a number from 1 to {len(ids)}."
    r = await svc.get_resource(db, uuid.UUID(ids[n - 1]))
    if r is None:
        return "That place isn't listed anymore. Reply MORE or try another number."
    checks = {c["document"]: c["status"] for c in await svc.document_checks(db, client.id, r)}
    d = svc.detail(r)

    lines = [d["name"]]
    if d["address"]:
        a = d["address"]
        lines.append(f"{a['street']}, {a['city']}")
    if d["phone"]:
        lines.append(f"Call {_phone(d['phone'])}")
    hours = _hours_today(d, now)
    if hours:
        lines.append(hours)
    if d["hours_note"]:
        lines.append(d["hours_note"])

    serves = []
    if d["gender"] in ("men", "women"):
        serves.append(f"{d['gender']} only")
    if d["families_welcome"] == "yes":
        serves.append("families welcome")
    if d["records_policy"] == "accepted":
        serves.append("accepts people with records")
    elif d["records_policy"] == "case_by_case":
        serves.append("records: case by case")
    if d["cost_type"] == "free" and r.category != "jobs":
        serves.append("free")
    if serves:
        lines.append(("Hiring: " if r.category == "jobs" else "Serves: ") + ", ".join(serves))

    details = d["details"]
    if r.category == "jobs":
        for k in ("pay_note", "shift_note"):
            if details.get(k):
                lines.append(details[k])
    if r.category in svc.EVENT_CATEGORIES and details.get("recurrence"):
        lines.append(details["recurrence"])

    if d["required_documents"]:
        parts = []
        for doc in d["required_documents"]:
            name = _DOC_NAMES.get(doc, doc)
            status = checks.get(doc)
            if status == "missing":
                name += " (we don't have one on file)"
            elif status == "expired":
                name += " (yours on file is expired)"
            parts.append(name)
        lines.append("Bring: " + "; ".join(parts))

    if d["location"]:
        lines.append("Directions: " + maps.directions_url(d["location"]["lat"], d["location"]["lng"]))
    if d["nearest_stops"]:
        stop = d["nearest_stops"][0]
        lines.append(f"Nearest stop: {stop['stop_name']} ({_miles(stop['distance_m'])})")

    if d["verification"] == "verified":
        if d["last_verified_at"]:
            v = aware(datetime.fromisoformat(d["last_verified_at"])).astimezone(local_tz())
            lines.append(f"Checked by staff {v.strftime('%b')} {v.day}.")
        else:
            lines.append("Checked by staff.")
    else:
        lines.append("Not verified yet: call before you go.")
    return "\n".join(lines)


async def map_reply(db: AsyncSession, s: BotSession) -> list:
    """Map of the current list (numbered like the list) plus a directions link each."""
    last = s.last_results or {}
    ids = (last.get("ids") or [])[: maps.MAX_MARKERS]
    if last.get("kind") != "resources" or not ids:
        return ["Send FOOD, SHELTER or JOBS first, then MAP."]
    points, stops, lines, no_address = [], [], [f"Map: {last['title']}"], []
    for n, rid in enumerate(ids, 1):
        r = await svc.get_resource(db, uuid.UUID(rid))
        if r is None or r.lat is None or r.lng is None:
            no_address.append(str(n))
            continue
        points.append(maps.MapPoint(str(n), r.lat, r.lng))
        stops += [(st["lat"], st["lng"]) for st in (r.nearest_stops or [])[:1]]
        lines.append(f"{n}. {r.name}: {maps.directions_url(r.lat, r.lng)}")
    if not points:
        return ["None of these places have an address to map. Reply a number for details."]
    if no_address:
        lines.append(f"No address for {', '.join(no_address)} (call instead).")
    if len(last.get("ids") or []) > maps.MAX_MARKERS:
        lines.append(f"Showing the first {maps.MAX_MARKERS}.")
    png = await maps.static_map_png(points, list(dict.fromkeys(stops)))
    if png is None:
        lines.insert(1, "(Map picture unavailable right now; links below.)")
        return ["\n".join(lines)]
    return ["\n".join(lines), BotImage(png)]
