"""Resources over text: lists, MORE, details, places, and the Gemini router (faked)."""

import json
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.jobs.ingest_resources import ingest, load_stops
from app.security import hash_pin
from app.services import bot_conversation, bot_intent
from app.services import bot_messages as msg
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.bot_intent import Intent
from app.services.bot_resources import parse_fast
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.services.places import lookup
from app.tables import Base, BotAuditLog, BotEnrollment, BotEnrollmentStatus, Client, ClientId, IdStatus, IdType

DATA = Path(__file__).resolve().parent.parent / "data"
ET = ZoneInfo("America/New_York")
PHONE = "+14045550100"
NOON_TUE = datetime(2026, 10, 13, 12, 0, tzinfo=ET).astimezone(timezone.utc)


@pytest_asyncio.fixture
async def db(monkeypatch):
    monkeypatch.setattr(bot_conversation, "_now", lambda: NOON_TUE)
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        await ingest(s, json.loads((DATA / "resources.sample.json").read_text()),
                     load_stops(DATA / "marta_stops.sample.csv"), now=NOON_TUE)
        c = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"),
                   pin_failed_attempts=0, is_active=True)
        s.add(c)
        await s.flush()
        s.add(ClientId(client_id=c.id, id_type=IdType.SSN_CARD, status=IdStatus.HELD, verified=True))
        s.add(BotEnrollment(client_id=c.id, phone_encrypted=encrypt_phone(PHONE),
                            phone_hash=phone_lookup_hash(PHONE), phone_last4="0100",
                            status=BotEnrollmentStatus.ACTIVE, consent_at=NOON_TUE))
        await s.commit()
    async with Session() as s:
        for t in ("hi", "Maria Lopez", "4821"):
            await handle_inbound(s, Inbound(sender=PHONE, text=t))
        yield s
    await engine.dispose()


async def say(db, text):
    return (await handle_inbound(db, Inbound(sender=PHONE, text=text))).replies[0]


def test_parse_fast():
    assert parse_fast("FOOD").category == "food"
    a = parse_fast("shelter near West End station")
    assert a.category == "shelter" and a.place == "West End station"
    assert parse_fast("where can I eat") is None
    assert parse_fast("recovery").category == "addiction"


def test_places():
    assert lookup("West End station")[0] == "West End"
    assert lookup("5 Points")[0] == "Five Points"
    assert lookup("MARTA Garnett")[0] == "Garnett"
    assert lookup("my aunt's house") is None


@pytest.mark.asyncio
async def test_food_near_station_list(db):
    reply = await say(db, "FOOD near Garnett")
    lines = reply.splitlines()
    assert lines[0] == "Food near Garnett:"
    assert lines[1].startswith("1. SAMPLE Garnett Community Pantry - 0.1 mi, open now, near rail/bus")
    assert "not verified yet" in reply  # hot meal / delivery line are unverified
    assert lines[-1] == "Reply 1-3 for details."  # exactly 3 food listings in the sample


@pytest.mark.asyncio
async def test_more_and_numbering_continue(db):
    first = await say(db, "shelter")
    assert "MORE for more" in first or "Reply 1-3" in first
    reply = await say(db, "events")  # 1 sample event -> no MORE
    assert "MORE" not in reply.splitlines()[-1]
    assert (await say(db, "MORE")).startswith("That's everything")


@pytest.mark.asyncio
async def test_detail_with_document_checks(db):
    await say(db, "jobs")
    d = await say(db, "1")
    assert d.splitlines()[0] == "SAMPLE Fair-Chance Warehouse"
    assert "Call (404) 555-0106" in d
    assert "Bring: a photo ID (we don't have one on file); your Social Security card" in d
    assert "$16-18/hr" in d and "Nearest stop:" in d and "Checked by staff" in d


@pytest.mark.asyncio
async def test_detail_without_list_and_out_of_range(db):
    assert (await say(db, "2")).startswith("Send FOOD")
    await say(db, "events")  # one sample event
    assert (await say(db, "9")) == "Reply 1 for details."
    await say(db, "food")
    assert (await say(db, "9")) == "Pick a number from 1 to 3."


@pytest.mark.asyncio
async def test_unknown_place(db):
    reply = await say(db, "food near my cousin's")
    assert "don't know" in reply and "Food:" in reply.splitlines()[0]


@pytest.mark.asyncio
async def test_no_router_falls_back(db):
    assert await say(db, "where can I eat tonight") == msg.NOT_AVAILABLE_YET


@pytest.mark.asyncio
async def test_long_number_never_sent_to_router(db, monkeypatch):
    called = []

    async def spy(text):
        called.append(text)
        return None

    monkeypatch.setattr(bot_intent, "classify", spy)
    await say(db, "4821")
    assert called == []


@pytest.mark.asyncio
async def test_router_dispatch(db, monkeypatch):
    async def fake(text):
        return Intent(tool="search_resources", category="food", near_place="Five Points")
    monkeypatch.setattr(bot_intent, "classify", fake)
    reply = await say(db, "where can I eat tonight near five points")
    assert reply.startswith("Food near Five Points:")


@pytest.mark.asyncio
async def test_router_schedule(db, monkeypatch):
    async def fake(text):
        return Intent(tool="get_schedule", schedule_range="week")
    monkeypatch.setattr(bot_intent, "classify", fake)
    assert (await say(db, "what do I have coming up")).startswith("Nothing on your schedule")


@pytest.mark.asyncio
async def test_recovery_never_inferred(db, monkeypatch):
    async def fake(text):
        return Intent(tool="search_resources", category="addiction")
    monkeypatch.setattr(bot_intent, "classify", fake)
    # model wrongly picks addiction for an unrelated ask -> refused
    assert (await say(db, "I need help with my paperwork")) == msg.NOT_UNDERSTOOD
    # explicit ask -> allowed
    assert (await say(db, "I want to get into treatment")).startswith("Recovery help")


@pytest.mark.asyncio
async def test_router_unknown(db, monkeypatch):
    async def fake(text):
        return Intent(tool="unknown")
    monkeypatch.setattr(bot_intent, "classify", fake)
    assert await say(db, "can you fix my parole") == msg.NOT_UNDERSTOOD


@pytest.mark.asyncio
async def test_audit_has_no_content(db):
    await say(db, "FOOD near Garnett")
    await say(db, "1")
    rows = (await db.scalars(select(BotAuditLog))).all()
    blob = " ".join(r.intent + r.outcome for r in rows)
    assert "Garnett" not in blob and "SAMPLE" not in blob
    assert "resources.food" in blob


@pytest.mark.asyncio
async def test_requires_sign_in(db):
    await say(db, "sign out")
    reply = await say(db, "FOOD")
    assert reply == msg.ASK_NAME or "SAMPLE" not in reply


@pytest.mark.asyncio
async def test_more_pages_and_numbers_continue(db):
    extra = [{"key": f"sample-extra-shelter-{i}", "category": "shelter", "name": f"SAMPLE Extra Shelter {i}",
              "location": {"lat": 33.75 + i / 100, "lng": -84.39}} for i in range(4)]
    await ingest(db, {"resources": extra}, now=NOON_TUE)
    first = await say(db, "shelter near Five Points")
    assert first.splitlines()[-1] == "Reply 1-3 for details, MORE for more."
    more = await say(db, "more")
    lines = more.splitlines()
    assert lines[0] == "More shelters near Five Points:"
    assert lines[1].startswith("4. ")
    fourth = lines[1][3:].split(" - ")[0]
    assert (await say(db, "4")).splitlines()[0] == fourth
    last = await say(db, "MORE")
    assert last.splitlines()[1].startswith("7. ")
    assert (await say(db, "MORE")).startswith("That's everything")
