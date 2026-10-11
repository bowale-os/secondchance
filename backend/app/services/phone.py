"""Phone numbers for the text bot: normalize to E.164, encrypt at rest, and look up
by a keyed hash so the plaintext number never needs to be indexed.

Both keys derive from DATA_ENCRYPTION_KEY. Rotating that key means re-encrypting
and re-hashing bot_enrollments (or re-enrolling clients)."""

import base64
import hashlib
import hmac
import re
from functools import lru_cache

from cryptography.fernet import Fernet

from app.config import get_settings


class InvalidPhone(ValueError):
    pass


def normalize_phone(raw: str, default_country: str = "1") -> str:
    """'(404) 555-0100' -> '+14045550100'. US numbers may omit the country code."""
    raw = raw.strip()
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        e164 = "+" + digits
    elif len(digits) == 10:
        e164 = f"+{default_country}{digits}"
    elif len(digits) == 11 and digits.startswith("1"):
        e164 = "+" + digits
    else:
        raise InvalidPhone("Enter a 10-digit US number or a full +country number")
    if not re.fullmatch(r"\+[1-9]\d{7,14}", e164):
        raise InvalidPhone("Not a valid phone number")
    return e164


def _derive(purpose: bytes) -> bytes:
    key = get_settings().data_encryption_key.get_secret_value().encode()
    return hmac.new(key, purpose, hashlib.sha256).digest()


@lru_cache
def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_derive(b"bot-phone-encryption")))


def encrypt_phone(e164: str) -> str:
    return _fernet().encrypt(e164.encode()).decode()


def decrypt_phone(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def phone_lookup_hash(e164: str) -> str:
    return hmac.new(_derive(b"bot-phone-lookup"), e164.encode(), hashlib.sha256).hexdigest()
