"""Photos over text: read a document with the portal's reader, then optionally SAVE it.

Images live in the sidecar, not here. After a reading, the backend asks the sidecar to
hold the photos (`Outcome.hold_images`) in case the client replies SAVE, and the sidecar
re-sends them once with the next message (`Inbound.images_held`). Nothing is written to
the database unless the client replies SAVE, and SAVE goes through the same signed-receipt
keep path as the web portal (the held photos must match the ones that were read).

BotSession.pending_attachment_ref is "photo_save" while a SAVE is on offer; the receipt
is kept in last_results until then.
"""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.reader import receipt as receipts
from app.reader.dates import short_date
from app.reader.schemas import LEGAL_DOC_TYPES, ActionItem
from app.reader.store import save_kept
from app.services import photo_reader
from app.services.bot_messages import EN, EN_STRINGS, Strings
from app.services.photo_reader import Photo, PhotoError, PhotoReading
from app.tables import BotSession, Client

# English strings under their old names (tests and callers); text comes from bot_messages.
PHOTO_GONE = EN["PH_GONE"]
NOT_AVAILABLE = EN["PH_NOT_AVAILABLE"]
UNREADABLE = EN["PH_UNREADABLE"]
UNSUPPORTED = EN["PH_UNSUPPORTED"]
SAVED = EN["PH_SAVED"]
LEGAL_NOTE = EN["PH_LEGAL"]
MAX_REPLY = 1500
MAX_TODOS = 3
MAX_CHECKS = 2


def _clip(s: str, n: int) -> str:
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0] + "…"


def _due(a: ActionItem, lang: str) -> str:
    """'Oct 12', the paper's own wording, or what's missing (e.g. the release date)."""
    if a.due.resolved_date:
        return short_date(a.due.resolved_date, "es" if lang == "es" else "en")
    if a.due.type == "relative" and a.due.explanation:
        return a.due.explanation
    return a.due.text or ""


def render(r: PhotoReading, L: Strings = EN_STRINGS) -> str:
    """A short text: the paper, up to 3 to-dos with dates, double-check notes, the SAVE offer.
    The full simple version is in the portal once the paper is kept."""
    res = r.result
    lines = [L.get("PH_TITLE", title=res.meta.title.strip().rstrip("."))]
    open_todos = [a for a in res.actions if not a.completed]
    if open_todos:
        lines.append(L.PH_TODO)
        for a in open_todos[:MAX_TODOS]:
            due = _due(a, L.lang)
            lines.append(f"- {_clip(a.title, 100)}" + (f" ({_clip(due, 90)})" if due else ""))
        if len(open_todos) > MAX_TODOS:
            lines.append(L.get("PH_MORE", n=len(open_todos) - MAX_TODOS))
    else:
        lines.append(L.PH_NOTHING_TO_DO)
    checks = list(dict.fromkeys(f.detail for f in res.flags))[:MAX_CHECKS]
    if checks:
        lines.append(L.PH_CHECK)
        lines += [f"- {_clip(c, 160)}" for c in checks]
    if res.meta.doc_type in LEGAL_DOC_TYPES:
        lines.append(L.PH_LEGAL)
    lines.append(L.PH_SAVE_OFFER)
    text = "\n".join(lines)
    return text if len(text) <= MAX_REPLY else text[: MAX_REPLY - 1] + "…"


async def process(
    client: Client, s: BotSession, photos: list[Photo], now: datetime, L: Strings = EN_STRINGS,
) -> tuple[str, bool, str]:
    """(reply, hold_images, audit_outcome)."""
    try:
        reading = await photo_reader.read_photos(photos, client, now)
    except PhotoError as exc:
        s.pending_attachment_ref = None
        reason = str(exc)
        reply = {"unsupported": L.PH_UNSUPPORTED, "unreadable_image": L.PH_UNREADABLE}.get(reason, L.PH_NOT_AVAILABLE)
        return reply, False, reason
    s.pending_attachment_ref = "photo_save"
    s.last_results = {"kind": "photo", "receipt": reading.receipt}
    return render(reading, L), True, "ok"


async def save(
    db: AsyncSession, client: Client, s: BotSession, photos: list[Photo], now: datetime, L: Strings = EN_STRINGS
) -> tuple[str, str]:
    """(reply, audit_outcome). Saves through the portal's keep path."""
    token = (s.last_results or {}).get("receipt") if (s.last_results or {}).get("kind") == "photo" else None
    s.pending_attachment_ref = None
    s.last_results = None
    if not token:
        return L.PH_GONE, "no_receipt"
    try:
        files = photo_reader.uploads(photos)
        body = receipts.check(token, client_id=str(client.id), files=[f.data for f in files])
    except (PhotoError, receipts.ReceiptError):
        return L.PH_GONE, "receipt_rejected"   # expired, or not the same photos
    await save_kept(db, body, files, client, None, now)
    return L.PH_SAVED, "saved"
