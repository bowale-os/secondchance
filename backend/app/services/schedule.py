"""A client's schedule: appointments plus open obligations, in local time.

Shared by the case-worker routes and the client-scoped paths (text bot, client
portal). Callers pass a client id they have already authorized; this module does
no access checks of its own."""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Literal, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.timeutil import aware, local_tz
from app.tables import (
    Appointment,
    ClientObligation,
    ObligationStatus,
    ObligationType,
)

Range = Literal["day", "tomorrow", "week"]

WEEK_DAYS = 7  # "week" = today plus the next 6 days


@dataclass
class ScheduleItem:
    kind: Literal["appointment", "obligation"]
    day: date                       # local date
    title: str
    starts_at: Optional[datetime] = None   # local time; None = all day / due date
    ends_at: Optional[datetime] = None
    location_name: Optional[str] = None
    address: Optional[str] = None
    transit_note: Optional[str] = None
    documents_to_bring: list[str] = field(default_factory=list)
    amount: Optional[Decimal] = None
    overdue: bool = False


def window(range_: Range, now: datetime) -> tuple[date, date]:
    """Inclusive local-date range for a request made at `now`."""
    today = now.astimezone(local_tz()).date()
    if range_ == "tomorrow":
        d = today + timedelta(days=1)
        return d, d
    if range_ == "week":
        return today, today + timedelta(days=WEEK_DAYS - 1)
    return today, today


_OBLIGATION_TITLE = {
    ObligationType.FEE: "Payment due",
    ObligationType.COURT_DATE: "Court date",
    ObligationType.CHECK_IN: "Check-in",
    ObligationType.REPORT: "Report due",
}


async def get_schedule(
    db: AsyncSession, client_id: uuid.UUID, range_: Range, now: datetime
) -> list[ScheduleItem]:
    tz = local_tz()
    first, last = window(range_, now)
    # Local midnights, compared in UTC (also what SQLite needs in tests).
    start = datetime.combine(first, time.min, tz).astimezone(timezone.utc)
    end = datetime.combine(last + timedelta(days=1), time.min, tz).astimezone(timezone.utc)

    appts = (
        await db.scalars(
            select(Appointment)
            .where(
                Appointment.client_id == client_id,
                Appointment.cancelled.is_(False),
                Appointment.starts_at >= start,
                Appointment.starts_at < end,
            )
            .order_by(Appointment.starts_at)
        )
    ).all()
    linked = {a.obligation_id for a in appts if a.obligation_id}

    # Only case-worker-verified obligations: an AI misread of a court date must
    # never be texted to the client as fact.
    obligations = (
        await db.scalars(
            select(ClientObligation).where(
                ClientObligation.client_id == client_id,
                ClientObligation.verified.is_(True),
                ClientObligation.status != ObligationStatus.DONE,
                ClientObligation.due_date >= first,
                ClientObligation.due_date <= last,
            )
        )
    ).all()

    items: list[ScheduleItem] = []
    for a in appts:
        starts = aware(a.starts_at).astimezone(tz)
        items.append(ScheduleItem(
            kind="appointment",
            day=starts.date(),
            title=a.title,
            starts_at=starts,
            ends_at=aware(a.ends_at).astimezone(tz) if a.ends_at else None,
            location_name=a.location_name,
            address=a.address,
            transit_note=a.transit_note,
            documents_to_bring=list(a.documents_to_bring or []),
        ))
    for o in obligations:
        if o.id in linked:
            continue  # already shown as its appointment
        title = _OBLIGATION_TITLE.get(o.obligation_type, "Due")
        if o.description:
            title = f"{title}: {o.description.strip()[:80]}"
        items.append(ScheduleItem(
            kind="obligation",
            day=o.due_date,
            title=title,
            amount=o.amount,
            overdue=o.status == ObligationStatus.OVERDUE,
        ))

    # Per day: all-day items first, then by time.
    items.sort(key=lambda i: (i.day, i.starts_at is not None, i.starts_at or datetime.min.replace(tzinfo=tz)))
    return items
