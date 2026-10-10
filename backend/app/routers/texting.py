"""Case-worker controls for a client's text-bot enrollment (ClientPage toggle)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_staff
from app.db import get_session
from app.schemas import TextingEnroll, TextingStatus
from app.services import bot_messages as msg
from app.services.phone import (
    InvalidPhone,
    encrypt_phone,
    normalize_phone,
    phone_lookup_hash,
)
from app.services.textbot_client import send_text
from app.tables import Assignment, BotEnrollment, BotEnrollmentStatus, Client, Staff

router = APIRouter(prefix="/clients", tags=["texting"])


async def _my_client(session: AsyncSession, client_id: uuid.UUID, staff: Staff) -> Client:
    client = await session.scalar(
        select(Client)
        .join(Assignment, Assignment.client_id == Client.id)
        .where(
            Client.id == client_id,
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
        )
    )
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return client


async def _enrollment(session: AsyncSession, client_id: uuid.UUID) -> BotEnrollment | None:
    return await session.scalar(select(BotEnrollment).where(BotEnrollment.client_id == client_id))


def _status(e: BotEnrollment | None, welcome_sent: bool | None = None) -> TextingStatus:
    if e is None or e.status == BotEnrollmentStatus.REVOKED:
        return TextingStatus(enrolled=False, status=e.status.value if e else None)
    return TextingStatus(
        enrolled=True,
        status=e.status.value,
        phone_last4=e.phone_last4,
        channel=e.channel.value if e.channel else None,
        consent_at=e.consent_at,
        locked_at=e.locked_at,
        welcome_sent=welcome_sent,
    )


@router.get("/{client_id}/texting", response_model=TextingStatus)
async def texting_status(
    client_id: uuid.UUID,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> TextingStatus:
    await _my_client(session, client_id, staff)
    return _status(await _enrollment(session, client_id))


@router.put("/{client_id}/texting", response_model=TextingStatus)
async def enroll_texting(
    client_id: uuid.UUID,
    payload: TextingEnroll,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> TextingStatus:
    """Turn texting on (or change the number). Sends a welcome text with no personal details."""
    await _my_client(session, client_id, staff)
    if not payload.consent:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Client consent is required")
    try:
        e164 = normalize_phone(payload.phone)
    except InvalidPhone as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))

    e = await _enrollment(session, client_id)
    if e is None:
        e = BotEnrollment(client_id=client_id)
        session.add(e)
    else:
        await session.refresh(e, ["session"])
        if e.session is not None:  # new number or re-enrollment: start sign-in fresh
            await session.delete(e.session)
    e.phone_encrypted = encrypt_phone(e164)
    e.phone_hash = phone_lookup_hash(e164)
    e.phone_last4 = e164[-4:]
    e.status = BotEnrollmentStatus.ACTIVE
    e.consent_at = datetime.now(timezone.utc)
    e.enrolled_by_staff_id = staff.id
    e.locked_at = None
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "That number is already enrolled for another client")
    welcome_sent = await send_text(e164, msg.WELCOME)
    return _status(e, welcome_sent)


@router.post("/{client_id}/texting/unlock", response_model=TextingStatus)
async def unlock_texting(
    client_id: uuid.UUID,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> TextingStatus:
    """Clear a sign-in lock after too many wrong name/PIN attempts. To change the PIN,
    use the client's profile; there is no PIN reset over text."""
    await _my_client(session, client_id, staff)
    e = await _enrollment(session, client_id)
    if e is None or e.status != BotEnrollmentStatus.LOCKED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Texting is not locked")
    await session.refresh(e, ["session"])
    if e.session is not None:
        await session.delete(e.session)
    e.status = BotEnrollmentStatus.ACTIVE
    e.locked_at = None
    await session.commit()
    return _status(e)


@router.delete("/{client_id}/texting", response_model=TextingStatus)
async def revoke_texting(
    client_id: uuid.UUID,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> TextingStatus:
    """Turn texting off. The number then gets the generic not-enrolled reply."""
    await _my_client(session, client_id, staff)
    e = await _enrollment(session, client_id)
    if e is not None:
        await session.refresh(e, ["session"])
        if e.session is not None:
            await session.delete(e.session)
        e.status = BotEnrollmentStatus.REVOKED
        await session.commit()
    return _status(e)
