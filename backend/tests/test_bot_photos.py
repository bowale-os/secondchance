"""Photos over text: sign-in prompts, simplify/translate, hold protocol, SAVE."""

from datetime import datetime, timezone

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.security import hash_pin
from app.services import bot_conversation, bot_photos, photo_reader
from app.services import bot_messages as msg
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.photo_reader import KeyDate, Photo, PhotoError, PhotoReading
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.tables import (
    Base, BotAuditLog, BotEnrollment, BotEnrollmentStatus, BotSession, BotSessionState, Client,
    DataSource, Document, DocumentStatus,
)

PHONE = "+14045550100"
NOW = datetime(2026, 10, 13, 16, 0, tzinfo=timezone.utc)
JPG = Photo(b"\xff\xd8\xff fake jpeg", "image/jpeg", "IMG_1.jpg")
READING = PhotoReading(
    readable=True, document_kind="court notice", legal_or_court=True,
    summary="You have to go to court about a missed payment.",
    key_dates=[KeyDate(date="Nov 3, 2026", what="Hearing at 9 AM, Fulton County Courthouse")],
    next_steps=["Go to the hearing", "Bring this letter"],
)


@pytest_asyncio.fixture
async def env(monkeypatch):
    monkeypatch.setattr(bot_conversation, "_now", lambda: NOW)
    calls = []

    async def fake_read(photos, mode, target_language):
        calls.append((len(photos), mode, target_language))
        return READING

    monkeypatch.setattr(photo_reader, "read_photos", fake_read)
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        c = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"),
                   pin_failed_attempts=0, is_active=True, language="es")
        s.add(c)
        await s.flush()
        s.add(BotEnrollment(client_id=c.id, phone_encrypted=encrypt_phone(PHONE), phone_hash=phone_lookup_hash(PHONE),
                            phone_last4="0100", status=BotEnrollmentStatus.ACTIVE, consent_at=NOW))
        await s.commit()
    async with Session() as s:
        yield s, calls
    await engine.dispose()


async def send(db, text="", images=(), held=False, count=None):
    return await handle_inbound(db, Inbound(
        sender=PHONE, text=text, images=list(images), images_held=held,
        attachment_count=len(images) if count is None else count))


async def sign_in(db):
    for t in ("hi", "Maria Lopez", "4821"):
        await send(db, t)


def test_parse_mode():
    assert bot_photos.parse_mode("1") == ("simplify", None)
    assert bot_photos.parse_mode("what does this say?") == ("simplify", None)
    assert bot_photos.parse_mode("2") == ("translate", None)
    assert bot_photos.parse_mode("2 Vietnamese") == ("translate", "Vietnamese")
    assert bot_photos.parse_mode("translate to english") == ("translate", "english")
    assert bot_photos.parse_mode("FOOD") is None


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
async def test_no_caption_asks_mode_then_translates_to_profile_language(env):
    db, calls = env
    await sign_in(db)
    out = await send(db, images=[JPG])
    assert out.replies == [bot_photos.ASK_MODE] and out.hold_images
    out = await send(db, "2", images=[JPG], held=True)
    assert calls == [(1, "translate", "Spanish")]
    reply = out.replies[0]
    assert "This looks like a court notice." in reply
    assert "- Nov 3, 2026: Hearing at 9 AM" in reply
    assert bot_photos.LEGAL_NOTE in reply and reply.endswith("Reply SAVE to keep a copy in your documents.")
    assert out.hold_images  # held again for SAVE


@pytest.mark.asyncio
async def test_caption_picks_mode_directly(env):
    db, calls = env
    await sign_in(db)
    await send(db, "translate to Vietnamese", images=[JPG, JPG])
    assert calls == [(2, "translate", "Vietnamese")]


@pytest.mark.asyncio
async def test_other_caption_means_simplify(env):
    db, calls = env
    await sign_in(db)
    await send(db, "what is this letter?", images=[JPG])
    assert calls[0][1] == "simplify"


@pytest.mark.asyncio
async def test_save_creates_reviewable_client_document(env):
    db, _ = env
    await sign_in(db)
    await send(db, "1", images=[JPG])
    out = await send(db, "save", images=[JPG], held=True)
    assert out.replies == [bot_photos.SAVED]
    doc = await db.scalar(select(Document))
    assert doc.source == DataSource.CLIENT and doc.status == DocumentStatus.READ
    assert doc.ai_summary.startswith("You have to go to court") and doc.ai_warnings[0].startswith("Nov 3, 2026")
    s = await db.scalar(select(BotSession))
    assert s.pending_attachment_ref is None and s.last_results is None


@pytest.mark.asyncio
async def test_moving_on_drops_photos_and_reading(env):
    db, _ = env
    await sign_in(db)
    await send(db, "1", images=[JPG])
    out = await send(db, "menu", images=[JPG], held=True)
    assert out.replies == [msg.MENU] and not out.hold_images
    assert await db.scalar(select(Document)) is None
    s = await db.scalar(select(BotSession))
    assert s.pending_attachment_ref is None and s.last_results is None


@pytest.mark.asyncio
async def test_number_after_mode_question_is_a_mode_not_a_list_item(env):
    db, calls = env
    await sign_in(db)
    await send(db, images=[JPG])
    await send(db, "1", images=[JPG], held=True)
    assert calls == [(1, "simplify", "Spanish")]


@pytest.mark.asyncio
async def test_sidecar_copy_expired(env):
    db, _ = env
    await sign_in(db)
    await send(db, images=[JPG])
    assert (await send(db, "2")).replies == [bot_photos.PHOTO_GONE]


@pytest.mark.asyncio
async def test_reader_errors(env, monkeypatch):
    db, _ = env
    await sign_in(db)

    async def boom(photos, mode, target_language):
        raise PhotoError("model_error")
    monkeypatch.setattr(photo_reader, "read_photos", boom)
    out = await send(db, "1", images=[JPG])
    assert out.replies == [bot_photos.NOT_AVAILABLE] and not out.hold_images

    async def unreadable(photos, mode, target_language):
        return PhotoReading(readable=False)
    monkeypatch.setattr(photo_reader, "read_photos", unreadable)
    assert (await send(db, "1", images=[JPG])).replies == [bot_photos.UNREADABLE]


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
    await send(db, "1", images=[JPG])
    blob = " ".join(r.intent + r.outcome for r in (await db.scalars(select(BotAuditLog))).all())
    assert "photo.simplify" in blob and "court" not in blob


@pytest.mark.asyncio
async def test_router_decodes_images_and_returns_hold(env):
    db, calls = env
    import base64
    from app.routers import bot as bot_router
    from app.schemas import BotImageIn, BotInbound
    await sign_in(db)
    result = await bot_router.inbound(BotInbound(
        sender=PHONE, images=[BotImageIn(base64.b64encode(JPG.data).decode(), "image/jpeg")]), db)
    assert result.hold_images is True and result.replies[0].text == bot_photos.ASK_MODE


@pytest.mark.asyncio
async def test_read_photos_builds_request(monkeypatch):
    import io
    from types import SimpleNamespace
    from PIL import Image
    from pydantic import SecretStr
    from app.config import get_settings
    import app.services.photo_reader as pr

    monkeypatch.setattr(get_settings(), "gemini_api_key", SecretStr("k"))
    monkeypatch.setattr(get_settings(), "gemini_model", "test-model")
    buf = io.BytesIO()
    Image.new("RGB", (4000, 3000), "white").save(buf, "JPEG")
    seen = {}

    async def generate_content(model, contents, config):
        seen.update(model=model, contents=contents)
        return SimpleNamespace(parsed=READING)

    fake = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    monkeypatch.setattr(pr, "get_client", lambda: fake)
    out = await pr.read_photos([Photo(buf.getvalue(), "image/jpeg")], "translate", "Spanish")
    assert out is READING and seen["model"] == "test-model"
    assert seen["contents"][0].startswith("MODE: translate. TARGET LANGUAGE: Spanish. 1 page(s)")
    part = seen["contents"][1]
    img = Image.open(io.BytesIO(part.inline_data.data))
    assert max(img.size) < 4000  # downscaled before upload


@pytest.mark.asyncio
async def test_withheld_photos_while_signed_in_get_no_reply(env):
    db, _ = env
    await sign_in(db)
    out = await handle_inbound(db, Inbound(sender=PHONE, attachment_count=1, images_withheld=True))
    assert out.replies == [] and out.client_id  # session_active -> sidecar re-sends
    out = await handle_inbound(db, Inbound(sender=PHONE, attachment_count=1))
    assert out.replies == [msg.PHOTO_RESEND]  # e.g. a video or sticker
