"""PIN hashing. A 4-digit PIN is trivially brute-forced if the hash leaks, so the
PIN is first HMAC'd with a server-side pepper (config.pin_pepper, kept out of the
database) and then hashed with argon2."""

import asyncio
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.config import get_settings

_hasher = PasswordHasher()


def _peppered(pin: str) -> str:
    key = get_settings().pin_pepper.get_secret_value().encode()
    return hmac.new(key, pin.encode(), hashlib.sha256).hexdigest()


def hash_pin(pin: str) -> str:
    return _hasher.hash(_peppered(pin))


def verify_pin(pin: str, pin_hash: str) -> bool:
    try:
        return _hasher.verify(pin_hash, _peppered(pin))
    except (VerificationError, InvalidHashError):
        return False


async def hash_pin_async(pin: str) -> str:
    """argon2 is deliberately slow; keep it off the event loop."""
    return await asyncio.to_thread(hash_pin, pin)


async def verify_pin_async(pin: str, pin_hash: str) -> bool:
    return await asyncio.to_thread(verify_pin, pin, pin_hash)


# ---------- client session tokens ----------

CLIENT_TOKEN_ROLE = "client"


def create_client_token(client_id: uuid.UUID) -> tuple[str, int]:
    """Signed token for a client who passed name + PIN. Returns (token, expires_in seconds)."""
    s = get_settings()
    expires_in = s.session_timeout_minutes * 60
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "sub": str(client_id),
            "role": CLIENT_TOKEN_ROLE,
            "iat": now,
            "exp": now + timedelta(seconds=expires_in),
        },
        s.session_secret.get_secret_value(),
        algorithm="HS256",
    )
    return token, expires_in


def decode_client_token(token: str) -> uuid.UUID:
    """Client id from a valid client token; raises jwt.PyJWTError otherwise."""
    claims = jwt.decode(
        token,
        get_settings().session_secret.get_secret_value(),
        algorithms=["HS256"],
        options={"require": ["exp", "sub"]},
    )
    if claims.get("role") != CLIENT_TOKEN_ROLE:
        raise jwt.InvalidTokenError("not a client token")
    return uuid.UUID(claims["sub"])
