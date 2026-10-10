"""Delete abandoned uploads: documents never attached to a client.

Run from cron / a platform scheduler:
    python -m app.jobs.cleanup_documents [--hours N] [--dry-run]
"""

import argparse
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import SessionLocal, engine
from app.tables import Document

logger = logging.getLogger(__name__)


async def delete_abandoned_documents(session: AsyncSession, hours: int, dry_run: bool = False) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    abandoned = (Document.client_id.is_(None), Document.created_at < cutoff)
    if dry_run:
        return await session.scalar(select(func.count()).select_from(Document).where(*abandoned)) or 0
    result = await session.execute(delete(Document).where(*abandoned))
    await session.commit()
    return result.rowcount


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--hours", type=int, default=get_settings().abandoned_upload_hours)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    try:
        async with SessionLocal() as session:
            count = await delete_abandoned_documents(session, args.hours, args.dry_run)
        print(f"{'Would delete' if args.dry_run else 'Deleted'} {count} abandoned document(s) older than {args.hours}h")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
