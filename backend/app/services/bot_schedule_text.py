"""Render a schedule as a text message, in the client's language. Plain text only (it
must read on SMS). Sent only to a signed-in client. Strings live in bot_messages."""

from datetime import date, datetime

from app.services.bot_messages import EN_STRINGS, Strings
from app.services.schedule import Range, ScheduleItem


def _time(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0")


def _money(amount) -> str:
    return f"${amount:,.2f}".replace(".00", "")


def _title(i: ScheduleItem, L: Strings) -> str:
    if i.kind == "obligation":
        label = L.get(f"OBL_{i.obligation_type}") if i.obligation_type in ("fee", "court_date", "check_in", "report") else L.OBL_other
        return f"{label}: {i.detail}" if i.detail else label
    return i.title


def _headline(i: ScheduleItem, L: Strings) -> str:
    title = _title(i, L)
    if i.amount is not None:
        title += f" ({_money(i.amount)})"
    if i.overdue:
        title += f" - {L.OVERDUE}"
    return f"{_time(i.starts_at)} {title}" if i.starts_at else title


def render_day(items: list[ScheduleItem], d: date, today: date, L: Strings = EN_STRINGS) -> str:
    label = L.TODAY if d == today else L.TOMORROW_LABEL if (d - today).days == 1 else L.day(d)
    if not items:
        return L.get("SCHED_DAY_EMPTY", label=label, day=L.day(d))
    lines = [L.get("SCHED_DAY_HEAD", label=label, day=L.day(d))]
    for n, i in enumerate(items, 1):
        lines.append(f"{n}. {_headline(i, L)}")
        place = ", ".join(p for p in (i.location_name, i.address) if p)
        if place:
            lines.append(f"   {L.SCHED_WHERE}: {place}")
        if i.transit_note:
            lines.append(f"   {L.SCHED_TRANSIT}: {i.transit_note}")
        if i.documents_to_bring:
            lines.append(f"   {L.SCHED_BRING}: {', '.join(i.documents_to_bring)}")
    lines.append(L.SCHED_DAY_FOOT)
    return "\n".join(lines)


def render_week(items: list[ScheduleItem], today: date, L: Strings = EN_STRINGS) -> str:
    if not items:
        return L.SCHED_WEEK_EMPTY
    lines = [L.SCHED_WEEK_HEAD]
    current = None
    for i in items:
        if i.day != current:
            current = i.day
            lines.append("")
            lines.append(L.TODAY if i.day == today else L.day(i.day))
        lines.append(f"- {_headline(i, L)}")
    lines.append("")
    lines.append(L.SCHED_WEEK_FOOT)
    return "\n".join(lines)


def render(range_: Range, items: list[ScheduleItem], first: date, today: date, L: Strings = EN_STRINGS) -> str:
    if range_ == "week":
        return render_week(items, today, L)
    return render_day(items, first, today, L)
