"""Phase 4: geocoding, static map, directions, MAP over text, home-as-origin privacy."""

import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import get_settings
from app.jobs.ingest_resources import ingest, load_stops
from app.security import hash_pin
from app.services import bot_conversation, maps
from app.services import resources as svc
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.bot_types import BotImage
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.tables import Base, BotEnrollment, BotEnrollmentStatus, Client

DATA = Path(__file__).resolve().parent.parent / "data"
ET = ZoneInfo("America/New_York")
PHONE = "+14045550100"
NOON_TUE = datetime(2026, 10, 13, 12, 0, tzinfo=ET).astimezone(timezone.utc)
HOME = (33.7400, -84.4000)  # pretend geocode of the client's address
PNG = b"\x89PNG\r\n\x1a\nfake"


@pytest.fixture
def maps_key(monkeypatch):
    monkeypatch.setattr(get_settings(), "maps_api_key", SecretStr("test-maps-key"))
    maps._cache.clear()
    yield
    maps._cache.clear()


# ---------- unit ----------

@pytest.mark.asyncio
async def test_geocode_parses_and_caches(maps_key):
    calls = []

    def handler(req: httpx.Request):
        calls.append(req.url)
        return httpx.Response(200, json={"status": "OK", "results": [{"geometry": {"location": {"lat": 33.7, "lng": -84.4}}}]})

    t = httpx.MockTransport(handler)
    assert await maps.geocode("100 Main St", httpx.AsyncClient(transport=t)) == (33.7, -84.4)
    assert await maps.geocode("100  main st.", httpx.AsyncClient(transport=t)) == (33.7, -84.4)  # cached
    assert len(calls) == 1
    q = parse_qs(urlsplit(str(calls[0])).query)
    assert q["components"] == ["country:US|administrative_area:GA"] and q["key"] == ["test-maps-key"]


@pytest.mark.asyncio
async def test_geocode_errors_are_none_and_not_cached(maps_key):
    t = httpx.MockTransport(lambda r: httpx.Response(200, json={"status": "OVER_QUERY_LIMIT"}))
    assert await maps.geocode("x", httpx.AsyncClient(transport=t)) is None
    assert maps._cache == {}


@pytest.mark.asyncio
async def test_no_key_means_no_calls():
    assert await maps.geocode("100 Main St") is None
    assert await maps.static_map_png([maps.MapPoint("1", 33.7, -84.4)]) is None


def test_static_url_has_numbered_markers_and_no_center(maps_key):
    url = maps.static_map_url([maps.MapPoint("1", 33.75, -84.39), maps.MapPoint("2", 33.74, -84.41)], [(33.7539, -84.3916)])
    q = parse_qs(urlsplit(url).query)
    assert "center" not in q and "zoom" not in q  # auto-fit to the results
    assert q["markers"][0] == "color:red|label:1|33.75000,-84.39000"
    assert q["markers"][2].startswith("size:tiny|color:blue|")


def test_directions_has_no_origin():
    q = parse_qs(urlsplit(maps.directions_url(33.7478, -84.3965)).query)
    assert q == {"api": ["1"], "destination": ["33.74780,-84.39650"], "travelmode": ["transit"]}


# ---------- over text ----------

@pytest_asyncio.fixture
async def db(monkeypatch, maps_key):
    monkeypatch.setattr(bot_conversation, "_now", lambda: NOON_TUE)
    geocoded = []

    async def fake_geocode(address, http=None):
        geocoded.append(address)
        return HOME if "Home St" in address else None

    async def fake_png(points, stops=(), http=None):
        fake_png.points = points
        return PNG

    monkeypatch.setattr(maps, "geocode", fake_geocode)
    monkeypatch.setattr(maps, "static_map_png", fake_png)
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        await ingest(s, json.loads((DATA / "resources.sample.json").read_text()),
                     load_stops(DATA / "marta_stops.sample.csv"), now=NOON_TUE)
        c = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"), pin_failed_attempts=0,
                   is_active=True, address_line="12 Home St SW", city="Atlanta", zip_code="30310", state="GA")
        s.add(c)
        await s.flush()
        s.add(BotEnrollment(client_id=c.id, phone_encrypted=encrypt_phone(PHONE), phone_hash=phone_lookup_hash(PHONE),
                            phone_last4="0100", status=BotEnrollmentStatus.ACTIVE, consent_at=NOON_TUE))
        await s.commit()
        cid = c.id
    async with Session() as s:
        for t in ("hi", "Maria Lopez", "4821"):
            await handle_inbound(s, Inbound(sender=PHONE, text=t))
        yield s, geocoded, fake_png, cid
    await engine.dispose()


async def say(db, text):
    return (await handle_inbound(db, Inbound(sender=PHONE, text=text))).replies


@pytest.mark.asyncio
async def test_home_sorts_but_is_never_shown(db):
    s, geocoded, *_ = db
    reply = (await say(s, "FOOD"))[0]
    assert reply.splitlines()[0] == "Food near you:"
    assert "mi" in reply.splitlines()[1]          # distances from home
    assert "Home St" not in reply and "33.74000" not in reply
    assert any("Home St" in a for a in geocoded)  # geocoded server-side


@pytest.mark.asyncio
async def test_map_reply_has_image_and_links_without_home(db):
    s, _, fake_png, _ = db
    await say(s, "food near Garnett")
    out = await say(s, "MAP")
    text, image = out
    assert isinstance(image, BotImage) and image.data == PNG
    assert text.splitlines()[0] == "Map: Food near Garnett"
    assert "travelmode=transit" in text and "origin" not in text
    assert "No address for 3" in text  # phone-only delivery line
    assert [p.label for p in fake_png.points] == ["1", "2"]
    assert all((p.lat, p.lng) != (33.74, -84.40) for p in fake_png.points)


@pytest.mark.asyncio
async def test_map_without_list(db):
    s, *_ = db
    assert (await say(s, "map"))[0].startswith("Send FOOD")


@pytest.mark.asyncio
async def test_map_falls_back_to_links(db, monkeypatch):
    s, *_ = db

    async def no_png(points, stops=(), http=None):
        return None
    monkeypatch.setattr(maps, "static_map_png", no_png)
    await say(s, "shelter")
    out = await say(s, "map")
    assert len(out) == 1 and "unavailable" in out[0] and "maps/dir" in out[0]


@pytest.mark.asyncio
async def test_detail_has_directions(db):
    s, *_ = db
    await say(s, "jobs")
    d = (await say(s, "1"))[0]
    assert "Directions: https://www.google.com/maps/dir/?api=1&destination=" in d


@pytest.mark.asyncio
async def test_router_sends_image_as_base64(db):
    s, *_ = db
    from app.routers import bot as bot_router
    from app.schemas import BotInbound
    await say(s, "food near Garnett")
    result = await bot_router.inbound(BotInbound(sender=PHONE, text="MAP"), s)
    assert result.replies[0].image is not None
    assert base64.b64decode(result.replies[0].image.data_base64) == PNG
    assert result.replies[0].image.mime_type == "image/png"


@pytest.mark.asyncio
async def test_profile_query_uses_home_origin(db):
    s, _, _, cid = db
    client = await s.get(Client, cid)
    q, keys = await svc.profile_query(s, client)
    assert (q.origin_lat, q.origin_lng) == HOME and "origin" in keys
