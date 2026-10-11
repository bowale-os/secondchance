"""Read photos of documents a client texts in, with the same reader as the web portal.

The pages go through app.reader's pipeline (Claude): a plain-language version and a to-do
list with real dates, in the client's language. Nothing is stored here. The result comes
back with a signed receipt, so a SAVE goes through the same keep path as the portal.
"""

import asyncio
import logging
import os
from dataclasses import dataclass
from datetime import datetime

from app.config import get_settings
from app.reader import receipt
from app.reader.ai import get_ai_client
from app.reader.messages import UserFacingError
from app.reader.pipeline import ProcessInput, ProcessResult, process_document
from app.reader.preprocess import ACCEPTED_MIME_TYPES, UploadFile
from app.services.timeutil import local_tz
from app.tables import Client

logger = logging.getLogger(__name__)

MAX_PHOTOS = 5
MAX_FILE_BYTES = 10 * 1024 * 1024
# The sidecar gives up on a photo reply after 75 s; answer before that.
TIMEOUT_S = 60

# Reader error keys -> the bot's reasons (which pick the reply text).
_REASONS = {
    "bad_type": "unsupported", "too_big": "unsupported", "word_alone": "unsupported",
    "bad_image": "unreadable_image", "bad_pdf": "unreadable_image", "bad_word": "unreadable_image",
    "empty": "unreadable_image", "refused": "refused",
}


@dataclass
class Photo:
    data: bytes
    mime_type: str
    name: str = "photo.jpg"


@dataclass
class PhotoReading:
    result: ProcessResult
    receipt: str   # signed; SAVE hands it back to receipt.check
    language: str


class PhotoError(Exception):
    pass


def configured() -> bool:
    s = get_settings()
    return s.reader_ai == "fake" or bool(s.anthropic_api_key.get_secret_value() or os.environ.get("ANTHROPIC_API_KEY"))


def check_photos(photos: list[Photo]) -> list[Photo]:
    """Drop what the reader can't take; raise if nothing usable is left."""
    ok = [p for p in photos[:MAX_PHOTOS] if p.mime_type in ACCEPTED_MIME_TYPES and len(p.data) <= MAX_FILE_BYTES]
    if not ok:
        raise PhotoError("unsupported")
    return ok


def uploads(photos: list[Photo]) -> list[UploadFile]:
    return [UploadFile(name=p.name, mime_type=p.mime_type, data=p.data) for p in check_photos(photos)]


async def read_photos(photos: list[Photo], client: Client, now: datetime) -> PhotoReading:
    if not configured():
        raise PhotoError("not_configured")
    files = uploads(photos)
    language = client.language or "en"
    today = now.astimezone(local_tz()).date().isoformat()
    inp = ProcessInput(
        files=files, language=language, today=today,
        release_date=client.release_date.isoformat() if client.release_date else None,
        received_date=today,
    )
    try:
        result = await asyncio.wait_for(process_document(get_ai_client(), inp, lambda _e: None), TIMEOUT_S)
    except UserFacingError as exc:
        raise PhotoError(_REASONS.get(exc.key, "model_error")) from None
    except asyncio.TimeoutError:
        raise PhotoError("timeout") from None
    except Exception as exc:
        # The type only: messages from validation errors can quote document text.
        logger.warning("Photo read failed (%s)", type(exc).__name__)
        raise PhotoError("model_error") from None
    body = receipt.receipt_body(
        result, client_id=str(client.id), language=language, received_date=today, files=[f.data for f in files],
    )
    return PhotoReading(result=result, receipt=receipt.sign(body), language=language)
