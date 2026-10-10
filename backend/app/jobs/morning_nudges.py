"""Morning nudge: on days a client has something scheduled, text them a content-free
"your schedule is ready" at their chosen time. Opt-in only (client texts NUDGE ON).

Run every 15 minutes from cron / a platform scheduler:
    python -m app.jobs.morning_nudges [--dry-run]

Safe to run more often or overlapping: each client is claimed for the day with one
atomic UPDATE before sending, so nobody gets two nudges. A nudge is only sent within
SEND_WINDOW of the chosen time, so a scheduler outage doesn't produce 4 PM "morning"
texts.
"""

import argparse
import asyncio
import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Awaitable, Callable, Optional

from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import bot_messages as msg
from app.services.phone import decrypt_phone
from app.services.schedule import get_schedule
from app.services.textbot_client import send_text
from app.services.timeutil import local_tz
from app.tables import BotAuditLog, BotEnrollment, BotEnrollmentStatus, Client

logger = logging.getLogger(__name__)

SEND_WINDOW = timedelta(hours=2)

SendFn = Callable[[str, str], Awaitable[bool]]


@dataclass
class NudgeReport:
    sent: int = 0
    skipped_empty: int = 0
    failed: int = 0
    not_due: int = 0


def _due(nudge_at: time, today: date, now_local: datetime) -> bool:
    start = datetime.combine(today, nudge_at, now_local.tzinfo)
    return start <= now_local < start + SEND_WINDOW


async def run_nudges(
    session: AsyncSession,
    now: Optional[datetime] = None,
    send: SendFn = send_text,
    dry_run: bool = False,
) -> NudgeReport:
    now = now or datetime.now(timezone.utc)
    now_local = now.astimezone(local_tz())
    today = now_local.date()
    report = NudgeReport()

    candidates = (
        await session.scalars(
            select(BotEnrollment)
            .join(Client, Client.id == BotEnrollment.client_id)
            .where(
                BotEnrollment.nudge_enabled.is_(True),
                BotEnrollment.status == BotEnrollmentStatus.ACTIVE,  # not stopped/locked/revoked
                Client.is_active.is_(True),
                or_(BotEnrollment.last_nudged_on.is_(None), BotEnrollment.last_nudged_on < today),
            )
        )
    ).all()

    for e in candidates:
        if not _due(e.nudge_time, today, now_local):
            report.not_due += 1
            continue
        if not await get_schedule(session, e.client_id, "day", now):
            # Checked for today; don't look again until tomorrow.
            if not dry_run:
                await _claim(session, e, today)
                session.add(BotAuditLog(enrollment_id=e.id, intent="nudge", outcome="skipped_empty"))
                await session.commit()
            report.skipped_empty += 1
            continue
        if dry_run:
            report.sent += 1
            continue
        previous = e.last_nudged_on
        if not await _claim(session, e, today):
            continue  # another run got it first
        await session.commit()
        ok = await send(decrypt_phone(e.phone_encrypted), msg.NUDGE)
        if ok:
            session.add(BotAuditLog(enrollment_id=e.id, intent="nudge", outcome="sent"))
            report.sent += 1
        else:
            # Release the claim so the next run (still inside the window) retries.
            await session.execute(
                update(BotEnrollment).where(BotEnrollment.id == e.id).values(last_nudged_on=previous)
            )
            session.add(BotAuditLog(enrollment_id=e.id, intent="nudge", outcome="failed"))
            report.failed += 1
        await session.commit()
    return report


async def _claim(session: AsyncSession, e: BotEnrollment, today: date) -> bool:
    result = await session.execute(
        update(BotEnrollment)
        .where(
            BotEnrollment.id == e.id,
            or_(BotEnrollment.last_nudged_on.is_(None), BotEnrollment.last_nudged_on < today),
        )
        .values(last_nudged_on=today)
        .execution_options(synchronize_session=False)
    )
    return result.rowcount == 1


async def _main(dry_run: bool) -> None:
    from app.db import SessionLocal, engine

    try:
        async with SessionLocal() as session:
            report = await run_nudges(session, dry_run=dry_run)
        logger.info("morning nudges%s: %s", " (dry run)" if dry_run else "", report)
        print(report)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="count only; send nothing")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main(args.dry_run))
