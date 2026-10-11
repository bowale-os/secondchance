"""Calendar events, stored as client obligations.

Case workers enter a client's fees, court dates and check-ins at registration. After
that, clients add their own events here; case workers see them (and are told about new
ones) and can mark any event done, but cannot edit them.
"""

import uuid
from dataclasses import fields
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_client, get_current_staff
from app.db import get_session
from app.schemas import EventRead, EventStatusUpdate, EventWrite, StaffEventRead
from app.tables import Assignment, Client, ClientObligation, ObligationStatus, Staff

router = APIRouter(tags=["events"])


def _status(row: ClientObligation) -> ObligationStatus:
    """OVERDUE is never stored: an open event whose date has passed is overdue."""
    if row.status == ObligationStatus.OPEN and row.due_date and row.due_date < date.today():
        return ObligationStatus.OVERDUE
    return row.status


def _event(cls, row: ClientObligation, **extra):
    values = {f.name: getattr(row, f.name) for f in fields(EventRead)}
    values["status"] = _status(row)
    return cls(**values, **extra)


def _clean(payload: EventWrite) -> None:
    description = payload.description.strip()
    if not description or len(description) > 500:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Describe the event in 1-500 characters")
    payload.description = description
    if payload.location is not None:
        payload.location = payload.location.strip()[:300] or None


# ---------------- client ----------------


async def _own_event(event_id: uuid.UUID, client: Client, session: AsyncSession) -> ClientObligation:
    row = await session.scalar(
        select(ClientObligation).where(
            ClientObligation.id == event_id,
            ClientObligation.client_id == client.id,
            ClientObligation.added_by_client.is_(True),  # registration entries belong to the case worker
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    return row


@router.get("/auth/client/obligations", response_model=list[EventRead])
async def client_events(
    client: Client = Depends(get_current_client), session: AsyncSession = Depends(get_session)
) -> list[EventRead]:
    """All of the logged-in client's events, soonest first (undated ones last)."""
    rows = await session.scalars(
        select(ClientObligation)
        .where(ClientObligation.client_id == client.id)
        .order_by(ClientObligation.due_date.asc().nulls_last(), ClientObligation.due_time.asc().nulls_last())
    )
    return [_event(EventRead, r) for r in rows]


@router.post("/auth/client/obligations", response_model=EventRead, status_code=status.HTTP_201_CREATED)
async def client_add_event(
    payload: EventWrite,
    client: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> EventRead:
    """The client adds an event to their own calendar. Their case worker is notified."""
    _clean(payload)
    row = ClientObligation(
        client_id=client.id,
        obligation_type=payload.obligation_type,
        description=payload.description,
        amount=payload.amount,
        due_date=payload.due_date,
        due_time=payload.due_time,
        location=payload.location,
        added_by_client=True,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _event(EventRead, row)


@router.put("/auth/client/obligations/{event_id}", response_model=EventRead)
async def client_edit_event(
    event_id: uuid.UUID,
    payload: EventWrite,
    client: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> EventRead:
    """Change an event the client added. Closing it out is the case worker's job."""
    _clean(payload)
    row = await _own_event(event_id, client, session)
    row.obligation_type = payload.obligation_type
    row.description = payload.description
    row.amount = payload.amount
    row.due_date = payload.due_date
    row.due_time = payload.due_time
    row.location = payload.location
    row.staff_seen_at = None  # the case worker is told about the change
    await session.commit()
    await session.refresh(row)
    return _event(EventRead, row)


@router.delete("/auth/client/obligations/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def client_delete_event(
    event_id: uuid.UUID,
    client: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> Response:
    row = await _own_event(event_id, client, session)
    await session.delete(row)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------- case worker ----------------


@router.get("/obligations", response_model=list[StaffEventRead])
async def staff_events(
    start: Optional[date] = Query(None, alias="from"),
    end: Optional[date] = Query(None, alias="to"),
    event_status: Optional[ObligationStatus] = Query(None, alias="status"),
    unseen_only: bool = False,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> list[StaffEventRead]:
    """Events across all my clients, soonest first.

    `from`/`to` limit by date (inclusive); `status` is open, done or overdue.
    `unseen_only=true` returns client-added events I have not acknowledged yet,
    whatever their date (this is the notification feed).
    """
    stmt = (
        select(ClientObligation, Client.first_name, Client.last_name)
        .join(Client, Client.id == ClientObligation.client_id)
        .join(Assignment, Assignment.client_id == Client.id)
        .where(
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
            Client.is_active.is_(True),
        )
    )
    if unseen_only:
        stmt = stmt.where(ClientObligation.added_by_client.is_(True), ClientObligation.staff_seen_at.is_(None))
    if start:
        stmt = stmt.where(ClientObligation.due_date >= start)
    if end:
        stmt = stmt.where(ClientObligation.due_date <= end)
    today = date.today()
    if event_status == ObligationStatus.OVERDUE:
        stmt = stmt.where(ClientObligation.status == ObligationStatus.OPEN, ClientObligation.due_date < today)
    elif event_status == ObligationStatus.OPEN:
        stmt = stmt.where(
            ClientObligation.status == ObligationStatus.OPEN,
            or_(ClientObligation.due_date.is_(None), ClientObligation.due_date >= today),
        )
    elif event_status == ObligationStatus.DONE:
        stmt = stmt.where(ClientObligation.status == ObligationStatus.DONE)
    stmt = stmt.order_by(
        ClientObligation.due_date.asc().nulls_last(), ClientObligation.due_time.asc().nulls_last()
    )
    result = await session.execute(stmt)
    return [_event(StaffEventRead, row, client_name=f"{first} {last}") for row, first, last in result]


@router.patch("/obligations/{event_id}/status", response_model=EventRead)
async def set_event_status(
    event_id: uuid.UUID,
    payload: EventStatusUpdate,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> EventRead:
    """Mark one of my clients' events done (or reopen it). Nothing else can change."""
    if payload.status not in (ObligationStatus.OPEN, ObligationStatus.DONE):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Status must be open or done")
    row = await session.scalar(
        select(ClientObligation)
        .join(Assignment, Assignment.client_id == ClientObligation.client_id)
        .where(
            ClientObligation.id == event_id,
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Event not found")
    row.status = payload.status
    if row.staff_seen_at is None:
        row.staff_seen_at = datetime.now(timezone.utc)
    await session.commit()
    await session.refresh(row)
    return _event(EventRead, row)


@router.post("/clients/{client_id}/obligations/seen")
async def mark_events_seen(
    client_id: uuid.UUID,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Dismiss the notifications for one client: all their client-added events count as seen."""
    assigned = await session.scalar(
        select(Assignment.id).where(
            Assignment.client_id == client_id,
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
        )
    )
    if assigned is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    rows = await session.scalars(
        select(ClientObligation).where(
            ClientObligation.client_id == client_id,
            ClientObligation.added_by_client.is_(True),
            ClientObligation.staff_seen_at.is_(None),
        )
    )
    now = datetime.now(timezone.utc)
    seen = 0
    for row in rows:
        row.staff_seen_at = now
        seen += 1
    await session.commit()
    return {"seen": seen}
