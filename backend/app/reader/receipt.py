"""Signed receipts for opt-in saving.

/reader/process stores nothing. Its last event carries a receipt: the full result, a
SHA-256 of each uploaded file, the client, the language and an expiry, signed with
READER_RECEIPT_SECRET. If the client chooses Keep, the browser sends the same files and
the receipt to /reader/keep, which checks it and saves without calling the AI again.
Because it is signed, nobody can edit the to-dos a case worker will later see.
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt

from app.config import get_settings
from app.reader.ai import UserFacingError
from app.reader.dates import to_raw
from app.reader.schemas import CamelModel, DocumentMeta, Flag, RawAction, SimplifiedDocument

RECEIPT_TTL = timedelta(minutes=30)
AUDIENCE = "reader-keep"
ALGORITHM = "HS256"
READER_VERSION = "claude-2026-10"


class ReceiptAction(CamelModel):
    raw: RawAction
    flags: list[Flag]   # this to-do's flags, without actionId


class ReceiptBody(CamelModel):
    client_id: str
    language: str
    received_date: str
    file_hashes: list[str]
    meta: DocumentMeta
    simplified: SimplifiedDocument
    actions: list[ReceiptAction]
    flags: list[Flag]   # flags not tied to one to-do
    reader_version: str = READER_VERSION


class ReceiptError(UserFacingError):
    pass


def file_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _secret() -> str:
    secret = get_settings().reader_receipt_secret.get_secret_value()
    if not secret:
        raise RuntimeError("READER_RECEIPT_SECRET is not set")
    return secret


def receipt_body(result, *, client_id: str, language: str, received_date: str, files: list[bytes]) -> ReceiptBody:
    """`result` is a pipeline ProcessResult."""
    by_action: dict[str, list[Flag]] = {a.id: [] for a in result.actions}
    loose: list[Flag] = []
    for f in result.flags:
        if f.action_id in by_action:
            by_action[f.action_id].append(f.model_copy(update={"action_id": None}))
        else:
            loose.append(f)
    return ReceiptBody(
        client_id=client_id,
        language=language,
        received_date=received_date,
        file_hashes=[file_hash(b) for b in files],
        meta=result.meta,
        simplified=result.simplified,
        actions=[ReceiptAction(raw=to_raw(a), flags=by_action[a.id]) for a in result.actions],
        flags=loose,
    )


def sign(body: ReceiptBody, now: Optional[datetime] = None) -> str:
    now = now or datetime.now(timezone.utc)
    claims = {"aud": AUDIENCE, "iat": now, "exp": now + RECEIPT_TTL,
              # Nulls kept: the raw to-dos need every field.
              "body": body.model_dump(mode="json", by_alias=True)}
    return jwt.encode(claims, _secret(), algorithm=ALGORITHM)


def check(token: str, *, client_id: str, files: list[bytes]) -> ReceiptBody:
    """Signature, expiry, client and file hashes must all match, or nothing is saved."""
    try:
        claims = jwt.decode(token, _secret(), algorithms=[ALGORITHM], audience=AUDIENCE)
    except jwt.ExpiredSignatureError:
        raise ReceiptError("This reading has expired. Please read the paper again to keep it.") from None
    except jwt.PyJWTError:
        raise ReceiptError("We couldn't save this paper. Please read it again.") from None
    body = ReceiptBody.model_validate(claims["body"])
    if body.client_id != client_id:
        raise ReceiptError("We couldn't save this paper. Please read it again.")
    if body.file_hashes != [file_hash(b) for b in files]:
        raise ReceiptError("These aren't the same pages that were read. Please read the paper again.")
    return body
