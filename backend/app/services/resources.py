"""Resource search for the text bot, on top of the web app's search (routers/resources.py).

The bot keeps its own small query and plain-dict results because it stores the last query
in the session (JSON) and renders text, not API models. Matching, hours, distance and
document checks come from the same code the web app uses, so the two never disagree.
"""

import uuid
from dataclasses import dataclass, fields
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.routers import resources as web
from app.schemas import LatLng, resource_read
from app.schemas import ResourceQuery as WebQuery
from app.tables import Resource, ResourceCategory, VerificationStatus

EVENT_CATEGORIES = ("classes", "events")
PAGE_SIZE = web.PAGE_SIZE


@dataclass
class ResourceQuery:
    """What a text asked for. Plain values only, so it survives in `BotSession.last_results`."""
    q: Optional[str] = None
    categories: Optional[list[str]] = None
    near_transit: Optional[bool] = None
    origin_lat: Optional[float] = None
    origin_lng: Optional[float] = None
    starts_within_days: Optional[int] = None
    cursor: Optional[str] = None


def stored(q: ResourceQuery) -> dict:
    """JSON-safe form for the session (the cursor is kept separately)."""
    return {f.name: getattr(q, f.name) for f in fields(q) if f.name != "cursor"}


def _web_query(q: ResourceQuery) -> WebQuery:
    origin = LatLng(q.origin_lat, q.origin_lng) if q.origin_lat is not None and q.origin_lng is not None else None
    return WebQuery(
        q=q.q,
        categories=[ResourceCategory(c) for c in q.categories] if q.categories else None,
        near_transit=q.near_transit or None,
        origin=origin,
        starts_within_days=q.starts_within_days,
        cursor=q.cursor,
    )


async def search(
    db: AsyncSession, q: ResourceQuery, now: Optional[datetime] = None, limit: int = PAGE_SIZE
) -> dict:
    """{items: [summary dicts], total, next_cursor}. Places reported wrong are hidden."""
    res = await web.run_search(db, _web_query(q), limit=limit, now=now, hide_flagged=True)
    return {
        "items": [
            {
                "id": str(i.id),
                "name": i.name,
                "category": i.category.value,
                "distance_m": round(i.distance_m) if i.distance_m is not None else None,
                "near_transit": i.near_transit,
                "open_now": i.open_now,
                "starts_at": i.starts_at.isoformat() if i.starts_at else None,
                "verification": i.verification.value,
            }
            for i in res.items
        ],
        "total": res.total,
        "next_cursor": res.next_cursor,
    }


async def get_resource(db: AsyncSession, resource_id: uuid.UUID) -> Optional[Resource]:
    r = await db.get(Resource, resource_id)
    return r if r is not None and r.verification != VerificationStatus.FLAGGED else None


async def document_checks(db: AsyncSession, client_id: uuid.UUID, r: Resource) -> list[dict]:
    """Have / missing / expired for each document the place asks for."""
    client = await web._load_client(db, client_id)
    read = resource_read(r)
    return [
        {"document": c.document.value, "status": c.status}
        for c in web.document_checks(client, read.required_documents)
    ]


def detail(r: Resource) -> dict:
    """The fields the text reply prints, as plain strings and dicts."""
    read = resource_read(r)
    verified_at = read.last_verified_at
    if verified_at is not None and verified_at.tzinfo is None:
        verified_at = verified_at.replace(tzinfo=timezone.utc)
    return {
        "name": read.name,
        "address": {"street": read.address.street, "city": read.address.city} if read.address else None,
        "phone": read.phone,
        "hours": [{"day": h.day, "opens": h.opens, "closes": h.closes} for h in read.hours],
        "hours_note": read.hours_note,
        "gender": read.gender.value,
        "families_welcome": read.families_welcome.value,
        "records_policy": read.records_policy.value,
        "cost_type": read.cost_type.value,
        "details": r.details or {},
        "required_documents": [d.value for d in read.required_documents],
        "location": {"lat": read.location.lat, "lng": read.location.lng} if read.location else None,
        "nearest_stops": [
            {"stop_name": s.stop_name, "distance_m": s.distance_m, "lat": s.lat, "lng": s.lng}
            for s in read.nearest_stops
        ],
        "verification": read.verification.value,
        "last_verified_at": verified_at.isoformat() if verified_at else None,
    }
