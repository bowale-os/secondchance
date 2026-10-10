"""Case-worker CRUD for a client's appointments, plus the schedule preview."""

import uuid
from dataclasses import asdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_staff
from app.db import get_session
from app.schemas import AppointmentRead, AppointmentWrite, ScheduleItemRead, from_row
from app.services.schedule import get_schedule
from app.services.timeutil import aware, local_tz
from app.tables import Appointment, Assignment, ClientObligation, Staff

router = APIRouter(prefix="/clients", tags=["appointments"])

MAX_DOCS = 10
MAX_DOC_LEN = 80


async def _assert_mine(session: AsyncSession, client_id: uuid.UUID, staff: Staff) -> None:
    assigned = await session.scalar(
        select(Assignment.id).where(
            Assignment.client_id == client_id,
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
        )
    )
    if assigned is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")


def _localize(dt: datetime) -> datetime:
    return dt.replace(tzinfo=local_tz()) if dt.tzinfo is None else dt


async def _validated(session: AsyncSession, client_id: uuid.UUID, p: AppointmentWrite) -> dict:
    title = p.title.strip()
    if not title:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Title is required")
    starts = _localize(p.starts_at)
    ends = _localize(p.ends_at) if p.ends_at else None
    if ends and ends <= starts:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "End time must be after the start time")
    docs = [d.strip() for d in p.documents_to_bring if d and d.strip()]
    if len(docs) > MAX_DOCS or any(len(d) > MAX_DOC_LEN for d in docs):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Up to {MAX_DOCS} documents, {MAX_DOC_LEN} characters each",
        )
    if p.obligation_id:
        owner = await session.scalar(
            select(ClientObligation.client_id).where(ClientObligation.id == p.obligation_id)
        )
        if owner != client_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Obligation not found for this client")
    clean = lambda v: (v or "").strip() or None  # noqa: E731
    return dict(
        title=title[:200],
        starts_at=starts.astimezone(timezone.utc),
        ends_at=ends.astimezone(timezone.utc) if ends else None,
        location_name=clean(p.location_name),
        address=clean(p.address),
        transit_note=clean(p.transit_note),
        documents_to_bring=docs,
        obligation_id=p.obligation_id,
    )


async def _get(session: AsyncSession, client_id: uuid.UUID, appt_id: uuid.UUID) -> Appointment:
    appt = await session.scalar(
        select(Appointment).where(Appointment.id == appt_id, Appointment.client_id == client_id)
    )
    if appt is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Appointment not found")
    return appt


@router.get("/{client_id}/appointments", response_model=list[AppointmentRead])
async def list_appointments(
    client_id: uuid.UUID,
    include_past: bool = Query(False, description="Also return the last 30 days"),
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> list[AppointmentRead]:
    """Upcoming appointments (including cancelled, so the case worker sees them), soonest first."""
    await _assert_mine(session, client_id, staff)
    since = datetime.now(timezone.utc) - (timedelta(days=30) if include_past else timedelta(hours=12))
    rows = await session.scalars(
        select(Appointment)
        .where(Appointment.client_id == client_id, Appointment.starts_at >= since)
        .order_by(Appointment.starts_at)
    )
    return [from_row(AppointmentRead, a) for a in rows]


@router.post("/{client_id}/appointments", response_model=AppointmentRead, status_code=status.HTTP_201_CREATED)
async def create_appointment(
    client_id: uuid.UUID,
    payload: AppointmentWrite,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> AppointmentRead:
    await _assert_mine(session, client_id, staff)
    appt = Appointment(client_id=client_id, created_by_staff_id=staff.id, cancelled=False,
                       **await _validated(session, client_id, payload))
    session.add(appt)
    await session.commit()
    await session.refresh(appt)
    return from_row(AppointmentRead, appt)


@router.put("/{client_id}/appointments/{appt_id}", response_model=AppointmentRead)
async def replace_appointment(
    client_id: uuid.UUID,
    appt_id: uuid.UUID,
    payload: AppointmentWrite,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> AppointmentRead:
    await _assert_mine(session, client_id, staff)
    appt = await _get(session, client_id, appt_id)
    for k, v in (await _validated(session, client_id, payload)).items():
        setattr(appt, k, v)
    appt.cancelled = False
    await session.commit()
    await session.refresh(appt)
    return from_row(AppointmentRead, appt)


@router.delete("/{client_id}/appointments/{appt_id}", response_model=AppointmentRead)
async def cancel_appointment(
    client_id: uuid.UUID,
    appt_id: uuid.UUID,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> AppointmentRead:
    """Cancel (kept for the record; disappears from the client's schedule)."""
    await _assert_mine(session, client_id, staff)
    appt = await _get(session, client_id, appt_id)
    appt.cancelled = True
    await session.commit()
    await session.refresh(appt)
    return from_row(AppointmentRead, appt)


@router.get("/{client_id}/schedule", response_model=list[ScheduleItemRead])
async def preview_schedule(
    client_id: uuid.UUID,
    range: Literal["day", "tomorrow", "week"] = "week",
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> list[ScheduleItemRead]:
    """Exactly what the client sees when they text TODAY / TOMORROW / WEEK."""
    await _assert_mine(session, client_id, staff)
    items = await get_schedule(session, client_id, range, datetime.now(timezone.utc))
    return [ScheduleItemRead(**asdict(i)) for i in items]
