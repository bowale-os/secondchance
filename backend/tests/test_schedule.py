"""Schedule service, text rendering, TODAY/WEEK over the bot, and case-worker CRUD."""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import get_current_staff
from app.db import get_session
from app.main import app
from app.security import hash_pin
from app.services import bot_conversation
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.bot_schedule_text import render
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.services.schedule import get_schedule, window
from app.tables import (
    Appointment,
    Assignment,
    Base,
    BotEnrollment,
    BotEnrollmentStatus,
    Client,
    ClientObligation,
    ObligationStatus,
    ObligationType,
    Staff,
)

ET = ZoneInfo("America/New_York")
PHONE = "+14045550100"
# Saturday Oct 10 2026, 9:00 PM Eastern = Oct 11 01:00 UTC (tests the day boundary)
NOW = datetime(2026, 10, 11, 1, 0, tzinfo=timezone.utc)
TODAY = date(2026, 10, 10)


def et(y, mo, d, h, mi=0):
    """Eastern wall time, stored as UTC like the API does (SQLite drops offsets)."""
    return datetime(y, mo, d, h, mi, tzinfo=ET).astimezone(timezone.utc)


@pytest_asyncio.fixture
async def env():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        staff = Staff(auth0_id="auth0|cw", email="cw@example.org", full_name="Case Worker", is_active=True)
        other = Staff(auth0_id="auth0|x", email="x@example.org", full_name="Other", is_active=True)
        client = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"),
                        pin_failed_attempts=0, is_active=True)
        stranger = Client(first_name="Sam", last_name="Lee", pin_hash=hash_pin("1111"),
                          pin_failed_attempts=0, is_active=True)
        s.add_all([staff, other, client, stranger])
        await s.flush()
        s.add(Assignment(client_id=client.id, staff_id=staff.id, is_active=True))
        s.add(BotEnrollment(client_id=client.id, phone_encrypted=encrypt_phone(PHONE),
                            phone_hash=phone_lookup_hash(PHONE), phone_last4="0100",
                            status=BotEnrollmentStatus.ACTIVE, consent_at=NOW))
        court = ClientObligation(client_id=client.id, obligation_type=ObligationType.COURT_DATE,
                                 description="Fulton County hearing", due_date=date(2026, 10, 13),
                                 status=ObligationStatus.OPEN, verified=True)
        s.add_all([
            # today, evening (after NOW in local time is irrelevant: whole day is shown)
            Appointment(client_id=client.id, title="Parole check-in", starts_at=et(2026, 10, 10, 10),
                        location_name="Parole office", address="2 Peachtree St",
                        transit_note="Five Points station", documents_to_bring=["State ID", "Pay stub"],
                        cancelled=False),
            # late tonight local, which is tomorrow in UTC: must count as today
            Appointment(client_id=client.id, title="Group meeting", starts_at=et(2026, 10, 10, 22),
                        cancelled=False),
            Appointment(client_id=client.id, title="Cancelled thing", starts_at=et(2026, 10, 10, 11),
                        cancelled=True),
            Appointment(client_id=client.id, title="Job interview", starts_at=et(2026, 10, 12, 14),
                        cancelled=False),
            Appointment(client_id=client.id, title="Too far out", starts_at=et(2026, 10, 20, 9),
                        cancelled=False),
            Appointment(client_id=stranger.id, title="Not hers", starts_at=et(2026, 10, 10, 12),
                        cancelled=False),
            court,
            ClientObligation(client_id=client.id, obligation_type=ObligationType.FEE,
                             description="Supervision fee", amount=Decimal("30.00"),
                             due_date=TODAY, status=ObligationStatus.OVERDUE, verified=True),
            ClientObligation(client_id=client.id, obligation_type=ObligationType.CHECK_IN,
                             description="AI guess, unverified", due_date=TODAY,
                             status=ObligationStatus.OPEN, verified=False),
            ClientObligation(client_id=client.id, obligation_type=ObligationType.REPORT,
                             description="Already done", due_date=TODAY,
                             status=ObligationStatus.DONE, verified=True),
        ])
        await s.commit()
        ids = dict(client=client.id, stranger=stranger.id, staff=staff.id, other=other.id, court=court.id)
    async with Session() as s:
        yield s, Session, ids
    await engine.dispose()


@pytest.mark.asyncio
async def test_today_in_local_time(env):
    db, _, ids = env
    items = await get_schedule(db, ids["client"], "day", NOW)
    titles = [i.title for i in items]
    # all-day/due items first, then by time; cancelled, unverified, done, other client excluded
    assert titles == ["Payment due: Supervision fee", "Parole check-in", "Group meeting"]
    assert items[0].overdue and items[0].amount == Decimal("30.00")


@pytest.mark.asyncio
async def test_week_window(env):
    db, _, ids = env
    assert window("week", NOW) == (TODAY, date(2026, 10, 16))
    titles = [i.title for i in await get_schedule(db, ids["client"], "week", NOW)]
    assert "Job interview" in titles and "Court date: Fulton County hearing" in titles
    assert "Too far out" not in titles


@pytest.mark.asyncio
async def test_linked_obligation_not_duplicated(env):
    db, _, ids = env
    db.add(Appointment(client_id=ids["client"], title="Court hearing", starts_at=et(2026, 10, 13, 9),
                       obligation_id=ids["court"], cancelled=False))
    await db.commit()
    titles = [i.title for i in await get_schedule(db, ids["client"], "week", NOW)]
    assert "Court hearing" in titles
    assert not any(t.startswith("Court date") for t in titles)


@pytest.mark.asyncio
async def test_render_day_text(env):
    db, _, ids = env
    items = await get_schedule(db, ids["client"], "day", NOW)
    text = render("day", items, TODAY, TODAY)
    assert text.startswith("Today, Sat Oct 10:")
    assert "1. Payment due: Supervision fee ($30) - OVERDUE" in text
    assert "2. 10:00 AM Parole check-in" in text
    assert "Where: Parole office, 2 Peachtree St" in text
    assert "Transit: Five Points station" in text
    assert "Bring: State ID, Pay stub" in text
    assert "**" not in text  # plain text for SMS


@pytest.mark.asyncio
async def test_render_week_groups_by_day(env):
    db, _, ids = env
    text = render("week", await get_schedule(db, ids["client"], "week", NOW), TODAY, TODAY)
    assert "\nToday\n" in text and "\nMon Oct 12\n- 2:00 PM Job interview" in text
    assert "\nTue Oct 13\n- Court date: Fulton County hearing" in text


@pytest.mark.asyncio
async def test_empty_day(env):
    assert "nothing on your schedule" in render("day", [], date(2026, 10, 11), TODAY)


async def _sign_in(db):
    for text in ("hi", "Maria Lopez", "4821"):
        out = await handle_inbound(db, Inbound(sender=PHONE, text=text))
    return out


@pytest.mark.asyncio
async def test_bot_today_and_week(env, monkeypatch):
    db, _, _ = env
    monkeypatch.setattr(bot_conversation, "_now", lambda: NOW)
    assert (await _sign_in(db)).client_id
    today = (await handle_inbound(db, Inbound(sender=PHONE, text="today"))).replies[0]
    assert "Parole check-in" in today and "Not hers" not in today
    week = (await handle_inbound(db, Inbound(sender=PHONE, text="WEEK"))).replies[0]
    assert week.startswith("Next 7 days:")
    tomorrow = (await handle_inbound(db, Inbound(sender=PHONE, text="Tomorrow"))).replies[0]
    assert tomorrow.startswith("Tomorrow, Sun Oct 11")


@pytest.mark.asyncio
async def test_bot_schedule_requires_sign_in(env, monkeypatch):
    db, _, _ = env
    monkeypatch.setattr(bot_conversation, "_now", lambda: NOW)
    await handle_inbound(db, Inbound(sender=PHONE, text="hi"))
    out = await handle_inbound(db, Inbound(sender=PHONE, text="TODAY"))  # taken as a name
    assert "Parole" not in out.replies[0]


# ---------- case-worker CRUD ----------

@pytest_asyncio.fixture
async def api(env):
    _, Session, ids = env

    async def session_override():
        async with Session() as s:
            yield s

    current = {"id": ids["staff"]}

    async def staff_override():
        async with Session() as s:
            return await s.get(Staff, current["id"])

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_current_staff] = staff_override
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
        yield c, ids, current
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_crud_flow(api):
    c, ids, _ = api
    base = f"/clients/{ids['client']}/appointments"
    start = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0)
    r = await c.post(base, json={"title": " Doctor ", "starts_at": start.isoformat(),
                                 "documents_to_bring": ["Medicaid card", " "]})
    assert r.status_code == 201, r.text
    appt = r.json()
    assert appt["title"] == "Doctor" and appt["documents_to_bring"] == ["Medicaid card"]

    r = await c.put(f"{base}/{appt['id']}", json={"title": "Doctor visit", "starts_at": start.isoformat(),
                                                   "address": "1 Main St"})
    assert r.status_code == 200 and r.json()["address"] == "1 Main St"

    r = await c.delete(f"{base}/{appt['id']}")
    assert r.json()["cancelled"] is True

    titles = [a["title"] for a in (await c.get(base)).json()]
    assert "Doctor visit" in titles  # cancelled still listed for the case worker


@pytest.mark.asyncio
async def test_naive_time_is_local(api):
    c, ids, _ = api
    r = await c.post(f"/clients/{ids['client']}/appointments",
                     json={"title": "Class", "starts_at": "2026-12-01T09:00:00"})
    assert r.json()["starts_at"].startswith("2026-12-01T14:00:00")  # 9 AM EST = 14:00 UTC


@pytest.mark.asyncio
async def test_validation(api):
    c, ids, _ = api
    base = f"/clients/{ids['client']}/appointments"
    bad_end = await c.post(base, json={"title": "x", "starts_at": "2026-12-01T09:00:00",
                                       "ends_at": "2026-12-01T08:00:00"})
    assert bad_end.status_code == 422
    other_obligation = await c.post(base, json={"title": "x", "starts_at": "2026-12-01T09:00:00",
                                                "obligation_id": str(uuid.uuid4())})
    assert other_obligation.status_code == 422


@pytest.mark.asyncio
async def test_not_my_client(api):
    c, ids, current = api
    current["id"] = ids["other"]
    r = await c.get(f"/clients/{ids['client']}/appointments")
    assert r.status_code == 404
    r = await c.post(f"/clients/{ids['client']}/appointments",
                     json={"title": "x", "starts_at": "2026-12-01T09:00:00"})
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_schedule_preview(api):
    c, ids, _ = api
    r = await c.get(f"/clients/{ids['client']}/schedule", params={"range": "week"})
    assert r.status_code == 200 and isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_schedule_text_preview(api):
    c, ids, current = api
    r = await c.get(f"/clients/{ids['client']}/schedule/text", params={"range": "week"})
    assert r.status_code == 200 and r.json()["text"]
    current["id"] = ids["other"]
    assert (await c.get(f"/clients/{ids['client']}/schedule/text")).status_code == 404
