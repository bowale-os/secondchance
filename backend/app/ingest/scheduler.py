"""
Runs the resource ingest on a timer inside the API process (INGEST_ENABLED=true), so no external
cron is needed. `python -m app.jobs.ingest_resources` runs the same code once by hand.

With several API workers every one starts a loop, so each run first takes a Postgres advisory lock;
a worker that cannot get it skips that round.
"""

import asyncio
import logging

from sqlalchemy import text

from app.config import get_settings
from app.db import SessionLocal, engine
from app.ingest.base import SOURCES, collect_sources
from app.ingest.runner import upsert_resources

logger = logging.getLogger(__name__)

LOCK_KEY = 7_204_001  # arbitrary, only has to be the same in every worker


async def ingest_once(names: list[str] | None = None, dry_run: bool = False):
    """Fetch, normalize, merge and (unless dry_run) save. Returns (all sources ok, merged items)."""
    results, items, folded = await collect_sources(names or list(SOURCES))
    ok = all(r is not None for r in results.values())
    print(f"combined: {len(items)} resources ({folded} duplicates across sources merged)")
    if items and not dry_run:
        async with SessionLocal() as session:
            res = await upsert_resources(session, items)
        print(f"created {res.created}, updated {res.updated}, unchanged {res.unchanged}, "
              f"duplicates in feed {res.duplicates}")
    return ok, items


async def _run_locked() -> None:
    async with engine.connect() as conn:
        async with conn.begin():  # the lock lasts until this transaction ends
            got = (await conn.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY})).scalar()
            if not got:
                logger.info("Ingest already running in another worker; skipping")
                return
            await ingest_once()


async def run_forever() -> None:
    hours = get_settings().ingest_interval_hours
    while True:
        try:
            await _run_locked()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Scheduled ingest failed; will retry in %s h", hours)
        await asyncio.sleep(hours * 3600)
