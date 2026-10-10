"""Inbound endpoint for the textbot sidecar. Not for browsers: authenticated with the
shared BOT_SERVICE_SECRET, never with Auth0 or client tokens."""

import hmac

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
import base64

from app.schemas import BotImageOut, BotInbound, BotInboundResult, BotReply
from app.services.bot_types import BotImage
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
    replies: list[BotReply] = []
    for item in outcome.replies:
        if isinstance(item, BotImage):
            image = BotImageOut(base64.b64encode(item.data).decode(), item.name, item.mime_type)
            if replies and replies[-1].image is None:
                replies[-1].image = image
            else:
                replies.append(BotReply(image=image))
        else:
            replies.append(BotReply(text=item))
    return BotInboundResult(
        replies=replies,
        session_active=outcome.client_id is not None,
    )
