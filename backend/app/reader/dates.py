"""Deterministic date math: turns what the AI read ("within 72 hours of release") into a real
date. Never done by the model. Kept pure so resolved dates can be recomputed each time
actions are read, e.g. after a case worker adds a client's release date."""

import math
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal, Optional

from app.reader.schemas import (
    LEGAL_DOC_TYPES,
    URGENT_WINDOW_DAYS,
    ActionItem,
    Contact,
    DocType,
    DueDate,
    RawAction,
    RawDue,
)

Lang = Literal["en", "es"]


@dataclass
class DateAnchors:
    document_date: Optional[str] = None
    release_date: Optional[str] = None
    received_date: Optional[str] = None


def add_days(iso: str, days: int) -> str:
    return (date.fromisoformat(iso) + timedelta(days=days)).isoformat()


def add_business_days(iso: str, days: int) -> str:
    """Adds business days, skipping Saturdays and Sundays. Holidays are NOT skipped, so a
    deadline can only come out earlier than the real one, never later. Early is safe."""
    d = date.fromisoformat(iso)
    left = days
    while left > 0:
        d += timedelta(days=1)
        if d.weekday() < 5:
            left -= 1
    return d.isoformat()


def days_between(from_iso: str, to_iso: str) -> int:
    return (date.fromisoformat(to_iso) - date.fromisoformat(from_iso)).days


MONTHS: dict[Lang, list[str]] = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
}


def short_date(iso: str, lang: Lang = "en") -> str:
    d = date.fromisoformat(iso)
    m = MONTHS[lang][d.month - 1]
    return f"{d.day} {m}" if lang == "es" else f"{m} {d.day}"


ANCHOR_WORDS: dict[Lang, dict[str, str]] = {
    "en": {"release_date": "your release", "document_date": "the date on the paper",
           "received_date": "the day you got the paper"},
    "es": {"release_date": "su salida", "document_date": "la fecha del papel",
           "received_date": "el día que recibió el papel"},
}

NEEDS: dict[Lang, dict[str, str]] = {
    "en": {"release_date": "Add your release date to get the exact day",
           "document_date": "The paper has no date. Ask your case manager for the exact day",
           "received_date": "Add the day you got this paper to get the exact day"},
    "es": {"release_date": "Agregue su fecha de salida para saber el día exacto",
           "document_date": "El papel no tiene fecha. Pregunte a su administrador de caso el día exacto",
           "received_date": "Agregue el día que recibió el papel para saber el día exacto"},
}


def _num(x: float) -> str:
    return f"{x:g}"   # 72.0 -> "72", as the reader prints it


def _offset_words(raw: RawDue, lang: Lang) -> str:
    es = lang == "es"
    if raw.offset_days is not None and raw.business_days:
        return f"{raw.offset_days} días hábiles" if es else f"{raw.offset_days} business days"
    if raw.offset_days is not None:
        return f"{raw.offset_days} días" if es else f"{raw.offset_days} days"
    return f"{_num(raw.offset_hours)} horas" if es else f"{_num(raw.offset_hours)} hours"


def resolve_due(raw: RawDue, anchors: DateAnchors, lang: Lang = "en") -> DueDate:
    if raw.type == "exact":
        return DueDate(type="exact", text=raw.text, resolved_date=raw.exact_date)
    if raw.type != "relative" or not raw.anchor:
        return DueDate(type="none", text=raw.text)

    due = DueDate(
        type="relative", text=raw.text, anchor=raw.anchor,
        offset_hours=raw.offset_hours, offset_days=raw.offset_days, business_days=raw.business_days,
    )
    start = getattr(anchors, raw.anchor)
    if not start:
        return due.model_copy(update={"explanation": NEEDS[lang][raw.anchor]})

    if raw.offset_days is not None:
        resolved = (add_business_days if raw.business_days else add_days)(start, raw.offset_days)
    elif raw.offset_hours is not None:
        # Whole days only, rounded down: 36 hours after Oct 9 shows Oct 10, the earlier day.
        resolved = add_days(start, math.floor(raw.offset_hours / 24))
    else:
        return due

    after, on = ("después de", "el") if lang == "es" else ("after", "on")
    explanation = (
        f"{_offset_words(raw, lang)} {after} {ANCHOR_WORDS[lang][raw.anchor]} {on} "
        f"{short_date(start, lang)} = {short_date(resolved, lang)}"
    )
    return due.model_copy(update={"resolved_date": resolved, "explanation": explanation})


def is_urgent(due: DueDate, doc_type: DocType, today: str) -> bool:
    """Urgent: due within 7 days (or overdue), or on a parole / probation / court paper."""
    if doc_type in LEGAL_DOC_TYPES:
        return True
    return bool(due.resolved_date) and days_between(today, due.resolved_date) <= URGENT_WINDOW_DAYS


def _lang(language: Optional[str]) -> Lang:
    return "es" if language == "es" else "en"


RANK = {"urgent": 0, "normal": 1, "low": 2}


def finalize_actions(
    raw: list[RawAction], *, anchors: DateAnchors, doc_type: DocType, today: str,
    language: Optional[str] = None,
) -> list[ActionItem]:
    """Raw AI actions -> app actions: resolves dates, raises priority where the rules say
    urgent (never lowers what the model flagged), and orders urgent first, then soonest."""
    lang = _lang(language)
    items = []
    for r in raw:
        due = resolve_due(r.due, anchors, lang)
        items.append(ActionItem(
            id="",
            order=r.order,
            title=r.title,
            details=r.details,
            due=due,
            location=r.location,
            contact=Contact(**r.contact.model_dump()) if r.contact else None,
            bring=r.bring or None,
            priority="urgent" if is_urgent(due, doc_type, today) else r.priority,
            consequence=r.consequence,
            source_quote=r.source_quote,
            source_page=r.source_page,
            confidence=r.confidence,
        ))

    items.sort(key=lambda a: (RANK[a.priority], a.due.resolved_date or "9999", a.order))
    return [a.model_copy(update={"id": f"a{i}", "order": i}) for i, a in enumerate(items, 1)]


def reresolve_actions(
    actions: list[ActionItem], *, anchors: DateAnchors, doc_type: DocType, today: str,
    language: Optional[str] = None,
) -> list[ActionItem]:
    """Re-resolve saved relative dates once a missing date (e.g. release date) is known."""
    lang = _lang(language)
    out = []
    for a in actions:
        if a.due.type != "relative":
            out.append(a)
            continue
        raw = RawDue(
            type="relative", text=a.due.text, exact_date=None, anchor=a.due.anchor,
            offset_hours=a.due.offset_hours, offset_days=a.due.offset_days,
            business_days=a.due.business_days,
        )
        due = resolve_due(raw, anchors, lang)
        priority = "urgent" if is_urgent(due, doc_type, today) else a.priority
        out.append(a.model_copy(update={"due": due, "priority": priority}))
    return out
