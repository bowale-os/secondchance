"""Auth0 access-token verification and the current-staff dependency."""

import logging
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.security import decode_client_token
from app.tables import Client, Staff

settings = get_settings()
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


@lru_cache
def _jwks_client() -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"https://{settings.auth0_domain}/.well-known/jwks.json")


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED, detail, headers={"WWW-Authenticate": "Bearer"}
    )


async def get_token_claims(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    """Validate the Auth0 bearer token and return its claims."""
    if creds is None:
        raise _unauthorized("Missing bearer token")
    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(creds.credentials)
        return jwt.decode(
            creds.credentials,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.auth0_audience,
            issuer=f"https://{settings.auth0_domain}/",
            leeway=60,  # tolerate small clock skew between this machine and Auth0
        )
    except jwt.PyJWTError as exc:
        logger.warning("Token rejected: %s: %s", type(exc).__name__, exc)
        raise _unauthorized("Invalid or expired token")


async def get_current_client(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> Client:
    """The active client behind a token issued by POST /auth/client/login."""
    if creds is None:
        raise _unauthorized("Missing bearer token")
    try:
        client_id = decode_client_token(creds.credentials)
    except (jwt.PyJWTError, ValueError):
        raise _unauthorized("Invalid or expired token")
    client = await session.get(Client, client_id)
    if client is None or not client.is_active:
        raise _unauthorized("Invalid or expired token")
    return client


async def get_current_staff(
    claims: dict = Depends(get_token_claims),
    session: AsyncSession = Depends(get_session),
) -> Staff:
    """The signed-up, active case worker behind the token."""
    staff = await session.scalar(select(Staff).where(Staff.auth0_id == claims["sub"]))
    if staff is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found; sign up first")
    if not staff.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is deactivated")
    return staff


async def get_staff_or_client(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    session: AsyncSession = Depends(get_session),
) -> Staff | Client:
    """Whoever holds the token: a logged-in client (HS256) or an Auth0 case worker (RS256)."""
    if creds is None:
        raise _unauthorized("Missing bearer token")
    try:
        client_id = decode_client_token(creds.credentials)
    except (jwt.PyJWTError, ValueError):
        return await get_current_staff(await get_token_claims(creds), session)
    client = await session.get(Client, client_id)
    if client is None or not client.is_active:
        raise _unauthorized("Invalid or expired token")
    return client
