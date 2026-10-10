"""
SAMHSA FindTreatment.gov: substance use treatment facilities -> ADDICTION resources.

Official API (developer guide, FindTreatment.gov API v1.8):
    GET https://findtreatment.gov/locator/exportsAsJson/v2
Verified against the live API: sAddr is "lat,lng" (the guide's parameter table says lng,lat,
but its examples and the live service use latitude first).
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from app.config import get_settings
from app.ingest.common import IngestError, clean, normalize_phone, normalize_url, split_list, to_float
from app.schemas import Address, AddictionDetails, FieldMeta, LatLng, ResourceUpsert
from app.tables import (
    AddictionSetting,
    Confidence,
    CostType,
    FieldSource,
    Gender,
    RecordsPolicy,
    ResourceCategory,
    ScrapeSource,
    Tri,
)

logger = logging.getLogger(__name__)

SOURCE = ScrapeSource.SAMHSA
URL = "https://findtreatment.gov/locator/exportsAsJson/v2"
SOURCE_URL = "https://findtreatment.gov/"
PAGE_SIZE = 500  # the API allows up to 2000
MAX_PAGES = 20

MEDICATION_WORDS = ("buprenorphine", "methadone", "naltrexone", "acamprosate", "disulfiram")
LANGUAGE_CODES = {"spanish": "es", "french": "fr", "arabic": "ar", "hindi": "hi", "tagalog": "tl",
                  "vietnamese": "vi", "korean": "ko", "chinese": "zh", "russian": "ru", "portuguese": "pt"}


async def fetch(http: httpx.AsyncClient) -> list[dict[str, Any]]:
    """All facilities within the configured radius, following the pagination."""
    s = get_settings()
    lat, lng = (p.strip() for p in s.ingest_center.split(","))
    rows: list[dict[str, Any]] = []
    for page in range(1, MAX_PAGES + 1):
        resp = await http.get(
            URL,
            params={
                "sAddr": f'"{lat},{lng}"',
                "limitType": 2,  # distance search
                "limitValue": s.ingest_radius_m,
                "sType": "sa",  # substance use only
                "pageSize": PAGE_SIZE,
                "page": page,
                "sort": 0,
            },
            headers={"user-agent": s.ingest_user_agent, "accept": "application/json"},
            timeout=60,
        )
        if resp.status_code != 200 or "json" not in resp.headers.get("content-type", "").lower():
            raise IngestError(f"SAMHSA returned HTTP {resp.status_code}: {resp.text[:120]!r}")
        data = resp.json()
        if not isinstance(data, dict) or not isinstance(data.get("rows"), list):
            raise IngestError("SAMHSA response has no 'rows' list")
        rows.extend(data["rows"])
        if page >= int(data.get("totalPages") or 1):
            break
    return rows


def _services(row: dict[str, Any]) -> dict[str, list[str]]:
    """Service code -> values, e.g. {"SET": ["Outpatient", "Residential/24-hour residential"]}."""
    out: dict[str, list[str]] = {}
    for item in row.get("services") or []:
        out.setdefault(str(item.get("f2")), []).extend(split_list(item.get("f3")))
    return out


def normalize(row: dict[str, Any], now: Optional[datetime] = None) -> Optional[ResourceUpsert]:
    """One SAMHSA row -> ResourceUpsert, or None if it is not useful to our clients."""
    name = clean(row.get("name1"), 255)
    if not name:
        return None
    # name2 is the program ("Womens Recovery Center") or sometimes just the city; programs at one
    # address are separate resources, so the program name goes into the resource name
    program = clean(row.get("name2"), 120)
    if program and (program.lower() == (clean(row.get("city")) or "").lower() or program.lower() in name.lower()):
        program = None
    if program:
        name = f"{name} — {program}"[:255]
    svc = _services(row)
    lower = lambda code: [v.lower() for v in svc.get(code, [])]

    # Children/adolescent-only programs are no use to adult clients
    ages = svc.get("AGE", [])
    if ages and all("child" in a.lower() for a in ages):
        return None

    meta: dict[str, FieldMeta] = {}

    settings: list[AddictionSetting] = []
    set_text = " ".join(lower("SET"))
    if "outpatient" in set_text:
        settings.append(AddictionSetting.OUTPATIENT)
    if "residential" in set_text or "inpatient" in set_text:
        settings.append(AddictionSetting.INPATIENT)

    # Offers medication treatment: lists opioid medications, or a medication in its pharmacotherapies
    offers_meds = bool(svc.get("OM")) or any(w in " ".join(lower("PHR")) for w in MEDICATION_WORDS)
    medication = Tri.YES if offers_meds else Tri.UNKNOWN
    if offers_meds:
        meta["details.medication_assisted"] = FieldMeta(FieldSource.SCRAPED, Confidence.MEDIUM)

    cost = CostType.SLIDING_SCALE if any("sliding fee" in v for v in lower("PYAS")) else CostType.UNKNOWN
    if cost is not CostType.UNKNOWN:
        meta["cost_type"] = FieldMeta(FieldSource.SCRAPED, Confidence.HIGH)

    sexes = {v for v in lower("SN")}
    gender = Gender.UNKNOWN
    if sexes == {"female"}:
        gender = Gender.WOMEN
    elif sexes == {"male"}:
        gender = Gender.MEN
    elif sexes >= {"female", "male"}:
        gender = Gender.ANY
    if gender is not Gender.UNKNOWN:
        meta["gender"] = FieldMeta(FieldSource.SCRAPED, Confidence.MEDIUM)

    # A program built for criminal-justice clients takes people with records
    records = RecordsPolicy.UNKNOWN
    if any("criminal justice" in v for v in lower("SG")):
        records = RecordsPolicy.ACCEPTED
        meta["records_policy"] = FieldMeta(FieldSource.SCRAPED, Confidence.MEDIUM)

    languages: list[str] = []
    for v in lower("SL") + lower("OL"):
        code = LANGUAGE_CODES.get(v)
        if code and code not in languages:
            languages.append(code)
    if languages:
        meta["languages"] = FieldMeta(FieldSource.SCRAPED, Confidence.HIGH)

    exclusive = svc.get("EXCL", [])
    restrictions = f"Only for: {'; '.join(exclusive)}." if exclusive else None

    care = "; ".join(svc.get("TC", [])[:2])
    description = clean(f"{care}.", 300) if care else None

    street = clean(row.get("street1"), 255)
    if street and clean(row.get("street2")):
        street = f"{street}, {clean(row.get('street2'))}"
    address = (
        Address(street=street, city=clean(row.get("city"), 100) or "",
                state=clean(row.get("state"), 2) or "GA", zip=(clean(row.get("zip")) or "")[:10])
        if street else None
    )
    lat, lng = to_float(row.get("latitude")), to_float(row.get("longitude"))

    return ResourceUpsert(
        name=name,
        category=ResourceCategory.ADDICTION,
        source=SOURCE,
        description=description,
        address=address,
        location=LatLng(lat, lng) if lat is not None and lng is not None else None,
        phone=normalize_phone(row.get("phone")),
        website=normalize_url(row.get("website")),
        gender=gender,
        records_policy=records,
        restrictions_note=restrictions,
        languages=languages,
        cost_type=cost,
        details=AddictionDetails(setting=settings, medication_assisted=medication),
        source_url=SOURCE_URL,
        scraped_at=now or datetime.now(timezone.utc),
        field_meta=meta,
    )


async def collect(http: httpx.AsyncClient) -> tuple[list[ResourceUpsert], int]:
    """Fetch and normalize. Returns (resources, rows fetched)."""
    state = get_settings().ingest_state.upper()
    rows = [r for r in await fetch(http) if str(r.get("state", "")).upper() == state]
    now = datetime.now(timezone.utc)
    items = []
    for row in rows:
        try:
            item = normalize(row, now)
        except Exception:
            logger.exception("Could not normalize SAMHSA row %s", row.get("_irow"))
            continue
        if item:
            items.append(item)
    return items, len(rows)
