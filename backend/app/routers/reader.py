"""Document reader endpoints.

POST /reader/process  pages in, NDJSON progress events out, signed receipt at the end.
                      Stores nothing about the paper.
POST /reader/keep     the same pages plus the receipt; checks both and saves the paper,
                      its reading and its to-dos without calling the AI again.
POST /reader/documents/{id}/read
                      case worker: reads a paper already on file (e.g. from New Client)
                      and saves the reading straight away, since the paper is stored.

Both take a client's own token, or a case worker's token plus `client_id` for an assigned
client. Messages a person sees follow the client's language. Responses are never cached,
and nothing from a request body is logged.
"""

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Awaitable, Callable, Optional, Union

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy.orm import undefer

from app.auth import get_staff_or_client
from app.db import SessionLocal, get_session
from app.reader import receipt
from app.reader.ai import get_ai_client
from app.reader.messages import UserFacingError, say
from app.reader.pipeline import ProcessInput, ProcessResult, process_document
from app.reader.preprocess import MAX_PAGES
from app.reader.preprocess import UploadFile as ReaderFile
from app.reader.schemas import ErrorEvent
from app.reader.store import save_kept, save_reading
from app.services.timeutil import local_tz
from app.tables import Assignment, Client, Document, DocumentReading, DocumentStatus, ReaderUsage, Staff

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reader", tags=["reader"])

NO_STORE = {"Cache-Control": "no-store"}

RATE_LIMIT = 10          # readings per signed-in user...
RATE_WINDOW_S = 60       # ...per minute, shared by every API worker (reader_usage table)


async def _rate_limit(session: AsyncSession, actor: str, lang: str) -> None:
    """Counts this person's readings in the last minute. Count-then-insert isn't atomic,
    so two workers racing can let one extra reading through; that's fine for a limit."""
    now = time.time()
    await session.execute(delete(ReaderUsage).where(ReaderUsage.at < now - RATE_WINDOW_S))
    recent = await session.scalar(select(func.count()).where(ReaderUsage.actor == actor))
    if recent >= RATE_LIMIT:
        await session.commit()
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, say("rate_limited", lang))
    session.add(ReaderUsage(actor=actor, at=now))
    await session.commit()


async def _resolve_client(
    session: AsyncSession, who: Union[Staff, Client], client_id: Optional[uuid.UUID]
) -> tuple[Client, Optional[Staff]]:
    """A client reads for themselves; a case worker reads for an assigned client."""
    if isinstance(who, Client):
        return who, None
    if client_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "client_id is required")
    assigned = await session.scalar(
        select(Assignment.id).where(
            Assignment.client_id == client_id,
            Assignment.staff_id == who.id,
            Assignment.is_active.is_(True),
        )
    )
    client = await session.get(Client, client_id) if assigned else None
    if client is None or not client.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return client, who


async def _read(files: list[UploadFile], lang: str) -> list[ReaderFile]:
    if len(files) > MAX_PAGES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, say("too_many", lang, max=MAX_PAGES))
    return [
        ReaderFile(name=f.filename or "page", mime_type=f.content_type or "", data=await f.read())
        for f in files
    ]


def _today() -> str:
    return datetime.now(local_tz()).date().isoformat()


def get_session_factory() -> async_sessionmaker:
    """Sessions opened while streaming: the request's own session is closed by then."""
    return SessionLocal


async def _stream(inp: ProcessInput, finish: Callable[[ProcessResult], Awaitable[dict]]) -> AsyncIterator[str]:
    """Runs the pipeline and yields one JSON line per event. If the browser goes away,
    the generator is closed and the pipeline task is cancelled with it."""
    queue: asyncio.Queue = asyncio.Queue()

    async def run() -> None:
        try:
            await process_document(get_ai_client(), inp, queue.put_nowait, finish)
        except UserFacingError as exc:
            queue.put_nowait(ErrorEvent(message=exc.text(inp.language)))
        except Exception as exc:
            # The type only: messages from validation errors can quote document text.
            logger.error("reader: processing failed (%s)", type(exc).__name__)
            queue.put_nowait(ErrorEvent(message=say("failed", inp.language)))
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(run())
    try:
        while (event := await queue.get()) is not None:
            yield json.dumps(event.wire(), ensure_ascii=False) + "\n"
    finally:
        task.cancel()


@router.post("/process")
async def process(
    files: list[UploadFile] = File(...),
    client_id: Optional[uuid.UUID] = Form(None),
    who: Union[Staff, Client] = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    client, staff = await _resolve_client(session, who, client_id)
    language = client.language or "en"
    await _rate_limit(session, f"{'staff' if staff else 'client'}:{who.id}", language)
    uploads = await _read(files, language)

    # Dates come from the profile and the local calendar, never from the browser.
    today = _today()
    cid = str(client.id)
    inp = ProcessInput(
        files=uploads, language=language, today=today,
        release_date=client.release_date.isoformat() if client.release_date else None,
        received_date=today,
    )

    async def finish(result: ProcessResult) -> dict:
        body = receipt.receipt_body(
            result, client_id=cid, language=language, received_date=today, files=[u.data for u in uploads],
        )
        return {"receipt": receipt.sign(body)}

    return StreamingResponse(_stream(inp, finish), media_type="application/x-ndjson", headers=NO_STORE)


@router.post("/keep", status_code=status.HTTP_201_CREATED)
async def keep(
    files: list[UploadFile] = File(...),
    receipt_token: str = Form(..., alias="receipt"),
    client_id: Optional[uuid.UUID] = Form(None),
    who: Union[Staff, Client] = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    client, staff = await _resolve_client(session, who, client_id)
    language = client.language or "en"
    uploads = await _read(files, language)
    try:
        body = receipt.check(receipt_token, client_id=str(client.id), files=[u.data for u in uploads])
    except receipt.ReceiptError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.text(language)) from None

    reading = await save_kept(session, body, uploads, client, staff, datetime.now(timezone.utc))
    await session.commit()
    return JSONResponse(
        {"documentId": str(reading.document_id), "readingId": str(reading.id)},
        status_code=status.HTTP_201_CREATED, headers=NO_STORE,
    )


@router.post("/documents/{document_id}/read")
async def read_stored(
    document_id: uuid.UUID,
    who: Union[Staff, Client] = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
    sessions: async_sessionmaker = Depends(get_session_factory),
) -> StreamingResponse:
    """Case workers only, for a paper on file that has no reading yet. Streams the same
    events as /reader/process; the last one carries the saved reading's id."""
    if not isinstance(who, Staff):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Case workers only")
    doc = await session.scalar(select(Document).options(undefer(Document.content)).where(Document.id == document_id))
    if doc is None or doc.client_id is None or doc.content is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    client, staff = await _resolve_client(session, who, doc.client_id)
    if await session.scalar(select(DocumentReading.id).where(DocumentReading.document_id == doc.id)):
        raise HTTPException(status.HTTP_409_CONFLICT, "This paper has already been read")
    language = client.language or "en"
    await _rate_limit(session, f"staff:{who.id}", language)

    today = _today()
    upload = ReaderFile(name=doc.original_filename or "document", mime_type=doc.mime_type or "", data=doc.content)
    inp = ProcessInput(
        files=[upload], language=language, today=today,
        release_date=client.release_date.isoformat() if client.release_date else None,
        received_date=doc.created_at.astimezone(local_tz()).date().isoformat() if doc.created_at else today,
    )
    client_id, staff_id, doc_id = client.id, staff.id, doc.id

    async def finish(result: ProcessResult) -> dict:
        body = receipt.receipt_body(
            result, client_id=str(client_id), language=language, received_date=inp.received_date or today,
            files=[upload.data],
        )
        async with sessions() as s:
            stored = await s.get(Document, doc_id)
            owner = await s.get(Client, client_id)
            worker = await s.get(Staff, staff_id)
            reading = await save_reading(s, body, stored, owner, worker)
            if stored.status in (DocumentStatus.UPLOADED, DocumentStatus.PROCESSING, DocumentStatus.FAILED):
                stored.status = DocumentStatus.READ
            stored.ai_summary = stored.ai_summary or body.meta.title
            stored.processed_at = datetime.now(timezone.utc)
            await s.commit()
            return {"reading_id": str(reading.id)}

    return StreamingResponse(_stream(inp, finish), media_type="application/x-ndjson", headers=NO_STORE)
