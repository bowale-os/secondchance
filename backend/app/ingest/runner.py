"""
Write normalized resources to the database without damaging good data.

Rules:
- Rows are matched on dedupe_key.
- A scrape that found nothing for a field never erases a value we already have.
- A VERIFIED row (a case worker confirmed it) is only filled where a field is unknown.
- The same place arriving from different sources is merged first (merge_sources), best source first.
- verification, near_transit and nearest_stops are never touched by a scrape; a changed
  location clears the transit result so it is recomputed.
"""

import math
import re
from dataclasses import dataclass, fields, replace
from enum import Enum
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ingest.common import street_key
from app.schemas import ResourceUpsert, resource_columns
from app.tables import FieldSource, Resource, VerificationStatus

INSERT_ONLY = {"dedupe_key", "source"}
DERIVED = {"requires_id"}  # recomputed from required_documents
MERGED = {"details", "field_meta"}  # JSON dicts merged key by key
ALWAYS = {"scraped_at"}  # refreshed on every sighting, not counted as a change


@dataclass
class UpsertResult:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    duplicates: int = 0


def is_unknown(value: Any) -> bool:
    """None, empty, or an UNKNOWN enum / "unknown" string."""
    if isinstance(value, Enum):
        value = value.value
    return value is None or value == "unknown" or value == [] or value == {}


def apply_columns(row: Resource, cols: dict[str, Any]) -> bool:
    """Merge scraped column values into an existing row. Returns True if anything changed."""
    locked = row.verification is VerificationStatus.VERIFIED
    changed = False

    def set_attr(key: str, value: Any) -> None:
        nonlocal changed
        if getattr(row, key) != value:
            setattr(row, key, value)
            changed = True

    old_location = (row.lat, row.lng)

    for key, new in cols.items():
        if key in INSERT_ONLY or key in DERIVED:
            continue
        if key in ALWAYS:
            row.scraped_at = new
            continue
        old = getattr(row, key)
        if key in MERGED:
            merged = dict(old or {})
            for k, v in (new or {}).items():
                if key == "field_meta":
                    if (merged.get(k) or {}).get("source") == FieldSource.CASE_WORKER.value:
                        continue  # a person's answer beats a scrape
                    merged[k] = v
                elif not is_unknown(v) and (not locked or is_unknown(merged.get(k))):
                    merged[k] = v
            set_attr(key, merged)
        elif is_unknown(new):
            continue
        elif locked and not is_unknown(old):
            continue
        else:
            set_attr(key, new)

    set_attr("requires_id", bool(row.required_documents))
    if (row.lat, row.lng) != old_location:
        row.near_transit, row.nearest_stops = None, []
        changed = True
    return changed


# ---- Merging the same place from different sources ----

SAME_PLACE_M = 150  # metres
NAME_STOPWORDS = {"the", "inc", "incorporated", "of", "and", "center", "centre", "llc", "ministries", "ministry"}


def _name_tokens(name: str) -> set[str]:
    return {w for w in re.sub(r"[^a-z0-9 ]", " ", name.lower()).split() if w not in NAME_STOPWORDS}


def _meters(a: ResourceUpsert, b: ResourceUpsert) -> float:
    if not (a.location and b.location):
        return math.inf
    dlat = math.radians(b.location.lat - a.location.lat)
    dlng = math.radians(b.location.lng - a.location.lng) * math.cos(math.radians(a.location.lat))
    return 6371000 * math.hypot(dlat, dlng)


def same_place(a: ResourceUpsert, b: ResourceUpsert) -> bool:
    """Same category, a similar name, and the same spot. Where both sources say where the place is,
    only that counts (a shared phone number is often one office for several sites). When one source
    gives no position, the names must match exactly and the phone must agree if both have one."""
    if a.category is not b.category:
        return False
    ta, tb = _name_tokens(a.name), _name_tokens(b.name)
    if not ta or not tb or len(ta & tb) / min(len(ta), len(tb)) < 0.75:
        return False
    sa, sb = street_key(a.address.street if a.address else None), street_key(b.address.street if b.address else None)
    if sa and sb:
        return sa == sb
    if a.location and b.location:
        return _meters(a, b) <= SAME_PLACE_M
    return ta == tb and (not (a.phone and b.phone) or a.phone == b.phone)


def _fill_unknown(target: Any, other: Any) -> None:
    for f in fields(target):
        if is_unknown(getattr(target, f.name)) and not is_unknown(getattr(other, f.name)):
            setattr(target, f.name, getattr(other, f.name))


def merge_sources(items: Iterable[ResourceUpsert]) -> tuple[list[ResourceUpsert], int]:
    """Collapse the same place found by several sources into one resource.
    Pass items best source first: the first keeps its values and only gains what it was missing.
    Returns (merged, number of duplicates folded away)."""
    kept: list[ResourceUpsert] = []
    merged_away = 0
    for item in items:
        match = next((k for k in kept if same_place(k, item)), None)
        if match is None:
            kept.append(replace(item, field_meta=dict(item.field_meta)))
            continue
        merged_away += 1
        before = {f.name for f in fields(match) if is_unknown(getattr(match, f.name))}
        _fill_unknown(match, item)
        _fill_unknown(match.details, item.details)
        for name in before:  # how a filled-in field got its value
            if name in item.field_meta:
                match.field_meta.setdefault(name, item.field_meta[name])
    return kept, merged_away


async def upsert_resources(session: AsyncSession, items: Iterable[ResourceUpsert]) -> UpsertResult:
    """Insert new resources and merge into existing ones. Commits once at the end."""
    result = UpsertResult()
    batch: dict[str, dict[str, Any]] = {}
    for item in items:
        cols = resource_columns(item)
        if cols["dedupe_key"] in batch:
            result.duplicates += 1  # same place twice in one scrape: first one wins
            continue
        batch[cols["dedupe_key"]] = cols

    existing: dict[str, Resource] = {}
    keys = list(batch)
    for i in range(0, len(keys), 500):
        rows = await session.scalars(select(Resource).where(Resource.dedupe_key.in_(keys[i : i + 500])))
        existing.update({r.dedupe_key: r for r in rows})

    for key, cols in batch.items():
        row = existing.get(key)
        if row is None:
            session.add(Resource(**cols))
            result.created += 1
        elif apply_columns(row, cols):
            result.updated += 1
        else:
            result.unchanged += 1
    await session.commit()
    return result
