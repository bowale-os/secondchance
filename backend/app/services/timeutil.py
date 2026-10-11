from datetime import datetime, timezone
from functools import lru_cache
from typing import Optional
from zoneinfo import ZoneInfo

from app.config import get_settings


def aware(dt: Optional[datetime]) -> Optional[datetime]:
    """SQLite (tests) drops tzinfo; Postgres keeps it. Treat naive values as UTC."""
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


@lru_cache
def local_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().local_timezone)
