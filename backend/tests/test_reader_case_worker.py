"""Phase 4 backend: case workers read stored papers, schedule to-dos and mark papers reviewed."""

import json
import uuid
from datetime import datetime

import pytest
from sqlalchemy import select

from app.services.bot_schedule_text import render
from app.services.schedule import get_schedule, window
from app.services.timeutil import local_tz
from app.tables import ClientObligation, DataSource, Document, DocumentReading, DocumentStatus
from tests.test_reader_keep import PAGE_1, env, pages, process  # noqa: F401  (env is a fixture)


async def stored_doc(env, client="maria", status=DocumentStatus.UPLOADED):
    async with env["Session"]() as s:
        doc = Document(client_id=env[client].id, source=DataSource.CASE_WORKER, status=status,
                       content=PAGE_1, mime_type="image/jpeg", original_filename="parole.jpg", size_bytes=len(PAGE_1))
        s.add(doc)
        await s.commit()
        return doc.id


async def kept_paper(env):
    token = (await process(env, PAGE_1))[-1]["receipt"]
    r = await env["http"].post("/reader/keep", files=pages(PAGE_1), data={"receipt": token})
    return r.json()


FORM = {"obligation_type": "check_in", "description": "Meet your parole officer", "due_date": "2026-10-12",
        "location": "123 Main St, Atlanta, GA 30303"}


# ---------- reading a stored paper ----------

@pytest.mark.asyncio
async def test_case_worker_reads_a_stored_paper_and_it_saves_straight_away(env):
    doc_id = await stored_doc(env)
    env["who"]["user"] = env["staff"]
    r = await env["http"].post(f"/reader/documents/{doc_id}/read")
    events = [json.loads(line) for line in r.text.splitlines()]
    assert events[-1]["stage"] == "done" and events[-1]["readingId"]
    assert "receipt" not in events[-1]
    async with env["Session"]() as s:
        reading = await s.scalar(select(DocumentReading))
        doc = await s.get(Document, doc_id)
    assert (str(reading.id), reading.document_id, reading.created_by_staff_id) == (
        events[-1]["readingId"], doc_id, env["staff"].id)
    assert doc.status == DocumentStatus.READ and doc.ai_summary == "Parole conditions"

    again = await env["http"].post(f"/reader/documents/{doc_id}/read")
    assert again.status_code == 409


@pytest.mark.asyncio
async def test_only_assigned_case_workers_can_read_a_stored_paper(env):
    doc_id = await stored_doc(env, client="other")
    env["who"]["user"] = env["staff"]
    assert (await env["http"].post(f"/reader/documents/{doc_id}/read")).status_code == 404
    env["who"]["user"] = env["other"]
    assert (await env["http"].post(f"/reader/documents/{doc_id}/read")).status_code == 403


# ---------- add to schedule ----------

@pytest.mark.asyncio
async def test_a_scheduled_to_do_shows_in_today_and_its_label_changes(env):
    kept = await kept_paper(env)
    paper = (await env["http"].get(f"/papers/{kept['readingId']}")).json()
    meet = next(a for a in paper["actions"] if a["title"] == "Meet your parole officer")
    assert meet["checkedByCaseWorker"] is False

    env["who"]["user"] = env["staff"]
    r = await env["http"].post(f"/papers/actions/{meet['id']}/schedule", json=FORM)
    assert r.status_code == 201
    assert (await env["http"].post(f"/papers/actions/{meet['id']}/schedule", json=FORM)).status_code == 409

    async with env["Session"]() as s:
        ob = await s.get(ClientObligation, uuid.UUID(r.json()["obligationId"]))
        assert (ob.verified, ob.verified_by_staff_id, ob.source_document_id) == (
            True, env["staff"].id, uuid.UUID(kept["documentId"]))
        now = datetime(2026, 10, 12, 9, 0, tzinfo=local_tz())
        items = await get_schedule(s, env["maria"].id, "day", now)
        text = render("day", items, window("day", now)[0], now.date())
    assert "Meet your parole officer" in text

    env["who"]["user"] = env["maria"]
    paper = (await env["http"].get(f"/papers/{kept['readingId']}")).json()
    assert next(a for a in paper["actions"] if a["id"] == meet["id"])["checkedByCaseWorker"] is True


@pytest.mark.asyncio
async def test_checking_off_a_scheduled_to_do_closes_its_obligation(env):
    kept = await kept_paper(env)
    action_id = (await env["http"].get(f"/papers/{kept['readingId']}")).json()["actions"][0]["id"]
    env["who"]["user"] = env["staff"]
    ob_id = (await env["http"].post(f"/papers/actions/{action_id}/schedule", json=FORM)).json()["obligationId"]
    env["who"]["user"] = env["maria"]
    await env["http"].patch(f"/papers/actions/{action_id}", json={"done": True})
    async with env["Session"]() as s:
        assert (await s.get(ClientObligation, uuid.UUID(ob_id))).status.value == "done"


@pytest.mark.asyncio
async def test_schedule_needs_a_date_and_a_case_worker(env):
    kept = await kept_paper(env)
    action_id = (await env["http"].get(f"/papers/{kept['readingId']}")).json()["actions"][0]["id"]
    assert (await env["http"].post(f"/papers/actions/{action_id}/schedule", json=FORM)).status_code == 403
    env["who"]["user"] = env["staff"]
    no_date = {k: v for k, v in FORM.items() if k != "due_date"}
    assert (await env["http"].post(f"/papers/actions/{action_id}/schedule", json=no_date)).status_code == 422


# ---------- review and list ----------

@pytest.mark.asyncio
async def test_mark_reviewed_works_on_any_paper(env):
    kept = await kept_paper(env)
    texted = await stored_doc(env, status=DocumentStatus.READ)   # e.g. a texted photo, never read
    env["who"]["user"] = env["staff"]
    for doc_id in (kept["documentId"], str(texted)):
        r = await env["http"].post(f"/documents/{doc_id}/reviewed")
        assert r.json()["status"] == "confirmed"
    async with env["Session"]() as s:
        doc = await s.get(Document, texted)
    assert doc.reviewed_by_staff_id == env["staff"].id and doc.reviewed_at is not None

    env["who"]["user"] = env["maria"]
    assert (await env["http"].post(f"/documents/{texted}/reviewed")).status_code == 403


@pytest.mark.asyncio
async def test_case_worker_lists_an_assigned_clients_papers(env):
    kept = await kept_paper(env)
    env["who"]["user"] = env["staff"]
    [paper] = (await env["http"].get(f"/clients/{env['maria'].id}/papers")).json()
    assert (paper["readingId"], paper["documentId"]) == (kept["readingId"], kept["documentId"])
    assert (await env["http"].get(f"/clients/{env['other'].id}/papers")).status_code == 404
