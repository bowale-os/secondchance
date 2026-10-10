"""Resource search and detail (staff and clients), and client matching.

Endpoints match frontend/src/api/resources.ts:
  GET /resources                 staff or client token
  GET /resources/{id}            staff or client; staff may pass ?client_id= (must be theirs)
  GET /clients/{id}/resources    staff, assigned client only
  GET /me/resources              client token
"""

import uuid
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import bearer, get_current_client, get_current_staff, get_token_claims
from app.db import get_session
from app.security import decode_client_token
from app.services import resources as svc
from app.tables import Assignment, Client, Staff

router = APIRouter(tags=["resources"])


class Viewer:
    def __init__(self, staff: Optional[Staff] = None, client: Optional[Client] = None):
        self.staff, self.client = staff, client


async def get_viewer(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> Viewer:
    """A logged-in client (HS256 token) or case worker (Auth0 RS256 token)."""
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token",
                            headers={"WWW-Authenticate": "Bearer"})
    try:
        client_id = decode_client_token(creds.credentials)
    except (jwt.PyJWTError, ValueError):
        staff = await get_current_staff(await get_token_claims(creds), session)
        return Viewer(staff=staff)
    client = await session.get(Client, client_id)
    if client is None or not client.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    return Viewer(client=client)


def _parse(request: Request, explicit: bool):
    try:
        return svc.parse_query(request.query_params, explicit=explicit)
    except svc.QueryError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))


async def _my_client(session: AsyncSession, client_id: uuid.UUID, staff: Staff) -> Client:
    client = await session.scalar(
        select(Client).join(Assignment, Assignment.client_id == Client.id).where(
            Client.id == client_id, Assignment.staff_id == staff.id, Assignment.is_active.is_(True)
        )
    )
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    return client


@router.get("/resources")
async def search_resources(
    request: Request,
    _: Viewer = Depends(get_viewer),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """ResourceSearchResponse. Filters never exclude on "unknown"."""
    q, _keys = _parse(request, explicit=False)
    return await svc.search(session, q)


@router.get("/resources/{resource_id}")
async def get_resource(
    resource_id: uuid.UUID,
    client_id: Optional[uuid.UUID] = None,
    viewer: Viewer = Depends(get_viewer),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Full Resource. document_checks is filled for a client context, else null."""
    r = await svc.get_resource(session, resource_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Resource not found")
    checks = None
    if viewer.client is not None:
        checks = await svc.document_checks(session, viewer.client.id, r)
    elif client_id is not None:
        await _my_client(session, client_id, viewer.staff)
        checks = await svc.document_checks(session, client_id, r)
    return svc.detail(r, checks)


@router.get("/clients/{client_id}/resources")
async def client_resource_matches(
    client_id: uuid.UUID,
    request: Request,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """ClientResourceMatch: profile-based filters plus overrides from the query string."""
    client = await _my_client(session, client_id, staff)
    overrides, keys = _parse(request, explicit=True)
    return await svc.client_matches(session, client, overrides, keys)


@router.get("/me/resources")
async def my_resource_matches(
    request: Request,
    client: Client = Depends(get_current_client),
    session: AsyncSession = Depends(get_session),
) -> dict:
    overrides, keys = _parse(request, explicit=True)
    return await svc.client_matches(session, client, overrides, keys)
