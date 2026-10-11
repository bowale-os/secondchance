"""Read photos of documents a client texts in: simplify or translate them.

Same Gemini pattern as extraction.py (downscale, structured JSON, retries on load
spikes). Images are processed in memory and never stored unless the client replies
SAVE. The model only reads the document; it gets no client data.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal, Optional

from google.genai import errors, types
from pydantic import BaseModel, Field

from app.config import get_settings
from app.extraction import ALLOWED_MIME, MAX_FILE_BYTES, ExtractionError, downscale, get_client

logger = logging.getLogger(__name__)

MAX_PHOTOS = 5
LANGUAGE_NAMES = {"en": "English", "es": "Spanish"}

Mode = Literal["simplify", "translate"]


class KeyDate(BaseModel):
    date: str = Field(description="As written or as a plain date, e.g. 'Nov 3, 2026'")
    what: str = Field(description="What happens or is due, short")


class PhotoReading(BaseModel):
    readable: bool = Field(description="False if the photo isn't a readable document")
    document_kind: Optional[str] = Field(None, description="e.g. 'court notice', 'benefits letter'")
    legal_or_court: bool = Field(False, description="Court, probation/parole, legal or police paper")
    summary: str = Field("", description="Plain-language summary, target language, under 600 characters")
    translation: Optional[str] = Field(None, description="Translate mode: the document's main text in the target language, under 1200 characters")
    key_dates: list[KeyDate] = []
    next_steps: list[str] = Field([], description="Up to 3 short actions, target language")


PROMPT = """You help people just released from prison read letters and forms.
You get one or more photos of the pages of ONE document.

Write for someone who reads at about a 5th-grade level: short sentences, common words,
no legal jargon. Write everything in the TARGET LANGUAGE given in the request.

- summary: what this document is and what it means for the reader, in plain words.
- translation (translate mode only): the main text of the document translated into the
  target language, simplified where needed, under 1200 characters. Leave null in simplify mode.
- key_dates: every deadline, hearing, appointment or due date, with what it is for.
  Copy dates exactly; never guess a date that isn't written.
- next_steps: up to 3 concrete things the reader should do.
- legal_or_court: true for court, probation, parole, police or legal papers.
- readable: false if the photos aren't a document or can't be read; then leave the rest empty.

Never invent facts that aren't on the page. Never give legal advice beyond what the
document itself says. Output only the JSON."""

CONFIG = types.GenerateContentConfig(
    system_instruction=PROMPT,
    response_mime_type="application/json",
    response_schema=PhotoReading,
    temperature=0,
    thinking_config=types.ThinkingConfig(thinking_budget=0),
)


@dataclass
class Photo:
    data: bytes
    mime_type: str
    name: str = "photo.jpg"


class PhotoError(Exception):
    pass


def configured() -> bool:
    s = get_settings()
    return bool(s.gemini_api_key.get_secret_value() and s.gemini_model)


def language_name(code_or_name: Optional[str]) -> str:
    if not code_or_name:
        return "English"
    return LANGUAGE_NAMES.get(code_or_name.lower(), code_or_name.strip().title())


def check_photos(photos: list[Photo]) -> list[Photo]:
    """Drop what Gemini can't read; raise if nothing usable is left."""
    ok = [p for p in photos[:MAX_PHOTOS] if p.mime_type in ALLOWED_MIME and len(p.data) <= MAX_FILE_BYTES]
    if not ok:
        raise PhotoError("unsupported")
    return ok


async def read_photos(photos: list[Photo], mode: Mode, target_language: str) -> PhotoReading:
    if not configured():
        raise PhotoError("not_configured")
    parts: list = [f"MODE: {mode}. TARGET LANGUAGE: {target_language}. {len(photos)} page(s):"]
    for p in check_photos(photos):
        try:
            data, mime = await asyncio.to_thread(downscale, p.data, p.mime_type)
        except ExtractionError as exc:
            raise PhotoError("unreadable_image") from exc
        parts.append(types.Part.from_bytes(data=data, mime_type=mime))
    for attempt in range(3):
        try:
            resp = await asyncio.wait_for(
                get_client().aio.models.generate_content(
                    model=get_settings().gemini_model, contents=parts, config=CONFIG
                ),
                timeout=45,
            )
            break
        except errors.APIError as exc:
            if exc.code in (429, 500, 503) and attempt < 2:
                await asyncio.sleep(2 * 2**attempt)
                continue
            logger.warning("Photo read failed: Gemini %s", exc.code)
            raise PhotoError("model_error") from exc
        except asyncio.TimeoutError as exc:
            raise PhotoError("timeout") from exc
    reading = resp.parsed
    if not isinstance(reading, PhotoReading):
        raise PhotoError("bad_response")
    return reading
