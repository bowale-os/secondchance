"""Load data/resources.sample.json into the resources table for tests.

Production data comes from app/ingest; this just gives the bot tests a few known places.
"""

import csv
import math
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.tables import (
    CostType,
    Gender,
    RecordsPolicy,
    Resource,
    ResourceCategory,
    ScrapeSource,
    Tri,
    VerificationStatus,
)

NEAR_TRANSIT_M = 1609


def load_stops(path: Path) -> list[dict]:
    with path.open(newline="") as f:
        return [
            {
                "stop_name": r["stop_name"],
                "lat": float(r["stop_lat"]),
                "lng": float(r["stop_lon"]),
                "routes": [x for x in (r.get("routes") or "").split("|") if x],
            }
            for r in csv.DictReader(f)
        ]


def _metres(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1) * math.cos(math.radians((lat1 + lat2) / 2))
    return 6371000 * math.hypot(dlat, dlng)


def _nearest(stops: list[dict], lat: float, lng: float, n: int = 3) -> list[dict]:
    ranked = sorted(({**s, "distance_m": round(_metres(lat, lng, s["lat"], s["lng"]))} for s in stops),
                    key=lambda s: s["distance_m"])
    return ranked[:n]


async def ingest(
    session: AsyncSession, data: dict[str, Any], stops: Optional[list[dict]] = None, now: Optional[datetime] = None
) -> None:
    for item in data["resources"]:
        loc = item.get("location")
        near = _nearest(stops, loc["lat"], loc["lng"]) if stops and loc else []
        starts = (item.get("details") or {}).get("starts_at")
        last_verified = item.get("last_verified_at")
        session.add(Resource(
            dedupe_key=item["key"],
            name=item["name"],
            category=ResourceCategory(item["category"]),
            description=item.get("description"),
            address=item.get("address"),
            lat=loc["lat"] if loc else None,
            lng=loc["lng"] if loc else None,
            phone=item.get("phone"),
            website=item.get("website"),
            hours=item.get("hours", []),
            hours_note=item.get("hours_note"),
            starts_at=datetime.fromisoformat(starts) if starts else None,
            gender=Gender(item.get("gender", "unknown")),
            families_welcome=Tri(item.get("families_welcome", "unknown")),
            records_policy=RecordsPolicy(item.get("records_policy", "unknown")),
            restrictions_note=item.get("restrictions_note"),
            languages=item.get("languages", []),
            cost_type=CostType(item.get("cost_type", "unknown")),
            access_methods=item.get("access_methods", []),
            required_documents=item.get("required_documents", []),
            requires_id="photo_id" in item.get("required_documents", []),
            nearest_stops=near,
            near_transit=(near[0]["distance_m"] <= NEAR_TRANSIT_M) if near else None,
            details=item.get("details", {}),
            verification=VerificationStatus(item.get("verification", "unverified")),
            source=ScrapeSource.OTHER,
            source_url=item.get("source_url"),
            last_verified_at=datetime.fromisoformat(last_verified) if last_verified else None,
            field_meta=item.get("field_meta", {}),
        ))
    await session.commit()
