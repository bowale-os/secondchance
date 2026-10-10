"""Spanish pass: string parity, Spanish keywords, and full flows with no English leaks."""

import json
import re
import string
from datetime import date, datetime, time, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.jobs.ingest_resources import ingest, load_stops
from app.jobs.morning_nudges import run_nudges
from app.security import hash_pin
from app.services import bot_conversation, bot_photos, photo_reader
from app.services import bot_messages as msg
from app.services.bot_conversation import Inbound, handle_inbound
from app.services.bot_keywords import keyword, parse_nudge
from app.services.bot_resources import parse_fast
from app.services.photo_reader import KeyDate, Photo, PhotoReading
from app.services.phone import encrypt_phone, phone_lookup_hash
from app.tables import (
    Appointment, Base, BotEnrollment, BotEnrollmentStatus, Client, ClientId, ClientObligation,
    IdStatus, IdType, ObligationStatus, ObligationType,
)

DATA = Path(__file__).resolve().parent.parent / "data"
ET = ZoneInfo("America/New_York")
PHONE = "+14045550100"
NOON_TUE = datetime(2026, 10, 13, 12, 0, tzinfo=ET).astimezone(timezone.utc)
ES = msg.ES_STRINGS

# English fragments that must never show up in a reply to a Spanish speaker.
ENGLISH = re.compile(r"\b(Reply|reply|Today|Tomorrow|Where|Bring|Call|Serves|Hiring|near you|"
                     r"open now|not verified|Checked by|Directions|Nearest stop|Key dates|"
                     r"What to do|Sign in|sign in|your)\b")


# ---------- strings ----------

def _fields(s: str) -> set[str]:
    return {f for _, f, _, _ in string.Formatter().parse(s) if f}


def test_every_english_string_has_spanish_with_same_placeholders():
    missing = set(msg.EN) - set(msg.ES)
    assert not missing, f"missing Spanish: {sorted(missing)}"
    extra = set(msg.ES) - set(msg.EN)
    assert not extra, f"Spanish keys with no English: {sorted(extra)}"
    for k in msg.EN:
        assert _fields(msg.EN[k]) == _fields(msg.ES[k]), k


def test_spanish_names_spanish_keywords():
    assert "HOY" in ES.MENU and "COMIDA" in ES.MENU and "AVISO SI" in ES.MENU and "SALIR" in ES.MENU
    assert "MAS" in ES.RES_FOOT_MORE and "MAPA" in ES.RES_FOOT_MAP and "GUARDAR" in ES.PH_SAVE_OFFER


def test_dates():
    assert ES.day(date(2026, 10, 10)) == "sáb 10 oct"
    assert msg.EN_STRINGS.day(date(2026, 10, 10)) == "Sat Oct 10"


# ---------- keywords ----------

@pytest.mark.parametrize("text,kw", [("Mañana", "MANANA"), ("hoy.", "HOY"), ("Cerrar sesión", "CERRARSESION"), ("MÁS", "MAS")])
def test_keyword_strips_accents(text, kw):
    assert keyword(text) == kw


def test_spanish_nudge_and_resources_parsing():
    assert parse_nudge("aviso sí") == ("on", None)
    assert parse_nudge("AVISO NO") == ("off", None)
    assert parse_nudge("recordatorio 7:30") == ("on", time(7, 30))
    ask = parse_fast("comida cerca de West End")
    assert ask.category == "food" and ask.place == "West End"
    assert parse_fast("Recuperación").category == "addiction"
    assert parse_fast("albergue").category == "shelter"


def test_spanish_photo_modes():
    assert bot_photos.parse_mode("explicar") == ("simplify", None)
    assert bot_photos.parse_mode("¿Qué dice?") == ("simplify", None)
    assert parse_fast("¿Comida?").category == "food"
    assert bot_photos.parse_mode("traducir al inglés") == ("translate", "English")
    assert bot_photos.parse_mode("2 vietnamita") == ("translate", "Vietnamese")


# ---------- flows ----------

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
        c = Client(first_name="María", last_name="López", pin_hash=hash_pin("4821"),
                   pin_failed_attempts=0, is_active=True, language="es")
        s.add(c)
        await s.flush()
        s.add(ClientId(client_id=c.id, id_type=IdType.SSN_CARD, status=IdStatus.HELD, verified=True))
        s.add(Appointment(client_id=c.id, title="Cita con el oficial", starts_at=datetime(2026, 10, 13, 14, 0, tzinfo=ET).astimezone(timezone.utc),
                          location_name="Oficina", documents_to_bring=["ID"], cancelled=False))
        s.add(ClientObligation(client_id=c.id, obligation_type=ObligationType.FEE, description="Cuota de supervisión",
                               due_date=date(2026, 10, 13), status=ObligationStatus.OVERDUE, verified=True))
        s.add(BotEnrollment(client_id=c.id, phone_encrypted=encrypt_phone(PHONE), phone_hash=phone_lookup_hash(PHONE),
                            phone_last4="0100", status=BotEnrollmentStatus.ACTIVE, consent_at=NOON_TUE,
                            nudge_enabled=False, nudge_time=time(8, 0)))
        await s.commit()
    async with Session() as s:
        yield s
    await engine.dispose()


async def say(db, text="", **kw):
    return (await handle_inbound(db, Inbound(sender=PHONE, text=text, **kw))).replies


async def sign_in(db):
    assert await say(db, "hola") == [ES.ASK_NAME]
    assert await say(db, "maria lopez") == [ES.ASK_PIN]
    assert await say(db, "4821") == [ES.SIGNED_IN]


def no_english(reply: str):
    hit = ENGLISH.search(reply)
    assert hit is None, f"English {hit.group(0)!r} in: {reply}"


@pytest.mark.asyncio
async def test_sign_in_and_menu_in_spanish(db):
    await sign_in(db)
    menu = (await say(db, "menu"))[0]
    assert menu == ES.MENU
    no_english(menu)
    assert (await say(db, "salir")) == [ES.SIGNED_OUT]


@pytest.mark.asyncio
async def test_bad_login_and_help_in_spanish(db):
    await say(db, "hola")
    await say(db, "Maria Smith")
    assert await say(db, "0000") == [ES.BAD_LOGIN]
    help_ = (await say(db, "AYUDA"))[0]
    assert help_.startswith("Mensajes de") and "911" in help_


@pytest.mark.asyncio
async def test_schedule_in_spanish(db):
    await sign_in(db)
    hoy = (await say(db, "hoy"))[0]
    assert hoy.startswith("Hoy, mar 13 oct:")
    assert "Pago pendiente: Cuota de supervisión - VENCIDO" in hoy
    assert "2:00 PM Cita con el oficial" in hoy and "Dónde: Oficina" in hoy and "Traiga: ID" in hoy
    no_english(hoy)
    semana = (await say(db, "SEMANA"))[0]
    assert semana.startswith("Próximos 7 días:")
    no_english(semana)
    assert (await say(db, "mañana"))[0].startswith("Mañana, mié 14 oct")


@pytest.mark.asyncio
async def test_resources_in_spanish(db):
    await sign_in(db)
    lst = (await say(db, "comida cerca de Garnett"))[0]
    assert lst.splitlines()[0] == "Comida cerca de Garnett:"
    assert "abierto ahora" in lst and "cerca de tren/bus" in lst and "sin verificar" in lst
    assert lst.splitlines()[-1] == "Responda 1-3 para ver detalles."
    no_english(lst)
    await say(db, "trabajo")
    d = (await say(db, "1"))[0]
    assert "Llame al (404) 555-0106" in d and "Hoy 8 AM-4 PM" in d
    assert "Contrata: antecedentes: depende del caso" in d
    assert "Traiga: una identificación con foto (no tenemos una en su expediente); su tarjeta del Seguro Social" in d
    assert "Parada más cercana:" in d and "Revisado por el personal." in d
    no_english(d.replace("Early mornings", ""))  # resource data itself stays as listed
    assert (await say(db, "MAS")) == [ES.RES_ALL_SHOWN]
    assert (await say(db, "mapa"))[0].startswith("Mapa: Trabajos")


@pytest.mark.asyncio
async def test_nudge_in_spanish(db):
    await sign_in(db)
    on = (await say(db, "aviso 7:30"))[0]
    assert "7:30 AM" in on and on.startswith("Los avisos de la mañana están activos")
    sent = []

    async def fake_send(to, text):
        sent.append(text)
        return True
    await run_nudges(db, datetime(2026, 10, 13, 7, 40, tzinfo=ET).astimezone(timezone.utc), fake_send)
    assert sent == [ES.NUDGE]
    assert (await say(db, "aviso no")) == [ES.NUDGE_OFF]


@pytest.mark.asyncio
async def test_photos_in_spanish(db, monkeypatch):
    calls = []

    async def fake_read(photos, mode, target_language):
        calls.append((mode, target_language))
        return PhotoReading(readable=True, document_kind="aviso de la corte", legal_or_court=True,
                            summary="Tiene que ir a la corte.", key_dates=[KeyDate(date="3 nov", what="Audiencia")],
                            next_steps=["Vaya a la audiencia"])
    monkeypatch.setattr(photo_reader, "read_photos", fake_read)
    jpg = Photo(b"\xff\xd8\xff", "image/jpeg")
    assert await say(db, attachment_count=1) == [ES.PHOTO_SIGN_IN]
    assert await say(db, "maria lopez") == [ES.ASK_PIN]  # already waiting for the name
    assert await say(db, "4821") == [ES.SIGNED_IN]
    assert await say(db, images=[jpg], attachment_count=1) == [ES.PH_ASK_MODE]
    reply = (await say(db, "1", images=[jpg], attachment_count=1, images_held=True))[0]
    assert calls == [("simplify", "Spanish")]  # profile language
    assert reply.startswith("Parece ser: aviso de la corte.")
    assert "Fechas importantes:" in reply and "Qué hacer:" in reply and ES.PH_LEGAL in reply
    no_english(reply)
    assert await say(db, "guardar", images=[jpg], attachment_count=1, images_held=True) == [ES.PH_SAVED]
    await say(db, "traducir al inglés", images=[jpg], attachment_count=1)
    assert calls[-1] == ("translate", "English")


@pytest.mark.asyncio
async def test_spanish_crisis_and_stop(db):
    reply = (await say(db, "no tengo dónde dormir esta noche"))[0]
    assert reply == ES.crisis_text() and "211" in reply
    assert await say(db, "PARAR") == [ES.STOPPED]
    assert await say(db, "hola") == []
    assert await say(db, "START") == [ES.STARTED]


@pytest.mark.asyncio
async def test_spanish_recovery_ask_allowed_but_not_inferred(db, monkeypatch):
    from app.services import bot_intent
    from app.services.bot_intent import Intent

    async def fake(text):
        return Intent(tool="search_resources", category="addiction")
    monkeypatch.setattr(bot_intent, "classify", fake)
    await sign_in(db)
    assert (await say(db, "necesito ayuda con mis papeles")) == [ES.NOT_UNDERSTOOD]
    assert (await say(db, "quiero entrar a un tratamiento"))[0].startswith("Ayuda para la recuperación")
