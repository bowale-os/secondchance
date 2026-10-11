"""Kept papers: the client's list, their open to-dos, one paper, checking a to-do off, and
removing a paper they kept. Due dates are worked out fresh on every read (store.load_reading).

GET    /auth/client/papers            client: kept papers, newest first (?q= searches titles)
GET    /auth/client/papers/upcoming   client: open to-dos from every paper, soonest first
DELETE /auth/client/papers/{id}       client: remove a paper they kept themselves
GET    /papers/{reading_id}           client (own) or case worker (assigned): one paper
PATCH  /papers/actions/{action_id}    client (own) or case worker (assigned): done / not done
"""

import uuid
from datetime import datetime, timezone
from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_client, get_staff_or_client
from app.db import get_session
from app.reader.schemas import ActionItem, CamelModel, Flag
from app.reader.store import ReadingView, load_reading
from app.services.timeutil import local_tz
from app.tables import Assignment, Client, Document, DocumentAction, DocumentReading, Staff

router = APIRouter(tags=["papers"])

NO_STORE = {"Cache-Control": "no-store"}


class PaperListItem(CamelModel):
    reading_id: str
    document_id: str
    title: str
    doc_type: str
    issuer: Optional[str] = None
    document_date: Optional[str] = None
    kept_at: str
    kept_by_case_worker: bool
    open_count: int
    next_due: Optional[str] = None   # soonest open to-do with a date


class UpcomingItem(CamelModel):
    reading_id: str
    paper_title: str
    doc_type: str
    action: ActionItem
    flags: list[Flag]   # this to-do's "double-check" notes


class ActionDone(BaseModel):
    done: bool


def _today() -> str:
    return datetime.now(local_tz()).date().isoformat()


def _json(data) -> Response:
    return JSONResponse(data, headers=NO_STORE)


async def _client_readings(session: AsyncSession, client_id: uuid.UUID, q: Optional[str] = None):
    stmt = (
        select(DocumentReading)
        .options(selectinload(DocumentReading.actions))
        .where(DocumentReading.client_id == client_id)
        .order_by(DocumentReading.created_at.desc())
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(DocumentReading.title.ilike(like), DocumentReading.issuer.ilike(like)))
    return list(await session.scalars(stmt))


async def _can_reach(session: AsyncSession, who: Union[Staff, Client], client_id: uuid.UUID) -> bool:
    if isinstance(who, Client):
        return who.id == client_id
    return await session.scalar(
        select(Assignment.id).where(
            Assignment.client_id == client_id, Assignment.staff_id == who.id, Assignment.is_active.is_(True),
        )
    ) is not None


@router.get("/auth/client/papers")
async def list_papers(
    q: Optional[str] = None,
    client: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> Response:
    today = _today()
    items = []
    for r in await _client_readings(session, client.id, q):
        view = load_reading(r, client, today)
        open_ = [a for a in view.actions if not a.completed]
        dated = sorted(a.due.resolved_date for a in open_ if a.due.resolved_date)
        items.append(PaperListItem(
            reading_id=str(r.id), document_id=str(r.document_id), title=r.title, doc_type=r.doc_type,
            issuer=r.issuer, document_date=view.meta.document_date, kept_at=r.created_at.isoformat(),
            kept_by_case_worker=r.created_by_staff_id is not None, open_count=len(open_),
            next_due=dated[0] if dated else None,
        ).wire())
    return _json(items)


@router.get("/auth/client/papers/upcoming")
async def upcoming(
    client: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Open to-dos from every kept paper: dated ones soonest first, undated ones last."""
    today = _today()
    items: list[UpcomingItem] = []
    for r in await _client_readings(session, client.id):
        view = load_reading(r, client, today)
        for a in view.actions:
            if not a.completed:
                items.append(UpcomingItem(
                    reading_id=str(r.id), paper_title=r.title, doc_type=r.doc_type, action=a,
                    flags=[f for f in view.flags if f.action_id == a.id],
                ))
    rank = {"urgent": 0, "normal": 1, "low": 2}
    items.sort(key=lambda i: (i.action.due.resolved_date or "9999", rank[i.action.priority], i.paper_title))
    return _json([i.wire() for i in items])


@router.delete("/auth/client/papers/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paper(
    reading_id: uuid.UUID,
    client: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Removes the paper, its reading and its to-dos. Only papers the client kept
    themselves; ones a case worker kept stay on file."""
    reading = await session.get(DocumentReading, reading_id)
    if reading is None or reading.client_id != client.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    if reading.created_by_staff_id is not None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your case worker saved this paper. Ask them to remove it.")
    doc = await session.get(Document, reading.document_id)
    await session.delete(reading)   # its to-dos go with it
    if doc is not None:
        await session.delete(doc)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/papers/{reading_id}")
async def get_paper(
    reading_id: uuid.UUID,
    who: Union[Staff, Client] = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
) -> Response:
    reading = await session.scalar(
        select(DocumentReading).options(selectinload(DocumentReading.actions)).where(DocumentReading.id == reading_id)
    )
    if reading is None or not await _can_reach(session, who, reading.client_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    client = who if isinstance(who, Client) else await session.get(Client, reading.client_id)
    view: ReadingView = load_reading(reading, client, _today())
    return _json(view.wire())


@router.patch("/papers/actions/{action_id}")
async def set_done(
    action_id: uuid.UUID,
    body: ActionDone,
    who: Union[Staff, Client] = Depends(get_staff_or_client),
    session: AsyncSession = Depends(get_session),
) -> Response:
    action = await session.get(DocumentAction, action_id)
    if action is None or not await _can_reach(session, who, action.client_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "To-do not found")
    if body.done:
        action.completed_at = action.completed_at or datetime.now(timezone.utc)
        action.completed_by_staff_id = who.id if isinstance(who, Staff) else None
    else:
        action.completed_at = None
        action.completed_by_staff_id = None
    await session.commit()
    return _json({
        "id": str(action.id),
        "completed": action.completed_at is not None,
        "completedAt": action.completed_at.isoformat() if action.completed_at else None,
    })
