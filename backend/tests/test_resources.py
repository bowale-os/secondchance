"""Resources: ingest, search rules, client matching, document checks, endpoints."""

import json
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import get_current_staff
from app.db import get_session
from app.jobs.ingest_resources import IngestError, ingest, load_stops
from app.main import app
from app.routers.resources import Viewer, get_viewer
from app.security import create_client_token, hash_pin
from app.services import resources as svc
from app.tables import (
    Assignment, Base, Client, ClientId, EmploymentStatus, HousingStatus, IdStatus, IdType,
    Resource, Staff,
)

DATA = Path(__file__).resolve().parent.parent / "data"
ET = ZoneInfo("America/New_York")
# Tuesday Oct 13 2026, 12:00 Eastern: pantry (Tue 10-14) open, hot meal (11:30-13) open
NOON_TUE = datetime(2026, 10, 13, 12, 0, tzinfo=ET).astimezone(timezone.utc)
FIVE_POINTS = (33.7539, -84.3916)


def Q(**kw) -> svc.ResourceQuery:
    return svc.ResourceQuery(**kw)


@pytest_asyncio.fixture
async def env():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        await ingest(s, json.loads((DATA / "resources.sample.json").read_text()),
                     load_stops(DATA / "marta_stops.sample.csv"), now=NOON_TUE)
        staff = Staff(auth0_id="auth0|cw", email="cw@x.org", full_name="CW", is_active=True)
        other = Staff(auth0_id="auth0|o", email="o@x.org", full_name="O", is_active=True)
        client = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"), pin_failed_attempts=0,
                        is_active=True, housing_status=HousingStatus.HOMELESS,
                        employment_status=EmploymentStatus.SEEKING, has_transportation=False, language="es")
        s.add_all([staff, other, client])
        await s.flush()
        s.add(Assignment(client_id=client.id, staff_id=staff.id, is_active=True))
        s.add(ClientId(client_id=client.id, id_type=IdType.SSN_CARD, status=IdStatus.HELD, verified=True))
        await s.commit()
        ids = {"staff": staff.id, "other": other.id, "client": client.id}
    async with Session() as s:
        yield s, Session, ids
    await engine.dispose()


async def names(db, q, now=NOON_TUE, limit=50):
    return [i["name"] for i in (await svc.search(db, q, now, limit))["items"]]


# ---------- ingest ----------

@pytest.mark.asyncio
async def test_ingest_computes_transit(env):
    db, _, _ = env
    rows = {r.source_key: r for r in (await db.scalars(select(Resource))).all()}
    assert len(rows) == 10
    downtown = rows["sample-shelter-men-downtown"]
    assert downtown.near_transit is True and downtown.nearest_stops[0]["stop_name"].endswith("Five Points Station")
    assert len(downtown.nearest_stops) == 3
    assert rows["sample-shelter-east"].near_transit is False
    assert rows["sample-food-phone-only"].near_transit is None  # no location


@pytest.mark.asyncio
async def test_reingest_updates_in_place(env):
    db, _, _ = env
    data = json.loads((DATA / "resources.sample.json").read_text())
    data["resources"][0]["name"] = "SAMPLE Renamed Shelter"
    result = await ingest(db, data, now=NOON_TUE)
    assert result == {"created": 0, "updated": 10, "deactivated": 0}
    assert await db.scalar(select(Resource).where(Resource.name == "SAMPLE Renamed Shelter"))


@pytest.mark.asyncio
@pytest.mark.parametrize("patch,msg", [
    ({"category": "spa"}, "category"), ({"records_policy": "maybe"}, "records_policy"),
    ({"phone": "404-555-0100"}, "E.164"), ({"required_documents": ["passport"]}, "required_documents"),
    ({"key": ""}, "key"),
])
async def test_ingest_validation(env, patch, msg):
    db, _, _ = env
    item = {**json.loads((DATA / "resources.sample.json").read_text())["resources"][0], **patch}
    with pytest.raises(IngestError, match=msg):
        await ingest(db, {"resources": [item]})


# ---------- search ----------

@pytest.mark.asyncio
async def test_categories_and_flagged_hidden(env):
    db, _, _ = env
    r = await db.scalar(select(Resource).where(Resource.source_key == "sample-food-hot-meal"))
    r.verification = "flagged"
    await db.commit()
    assert set(await names(db, Q(categories=["food"]))) == {"SAMPLE Garnett Community Pantry", "SAMPLE Food Delivery Line"}


@pytest.mark.asyncio
async def test_unknown_never_excludes(env):
    db, _, _ = env
    # Eastside shelter: records_policy unknown, families unknown, languages [] -> kept
    got = await names(db, Q(categories=["shelter"], records_accepted=True, families=True, language="es"))
    assert "SAMPLE Eastside Shelter (far from rail)" in got
    assert "SAMPLE Downtown Men's Shelter" not in got  # families "no" and languages ["en"]


@pytest.mark.asyncio
async def test_near_transit_keeps_unknown(env):
    db, _, _ = env
    got = await names(db, Q(categories=["shelter", "food"], near_transit=True))
    assert "SAMPLE Eastside Shelter (far from rail)" not in got  # definite no
    assert "SAMPLE Food Delivery Line" in got                     # no location = unknown


@pytest.mark.asyncio
async def test_open_now(env):
    db, _, _ = env
    got = await names(db, Q(categories=["food", "shelter"], open_now=True))
    assert "SAMPLE Garnett Community Pantry" in got and "SAMPLE Midtown Hot Meal" in got
    assert "SAMPLE Downtown Men's Shelter" not in got         # opens 18:00
    assert "SAMPLE Eastside Shelter (far from rail)" in got   # hours unknown


def test_open_overnight():
    hours = [{"day": d, "opens": "18:00", "closes": "07:00", "label": None} for d in range(7)]
    assert svc.is_open(hours, datetime(2026, 10, 13, 2, 0, tzinfo=ET)) is True    # 2 AM
    assert svc.is_open(hours, datetime(2026, 10, 13, 12, 0, tzinfo=ET)) is False
    assert svc.is_open([], datetime(2026, 10, 13, 12, 0, tzinfo=ET)) is None


@pytest.mark.asyncio
async def test_no_id_gender_free(env):
    db, _, _ = env
    no_id = await names(db, Q(no_id_required=True))
    assert "SAMPLE Fair-Chance Warehouse" not in no_id and "SAMPLE Midtown Hot Meal" in no_id
    women = await names(db, Q(categories=["shelter"], gender="women"))
    assert "SAMPLE Downtown Men's Shelter" not in women
    free = await names(db, Q(categories=["addiction"], free_only=True))
    assert free == []  # sliding scale


@pytest.mark.asyncio
async def test_distance_sort_and_radius(env):
    db, _, _ = env
    res = await svc.search(db, Q(categories=["shelter"], origin_lat=FIVE_POINTS[0], origin_lng=FIVE_POINTS[1]), NOON_TUE)
    # verified first, then nearest
    assert res["items"][0]["name"] == "SAMPLE Downtown Men's Shelter"
    assert res["items"][0]["distance_m"] < 300
    near = await names(db, Q(categories=["shelter"], origin_lat=FIVE_POINTS[0], origin_lng=FIVE_POINTS[1], radius_m=3000))
    assert "SAMPLE Eastside Shelter (far from rail)" not in near


@pytest.mark.asyncio
async def test_events_starting_soon(env):
    db, _, _ = env
    week = await names(db, Q(categories=["classes", "events"], starts_within_days=7))
    assert set(week) == {"SAMPLE GED Prep Class", "SAMPLE Second-Chance Job Fair"}
    soon = await names(db, Q(categories=["classes", "events"], starts_within_days=3))
    assert soon == ["SAMPLE GED Prep Class"]


@pytest.mark.asyncio
async def test_pagination(env):
    db, _, _ = env
    first = await svc.search(db, Q(), NOON_TUE, limit=4)
    assert first["total"] == 10 and len(first["items"]) == 4 and first["next_cursor"]
    seen = [i["id"] for i in first["items"]]
    cursor = first["next_cursor"]
    while cursor:
        page = await svc.search(db, Q(cursor=cursor), NOON_TUE, limit=4)
        seen += [i["id"] for i in page["items"]]
        cursor = page["next_cursor"]
    assert len(seen) == len(set(seen)) == 10


def test_parse_query():
    from starlette.datastructures import QueryParams
    q, keys = svc.parse_query(QueryParams("categories=food&categories=jobs&near_transit=true&open_now=false&origin_lat=33.7&origin_lng=-84.4"))
    assert q.categories == ["food", "jobs"] and q.near_transit is True and q.open_now is None
    assert keys == {"categories", "near_transit", "origin"}
    q, keys = svc.parse_query(QueryParams("near_transit=false&language="), explicit=True)
    assert q.near_transit is False and keys == {"near_transit", "language"}
    with pytest.raises(svc.QueryError):
        svc.parse_query(QueryParams("categories=spa"))


# ---------- client context ----------

@pytest.mark.asyncio
async def test_profile_mapping_never_infers_recovery(env):
    db, _, ids = env
    client = await db.get(Client, ids["client"])
    q, keys = await svc.profile_query(db, client)
    assert q.categories == ["shelter", "jobs"]
    assert q.near_transit is True and q.language == "es" and q.no_id_required is True
    assert "addiction" not in q.categories


@pytest.mark.asyncio
async def test_overrides_turn_filters_off(env):
    db, _, ids = env
    client = await db.get(Client, ids["client"])
    from starlette.datastructures import QueryParams
    overrides, okeys = svc.parse_query(QueryParams("near_transit=false&categories=food&free_only=true"), explicit=True)
    match = await svc.client_matches(db, client, overrides, okeys, NOON_TUE)
    assert "near_transit" not in match["query"]
    assert match["query"]["categories"] == ["food"]
    applied = {a["key"]: a["reason"] for a in match["applied"]}
    assert applied["categories"] == "manual" and applied["free_only"] == "manual"
    assert applied["language"] == "profile" and applied["no_id_required"] == "profile"


@pytest.mark.asyncio
async def test_document_checks(env):
    db, _, ids = env
    job = await db.scalar(select(Resource).where(Resource.source_key == "sample-job-warehouse"))
    checks = await svc.document_checks(db, ids["client"], job)
    assert checks == [{"document": "photo_id", "status": "missing"}, {"document": "ssn_card", "status": "have"}]


# ---------- endpoints ----------

@pytest_asyncio.fixture
async def api(env):
    _, Session, ids = env

    async def session_override():
        async with Session() as s:
            yield s

    who = {"staff": ids["staff"]}

    async def staff_override():
        async with Session() as s:
            return await s.get(Staff, who["staff"])

    async def viewer_override():
        return Viewer(staff=await staff_override())

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_staff] = staff_override
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c, ids, who, viewer_override
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_search_endpoint_needs_auth(api):
    c, *_ = api
    assert (await c.get("/resources")).status_code == 401


@pytest.mark.asyncio
async def test_client_token_search_and_detail_with_own_checks(api):
    c, ids, *_ = api
    token, _ = create_client_token(ids["client"])
    h = {"Authorization": f"Bearer {token}"}
    res = (await c.get("/resources?categories=jobs", headers=h)).json()
    assert res["total"] == 1
    detail = (await c.get(f"/resources/{res['items'][0]['id']}", headers=h)).json()
    assert detail["details"]["employer"] == "SAMPLE Logistics Co"
    assert {"document": "photo_id", "status": "missing"} in detail["document_checks"]
    me = (await c.get("/me/resources", headers=h)).json()
    assert set(me) == {"query", "applied", "results"}


@pytest.mark.asyncio
async def test_staff_detail_checks_only_for_my_client(api):
    c, ids, who, viewer_override = api
    app.dependency_overrides[get_viewer] = viewer_override
    rid = (await c.get("/resources?categories=jobs")).json()["items"][0]["id"]
    plain = (await c.get(f"/resources/{rid}")).json()
    assert plain["document_checks"] is None
    mine = (await c.get(f"/resources/{rid}?client_id={ids['client']}")).json()
    assert mine["document_checks"]
    who["staff"] = ids["other"]
    assert (await c.get(f"/resources/{rid}?client_id={ids['client']}")).status_code == 404
    assert (await c.get(f"/clients/{ids['client']}/resources")).status_code == 404


@pytest.mark.asyncio
async def test_bad_query_is_422(api):
    c, ids, who, viewer_override = api
    app.dependency_overrides[get_viewer] = viewer_override
    assert (await c.get("/resources?categories=spa")).status_code == 422
