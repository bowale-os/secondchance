"""Inbound endpoint for the textbot sidecar. Not for browsers: authenticated with the
shared BOT_SERVICE_SECRET, never with Auth0 or client tokens."""

import hmac

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.schemas import BotInbound, BotInboundResult, BotReply
from app.services.bot_conversation import Inbound, handle_inbound

router = APIRouter(prefix="/bot", tags=["bot"], include_in_schema=False)
_bearer = HTTPBearer(auto_error=False)


def require_sidecar(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> None:
    secret = get_settings().bot_service_secret.get_secret_value()
    if not secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Text bot is not configured")
    if creds is None or not hmac.compare_digest(creds.credentials.encode(), secret.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unauthorized")


@router.post("/inbound", response_model=BotInboundResult, dependencies=[Depends(require_sidecar)])
async def inbound(
    payload: BotInbound, session: AsyncSession = Depends(get_session)
) -> BotInboundResult:
    outcome = await handle_inbound(
        session,
        Inbound(
            sender=payload.sender,
            text=payload.text[:2000],
            channel=payload.channel,
            attachment_count=payload.attachment_count,
        ),
    )
    return BotInboundResult(
        replies=[BotReply(text=t) for t in outcome.replies],
        session_active=outcome.client_id is not None,
    )
