"""Resource search, detail and client matching. Shared by the HTTP routes (staff,
client portal) and the text bot. Callers authorize; this module does no access checks.

Rules carried over from frontend/src/types/resource.types.ts:
- Filters never exclude on "unknown", only on a definite mismatch.
- Recovery (addiction) is never inferred from a client's profile.
"""

import base64
import math
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.timeutil import aware, local_tz
from app.tables import (
    Client,
    ClientId,
    Document,
    DocumentType,
    EmploymentStatus,
    HousingStatus,
    IdStatus,
    IdType,
    Resource,
)

CATEGORIES = ("shelter", "food", "jobs", "addiction", "classes", "events")
EVENT_CATEGORIES = ("classes", "events")
NEAR_TRANSIT_M = 1609
PAGE_SIZE = 20

SHELTER_HOUSING = {HousingStatus.SHELTER, HousingStatus.UNSTABLE, HousingStatus.HOMELESS, HousingStatus.TRANSITIONAL}
JOB_EMPLOYMENT = {EmploymentStatus.SEEKING, EmploymentStatus.NOT_WORKING}


# ---------- query ----------

@dataclass
class ResourceQuery:
    q: Optional[str] = None
    categories: list[str] = field(default_factory=list)
    near_transit: Optional[bool] = None
    open_now: Optional[bool] = None
    no_id_required: Optional[bool] = None
    records_accepted: Optional[bool] = None
    gender: Optional[str] = None
    families: Optional[bool] = None
    free_only: Optional[bool] = None
    language: Optional[str] = None
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    radius_m: Optional[float] = None
    starts_within_days: Optional[int] = None
    cursor: Optional[str] = None

    def to_api(self) -> dict:
        """Frontend ResourceQuery shape (origin as {lat, lng}, unset keys dropped)."""
        out: dict[str, Any] = {}
        for k in ("q", "near_transit", "open_now", "no_id_required", "records_accepted", "gender",
                  "families", "free_only", "language", "radius_m", "starts_within_days", "cursor"):
            v = getattr(self, k)
            if v not in (None, ""):
                out[k] = v
        if self.categories:
            out["categories"] = list(self.categories)
        if self.origin_lat is not None and self.origin_lng is not None:
            out["origin"] = {"lat": self.origin_lat, "lng": self.origin_lng}
        return out


_BOOL_KEYS = {"near_transit", "open_now", "no_id_required", "records_accepted", "families", "free_only"}


class QueryError(ValueError):
    pass


def parse_query(params, explicit: bool = False) -> tuple[ResourceQuery, set[str]]:
    """Parse query-string params (a Starlette QueryParams or MultiDict) into a query and
    the set of keys the caller set. With explicit=False, false/"" mean "not set"; with
    explicit=True they are kept as "turn this filter off" (client-match overrides)."""
    q = ResourceQuery()
    provided: set[str] = set()

    def flag(raw: str) -> bool:
        if raw.lower() in ("true", "1", "yes"):
            return True
        if raw.lower() in ("false", "0", "no", ""):
            return False
        raise QueryError(f"not a boolean: {raw!r}")

    for key in params.keys():
        values = params.getlist(key)
        raw = values[-1] if values else ""
        try:
            if key == "categories":
                cats = [c for c in values if c]
                bad = [c for c in cats if c not in CATEGORIES]
                if bad:
                    raise QueryError(f"unknown category: {bad[0]}")
                if cats:
                    q.categories = cats
                    provided.add(key)
                continue
            if key in _BOOL_KEYS:
                v = flag(raw)
                if v or explicit:
                    setattr(q, key, v)
                    provided.add(key)
            elif key in ("q", "language", "gender", "cursor"):
                if raw or explicit:
                    setattr(q, key, raw.strip() or None)
                    provided.add(key)
            elif key in ("origin_lat", "origin_lng", "radius_m"):
                setattr(q, key, float(raw))
                provided.add("origin" if key.startswith("origin") else key)
            elif key == "starts_within_days":
                q.starts_within_days = int(raw)
                provided.add(key)
            # unknown keys (e.g. client_id) are ignored here
        except ValueError as exc:
            raise QueryError(f"bad value for {key}: {exc}") from exc
    if q.gender and q.gender not in ("men", "women", "any", "unknown"):
        raise QueryError("gender must be men, women, any or unknown")
    if (q.origin_lat is None) != (q.origin_lng is None):
        raise QueryError("origin_lat and origin_lng go together")
    return q, provided


# ---------- helpers ----------

def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters."""
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _hm(s: str) -> time:
    h, m = s.split(":")
    return time(int(h), int(m))


def is_open(hours: list[dict], now: datetime) -> Optional[bool]:
    """None when hours are unknown. Handles spans past midnight (closes <= opens)."""
    if not hours:
        return None
    local = now.astimezone(local_tz())
    today, t = local.weekday(), local.time()
    yesterday = (today - 1) % 7
    for h in hours:
        opens, closes = _hm(h["opens"]), _hm(h["closes"])
        overnight = closes <= opens
        if h["day"] == today and (opens <= t < closes if not overnight else t >= opens):
            return True
        if overnight and h["day"] == yesterday and t < closes:
            return True
    return False


def _starts_at(r: Resource) -> Optional[datetime]:
    v = (r.details or {}).get("starts_at") if r.category in EVENT_CATEGORIES else None
    if not v:
        return None
    try:
        return aware(datetime.fromisoformat(v))
    except ValueError:
        return None


def _ends_at(r: Resource) -> Optional[datetime]:
    v = (r.details or {}).get("ends_at") if r.category in EVENT_CATEGORIES else None
    try:
        return aware(datetime.fromisoformat(v)) if v else None
    except ValueError:
        return None


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(f"o:{offset}".encode()).decode()


def _decode_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        kind, n = base64.urlsafe_b64decode(cursor.encode()).decode().split(":")
        return max(0, int(n)) if kind == "o" else 0
    except Exception as exc:  # noqa: BLE001
        raise QueryError("bad cursor") from exc


# ---------- search ----------

def _passes(r: Resource, q: ResourceQuery, now: datetime, dist: Optional[float]) -> bool:
    """Exclude only on a definite mismatch; unknown always passes."""
    if q.q:
        needle = q.q.lower()
        hay = " ".join(filter(None, [r.name, r.description, (r.details or {}).get("employer")])).lower()
        if needle not in hay:
            return False
    if q.near_transit and r.near_transit is False:
        return False
    if q.open_now and is_open(r.hours or [], now) is False:
        return False
    if q.no_id_required and "photo_id" in (r.required_documents or []):
        return False
    if q.records_accepted and r.records_policy == "not_accepted":
        return False
    if q.gender in ("men", "women") and r.gender == ("women" if q.gender == "men" else "men"):
        return False
    if q.families and r.families_welcome == "no":
        return False
    if q.free_only and r.cost_type in ("fee", "sliding_scale"):
        return False
    if q.language and r.languages and q.language not in r.languages:
        return False
    if q.radius_m is not None and dist is not None and dist > q.radius_m:
        return False
    if q.starts_within_days is not None and r.category in EVENT_CATEGORIES:
        starts, ends = _starts_at(r), _ends_at(r)
        if starts is not None:
            if starts > now + timedelta(days=q.starts_within_days):
                return False
            if (ends or starts) < now:
                return False
    return True


def summary(r: Resource, now: datetime, dist: Optional[float]) -> dict:
    starts = _starts_at(r)
    return {
        "id": str(r.id),
        "name": r.name,
        "category": r.category,
        "location": {"lat": r.lat, "lng": r.lng} if r.lat is not None and r.lng is not None else None,
        "distance_m": round(dist) if dist is not None else None,
        "near_transit": r.near_transit,
        "open_now": is_open(r.hours or [], now),
        "starts_at": starts.isoformat() if starts else None,
        "verification": r.verification,
    }


async def search(
    db: AsyncSession, q: ResourceQuery, now: Optional[datetime] = None, limit: int = PAGE_SIZE
) -> dict:
    """ResourceSearchResponse: {items, total, next_cursor}."""
    now = now or datetime.now(timezone.utc)
    stmt = select(Resource).where(Resource.is_active.is_(True), Resource.verification != "flagged")
    if q.categories:
        stmt = stmt.where(Resource.category.in_(q.categories))
    rows = (await db.scalars(stmt)).all()

    has_origin = q.origin_lat is not None and q.origin_lng is not None
    matched: list[tuple[Resource, Optional[float]]] = []
    for r in rows:
        dist = (
            distance_m(q.origin_lat, q.origin_lng, r.lat, r.lng)
            if has_origin and r.lat is not None and r.lng is not None else None
        )
        if _passes(r, q, now, dist):
            matched.append((r, dist))

    def sort_key(item: tuple[Resource, Optional[float]]):
        r, dist = item
        starts = _starts_at(r)
        return (
            r.verification != "verified",                 # verified first
            dist if dist is not None else math.inf,       # then nearest (unknown last)
            starts.timestamp() if starts else math.inf,   # events: soonest
            r.name.lower(),
        )

    matched.sort(key=sort_key)
    offset = _decode_cursor(q.cursor)
    page = matched[offset: offset + limit]
    nxt = offset + limit
    return {
        "items": [summary(r, now, d) for r, d in page],
        "total": len(matched),
        "next_cursor": _encode_cursor(nxt) if nxt < len(matched) else None,
    }


# ---------- detail ----------

def detail(r: Resource, document_checks: Optional[list[dict]] = None) -> dict:
    """Full Resource (detail drawer)."""
    return {
        "id": str(r.id),
        "category": r.category,
        "name": r.name,
        "description": r.description,
        "address": r.address,
        "location": {"lat": r.lat, "lng": r.lng} if r.lat is not None and r.lng is not None else None,
        "phone": r.phone,
        "website": r.website,
        "hours": r.hours or [],
        "hours_note": r.hours_note,
        "gender": r.gender,
        "families_welcome": r.families_welcome,
        "records_policy": r.records_policy,
        "restrictions_note": r.restrictions_note,
        "languages": r.languages or [],
        "cost_type": r.cost_type,
        "access_methods": r.access_methods or [],
        "required_documents": r.required_documents or [],
        "document_checks": document_checks,
        "near_transit": r.near_transit,
        "nearest_stops": r.nearest_stops or [],
        "verification": r.verification,
        "source_url": r.source_url,
        "last_verified_at": aware(r.last_verified_at).isoformat() if r.last_verified_at else None,
        "updated_at": aware(r.updated_at).isoformat() if r.updated_at else None,
        "field_meta": r.field_meta or {},
        "details": r.details or {},
    }


async def get_resource(db: AsyncSession, resource_id: uuid.UUID) -> Optional[Resource]:
    r = await db.get(Resource, resource_id)
    return r if r is not None and r.is_active and r.verification != "flagged" else None


# ---------- client context ----------

_ID_FOR_DOC = {
    "photo_id": IdType.STATE_ID,
    "ssn_card": IdType.SSN_CARD,
    "birth_certificate": IdType.BIRTH_CERTIFICATE,
}


async def _held_ids(db: AsyncSession, client_id: uuid.UUID, today: date) -> dict[IdType, str]:
    """IdType -> 'have' | 'expired' | 'missing', using verified rows only."""
    rows = (await db.scalars(
        select(ClientId).where(ClientId.client_id == client_id, ClientId.verified.is_(True))
    )).all()
    rank = {"have": 2, "expired": 1, "missing": 0}
    status: dict[IdType, str] = {}
    for row in rows:
        if row.status == IdStatus.HELD:
            s = "expired" if row.expires_on and row.expires_on < today else "have"
        elif row.status == IdStatus.EXPIRED:
            s = "expired"
        else:
            s = "missing"
        # with several rows for one ID type, the best status wins
        if rank[s] > rank.get(status.get(row.id_type, ""), -1):
            status[row.id_type] = s
    return status


async def document_checks(db: AsyncSession, client_id: uuid.UUID, r: Resource) -> list[dict]:
    """Have/missing/expired for each required document we can actually check.
    Proof of income/address and referral letters aren't tracked, so they're left out."""
    today = datetime.now(timezone.utc).astimezone(local_tz()).date()
    ids = await _held_ids(db, client_id, today)
    checks = []
    for doc in r.required_documents or []:
        if doc in _ID_FOR_DOC:
            checks.append({"document": doc, "status": ids.get(_ID_FOR_DOC[doc], "missing")})
        elif doc == "release_papers":
            has = await db.scalar(select(Document.id).where(
                Document.client_id == client_id, Document.doc_type == DocumentType.RELEASE_PAPERS
            ).limit(1))
            checks.append({"document": doc, "status": "have" if has else "missing"})
    return checks


async def profile_query(db: AsyncSession, client: Client) -> tuple[ResourceQuery, set[str]]:
    """Filters a client's profile turns on, and which keys they are. Never infers recovery."""
    q = ResourceQuery()
    keys: set[str] = set()
    cats = []
    if client.housing_status in SHELTER_HOUSING:
        cats.append("shelter")
    if client.employment_status in JOB_EMPLOYMENT:
        cats.append("jobs")
    if cats:
        q.categories = cats
        keys.add("categories")
    if client.has_transportation is False:
        q.near_transit = True
        keys.add("near_transit")
    if client.language == "es":
        q.language = "es"
        keys.add("language")
    today = datetime.now(timezone.utc).astimezone(local_tz()).date()
    ids = await _held_ids(db, client.id, today)
    if ids.get(IdType.STATE_ID) != "have":
        q.no_id_required = True
        keys.add("no_id_required")
    # Origin: the client's address, geocoded server-side (None without MAPS_API_KEY).
    from app.services import maps  # local import keeps this module free of HTTP deps in tests

    address = maps.client_address(client)
    point = await maps.geocode(address) if address else None
    if point:
        q.origin_lat, q.origin_lng = point
        keys.add("origin")
    return q, keys


def merge(profile: ResourceQuery, profile_keys: set[str],
          overrides: ResourceQuery, override_keys: set[str]) -> tuple[ResourceQuery, list[dict]]:
    """Overrides replace the profile's value per key; false/"" turn a filter off."""
    q = ResourceQuery(**{k: getattr(profile, k) for k in profile.__dataclass_fields__})
    q.categories = list(profile.categories)
    for key in override_keys:
        if key == "origin":
            q.origin_lat, q.origin_lng = overrides.origin_lat, overrides.origin_lng
        else:
            setattr(q, key, getattr(overrides, key))
    # Normalize "turned off"
    for key in _BOOL_KEYS:
        if getattr(q, key) is False:
            setattr(q, key, None)
    if q.language == "":
        q.language = None

    applied = []
    api = q.to_api()
    for key in sorted(set(api) - {"cursor"}):
        reason = "manual" if key in override_keys else "profile" if key in profile_keys else "manual"
        applied.append({"key": key, "reason": reason})
    return q, applied


async def client_matches(
    db: AsyncSession, client: Client, overrides: ResourceQuery, override_keys: set[str],
    now: Optional[datetime] = None, limit: int = PAGE_SIZE,
) -> dict:
    """ClientResourceMatch: {query, applied, results}."""
    profile, profile_keys = await profile_query(db, client)
    q, applied = merge(profile, profile_keys, overrides, override_keys)
    return {"query": q.to_api(), "applied": applied, "results": await search(db, q, now, limit)}
