"""Render a schedule as a text message. Plain text only (it must read on SMS).
Sent only to a signed-in client."""

from datetime import date, datetime

from app.services.schedule import Range, ScheduleItem


def _time(dt: datetime) -> str:
    return dt.strftime("%I:%M %p").lstrip("0")


def _day(d: date) -> str:
    return f"{d.strftime('%a %b')} {d.day}"


def _money(amount) -> str:
    return f"${amount:,.2f}".replace(".00", "")


def _headline(i: ScheduleItem) -> str:
    title = i.title
    if i.amount is not None:
        title += f" ({_money(i.amount)})"
    if i.overdue:
        title += " - OVERDUE"
    return f"{_time(i.starts_at)} {title}" if i.starts_at else title


def render_day(items: list[ScheduleItem], d: date, today: date) -> str:
    label = "Today" if d == today else "Tomorrow" if (d - today).days == 1 else _day(d)
    if not items:
        return f"{label}, {_day(d)}: nothing on your schedule. Reply WEEK for the next 7 days."
    lines = [f"{label}, {_day(d)}:"]
    for n, i in enumerate(items, 1):
        lines.append(f"{n}. {_headline(i)}")
        place = ", ".join(p for p in (i.location_name, i.address) if p)
        if place:
            lines.append(f"   Where: {place}")
        if i.transit_note:
            lines.append(f"   Transit: {i.transit_note}")
        if i.documents_to_bring:
            lines.append(f"   Bring: {', '.join(i.documents_to_bring)}")
    lines.append("Reply WEEK for the next 7 days.")
    return "\n".join(lines)


def render_week(items: list[ScheduleItem], today: date) -> str:
    if not items:
        return "Nothing on your schedule for the next 7 days. Reply MENU for other options."
    lines = ["Next 7 days:"]
    current = None
    for i in items:
        if i.day != current:
            current = i.day
            lines.append("")
            lines.append("Today" if i.day == today else _day(i.day))
        lines.append(f"- {_headline(i)}")
    lines.append("")
    lines.append("Reply TODAY or TOMORROW for places and what to bring.")
    return "\n".join(lines)


def render(range_: Range, items: list[ScheduleItem], first: date, today: date) -> str:
    if range_ == "week":
        return render_week(items, today)
    return render_day(items, first, today)
