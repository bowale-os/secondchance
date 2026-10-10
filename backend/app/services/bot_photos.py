"""Photos over text: simplify or translate a document, then optionally SAVE it.

Images live in the sidecar, not here. The backend asks the sidecar to hold them
(`Outcome.hold_images`) while waiting for the client's choice (1 / 2) or a SAVE, and
the sidecar re-sends them once with the next message (`Inbound.images_held`). Nothing is
written to the database unless the client replies SAVE.

BotSession.pending_attachment_ref tracks what we're waiting for:
  "photo_mode"  asked "Reply 1 to simplify or 2 to translate"
  "photo_save"  sent a reading; offered SAVE (reading kept in last_results briefly)
"""

import re
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import photo_reader
from app.services.photo_reader import Photo, PhotoError, PhotoReading
from app.tables import BotSession, Client, DataSource, Document, DocumentStatus, DocumentType

ASK_MODE = "Got it. Reply 1 to explain it in plain words, or 2 to translate it."
PHOTO_GONE = "I don't have your photo anymore. Please send it again."
NOT_AVAILABLE = "I can't read photos right now. Please show it to your case worker."
UNREADABLE = "I couldn't read that. Try again in good light, with the whole page in the photo."
UNSUPPORTED = "I can only read photos (JPG, PNG, HEIC) or PDFs under 10 MB."
SAVED = "Saved to your documents. Your case worker will look it over."
LEGAL_NOTE = "This looks like a legal or court paper. Check with your case worker before you act on it."
MAX_REPLY = 1500

_SIMPLIFY = re.compile(r"^\s*(1|simplify|explain|plain|what does (this|it) (say|mean)\??)\s*[.!?]?\s*$", re.I)
_TRANSLATE = re.compile(r"^\s*(?:2|translate|translation)(?:\s+(?:it\s+)?(?:to|into|in)?\s*([a-z]{2,20}))?\s*[.!?]?\s*$", re.I)


def parse_mode(text: str) -> Optional[tuple[str, Optional[str]]]:
    """'1' -> ('simplify', None); '2 spanish' / 'translate to vietnamese' -> ('translate', 'spanish')."""
    if _SIMPLIFY.match(text or ""):
        return ("simplify", None)
    m = _TRANSLATE.match(text or "")
    if m:
        return ("translate", m.group(1))
    return None


def _clip(s: str, n: int) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def render(r: PhotoReading, mode: str) -> str:
    if not r.readable:
        return UNREADABLE
    lines = []
    if r.document_kind:
        lines.append(f"This looks like a {r.document_kind.strip().rstrip('.')}.")
    body = r.translation if mode == "translate" and r.translation else r.summary
    if body:
        lines.append(_clip(body, 1000 if mode == "translate" else 600))
    if r.key_dates:
        lines.append("Key dates:")
        lines += [f"- {d.date}: {_clip(d.what, 100)}" for d in r.key_dates[:6]]
    if r.next_steps:
        lines.append("What to do:")
        lines += [f"- {_clip(s, 120)}" for s in r.next_steps[:3]]
    if r.legal_or_court:
        lines.append(LEGAL_NOTE)
    lines.append("Reply SAVE to keep a copy in your documents.")
    text = "\n".join(lines)
    return text if len(text) <= MAX_REPLY else text[: MAX_REPLY - 1] + "…"


async def process(
    client: Client, s: BotSession, photos: list[Photo], mode: str, language: Optional[str]
) -> tuple[str, bool, str]:
    """(reply, hold_images, audit_outcome)."""
    target = photo_reader.language_name(language or client.language)
    try:
        reading = await photo_reader.read_photos(photos, mode, target)
    except PhotoError as exc:
        s.pending_attachment_ref = None
        reason = str(exc)
        reply = {"unsupported": UNSUPPORTED, "unreadable_image": UNREADABLE}.get(reason, NOT_AVAILABLE)
        return reply, False, reason
    if not reading.readable:
        s.pending_attachment_ref = None
        return UNREADABLE, False, "unreadable"
    s.pending_attachment_ref = "photo_save"
    s.last_results = {
        "kind": "photo",
        "summary": _clip(reading.summary, 1000),
        "dates": [f"{d.date}: {d.what}" for d in reading.key_dates[:10]],
        "legal": reading.legal_or_court,
    }
    return render(reading, mode), True, "ok"


async def save(db: AsyncSession, client: Client, s: BotSession, photos: list[Photo], now: datetime) -> str:
    reading = s.last_results if (s.last_results or {}).get("kind") == "photo" else {}
    usable = photo_reader.check_photos(photos)
    for n, p in enumerate(usable, 1):
        ext = "pdf" if p.mime_type == "application/pdf" else p.mime_type.split("/")[-1].replace("jpeg", "jpg")
        db.add(Document(
            client_id=client.id,
            source=DataSource.CLIENT,
            doc_type=DocumentType.OTHER,
            status=DocumentStatus.READ,  # waiting for case-worker review
            content=p.data,
            original_filename=f"texted-{now:%Y-%m-%d}-{n}.{ext}",
            mime_type=p.mime_type,
            size_bytes=len(p.data),
            ai_summary=reading.get("summary") or None,
            ai_warnings=reading.get("dates") or None,
            processed_at=now,
        ))
    s.pending_attachment_ref = None
    s.last_results = None
    return SAVED
