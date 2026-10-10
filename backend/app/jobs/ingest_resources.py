"""Load resources from a JSON file (RESOURCES_FILE) into the resources table.

    python -m app.jobs.ingest_resources [--file data/resources.json]
        [--stops data/marta_stops.csv] [--deactivate-stale] [--dry-run]

File format: {"resources": [ {...}, ... ]}, each item shaped like the frontend Resource
type (frontend/src/types/resource.types.ts) plus a stable "key", minus the fields the
server computes (id, updated_at, document_checks, near_transit, nearest_stops).

Transit: when a GTFS-style stops CSV is given (stop_name, stop_lat, stop_lon, optional
routes "Red|Gold"), near_transit and the 3 nearest stops are computed per resource.
Straight-line distance; "near" = within 1609 m.

Re-running updates rows in place by "key". Rows not in the file keep their data; with
--deactivate-stale, rows not seen for 30 days are hidden.
"""

import argparse
import asyncio
import csv
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.resources import CATEGORIES, NEAR_TRANSIT_M, distance_m
from app.tables import Resource

logger = logging.getLogger(__name__)

STALE_AFTER = timedelta(days=30)

ENUMS = {
    "gender": {"men", "women", "any", "unknown"},
    "families_welcome": {"yes", "no", "unknown"},
    "records_policy": {"accepted", "case_by_case", "not_accepted", "unknown"},
    "cost_type": {"free", "sliding_scale", "fee", "unknown"},
    "verification": {"unverified", "verified", "flagged"},
}
LIST_ENUMS = {
    "access_methods": {"walk_in", "appointment", "referral_required", "phone_only"},
    "required_documents": {"photo_id", "ssn_card", "birth_certificate", "proof_of_income",
                           "proof_of_address", "release_papers", "referral_letter"},
}


class IngestError(ValueError):
    pass


def load_stops(path: Path) -> list[dict]:
    stops = []
    with path.open(newline="") as f:
        for row in csv.DictReader(f):
            stops.append({
                "stop_name": row["stop_name"],
                "lat": float(row["stop_lat"]),
                "lng": float(row["stop_lon"]),
                "routes": [r for r in (row.get("routes") or "").split("|") if r],
            })
    return stops


def nearest(stops: list[dict], lat: float, lng: float, n: int = 3) -> list[dict]:
    ranked = sorted(
        ({**s, "distance_m": round(distance_m(lat, lng, s["lat"], s["lng"]))} for s in stops),
        key=lambda s: s["distance_m"],
    )
    return ranked[:n]


def validate(item: dict, i: int) -> dict:
    """Return column values for one file item, or raise IngestError naming the problem."""
    where = f"resources[{i}] ({item.get('key') or item.get('name') or '?'})"

    def need(cond: bool, msg: str):
        if not cond:
            raise IngestError(f"{where}: {msg}")

    need(isinstance(item.get("key"), str) and item["key"].strip(), "missing 'key'")
    need(item.get("category") in CATEGORIES, f"category must be one of {', '.join(CATEGORIES)}")
    need(isinstance(item.get("name"), str) and item["name"].strip(), "missing 'name'")
    for k, allowed in ENUMS.items():
        if k in item:
            need(item[k] in allowed, f"{k} must be one of {sorted(allowed)}")
    for k, allowed in LIST_ENUMS.items():
        bad = [v for v in item.get(k, []) if v not in allowed]
        need(not bad, f"{k} has unknown value(s) {bad}")
    loc = item.get("location")
    if loc is not None:
        need(isinstance(loc, dict) and -90 <= loc.get("lat", 999) <= 90 and -180 <= loc.get("lng", 999) <= 180,
             "location must be {lat, lng}")
    for h in item.get("hours", []):
        need(h.get("day") in range(7) and ":" in str(h.get("opens")) and ":" in str(h.get("closes")),
             "hours entries need day 0-6 (0 = Monday), opens and closes as HH:MM")
    phone = item.get("phone")
    if phone is not None:
        need(isinstance(phone, str) and phone.startswith("+") and phone[1:].isdigit(), "phone must be E.164")

    last_verified = item.get("last_verified_at")
    return {
        "category": item["category"],
        "name": item["name"].strip()[:200],
        "description": item.get("description"),
        "address": item.get("address"),
        "lat": loc["lat"] if loc else None,
        "lng": loc["lng"] if loc else None,
        "phone": phone,
        "website": item.get("website"),
        "hours": item.get("hours", []),
        "hours_note": item.get("hours_note"),
        "gender": item.get("gender", "unknown"),
        "families_welcome": item.get("families_welcome", "unknown"),
        "records_policy": item.get("records_policy", "unknown"),
        "restrictions_note": item.get("restrictions_note"),
        "languages": item.get("languages", []),
        "cost_type": item.get("cost_type", "unknown"),
        "access_methods": item.get("access_methods", []),
        "required_documents": item.get("required_documents", []),
        "details": item.get("details", {}),
        "verification": item.get("verification", "unverified"),
        "source_url": item.get("source_url"),
        "last_verified_at": datetime.fromisoformat(last_verified) if last_verified else None,
        "field_meta": item.get("field_meta", {}),
    }


async def ingest(
    session: AsyncSession, data: dict[str, Any], stops: list[dict] | None = None,
    deactivate_stale: bool = False, now: datetime | None = None, dry_run: bool = False,
) -> dict:
    now = now or datetime.now(timezone.utc)
    items = data.get("resources")
    if not isinstance(items, list):
        raise IngestError('file must be {"resources": [...]}')
    rows = [(item["key"] if isinstance(item, dict) else None, validate(item, i)) for i, item in enumerate(items)]
    keys = [k for k, _ in rows]
    if len(set(keys)) != len(keys):
        raise IngestError("duplicate 'key' values in file")

    existing = {r.source_key: r for r in (await session.scalars(
        select(Resource).where(Resource.source_key.in_(keys)))).all()}
    created = updated = 0
    for key, values in rows:
        if stops and values["lat"] is not None:
            near = nearest(stops, values["lat"], values["lng"])
            values["nearest_stops"] = near
            values["near_transit"] = bool(near) and near[0]["distance_m"] <= NEAR_TRANSIT_M
        else:
            values["nearest_stops"], values["near_transit"] = [], None
        r = existing.get(key)
        if r is None:
            r = Resource(source_key=key, is_active=True)
            session.add(r)
            created += 1
        else:
            updated += 1
        for k, v in values.items():
            setattr(r, k, v)
        r.is_active = True
        r.last_seen_at = now

    deactivated = 0
    if deactivate_stale:
        result = await session.execute(
            update(Resource)
            .where(Resource.is_active.is_(True), Resource.last_seen_at < now - STALE_AFTER)
            .values(is_active=False)
            .execution_options(synchronize_session=False)
        )
        deactivated = result.rowcount
    if dry_run:
        await session.rollback()
    else:
        await session.commit()
    return {"created": created, "updated": updated, "deactivated": deactivated}


async def _main(args) -> None:
    from app.config import get_settings
    from app.db import SessionLocal, engine

    path = Path(args.file or get_settings().resources_file)
    if not path.exists():
        raise SystemExit(f"{path} not found. Try --file data/resources.sample.json for test data.")
    stops = load_stops(Path(args.stops)) if args.stops else None
    try:
        async with SessionLocal() as session:
            result = await ingest(session, json.loads(path.read_text()), stops,
                                  deactivate_stale=args.deactivate_stale, dry_run=args.dry_run)
        print(("DRY RUN: " if args.dry_run else "") + json.dumps(result))
    finally:
        await engine.dispose()


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Load resources from a JSON file")
    p.add_argument("--file", help="defaults to RESOURCES_FILE")
    p.add_argument("--stops", help="GTFS-style stops CSV for transit badges")
    p.add_argument("--deactivate-stale", action="store_true", help="hide rows not seen for 30 days")
    p.add_argument("--dry-run", action="store_true")
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main(p.parse_args()))
