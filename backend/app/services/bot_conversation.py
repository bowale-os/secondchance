"""The text bot's sign-in state machine. One call per inbound message; returns the
replies for the sidecar to send. Nothing about a client is released until the sender
has matched the enrolled number, the client's name, and the client's PIN.

Order of checks for each message:
  1. Crisis exception  (anyone, no sign-in, no client data)
  2. Enrollment lookup (unknown numbers get one generic reply)
  3. STOP / START / HELP
  4. Lock check
  5. Session expiry
  6. awaiting_name -> awaiting_pin -> active
"""

import hmac
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.security import hash_pin, verify_pin_async
from app.services import bot_messages as msg
from app.services.bot_keywords import (
    HELP_WORDS,
    MENU_WORDS,
    SIGN_OUT_WORDS,
    START_WORDS,
    STOP_WORDS,
    is_crisis,
    keyword,
)
from app.services.phone import InvalidPhone, normalize_phone, phone_lookup_hash
from app.tables import (
    BotAuditLog,
    BotChannel,
    BotEnrollment,
    BotEnrollmentStatus,
    BotSession,
    BotSessionState,
    Client,
)


@dataclass
class Inbound:
    sender: str                      # phone number from Spectrum
    text: str = ""
    channel: Optional[str] = None    # imessage | rcs | sms | whatsapp | ...
    attachment_count: int = 0


@dataclass
class Outcome:
    replies: list[str] = field(default_factory=list)
    # Only set once the sender is signed in; later phases use it to call
    # client-scoped services. Never sent back to the sidecar.
    client_id: Optional[str] = None


# ---------- helpers ----------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite (tests) drops tzinfo; Postgres keeps it."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _normalize_name(name: str) -> str:
    name = unicodedata.normalize("NFKD", name)
    name = "".join(ch for ch in name if not unicodedata.combining(ch))
    name = re.sub(r"[^a-z ]", " ", name.lower())
    return " ".join(name.split())


def name_matches(typed: str, client: Client) -> bool:
    """Accepts 'First Last', 'Preferred Last', or 'Last, First' (case, accents,
    punctuation and extra spaces ignored)."""
    typed_n = _normalize_name(typed)
    first, last = _normalize_name(client.first_name), _normalize_name(client.last_name)
    accepted = {f"{first} {last}", f"{last} {first}"}
    if client.preferred_name:
        preferred = _normalize_name(client.preferred_name)
        accepted |= {f"{preferred} {last}", f"{last} {preferred}"}
    matched = False
    for candidate in accepted:  # compare against every candidate; no early exit
        matched |= hmac.compare_digest(typed_n.encode(), candidate.encode())
    return matched


@lru_cache
def _dummy_hash() -> str:
    return hash_pin("0000")


def _channel(value: Optional[str]) -> Optional[BotChannel]:
    if not value:
        return None
    try:
        return BotChannel(value.lower())
    except ValueError:
        return BotChannel.OTHER


def _audit(db: AsyncSession, enrollment: Optional[BotEnrollment], intent: str, outcome: str) -> None:
    db.add(BotAuditLog(
        enrollment_id=enrollment.id if enrollment else None, intent=intent, outcome=outcome
    ))


def _session_expired(s: BotSession, now: datetime) -> bool:
    settings = get_settings()
    last = _aware(s.last_activity_at) or _aware(s.authenticated_at)
    started = _aware(s.authenticated_at)
    if last is None or started is None:
        return True
    return (
        now - last > timedelta(minutes=settings.bot_idle_minutes)
        or now - started > timedelta(hours=settings.bot_session_max_hours)
    )


def _reset_to_name(s: BotSession) -> None:
    s.state = BotSessionState.AWAITING_NAME
    s.name_matched = False
    s.authenticated_at = None
    s.last_activity_at = None
    s.last_results = None


# ---------- entry point ----------

async def handle_inbound(db: AsyncSession, inbound: Inbound) -> Outcome:
    """Process one inbound message and commit. Caller owns the DB session."""
    out = await _handle(db, inbound)
    await db.commit()
    return out


async def _handle(db: AsyncSession, m: Inbound) -> Outcome:
    text = (m.text or "").strip()
    kw = keyword(text)
    now = _now()

    # 1. Crisis exception: before anything else, no sign-in, no client data.
    if text and is_crisis(text):
        enrollment = await _find_enrollment(db, m.sender)
        _audit(db, enrollment, "crisis", "hotlines_sent")
        return Outcome([msg.crisis_text()])

    # 2. Enrollment
    enrollment = await _find_enrollment(db, m.sender, lock=True)
    if enrollment is None:
        if kw in STOP_WORDS:
            return Outcome([])  # nothing to stop; stay silent
        _audit(db, None, "unenrolled", "help" if kw in HELP_WORDS else "generic_reply")
        return Outcome([msg.help_text() if kw in HELP_WORDS else msg.NOT_ENROLLED])

    if (ch := _channel(m.channel)) is not None:
        enrollment.channel = ch

    # 3. Compliance keywords
    if kw in STOP_WORDS:
        enrollment.status = BotEnrollmentStatus.STOPPED
        if enrollment.session and enrollment.session.state != BotSessionState.LOCKED:
            await db.delete(enrollment.session)
        _audit(db, enrollment, "keyword.stop", "stopped")
        return Outcome([msg.STOPPED])

    if enrollment.status == BotEnrollmentStatus.STOPPED:
        if kw in START_WORDS:
            if enrollment.session and enrollment.session.state == BotSessionState.LOCKED:
                enrollment.status = BotEnrollmentStatus.LOCKED  # STOP doesn't clear a lock
                return Outcome([msg.LOCKED])
            enrollment.status = BotEnrollmentStatus.ACTIVE
            s = await _get_or_create_session(db, enrollment)
            _reset_to_name(s)
            _audit(db, enrollment, "keyword.start", "resumed")
            return Outcome([msg.STARTED])
        if kw in HELP_WORDS:
            return Outcome([msg.help_text()])
        return Outcome([])  # opted out: send nothing

    if kw in HELP_WORDS:
        _audit(db, enrollment, "keyword.help", "sent")
        return Outcome([msg.help_text()])

    # 4. Lock
    if enrollment.status == BotEnrollmentStatus.LOCKED:
        _audit(db, enrollment, "auth", "locked")
        return Outcome([msg.LOCKED])

    client = await db.get(Client, enrollment.client_id)

    # 5./6. Session
    s = enrollment.session
    if s is None:
        s = await _get_or_create_session(db, enrollment)
        _audit(db, enrollment, "auth.start", "asked_name")
        return Outcome([msg.ASK_NAME])

    if s.state == BotSessionState.ACTIVE and _session_expired(s, now):
        _reset_to_name(s)
        _audit(db, enrollment, "auth.expired", "asked_name")
        return Outcome([msg.SESSION_ENDED])

    if s.state == BotSessionState.AWAITING_NAME:
        if not text:  # e.g. a photo with no caption
            return Outcome([msg.ASK_NAME])
        s.name_matched = name_matches(text, client)
        s.state = BotSessionState.AWAITING_PIN
        _audit(db, enrollment, "auth.name", "received")
        return Outcome([msg.ASK_PIN])

    if s.state == BotSessionState.AWAITING_PIN:
        if not text:
            return Outcome([msg.ASK_PIN])
        pin_ok = await verify_pin_async(text, client.pin_hash if s.name_matched else _dummy_hash())
        if s.name_matched and pin_ok:
            s.state = BotSessionState.ACTIVE
            s.failed_attempts = 0
            s.name_matched = False
            s.authenticated_at = now
            s.last_activity_at = now
            _audit(db, enrollment, "auth.pin", "success")
            return Outcome([msg.SIGNED_IN], client_id=str(client.id))

        s.failed_attempts += 1
        if s.failed_attempts >= get_settings().bot_max_failed_attempts:
            s.state = BotSessionState.LOCKED
            enrollment.status = BotEnrollmentStatus.LOCKED
            enrollment.locked_at = now
            _audit(db, enrollment, "auth.pin", "locked")
            return Outcome([msg.LOCKED])
        _reset_to_name(s)
        _audit(db, enrollment, "auth.pin", "failed")
        return Outcome([msg.BAD_LOGIN])

    if s.state == BotSessionState.LOCKED:  # enrollment unlocked but session not reset
        _reset_to_name(s)
        s.failed_attempts = 0
        return Outcome([msg.ASK_NAME])

    # ACTIVE
    s.last_activity_at = now
    if kw in SIGN_OUT_WORDS:
        await db.delete(s)
        _audit(db, enrollment, "auth.sign_out", "signed_out")
        return Outcome([msg.SIGNED_OUT])
    reply = await handle_active(db, client, s, text, kw, m)
    return Outcome(reply, client_id=str(client.id))


async def handle_active(
    db: AsyncSession, client: Client, s: BotSession, text: str, kw: str, m: Inbound
) -> list[str]:
    """Signed-in requests. Phase 1 only has the menu; later phases add the intent
    router (schedule, resources, maps, photos) here."""
    if kw in MENU_WORDS or (not text and not m.attachment_count):
        _audit(db, s.enrollment, "menu", "sent")
        return [msg.MENU]
    _audit(db, s.enrollment, "unknown", "not_available")
    return [msg.NOT_AVAILABLE_YET]


# ---------- lookups ----------

async def _find_enrollment(
    db: AsyncSession, sender: str, lock: bool = False
) -> Optional[BotEnrollment]:
    try:
        e164 = normalize_phone(sender)
    except InvalidPhone:
        return None  # e.g. an iMessage email handle; not supported for enrollment
    stmt = (
        select(BotEnrollment)
        .join(Client, Client.id == BotEnrollment.client_id)
        .where(
            BotEnrollment.phone_hash == phone_lookup_hash(e164),
            BotEnrollment.status != BotEnrollmentStatus.REVOKED,
            Client.is_active.is_(True),
        )
    )
    if lock:
        stmt = stmt.with_for_update(of=BotEnrollment)  # serialize bursts from one number
    enrollment = await db.scalar(stmt)
    if enrollment is not None:
        await db.refresh(enrollment, ["session"])
    return enrollment


async def _get_or_create_session(db: AsyncSession, enrollment: BotEnrollment) -> BotSession:
    if enrollment.session is None:
        enrollment.session = BotSession(
            state=BotSessionState.AWAITING_NAME, failed_attempts=0, name_matched=False
        )
        await db.flush()
    return enrollment.session
