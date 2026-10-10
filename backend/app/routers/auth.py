from datetime import datetime, timedelta, timezone
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_client, get_current_staff, get_token_claims
from app.config import get_settings
from app.db import get_session
from app.schemas import ClientLogin, ClientRead, DocumentListItem, ClientToken, StaffRead, StaffSignup, from_row
from app.security import create_client_token, hash_pin, verify_pin_async
from app.tables import Client, Document, Staff

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=StaffRead, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: StaffSignup,
    claims: dict = Depends(get_token_claims),
    session: AsyncSession = Depends(get_session),
) -> StaffRead:
    """Create the case worker profile for a freshly authenticated Auth0 user."""
    auth0_id = claims["sub"]
    existing = await session.scalar(
        select(Staff).where((Staff.auth0_id == auth0_id) | (Staff.email == payload.email))
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Account already exists")
    staff = Staff(
        auth0_id=auth0_id,
        email=payload.email,
        full_name=payload.full_name,
        organization_name=payload.organization_name,
        phone=payload.phone,
    )
    session.add(staff)
    await session.commit()
    await session.refresh(staff)
    return from_row(StaffRead, staff)


@router.post("/signin", response_model=StaffRead)
async def signin(staff: Staff = Depends(get_current_staff)) -> StaffRead:
    """Called by the frontend after Auth0 login; returns the profile.

    404 means the user authenticated but has not signed up yet.
    """
    return from_row(StaffRead, staff)


@router.get("/me", response_model=StaffRead)
async def me(staff: Staff = Depends(get_current_staff)) -> StaffRead:
    return from_row(StaffRead, staff)


@lru_cache
def _dummy_hash() -> str:
    """Verified against when the name is unknown, so timing doesn't reveal it."""
    return hash_pin("0000")


@router.post("/client/login", response_model=ClientToken)
async def client_login(
    payload: ClientLogin, session: AsyncSession = Depends(get_session)
) -> ClientToken:
    """Client login with name + PIN. Wrong PINs count toward a temporary lockout."""
    settings = get_settings()
    bad_login = HTTPException(status.HTTP_401_UNAUTHORIZED, "Name or PIN is incorrect")
    candidates = (
        await session.scalars(
            select(Client).where(
                func.lower(Client.first_name) == payload.first_name.strip().lower(),
                func.lower(Client.last_name) == payload.last_name.strip().lower(),
                Client.is_active.is_(True),
            )
        )
    ).all()
    if not candidates:
        await verify_pin_async(payload.pin, _dummy_hash())
        raise bad_login

    now = datetime.now(timezone.utc)
    open_candidates = [c for c in candidates if c.pin_locked_until is None or c.pin_locked_until <= now]
    if not open_candidates:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts; try again later")

    for client in open_candidates:
        if await verify_pin_async(payload.pin, client.pin_hash):
            client.pin_failed_attempts = 0
            client.pin_locked_until = None
            await session.commit()
            token, expires_in = create_client_token(client.id)
            return ClientToken(access_token=token, expires_in=expires_in)

    for client in open_candidates:  # two clients can share a name, so all take the strike
        client.pin_failed_attempts += 1
        if client.pin_failed_attempts >= settings.pin_max_attempts:
            client.pin_locked_until = now + timedelta(minutes=settings.pin_lockout_minutes)
            client.pin_failed_attempts = 0
    await session.commit()
    raise bad_login


@router.get("/client/me", response_model=ClientRead)
async def client_me(client: Client = Depends(get_current_client)) -> ClientRead:
    return from_row(ClientRead, client)


@router.get("/client/documents", response_model=list[DocumentListItem])
async def client_documents(
    client: Client = Depends(get_current_client), session: AsyncSession = Depends(get_session)
) -> list[DocumentListItem]:
    """The logged-in client's own documents (metadata only), newest first. Open a file
    with GET /documents/{id}/content."""
    docs = await session.scalars(
        select(Document).where(Document.client_id == client.id).order_by(Document.created_at.desc())
    )
    return [from_row(DocumentListItem, d) for d in docs]
