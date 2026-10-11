"""Inbound endpoint for the textbot sidecar. Not for browsers: authenticated with the
shared BOT_SERVICE_SECRET, never with Auth0 or client tokens."""

import hmac

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
import base64
import binascii

from app.schemas import BotAudioOut, BotImageOut, BotInbound, BotInboundResult, BotReply
from app.services.bot_types import BotAudio, BotImage
from app.services.photo_reader import MAX_PHOTOS, Photo
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
    if len(payload.images) > MAX_PHOTOS:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, f"At most {MAX_PHOTOS} photos per message")
    try:
        photos = [Photo(base64.b64decode(i.data_base64, validate=True), i.mime_type, i.name[:100])
                  for i in payload.images]
    except (binascii.Error, ValueError):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Bad image data")
    outcome = await handle_inbound(
        session,
        Inbound(
            sender=payload.sender,
            text=payload.text[:2000],
            channel=payload.channel,
            attachment_count=max(payload.attachment_count, len(photos)),
            images=photos,
            images_held=payload.images_held,
            images_withheld=payload.images_withheld,
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
        elif isinstance(item, BotAudio):
            audio = BotAudioOut(base64.b64encode(item.data).decode(), item.name, item.mime_type)
            if replies and replies[-1].audio is None:
                replies[-1].audio = audio
            else:
                replies.append(BotReply(audio=audio))
        else:
            replies.append(BotReply(text=item))
    return BotInboundResult(
        replies=replies,
        session_active=outcome.client_id is not None,
        hold_images=outcome.hold_images,
    )
