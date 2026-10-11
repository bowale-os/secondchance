"""Document reader endpoints.

POST /reader/process  pages in, NDJSON progress events out, signed receipt at the end.
                      Stores nothing.
POST /reader/keep     the same pages plus the receipt; checks both and saves the paper,
                      its reading and its to-dos without calling the AI again.

Both take a client's own token, or a case worker's token plus `client_id` for an assigned
client. Responses are never cached, and nothing from a request body is logged.
"""

import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import AsyncIterator, Callable, Optional, Union

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_staff_or_client
from app.db import get_session
from app.reader import receipt
from app.reader.ai import UserFacingError, get_ai_client
from app.reader.pipeline import ProcessInput, ProcessResult, process_document
from app.reader.preprocess import MAX_PAGES
from app.reader.preprocess import UploadFile as ReaderFile
from app.reader.schemas import ErrorEvent
from app.reader.store import save_kept
from app.services.timeutil import local_tz
from app.tables import Assignment, Client, Staff

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reader", tags=["reader"])

NO_STORE = {"Cache-Control": "no-store"}
GENERIC_ERROR = "Something went wrong reading this paper. Please try again."

RATE_LIMIT = 10          # readings per signed-in user...
RATE_WINDOW_S = 60       # ...per minute (per API process)
_hits: dict[str, deque] = defaultdict(deque)


def _rate_limit(key: str) -> None:
    now = time.monotonic()
    hits = _hits[key]
    while hits and now - hits[0] > RATE_WINDOW_S:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many papers at once. Please wait a minute and try again."
        )
    hits.append(now)


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


async def _read(files: list[UploadFile]) -> list[ReaderFile]:
    if len(files) > MAX_PAGES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"That's more than {MAX_PAGES} pages. Please send {MAX_PAGES} pages or fewer at a time.",
        )
    return [
        ReaderFile(name=f.filename or "page", mime_type=f.content_type or "", data=await f.read())
        for f in files
    ]


def _today() -> str:
    return datetime.now(local_tz()).date().isoformat()


async def _stream(inp: ProcessInput, sign: Callable[[ProcessResult], str]) -> AsyncIterator[str]:
    """Runs the pipeline and yields one JSON line per event. If the browser goes away,
    the generator is closed and the pipeline task is cancelled with it."""
    queue: asyncio.Queue = asyncio.Queue()

    async def run() -> None:
        try:
            await process_document(get_ai_client(), inp, queue.put_nowait, sign)
        except UserFacingError as exc:
            queue.put_nowait(ErrorEvent(message=str(exc)))
        except Exception as exc:
            # The type only: messages from validation errors can quote document text.
            logger.error("reader: processing failed (%s)", type(exc).__name__)
            queue.put_nowait(ErrorEvent(message=GENERIC_ERROR))
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
    _rate_limit(f"{'staff' if staff else 'client'}:{who.id}")
    uploads = await _read(files)

    # Dates come from the profile and the local calendar, never from the browser.
    today = _today()
    cid, language = str(client.id), client.language or "en"
    inp = ProcessInput(
        files=uploads, language=language, today=today,
        release_date=client.release_date.isoformat() if client.release_date else None,
        received_date=today,
    )

    def sign(result: ProcessResult) -> str:
        body = receipt.receipt_body(
            result, client_id=cid, language=language, received_date=today, files=[u.data for u in uploads],
        )
        return receipt.sign(body)

    return StreamingResponse(_stream(inp, sign), media_type="application/x-ndjson", headers=NO_STORE)


@router.post("/keep", status_code=status.HTTP_201_CREATED)
async def keep(
    files: list[UploadFile] = File(...),
    receipt_token: str = Form(..., alias="receipt"),
    client_id: Optional[uuid.UUID] = Form(None),
    who: Union[Staff, Client] = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    client, staff = await _resolve_client(session, who, client_id)
    uploads = await _read(files)
    try:
        body = receipt.check(receipt_token, client_id=str(client.id), files=[u.data for u in uploads])
    except receipt.ReceiptError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from None

    reading = await save_kept(session, body, uploads, client, staff, datetime.now(timezone.utc))
    await session.commit()
    return JSONResponse(
        {"documentId": str(reading.document_id), "readingId": str(reading.id)},
        status_code=status.HTTP_201_CREATED, headers=NO_STORE,
    )
