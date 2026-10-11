"""Morning nudge: opting in by text, and the cron job."""

from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.jobs.morning_nudges import run_nudges
from app.security import hash_pin
from app.services import bot_messages as msg
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.bot_keywords import parse_nudge
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.tables import (
    Appointment,
    Base,
    BotAuditLog,
    BotEnrollment,
    BotEnrollmentStatus,
    BotSession,
    BotSessionState,
    Client,
)

ET = ZoneInfo("America/New_York")
PHONE = "+14045550100"
TODAY = date(2026, 10, 12)


def at(h, mi=0, d=TODAY):
    return datetime(d.year, d.month, d.day, h, mi, tzinfo=ET).astimezone(timezone.utc)


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        c = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"),
                   pin_failed_attempts=0, is_active=True)
        s.add(c)
        await s.flush()
        s.add(BotEnrollment(client_id=c.id, phone_encrypted=encrypt_phone(PHONE),
                            phone_hash=phone_lookup_hash(PHONE), phone_last4="0100",
                            status=BotEnrollmentStatus.ACTIVE, consent_at=at(7),
                            nudge_enabled=False, nudge_time=time(8, 0)))
        s.add(Appointment(client_id=c.id, title="Parole check-in", starts_at=at(10), cancelled=False))
        await s.commit()
    async with Session() as s:
        yield s
    await engine.dispose()


async def say(db, text):
    return (await handle_inbound(db, Inbound(sender=PHONE, text=text))).replies


async def enrollment(db) -> BotEnrollment:
    e = await db.scalar(select(BotEnrollment))
    await db.refresh(e)
    return e


# ---------- parsing ----------

@pytest.mark.parametrize("text,expected", [
    ("NUDGE ON", ("on", None)), ("nudge off", ("off", None)), ("Reminders off.", ("off", None)),
    ("nudge 7:30", ("on", time(7, 30))), ("nudge 6pm", ("on", time(18, 0))),
    ("nudge 7", ("on", time(7, 0))), ("nudge 3", ("bad_time", None)), ("nudge 10pm", ("bad_time", None)),
    ("nudge me about court", None), ("Maria Lopez", None),
])
def test_parse_nudge(text, expected):
    assert parse_nudge(text) == expected


# ---------- by text ----------

@pytest.mark.asyncio
async def test_nudge_on_requires_sign_in_and_is_not_a_login_attempt(db):
    assert (await say(db, "NUDGE ON"))[0].startswith("Sign in first")
    assert (await say(db, "nudge on"))[0].startswith("Sign in first")
    s = await db.scalar(select(BotSession))
    assert s.state == BotSessionState.AWAITING_NAME and s.failed_attempts == 0
    assert (await enrollment(db)).nudge_enabled is False


@pytest.mark.asyncio
async def test_nudge_on_and_time_after_sign_in(db):
    for t in ("hi", "Maria Lopez", "4821"):
        await say(db, t)
    reply = (await say(db, "nudge 7:30"))[0]
    assert "7:30 AM" in reply and "won't say what" in reply
    e = await enrollment(db)
    assert e.nudge_enabled and e.nudge_time == time(7, 30)
    assert (await say(db, "nudge 3")) == [msg.NUDGE_BAD_TIME]


@pytest.mark.asyncio
async def test_nudge_off_works_without_sign_in(db):
    e = await enrollment(db)
    e.nudge_enabled = True
    await db.commit()
    assert await say(db, "NUDGE OFF") == [msg.NUDGE_OFF]
    assert (await enrollment(db)).nudge_enabled is False


# ---------- the job ----------

async def opt_in(db, **kw):
    e = await enrollment(db)
    e.nudge_enabled = True
    for k, v in kw.items():
        setattr(e, k, v)
    await db.commit()


class Sender:
    def __init__(self, ok=True):
        self.ok, self.sent = ok, []

    async def __call__(self, to, text):
        self.sent.append((to, text))
        return self.ok


@pytest.mark.asyncio
async def test_sends_once_at_chosen_time_with_no_content(db):
    await opt_in(db)
    send = Sender()
    assert (await run_nudges(db, at(7, 45), send)).not_due == 1   # too early
    r = await run_nudges(db, at(8, 5), send)
    assert r.sent == 1 and send.sent == [(PHONE, msg.NUDGE)]
    assert "Parole" not in send.sent[0][1]
    await run_nudges(db, at(8, 20), send)                          # same day: no repeat
    assert len(send.sent) == 1
    assert (await enrollment(db)).last_nudged_on == TODAY


@pytest.mark.asyncio
async def test_no_nudge_on_empty_day(db):
    await opt_in(db)
    send = Sender()
    tomorrow = date(2026, 10, 13)
    r = await run_nudges(db, at(8, 5, tomorrow), send)
    assert r.skipped_empty == 1 and send.sent == []


@pytest.mark.asyncio
async def test_window_closes(db):
    await opt_in(db)
    send = Sender()
    assert (await run_nudges(db, at(10, 30), send)).not_due == 1  # >2h late
    assert send.sent == []


@pytest.mark.asyncio
async def test_failed_send_is_retried(db):
    await opt_in(db)
    assert (await run_nudges(db, at(8, 5), Sender(ok=False))).failed == 1
    assert (await enrollment(db)).last_nudged_on is None
    retry = Sender()
    assert (await run_nudges(db, at(8, 20), retry)).sent == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [BotEnrollmentStatus.STOPPED, BotEnrollmentStatus.LOCKED, BotEnrollmentStatus.REVOKED])
async def test_skips_inactive_enrollments(db, status):
    await opt_in(db, status=status)
    send = Sender()
    await run_nudges(db, at(8, 5), send)
    assert send.sent == []


@pytest.mark.asyncio
async def test_not_opted_in(db):
    send = Sender()
    await run_nudges(db, at(8, 5), send)
    assert send.sent == []


@pytest.mark.asyncio
async def test_dry_run_sends_nothing(db):
    await opt_in(db)
    send = Sender()
    assert (await run_nudges(db, at(8, 5), send, dry_run=True)).sent == 1
    assert send.sent == [] and (await enrollment(db)).last_nudged_on is None


@pytest.mark.asyncio
async def test_audit_has_no_content(db):
    await opt_in(db)
    await run_nudges(db, at(8, 5), Sender())
    rows = (await db.scalars(select(BotAuditLog))).all()
    assert [(r.intent, r.outcome) for r in rows] == [("nudge", "sent")]
