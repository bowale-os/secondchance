"""Photos over text: read with the portal's reader (fake AI), hold protocol, SAVE via keep."""

import base64
import io
from datetime import date, datetime, timezone

import pytest
import pytest_asyncio
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.reader.ai import FakeAiClient
from app.security import hash_pin
from app.services import bot_conversation, bot_photos, photo_reader
from app.services import bot_messages as msg
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.photo_reader import Photo, PhotoError
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.tables import (
    Base, BotAuditLog, BotEnrollment, BotEnrollmentStatus, BotSession, BotSessionState, Client,
    DataSource, Document, DocumentAction, DocumentReading, DocumentStatus,
)

PHONE = "+14045550100"
NOW = datetime(2026, 10, 13, 16, 0, tzinfo=timezone.utc)


def jpeg(color: str) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 80), color).save(buf, "JPEG")
    return buf.getvalue()


JPG = Photo(jpeg("white"), "image/jpeg", "IMG_1.jpg")
OTHER_JPG = Photo(jpeg("gray"), "image/jpeg", "IMG_2.jpg")


@pytest_asyncio.fixture
async def env(monkeypatch):
    monkeypatch.setattr(bot_conversation, "_now", lambda: NOW)
    ai = FakeAiClient()
    monkeypatch.setattr(photo_reader, "get_ai_client", lambda: ai)
    monkeypatch.setattr(photo_reader, "configured", lambda: True)
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        c = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"),
                   pin_failed_attempts=0, is_active=True, language="en", release_date=date(2026, 10, 9))
        s.add(c)
        await s.flush()
        s.add(BotEnrollment(client_id=c.id, phone_encrypted=encrypt_phone(PHONE), phone_hash=phone_lookup_hash(PHONE),
                            phone_last4="0100", status=BotEnrollmentStatus.ACTIVE, consent_at=NOW))
        await s.commit()
    async with Session() as s:
        yield s, ai.calls
    await engine.dispose()


async def send(db, text="", images=(), held=False, count=None):
    return await handle_inbound(db, Inbound(
        sender=PHONE, text=text, images=list(images), images_held=held,
        attachment_count=len(images) if count is None else count))


async def sign_in(db):
    for t in ("hi", "Maria Lopez", "4821"):
        await send(db, t)


# ---------- before sign-in ----------

@pytest.mark.asyncio
async def test_photo_before_sign_in_is_not_a_login_attempt(env):
    db, calls = env
    assert (await send(db, count=1)).replies == [msg.PHOTO_SIGN_IN]
    out = await send(db, "what is this?", count=1)  # caption must not be taken as a name
    assert out.replies == [msg.PHOTO_SIGN_IN]
    s = await db.scalar(select(BotSession))
    assert s.state == BotSessionState.AWAITING_NAME and s.failed_attempts == 0
    await send(db, "Maria Lopez")
    assert (await send(db, "", count=1)).replies == [msg.PHOTO_ASK_PIN]
    assert calls == []


@pytest.mark.asyncio
async def test_images_sent_too_early_are_held_not_read(env):
    db, calls = env
    await send(db, "hi")
    out = await send(db, images=[JPG])
    assert out.replies == [msg.PHOTO_SIGN_IN] and out.hold_images is True and calls == []


# ---------- signed in ----------

@pytest.mark.asyncio
async def test_photo_is_read_right_away_with_to_dos_and_save_offer(env):
    db, calls = env
    await sign_in(db)
    out = await send(db, images=[JPG])
    assert {c.step for c in calls} == {"extract", "classify", "simplify", "actions"}
    reply = out.replies[0]
    assert reply.startswith("This paper: Parole conditions.")
    assert "What to do:\n- Meet your parole officer (Oct 12)" in reply   # 72 hours after the Oct 9 release
    assert "And 2 more." in reply
    assert bot_photos.LEGAL_NOTE in reply
    assert reply.endswith(msg.EN["PH_SAVE_OFFER"])
    assert out.hold_images   # held for SAVE


@pytest.mark.asyncio
async def test_any_caption_still_just_reads(env):
    db, calls = env
    await sign_in(db)
    out = await send(db, "translate to Vietnamese", images=[JPG, OTHER_JPG])
    assert out.replies[0].startswith("This paper:")
    assert [c.page for c in calls if c.step == "extract"] == [1, 2]


@pytest.mark.asyncio
async def test_save_goes_through_the_keep_path(env):
    db, _ = env
    await sign_in(db)
    await send(db, images=[JPG, OTHER_JPG])
    out = await send(db, "save", images=[JPG, OTHER_JPG], held=True)
    assert out.replies == [bot_photos.SAVED]
    doc = await db.scalar(select(Document))
    assert (doc.source, doc.status, doc.mime_type) == (DataSource.CLIENT, DocumentStatus.READ, "application/pdf")
    reading = await db.scalar(select(DocumentReading))
    assert reading.document_id == doc.id and reading.created_by_staff_id is None
    assert len((await db.scalars(select(DocumentAction))).all()) == 5
    s = await db.scalar(select(BotSession))
    assert s.pending_attachment_ref is None and s.last_results is None


@pytest.mark.asyncio
async def test_save_with_different_photos_is_refused(env):
    db, _ = env
    await sign_in(db)
    await send(db, images=[JPG])
    out = await send(db, "save", images=[OTHER_JPG], held=True)
    assert out.replies == [bot_photos.PHOTO_GONE]
    assert await db.scalar(select(Document)) is None


@pytest.mark.asyncio
async def test_moving_on_drops_photos_and_reading(env):
    db, _ = env
    await sign_in(db)
    await send(db, images=[JPG])
    out = await send(db, "menu", images=[JPG], held=True)
    assert out.replies == [msg.MENU] and not out.hold_images
    assert await db.scalar(select(Document)) is None
    s = await db.scalar(select(BotSession))
    assert s.pending_attachment_ref is None and s.last_results is None


@pytest.mark.asyncio
async def test_sidecar_copy_expired(env):
    db, _ = env
    await sign_in(db)
    await send(db, images=[JPG])
    assert (await send(db, "save")).replies == [bot_photos.PHOTO_GONE]


@pytest.mark.asyncio
async def test_reader_errors(env, monkeypatch):
    db, _ = env
    await sign_in(db)

    async def boom(photos, client, now):
        raise PhotoError("model_error")
    real = photo_reader.read_photos
    monkeypatch.setattr(photo_reader, "read_photos", boom)
    out = await send(db, images=[JPG])
    assert out.replies == [bot_photos.NOT_AVAILABLE] and not out.hold_images

    monkeypatch.setattr(photo_reader, "read_photos", real)
    bad = Photo(b"not an image", "image/jpeg")
    assert (await send(db, images=[bad])).replies == [bot_photos.UNREADABLE]


@pytest.mark.asyncio
async def test_slow_reading_times_out_with_a_plain_reply(env, monkeypatch):
    db, _ = env
    await sign_in(db)
    monkeypatch.setattr(photo_reader, "TIMEOUT_S", 0.01)
    monkeypatch.setattr(photo_reader, "get_ai_client", lambda: FakeAiClient(delay_s=1))
    assert (await send(db, images=[JPG])).replies == [bot_photos.NOT_AVAILABLE]


def test_check_photos_filters_types_and_size():
    big = Photo(b"x" * (10 * 1024 * 1024 + 1), "image/jpeg")
    gif = Photo(b"GIF89a", "image/gif")
    with pytest.raises(PhotoError):
        photo_reader.check_photos([big, gif])
    assert photo_reader.check_photos([gif, JPG]) == [JPG]


@pytest.mark.asyncio
async def test_audit_has_no_content(env):
    db, _ = env
    await sign_in(db)
    await send(db, images=[JPG])
    blob = " ".join(r.intent + r.outcome for r in (await db.scalars(select(BotAuditLog))).all())
    assert "photo.read" in blob and "parole" not in blob.lower()


@pytest.mark.asyncio
async def test_router_decodes_images_and_returns_hold(env):
    db, _ = env
    from app.routers import bot as bot_router
    from app.schemas import BotImageIn, BotInbound
    await sign_in(db)
    result = await bot_router.inbound(BotInbound(
        sender=PHONE, images=[BotImageIn(base64.b64encode(JPG.data).decode(), "image/jpeg")]), db)
    assert result.hold_images is True and result.replies[0].text.startswith("This paper:")


@pytest.mark.asyncio
async def test_withheld_photos_while_signed_in_get_no_reply(env):
    db, _ = env
    await sign_in(db)
    out = await handle_inbound(db, Inbound(sender=PHONE, attachment_count=1, images_withheld=True))
    assert out.replies == [] and out.client_id  # session_active -> sidecar re-sends
    out = await handle_inbound(db, Inbound(sender=PHONE, attachment_count=1))
    assert out.replies == [msg.PHOTO_RESEND]  # e.g. a video or sticker
