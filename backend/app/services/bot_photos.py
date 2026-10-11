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

from app.services import photo_reader, voice
from app.services.bot_keywords import strip_accents
from app.services.bot_messages import EN, EN_STRINGS, Strings
from app.services.photo_reader import Photo, PhotoError, PhotoReading
from app.tables import BotSession, Client, DataSource, Document, DocumentStatus, DocumentType

# English strings under their old names (tests and callers); text comes from bot_messages.
ASK_MODE = EN["PH_ASK_MODE"]
PHOTO_GONE = EN["PH_GONE"]
NOT_AVAILABLE = EN["PH_NOT_AVAILABLE"]
UNREADABLE = EN["PH_UNREADABLE"]
UNSUPPORTED = EN["PH_UNSUPPORTED"]
SAVED = EN["PH_SAVED"]
LEGAL_NOTE = EN["PH_LEGAL"]
MAX_REPLY = 1500

_SIMPLIFY = re.compile(
    r"^\s*(1|simplify|explain|plain|what does (this|it) (say|mean)\??|"
    r"simplificar|explicar|explicame|explicalo|que dice\??|que significa\??)\s*[.!?]?\s*$", re.I)
_TRANSLATE = re.compile(
    r"^\s*(?:2|translate|translation|traducir|traduce|traducelo|traduccion)"
    r"(?:\s+(?:it\s+)?(?:to|into|in|al|a|en)?\s*([a-z]{2,20}))?\s*[.!?]?\s*$", re.I)

# Language names a Spanish speaker might type -> the English name sent to the model.
_ES_LANGUAGE_NAMES = {
    "ingles": "English", "espanol": "Spanish", "castellano": "Spanish", "frances": "French",
    "portugues": "Portuguese", "chino": "Chinese", "mandarin": "Chinese", "vietnamita": "Vietnamese",
    "arabe": "Arabic", "coreano": "Korean", "criollo": "Haitian Creole", "haitiano": "Haitian Creole",
    "ruso": "Russian", "aleman": "German", "italiano": "Italian", "tagalo": "Tagalog",
}


_VOICE = re.compile(
    r"^\s*(voice|voice (message|note|summary)|audio|read (it|that|this) (to me|out loud|aloud)|read (it )?aloud|"
    r"read to me|say it|"
    r"voz|nota de voz|mensaje de voz|audio|leelo|leemelo|leeme|lee en voz alta|dilo)\s*[.!?]?\s*$", re.I)


def is_voice_request(text: str) -> bool:
    return bool(_VOICE.match(strip_accents(text or "").replace("¿", "").replace("¡", "")))


def parse_mode(text: str) -> Optional[tuple[str, Optional[str]]]:
    """'1' -> ('simplify', None); '2 spanish' / 'translate to vietnamese' -> ('translate', 'spanish');
    'traducir al inglés' -> ('translate', 'English')."""
    plain = strip_accents(text or "").replace("¿", "").replace("¡", "")
    if _SIMPLIFY.match(plain):
        return ("simplify", None)
    m = _TRANSLATE.match(plain)
    if m:
        lang = m.group(1)
        return ("translate", _ES_LANGUAGE_NAMES.get(lang.lower(), lang) if lang else None)
    return None


def _clip(s: str, n: int) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def render(r: PhotoReading, mode: str, L: Strings = EN_STRINGS) -> str:
    if not r.readable:
        return L.PH_UNREADABLE
    lines = []
    if r.document_kind:
        lines.append(L.get("PH_LOOKS_LIKE", kind=r.document_kind.strip().rstrip(".")))
    body = r.translation if mode == "translate" and r.translation else r.summary
    if body:
        lines.append(_clip(body, 1000 if mode == "translate" else 600))
    if r.key_dates:
        lines.append(L.PH_KEY_DATES)
        lines += [f"- {d.date}: {_clip(d.what, 100)}" for d in r.key_dates[:6]]
    if r.next_steps:
        lines.append(L.PH_TODO)
        lines += [f"- {_clip(s, 120)}" for s in r.next_steps[:3]]
    if r.legal_or_court:
        lines.append(L.PH_LEGAL)
    lines.append(L.PH_SAVE_OFFER)
    text = "\n".join(lines)
    return text if len(text) <= MAX_REPLY else text[: MAX_REPLY - 1] + "…"


def spoken(r: PhotoReading, mode: str, L: Strings = EN_STRINGS) -> str:
    """The reading as speech: no list dashes, no SAVE prompt, short enough for a voice note."""
    parts = []
    body = r.translation if mode == "translate" and r.translation else r.summary
    if body:
        parts.append(_clip(body, 500))
    if r.key_dates:
        parts.append(L.PH_KEY_DATES + " " + "; ".join(f"{d.date}, {_clip(d.what, 80)}" for d in r.key_dates[:4]) + ".")
    if r.next_steps:
        parts.append(L.PH_TODO + " " + " ".join(_clip(x, 100).rstrip(".") + "." for x in r.next_steps[:3]))
    if r.legal_or_court:
        parts.append(L.PH_LEGAL)
    return " ".join(parts)


async def process(
    client: Client, s: BotSession, photos: list[Photo], mode: str, language: Optional[str],
    L: Strings = EN_STRINGS,
) -> tuple[list, bool, str]:
    """(replies, hold_images, audit_outcome). Replies are text, then a voice version if available."""
    target = photo_reader.language_name(language or client.language)
    try:
        reading = await photo_reader.read_photos(photos, mode, target)
    except PhotoError as exc:
        s.pending_attachment_ref = None
        reason = str(exc)
        reply = {"unsupported": L.PH_UNSUPPORTED, "unreadable_image": L.PH_UNREADABLE}.get(reason, L.PH_NOT_AVAILABLE)
        return [reply], False, reason
    if not reading.readable:
        s.pending_attachment_ref = None
        return [L.PH_UNREADABLE], False, "unreadable"
    s.pending_attachment_ref = "photo_save"
    s.last_results = {
        "kind": "photo",
        "summary": _clip(reading.summary, 1000),
        "dates": [f"{d.date}: {d.what}" for d in reading.key_dates[:10]],
        "legal": reading.legal_or_court,
        "spoken": spoken(reading, mode, L),
        "spoken_lang": target,
    }
    replies: list = [render(reading, mode, L)]
    audio = await voice.synthesize(spoken(reading, mode, L), target)
    if audio:
        replies.append(audio)
    return replies, True, "ok"


async def voice_again(s: BotSession, L: Strings = EN_STRINGS) -> list:
    """Voice version of the last photo summary (VOICE / 'read it to me'), or an apology."""
    r = s.last_results or {}
    audio = await voice.synthesize(r.get("spoken") or "", r.get("spoken_lang") or "English")
    return [audio] if audio else [L.PH_VOICE_UNAVAILABLE]


async def save(
    db: AsyncSession, client: Client, s: BotSession, photos: list[Photo], now: datetime, L: Strings = EN_STRINGS
) -> str:
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
    return L.PH_SAVED
