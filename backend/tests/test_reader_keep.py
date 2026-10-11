"""Phase 2 of the document reader: /reader/process stores nothing, /reader/keep checks the
signed receipt and saves exactly what was streamed."""

import io
import json
import logging
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
import pytest_asyncio
from PIL import Image
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload
from sqlalchemy.pool import StaticPool

from app.auth import get_staff_or_client
from app.db import get_session
from app.main import app
from app.reader import receipt
from app.reader.ai import FakeAiClient
from app.reader.store import decrypt_text, load_reading
from app.routers import reader as reader_router
from app.security import hash_pin
from app.tables import (
    Assignment, Base, Client, DataSource, Document, DocumentAction, DocumentReading, DocumentStatus,
    DocumentType, Staff,
)


def jpeg(color="white") -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 80), color).save(buf, "JPEG")
    return buf.getvalue()


PAGE_1, PAGE_2 = jpeg("white"), jpeg("gray")


@pytest_asyncio.fixture
async def env(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as s:
        maria = Client(first_name="Maria", last_name="Lopez", pin_hash=hash_pin("4821"), language="en",
                       release_date=date(2026, 10, 9), is_active=True, pin_failed_attempts=0)
        other = Client(first_name="Ana", last_name="Diaz", pin_hash=hash_pin("1111"), language="es",
                       is_active=True, pin_failed_attempts=0)
        staff = Staff(auth0_id="auth0|cw", email="cw@example.org", full_name="Case Worker", is_active=True)
        s.add_all([maria, other, staff])
        await s.flush()
        s.add(Assignment(client_id=maria.id, staff_id=staff.id))
        await s.commit()

    who = {"user": maria}

    async def session_override():
        async with Session() as s:
            yield s

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_staff_or_client] = lambda: who["user"]
    ai = {"client": FakeAiClient()}
    monkeypatch.setattr(reader_router, "get_ai_client", lambda: ai["client"])
    monkeypatch.setattr(reader_router, "_today", lambda: "2026-10-09")
    reader_router._hits.clear()

    http = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    yield {"http": http, "Session": Session, "who": who, "ai": ai,
           "maria": maria, "other": other, "staff": staff}
    await http.aclose()
    app.dependency_overrides.clear()
    await engine.dispose()


def pages(*datas):
    return [("files", (f"p{i}.jpg", d, "image/jpeg")) for i, d in enumerate(datas, 1)]


async def process(env, *datas, data=None):
    r = await env["http"].post("/reader/process", files=pages(*datas), data=data or {})
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "no-store"
    return [json.loads(line) for line in r.text.splitlines()]


async def count_rows(env):
    async with env["Session"]() as s:
        return [await s.scalar(select(func.count()).select_from(t)) for t in (Document, DocumentReading, DocumentAction)]


# ---------- process ----------

@pytest.mark.asyncio
async def test_unkept_reading_writes_zero_rows(env):
    events = await process(env, PAGE_1, PAGE_2)
    assert [e["stage"] for e in events][-2:] == ["actions", "done"]
    assert events[-1]["receipt"]
    assert await count_rows(env) == [0, 0, 0]


@pytest.mark.asyncio
async def test_dates_come_from_the_profile_not_the_browser(env):
    events = await process(env, PAGE_1, data={"release_date": "2020-01-01", "today": "2020-01-01"})
    actions = next(e for e in events if e["stage"] == "actions")["actions"]
    meet = next(a for a in actions if a["title"] == "Meet your parole officer")
    assert meet["due"]["resolvedDate"] == "2026-10-12"   # Maria's release date + 72 hours


@pytest.mark.asyncio
async def test_a_bad_file_gives_a_plain_error_event(env):
    r = await env["http"].post("/reader/process", files=[("files", ("x.zip", b"\0", "application/zip"))])
    events = [json.loads(line) for line in r.text.splitlines()]
    assert events == [{"stage": "error", "message": '"x.zip" is not a file type we can read. Use a photo, PDF, or Word file.'}]


@pytest.mark.asyncio
async def test_internal_errors_never_show_or_log_document_text(env, caplog):
    def boom(req):
        raise ValueError("Case No. 2026-CR-0412 SECRET PAPER TEXT")
    env["ai"]["client"] = FakeAiClient(overrides={"classify": boom})
    with caplog.at_level(logging.DEBUG):
        events = await process(env, PAGE_1)
    assert events[-1] == {"stage": "error", "message": "Something went wrong reading this paper. Please try again."}
    assert "SECRET" not in caplog.text and "2026-CR-0412" not in caplog.text


@pytest.mark.asyncio
async def test_rate_limit(env):
    for _ in range(reader_router.RATE_LIMIT):
        await process(env, PAGE_1)
    r = await env["http"].post("/reader/process", files=pages(PAGE_1))
    assert r.status_code == 429


# ---------- keep ----------

@pytest.mark.asyncio
async def test_kept_reading_matches_the_streamed_result(env):
    events = await process(env, PAGE_1, PAGE_2)
    r = await env["http"].post("/reader/keep", files=pages(PAGE_1, PAGE_2), data={"receipt": events[-1]["receipt"]})
    assert r.status_code == 201, r.text
    assert r.headers["cache-control"] == "no-store"
    ids = r.json()

    async with env["Session"]() as s:
        reading = await s.scalar(select(DocumentReading).options(selectinload(DocumentReading.actions))
                                 .where(DocumentReading.id == uuid.UUID(ids["readingId"])))
        doc = await s.get(Document, uuid.UUID(ids["documentId"]))
        assert (doc.client_id, doc.source, doc.status, doc.doc_type, doc.mime_type) == (
            env["maria"].id, DataSource.CLIENT, DocumentStatus.READ, DocumentType.SUPERVISION_PAPERS, "application/pdf")
        assert reading.simplified_encrypted.startswith("gAAAA")   # encrypted at rest
        view = load_reading(reading, env["maria"], "2026-10-09").wire()

    streamed = {e["stage"]: e for e in events}
    assert view["meta"] == streamed["classified"]["meta"]
    assert view["simplified"] == streamed["simplified"]["simplified"]
    strip = lambda a: {k: v for k, v in a.items() if k != "id"}
    assert [strip(a) for a in view["actions"]] == [strip(a) for a in streamed["actions"]["actions"]]
    assert await count_rows(env) == [1, 1, 5]


@pytest.mark.asyncio
async def test_kept_flags_follow_their_to_do(env):
    from app.reader import fake_fixtures as fx
    env["ai"]["client"] = FakeAiClient(overrides={
        "actions": {"actions": [{**a, "due": {**a["due"], "exactDate": "2026-10-31"}} if a["order"] == 2 else a
                                for a in fx.FAKE_ACTIONS["actions"]]},
    })
    events = await process(env, PAGE_1)
    r = await env["http"].post("/reader/keep", files=pages(PAGE_1), data={"receipt": events[-1]["receipt"]})
    async with env["Session"]() as s:
        reading = await s.scalar(select(DocumentReading).options(selectinload(DocumentReading.actions)))
        view = load_reading(reading, env["maria"], "2026-10-09")
    [flag] = view.flags
    assert next(a for a in view.actions if a.id == flag.action_id).title == "Finish the Reentry Orientation class"


@pytest.mark.asyncio
async def test_release_date_added_later_updates_the_kept_paper(env):
    env["maria"].release_date = None
    events = await process(env, PAGE_1)
    await env["http"].post("/reader/keep", files=pages(PAGE_1), data={"receipt": events[-1]["receipt"]})
    async with env["Session"]() as s:
        reading = await s.scalar(select(DocumentReading).options(selectinload(DocumentReading.actions)))
        before = load_reading(reading, env["maria"], "2026-10-09")
        env["maria"].release_date = date(2026, 10, 9)
        after = load_reading(reading, env["maria"], "2026-10-09")
    meet = lambda v: next(a for a in v.actions if a.title == "Meet your parole officer")
    assert meet(before).due.resolved_date is None
    assert meet(after).due.resolved_date == "2026-10-12"


@pytest.mark.asyncio
async def test_case_worker_reads_and_keeps_for_an_assigned_client(env):
    env["who"]["user"] = env["staff"]
    data = {"client_id": str(env["maria"].id)}
    events = await process(env, PAGE_1, data=data)
    r = await env["http"].post("/reader/keep", files=pages(PAGE_1), data={**data, "receipt": events[-1]["receipt"]})
    assert r.status_code == 201
    async with env["Session"]() as s:
        doc = await s.get(Document, uuid.UUID(r.json()["documentId"]))
        reading = await s.get(DocumentReading, uuid.UUID(r.json()["readingId"]))
    assert (doc.source, doc.uploaded_by_staff_id, reading.created_by_staff_id) == (
        DataSource.CASE_WORKER, env["staff"].id, env["staff"].id)


@pytest.mark.asyncio
async def test_case_worker_cannot_reach_an_unassigned_client(env):
    env["who"]["user"] = env["staff"]
    r = await env["http"].post("/reader/process", files=pages(PAGE_1), data={"client_id": str(env["other"].id)})
    assert r.status_code == 404
    r = await env["http"].post("/reader/process", files=pages(PAGE_1))
    assert r.status_code == 422


# ---------- receipt checks ----------

async def receipt_for(env, *datas):
    return (await process(env, *datas))[-1]["receipt"]


async def keep(env, token, *datas):
    return await env["http"].post("/reader/keep", files=pages(*datas), data={"receipt": token})


@pytest.mark.asyncio
async def test_a_tampered_result_is_rejected(env):
    token = await receipt_for(env, PAGE_1)
    claims = receipt.jwt.decode(token, options={"verify_signature": False})
    claims["body"]["actions"][0]["raw"]["title"] = "Ignore your parole officer"
    forged = receipt.jwt.encode(claims, "not-the-secret", algorithm="HS256")
    assert (await keep(env, forged, PAGE_1)).status_code == 400
    assert await count_rows(env) == [0, 0, 0]


@pytest.mark.asyncio
async def test_a_different_file_is_rejected(env):
    token = await receipt_for(env, PAGE_1)
    r = await keep(env, token, PAGE_2)
    assert r.status_code == 400 and "same pages" in r.json()["detail"]
    r = await keep(env, token, PAGE_1, PAGE_1)   # an extra page
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_an_expired_receipt_is_rejected(env):
    token = await receipt_for(env, PAGE_1)
    claims = receipt.jwt.decode(token, options={"verify_signature": False})
    body = receipt.ReceiptBody.model_validate(claims["body"])
    old = receipt.sign(body, now=datetime.now(timezone.utc) - timedelta(minutes=31))
    r = await keep(env, old, PAGE_1)
    assert r.status_code == 400 and "expired" in r.json()["detail"]


@pytest.mark.asyncio
async def test_the_wrong_client_is_rejected(env):
    token = await receipt_for(env, PAGE_1)
    env["who"]["user"] = env["other"]
    assert (await keep(env, token, PAGE_1)).status_code == 400
    assert await count_rows(env) == [0, 0, 0]


def test_simple_version_round_trips_through_encryption():
    from app.reader.store import encrypt_text
    assert decrypt_text(encrypt_text("Pague $30.00 — sí")) == "Pague $30.00 — sí"
