"""Community resources: search, detail, and matching against a client's profile.

Every filter excludes only on a definite mismatch; UNKNOWN / NULL facts stay in the
results (the UI shows them as "call to confirm").
"""

import base64
import math
import uuid
from dataclasses import fields
from datetime import date, datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_client, get_current_staff, get_staff_or_client
from app.db import get_session
from app.schemas import (
    AppliedFilter,
    ClientResourceMatch,
    DocumentCheck,
    LatLng,
    OpeningHours,
    ResourceQuery,
    ResourceRead,
    ResourceSearchResponse,
    resource_read,
    resource_summary,
)
from app.tables import (
    Assignment,
    Client,
    CostType,
    DocumentStatus,
    DocumentType,
    EmploymentStatus,
    Gender,
    HousingStatus,
    IdStatus,
    IdType,
    RecordsPolicy,
    RequiredDocument,
    Resource,
    ResourceCategory,
    Staff,
    Tri,
)

router = APIRouter(tags=["resources"])

PAGE_SIZE = 25
LOCAL_TZ = ZoneInfo("America/New_York")  # Atlanta; hours are stored as local "HH:MM"

SHELTER_HOUSING = {HousingStatus.SHELTER, HousingStatus.UNSTABLE, HousingStatus.HOMELESS, HousingStatus.TRANSITIONAL}
JOB_EMPLOYMENT = {EmploymentStatus.SEEKING, EmploymentStatus.NOT_WORKING}


# ============================================================
# Query string -> ResourceQuery
# ============================================================

def _bad(key: str) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Invalid value for {key}")


def _as_bool(key: str, raw: str) -> bool:
    if raw.lower() in ("true", "1"):
        return True
    if raw.lower() in ("false", "0"):
        return False
    raise _bad(key)


def _as_number(key: str, raw: str, kind: type) -> Any:
    try:
        return kind(raw)
    except ValueError:
        raise _bad(key)


def _as_enum(key: str, raw: str, enum_cls: type[Enum]) -> Any:
    try:
        return enum_cls(raw)
    except ValueError:
        raise _bad(key)


def parse_query(request: Request) -> tuple[ResourceQuery, set[str]]:
    """The query string as a ResourceQuery, plus which ResourceQuery keys were present.

    Lists repeat their key (`categories=food&categories=jobs`) and `origin` arrives as
    `origin_lat` + `origin_lng`. `false` and "" are kept as given so the client-matching
    endpoints can tell "turned off" from "not sent"."""
    params = request.query_params
    q = ResourceQuery()
    present: set[str] = set()

    for key in ("q", "language", "cursor"):
        if key in params:
            present.add(key)
            setattr(q, key, params[key] or None)
    for key in ("near_transit", "open_now", "no_id_required", "records_accepted", "families", "free_only"):
        if key in params:
            present.add(key)
            setattr(q, key, _as_bool(key, params[key]))
    if "gender" in params:
        present.add("gender")
        q.gender = _as_enum("gender", params["gender"], Gender) if params["gender"] else None
    if "radius_m" in params:
        present.add("radius_m")
        q.radius_m = _as_number("radius_m", params["radius_m"], float)
    if "starts_within_days" in params:
        present.add("starts_within_days")
        q.starts_within_days = _as_number("starts_within_days", params["starts_within_days"], int)
    if "categories" in params:
        present.add("categories")  # `categories=` alone means "none selected", clearing the profile's
        cats = [c for c in params.getlist("categories") if c]
        q.categories = [_as_enum("categories", c, ResourceCategory) for c in cats] or None
    if "origin_lat" in params or "origin_lng" in params:
        if "origin_lat" not in params or "origin_lng" not in params:
            raise _bad("origin")
        present.add("origin")
        q.origin = LatLng(
            _as_number("origin_lat", params["origin_lat"], float),
            _as_number("origin_lng", params["origin_lng"], float),
        )
    return q, present


# ============================================================
# Search
# ============================================================

def _distance_m(a: LatLng, b: LatLng) -> float:
    """Straight-line metres (equirectangular; plenty accurate at city scale)."""
    dlat = math.radians(b.lat - a.lat)
    dlng = math.radians(b.lng - a.lng) * math.cos(math.radians((a.lat + b.lat) / 2))
    return 6371000 * math.hypot(dlat, dlng)


def _minutes(hhmm: str) -> int:
    hh, _, mm = hhmm.partition(":")
    return int(hh) * 60 + int(mm)


def open_now(hours: list[OpeningHours], now_local: datetime) -> Optional[bool]:
    """None when no hours are known. A closes time before opens means past midnight."""
    if not hours:
        return None
    today, minute = now_local.weekday(), now_local.hour * 60 + now_local.minute
    for h in hours:
        start, end = _minutes(h.opens), _minutes(h.closes)
        if end > start:
            if h.day == today and start <= minute < end:
                return True
        elif h.day == today and minute >= start:  # runs past midnight
            return True
        elif h.day == (today - 1) % 7 and minute < end:  # tail of yesterday's shift
            return True
    return False


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _decode_cursor(cursor: Optional[str]) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
    except ValueError:
        raise _bad("cursor")


async def run_search(session: AsyncSession, query: ResourceQuery) -> ResourceSearchResponse:
    now = datetime.now(timezone.utc)
    now_local = now.astimezone(LOCAL_TZ)

    stmt = select(Resource)
    if query.categories:
        stmt = stmt.where(Resource.category.in_(query.categories))
    if query.q:
        like = f"%{query.q.strip()}%"
        stmt = stmt.where(or_(Resource.name.ilike(like), Resource.description.ilike(like)))
    if query.near_transit:
        stmt = stmt.where(or_(Resource.near_transit.is_(None), Resource.near_transit.is_(True)))
    if query.no_id_required:
        stmt = stmt.where(Resource.requires_id.is_(False))
    if query.records_accepted:
        stmt = stmt.where(Resource.records_policy != RecordsPolicy.NOT_ACCEPTED)
    if query.gender and query.gender not in (Gender.ANY, Gender.UNKNOWN):
        stmt = stmt.where(Resource.gender.in_([query.gender, Gender.ANY, Gender.UNKNOWN]))
    if query.families:
        stmt = stmt.where(Resource.families_welcome != Tri.NO)
    if query.free_only:
        stmt = stmt.where(Resource.cost_type.notin_([CostType.FEE, CostType.SLIDING_SCALE]))
    if query.starts_within_days is not None:
        timed = Resource.category.in_([ResourceCategory.CLASSES, ResourceCategory.EVENTS])
        stmt = stmt.where(
            or_(
                ~timed,
                Resource.starts_at.is_(None),  # ongoing
                Resource.starts_at.between(now, now + timedelta(days=query.starts_within_days)),
            )
        )

    rows = (await session.scalars(stmt)).all()

    matches: list[tuple[Resource, Optional[float], Optional[bool]]] = []
    for row in rows:
        if query.language and row.languages and query.language not in row.languages:
            continue
        distance = None
        if query.origin and row.lat is not None and row.lng is not None:
            distance = _distance_m(query.origin, LatLng(row.lat, row.lng))
            if query.radius_m is not None and distance > query.radius_m:
                continue
        is_open = open_now(_load_hours(row), now_local)
        if query.open_now and is_open is False:
            continue
        matches.append((row, distance, is_open))

    # Nearest first when we know where from; otherwise by name. Unlocated places go last.
    matches.sort(key=lambda m: (m[1] is None, m[1] or 0.0, m[0].name.lower(), str(m[0].id)))

    offset = _decode_cursor(query.cursor)
    page = matches[offset : offset + PAGE_SIZE]
    return ResourceSearchResponse(
        items=[resource_summary(r, distance_m=d, open_now=o) for r, d, o in page],
        total=len(matches),
        next_cursor=_encode_cursor(offset + PAGE_SIZE) if offset + PAGE_SIZE < len(matches) else None,
    )


def _load_hours(row: Resource) -> list[OpeningHours]:
    return [OpeningHours(**h) for h in (row.hours or [])]


# ============================================================
# Client profile -> filters, and document checks
# ============================================================

async def _load_client(session: AsyncSession, client_id: uuid.UUID) -> Client:
    client = await session.scalar(
        select(Client)
        .where(Client.id == client_id)
        .options(selectinload(Client.ids), selectinload(Client.documents))
    )
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return client


async def _client_for_staff(session: AsyncSession, staff: Staff, client_id: uuid.UUID) -> Client:
    """One of the case worker's actively assigned clients, else 404."""
    assigned = await session.scalar(
        select(Assignment.id).where(
            Assignment.client_id == client_id,
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
        )
    )
    if assigned is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return await _load_client(session, client_id)


def _has_photo_id(client: Client) -> bool:
    today = date.today()
    return any(
        i.id_type == IdType.STATE_ID
        and i.status == IdStatus.HELD
        and (i.expires_on is None or i.expires_on >= today)
        for i in client.ids
    )


def profile_query(client: Client) -> ResourceQuery:
    """Filters implied by the profile. Keep in step with frontend/src/lib/clientNeeds.ts.
    Recovery (`addiction`) is never inferred from medications or medical documents."""
    q = ResourceQuery()
    categories = []
    if client.housing_status in SHELTER_HOUSING:
        categories.append(ResourceCategory.SHELTER)
    if client.employment_status in JOB_EMPLOYMENT:
        categories.append(ResourceCategory.JOBS)
    if categories:
        q.categories = categories
    if client.has_transportation is False:
        q.near_transit = True
    if client.language and client.language != "en":
        q.language = client.language
    if not _has_photo_id(client):
        q.no_id_required = True
    return q


def _active(value: Any) -> bool:
    """A filter that actually narrows results (False / "" / empty list do not)."""
    return value not in (None, False, "", [])


def match_query(client: Client, overrides: ResourceQuery, present: set[str]) -> tuple[ResourceQuery, list[AppliedFilter]]:
    """Profile filters with the request's keys laid on top. A present key replaces the
    profile's value, so `near_transit=false` or `language=` turn a profile filter off."""
    query = profile_query(client)
    from_profile = {f.name for f in fields(ResourceQuery) if _active(getattr(query, f.name))}
    for key in present:
        setattr(query, key, getattr(overrides, key))
        from_profile.discard(key)
    applied = [
        AppliedFilter(key=f.name, reason="profile" if f.name in from_profile else "manual")
        for f in fields(ResourceQuery)
        if f.name != "cursor" and _active(getattr(query, f.name))
    ]
    return query, applied


async def _match(session: AsyncSession, client: Client, request: Request) -> ClientResourceMatch:
    overrides, present = parse_query(request)
    query, applied = match_query(client, overrides, present - {"cursor"})
    query.cursor = overrides.cursor
    return ClientResourceMatch(query=query, applied=applied, results=await run_search(session, query))


def document_checks(client: Client, required: list[RequiredDocument]) -> list[DocumentCheck]:
    """Has / missing / expired for each document a resource asks for, from the client's
    ID records and confirmed-or-read paperwork."""
    today = date.today()
    held_docs = {d.doc_type for d in client.documents if d.status != DocumentStatus.FAILED}

    def id_status(id_type: IdType) -> str:
        records = [i for i in client.ids if i.id_type == id_type]
        if any(i.status == IdStatus.HELD and (i.expires_on is None or i.expires_on >= today) for i in records):
            return "have"
        if any(i.status == IdStatus.EXPIRED or (i.expires_on and i.expires_on < today) for i in records):
            return "expired"
        return "missing"

    def has(*types: DocumentType) -> str:
        return "have" if held_docs & set(types) else "missing"

    checks = {
        RequiredDocument.PHOTO_ID: lambda: id_status(IdType.STATE_ID),
        RequiredDocument.SSN_CARD: lambda: id_status(IdType.SSN_CARD),
        RequiredDocument.BIRTH_CERTIFICATE: lambda: id_status(IdType.BIRTH_CERTIFICATE),
        RequiredDocument.PROOF_OF_INCOME: lambda: has(DocumentType.BENEFITS_LETTER),
        RequiredDocument.PROOF_OF_ADDRESS: lambda: has(DocumentType.HOUSING_AGREEMENT),
        RequiredDocument.RELEASE_PAPERS: lambda: has(DocumentType.RELEASE_PAPERS, DocumentType.SUPERVISION_PAPERS),
        RequiredDocument.REFERRAL_LETTER: lambda: "missing",  # nothing on file can prove one
    }
    return [DocumentCheck(document=d, status=checks[d]()) for d in required]


# ============================================================
# Routes
# ============================================================

@router.get("/resources", response_model=ResourceSearchResponse)
async def search_resources(
    request: Request,
    _: Staff | Client = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
) -> ResourceSearchResponse:
    """Slim summaries for list rows and map pins."""
    query, _present = parse_query(request)
    return await run_search(session, query)


@router.get("/resources/{resource_id}", response_model=ResourceRead)
async def get_resource(
    resource_id: uuid.UUID,
    client_id: Optional[uuid.UUID] = None,
    who: Staff | Client = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
) -> ResourceRead:
    """The full resource. In a client context (a logged-in client, or staff passing
    `client_id` for one of their clients) `document_checks` is filled in."""
    row = await session.get(Resource, resource_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    read = resource_read(row)

    client: Optional[Client] = None
    if isinstance(who, Client):
        client = await _load_client(session, who.id)
    elif client_id is not None:
        client = await _client_for_staff(session, who, client_id)
    if client is not None:
        read.document_checks = document_checks(client, read.required_documents)
    return read


@router.get("/clients/{client_id}/resources", response_model=ClientResourceMatch)
async def resources_for_client(
    client_id: uuid.UUID,
    request: Request,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> ClientResourceMatch:
    """Search pre-filtered from one of my clients' profile; query params override it."""
    client = await _client_for_staff(session, staff, client_id)
    return await _match(session, client, request)


@router.get("/me/resources", response_model=ClientResourceMatch)
async def my_resources(
    request: Request,
    me: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> ClientResourceMatch:
    """The same matching, for the logged-in client."""
    return await _match(session, await _load_client(session, me.id), request)
