"""Sign-in state machine, end to end through the service against in-memory SQLite."""

from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.security import hash_pin
from app.services import bot_messages as msg
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.tables import (
    Base,
    BotAuditLog,
    BotEnrollment,
    BotEnrollmentStatus,
    BotSession,
    BotSessionState,
    Client,
)

PHONE = "+14045550100"
STRANGER = "+14045550199"


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        client = Client(first_name="Maria", last_name="López", preferred_name="Mari",
                        pin_hash=hash_pin("4821"), pin_failed_attempts=0, is_active=True)
        s.add(client)
        await s.flush()
        s.add(BotEnrollment(client_id=client.id, phone_encrypted=encrypt_phone(PHONE),
                            phone_hash=phone_lookup_hash(PHONE), phone_last4="0100",
                            status=BotEnrollmentStatus.ACTIVE,
                            consent_at=datetime.now(timezone.utc)))
        await s.commit()
    async with Session() as s:
        yield s
    await engine.dispose()


async def say(db, text, sender=PHONE):
    return (await handle_inbound(db, Inbound(sender=sender, text=text, channel="sms"))).replies


async def sign_in(db, name="Maria Lopez", pin="4821"):
    assert await say(db, "hi") == [msg.ASK_NAME]
    assert await say(db, name) == [msg.ASK_PIN]
    return await say(db, pin)


@pytest.mark.asyncio
async def test_unenrolled_number_gets_generic_reply(db):
    assert await say(db, "Maria Lopez", sender=STRANGER) == [msg.NOT_ENROLLED]


@pytest.mark.asyncio
async def test_successful_sign_in(db):
    assert await sign_in(db) == [msg.SIGNED_IN]
    assert await say(db, "menu") == [msg.MENU]


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["maria lopez", "  MARIA   LÓPEZ ", "Maria López."])
async def test_name_formatting_ignored(db, name):
    assert await sign_in(db, name=name) == [msg.SIGNED_IN]


@pytest.mark.asyncio
@pytest.mark.parametrize("name", ["Mari Lopez", "Lopez, Maria", "Maria"])
async def test_other_name_forms_rejected(db, name):
    assert await sign_in(db, name=name) == [msg.BAD_LOGIN]


@pytest.mark.asyncio
async def test_wrong_name_and_wrong_pin_look_the_same(db):
    wrong_name = await sign_in(db, name="Maria Smith", pin="4821")
    assert await say(db, "Maria Lopez") == [msg.ASK_PIN]
    wrong_pin = await say(db, "0000")
    assert wrong_name == wrong_pin == [msg.BAD_LOGIN]


@pytest.mark.asyncio
async def test_lock_after_five_failures_and_stop_does_not_clear_it(db):
    await say(db, "hi")
    for i in range(5):
        await say(db, "Maria Lopez")
        reply = await say(db, "1111")
    assert reply == [msg.LOCKED]
    # correct credentials no longer work
    assert await say(db, "Maria Lopez") == [msg.LOCKED]
    e = await db.scalar(select(BotEnrollment))
    assert e.status == BotEnrollmentStatus.LOCKED and e.locked_at is not None
    # STOP then START must not unlock
    assert await say(db, "STOP") == [msg.STOPPED]
    assert await say(db, "START") == [msg.LOCKED]


@pytest.mark.asyncio
async def test_stop_silences_until_start(db):
    await sign_in(db)
    assert await say(db, "Stop") == [msg.STOPPED]
    assert await say(db, "hello?") == []
    assert await say(db, "START") == [msg.STARTED]
    assert await say(db, "Maria Lopez") == [msg.ASK_PIN]


@pytest.mark.asyncio
async def test_help_never_reveals_data(db):
    reply = await say(db, "HELP")
    assert "Maria" not in reply[0]


@pytest.mark.asyncio
async def test_crisis_reply_without_sign_in(db):
    for sender in (PHONE, STRANGER):
        reply = await say(db, "I have nowhere to sleep tonight", sender=sender)
        assert reply == [msg.crisis_text()]
        assert "988" in reply[0] and "211" in reply[0]


@pytest.mark.asyncio
async def test_idle_timeout_requires_sign_in_again(db):
    await sign_in(db)
    s = await db.scalar(select(BotSession))
    s.last_activity_at = datetime.now(timezone.utc) - timedelta(minutes=16)
    await db.commit()
    assert await say(db, "menu") == [msg.SESSION_ENDED]
    assert await say(db, "Maria Lopez") == [msg.ASK_PIN]


@pytest.mark.asyncio
async def test_absolute_session_cap(db):
    await sign_in(db)
    s = await db.scalar(select(BotSession))
    s.authenticated_at = datetime.now(timezone.utc) - timedelta(hours=4)
    await db.commit()
    assert await say(db, "menu") == [msg.SESSION_ENDED]


@pytest.mark.asyncio
async def test_sign_out(db):
    await sign_in(db)
    assert await say(db, "sign out") == [msg.SIGNED_OUT]
    assert await say(db, "menu") == [msg.ASK_NAME]


@pytest.mark.asyncio
async def test_audit_log_has_no_message_content(db):
    await sign_in(db)
    rows = (await db.scalars(select(BotAuditLog))).all()
    assert rows
    for r in rows:
        assert "Maria" not in r.intent + r.outcome and "4821" not in r.intent + r.outcome


@pytest.mark.asyncio
async def test_session_never_stores_typed_name_or_pin(db):
    await say(db, "hi")
    await say(db, "Maria Lopez")
    s = await db.scalar(select(BotSession))
    assert s.state == BotSessionState.AWAITING_PIN
    assert s.name_matched is True
    cols = {c.name: getattr(s, c.name) for c in BotSession.__table__.columns}
    assert not any(isinstance(v, str) and "maria" in v.lower() for v in cols.values())


@pytest.mark.asyncio
async def test_stop_inside_merged_burst(db):
    await sign_in(db)
    assert await say(db, "where can I eat\nstop") == [msg.STOPPED]


@pytest.mark.asyncio
async def test_merged_burst_does_not_trigger_other_keywords(db):
    await say(db, "hi")
    await say(db, "Maria Lopez")
    signed = await handle_inbound(db, Inbound(sender=PHONE, text="4821"))
    assert signed.client_id is not None
    assert await say(db, "menu\nsign out") == [msg.NOT_AVAILABLE_YET]
