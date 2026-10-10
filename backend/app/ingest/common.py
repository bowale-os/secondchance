"""Cleanup helpers shared by every resource source."""

import re
from typing import Any, Optional


class IngestError(Exception):
    """A source returned something unusable. The run fails and existing data is kept."""


def fix_text(s: str) -> str:
    """Undo UTF-8 text that was decoded as Latin-1 ("Campral Â®" -> "Campral ®")."""
    if "Â" in s or "Ã" in s:
        try:
            return s.encode("latin-1").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return s


def clean(value: Any, limit: Optional[int] = None) -> Optional[str]:
    """Trimmed single-spaced text, or None when empty."""
    if value is None:
        return None
    text = re.sub(r"\s+", " ", fix_text(str(value))).strip()
    if not text:
        return None
    return text[:limit] if limit else text


def split_list(value: Any) -> list[str]:
    """SAMHSA-style "a; b; c" lists."""
    return [p for p in (clean(x) for x in str(value or "").split(";")) if p]


def normalize_phone(raw: Any) -> Optional[str]:
    """US numbers to E.164 (+14045551234). Anything that is not a 10/11-digit number is dropped."""
    text = str(raw or "")
    text = re.split(r"(?i)\s*(?:x|ext\.?|extension)\s*\d+\s*$", text)[0]
    digits = re.sub(r"\D", "", text)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return f"+1{digits}" if len(digits) == 10 else None


def normalize_url(raw: Any, limit: int = 500) -> Optional[str]:
    text = clean(raw)
    if not text or " " in text:
        return None
    if not re.match(r"(?i)^https?://", text):
        text = f"https://{text}"
    return text if len(text) <= limit and "." in text else None


_STREET_WORDS = {
    "street": "st", "avenue": "ave", "boulevard": "blvd", "road": "rd", "drive": "dr", "parkway": "pkwy",
    "lane": "ln", "court": "ct", "place": "pl", "highway": "hwy", "circle": "cir", "terrace": "ter",
    "junior": "jr", "senior": "sr", "saint": "st", "suite": "", "ste": "", "unit": "", "apt": "",
}
_DIRECTIONS = {"n", "s", "e", "w", "ne", "nw", "se", "sw",
               "north", "south", "east", "west", "northeast", "northwest", "southeast", "southwest"}


def street_key(street: Optional[str]) -> str:
    """"275 Pryor Street Southwest" and "275 Pryor St" -> "275pryorst". Directions are dropped
    because sources disagree on them; the house number and street name still tell places apart."""
    words = re.sub(r"[^a-z0-9 ]", " ", (street or "").lower()).split()
    words = [_STREET_WORDS.get(w, w) for w in words]
    return "".join(w for w in words if w and w not in _DIRECTIONS)


def to_float(raw: Any) -> Optional[float]:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None
