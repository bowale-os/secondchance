"""Plain code, not AI: every date, dollar amount, phone number and case number in the
simplified text and the action list must appear on the original paper. Anything that
doesn't is flagged "Double-check this" rather than shown as fact. Every action must also
point to a real sentence on the paper."""

import re
from dataclasses import dataclass
from typing import Optional

from app.reader.schemas import ActionItem, Flag, SimplifiedDocument

MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]


def _iso(y: int, m: int, d: int) -> Optional[str]:
    return f"{y}-{m:02d}-{d:02d}" if 1 <= m <= 12 and 1 <= d <= 31 else None


def _month_index(word: str) -> int:
    w = word.lower().replace(".", "", 1)
    w = "septiembre" if w == "setiembre" else w
    if w in MONTHS_ES:
        return MONTHS_ES.index(w) + 1
    if w[:3] in MONTHS_EN and re.fullmatch(r"[a-z]+", w):
        return MONTHS_EN.index(w[:3]) + 1
    return 0


MONTH_WORD = (r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?"
              r"|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?")
MONTH_ES = f"({'|'.join(MONTHS_ES)}|setiembre)"
A = re.ASCII  # match JavaScript's \b and \d

DATE_PATTERNS = [
    # (regex, year group, month group, day group)
    (re.compile(rf"\b{MONTH_WORD}\s+(\d{{1,2}})(?:st|nd|rd|th)?(?:,?\s+(\d{{4}}))?", re.I | A), 3, 1, 2),
    (re.compile(rf"\b(\d{{1,2}})\s+{MONTH_WORD}(?:,?\s+(\d{{4}}))?", re.I | A), 3, 2, 1),
    (re.compile(rf"\b(\d{{1,2}})\s+de\s+{MONTH_ES}(?:\s+(?:de|del)\s+(\d{{4}}))?", re.I | A), 3, 2, 1),
    (re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", A), 3, 1, 2),   # US M/D/YYYY
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b", A), 1, 2, 3),
]


@dataclass
class FoundDate:
    """A date found in text: full ISO date, or month-day only when no year is written."""
    value: str
    iso: Optional[str]
    month_day: str


@dataclass
class Found:
    value: str
    key: str


def find_dates(text: str) -> list[FoundDate]:
    out = []
    for regex, yg, mg, dg in DATE_PATTERNS:
        for m in regex.finditer(text):
            month = m.group(mg)
            month = int(month) if month.isdigit() else _month_index(month)
            day = int(m.group(dg))
            md = _iso(2000, month, day)
            if not md:
                continue
            year = m.group(yg)
            out.append(FoundDate(m.group(0), _iso(int(year), month, day) if year else None, md[5:]))
    return out


PHONE = re.compile(r"(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b", A)
MONEY = re.compile(r"\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{2}))?", A)
# Case and account numbers: capital letters and digits joined by dashes (2026-CR-0412), or
# 5+ digit runs. Capitals only, so ordinary words like "10-day" aren't mistaken for one.
CASE_DASHED = re.compile(r"\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]+(?:-[A-Z0-9]+)+\b", A)
CASE_DIGITS = re.compile(r"(?<![\d-])\d{5,}(?![\d-])", A)


def find_phones(text: str) -> list[Found]:
    return [Found(m.group(0).strip(), re.sub(r"\D", "", m.group(0))[-10:]) for m in PHONE.finditer(text)]


def find_money(text: str) -> list[Found]:
    return [Found(m.group(0), f"{m.group(1).replace(',', '')}.{m.group(2) or '00'}")
            for m in MONEY.finditer(text)]


def find_case_numbers(text: str) -> list[Found]:
    found = [*CASE_DASHED.finditer(text), *CASE_DIGITS.finditer(text)]
    return [Found(m.group(0), m.group(0).upper()) for m in found]


def normalize_quote(s: str) -> str:
    s = s.lower()
    s = re.sub(r"(\.\.\.|…)\s*$", "", s)
    s = re.sub(r"[“”\"'‘’]", "", s)
    s = re.sub(r"(?:[^\w$]|_)+", " ", s)   # keep letters, digits and $
    return s.strip()


@dataclass
class _Index:
    iso_dates: set
    yearless_month_days: set
    all_month_days: set
    phones: set
    money: set
    case_numbers: set
    quote_text: str


def _index(original: str) -> _Index:
    dates = find_dates(original)
    return _Index(
        iso_dates={d.iso for d in dates if d.iso},
        yearless_month_days={d.month_day for d in dates if not d.iso},
        all_month_days={d.month_day for d in dates},
        phones={p.key for p in find_phones(original)},
        money={m.key for m in find_money(original)},
        case_numbers={c.key for c in find_case_numbers(original)},
        quote_text=normalize_quote(original),
    )


MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August",
               "September", "October", "November", "December"]


def _human_date(iso: str, lang: str = "en") -> str:
    """2026-10-30 -> "October 30, 2026" / "30 de octubre de 2026" """
    y, m, d = iso[:4], int(iso[5:7]), int(iso[8:10])
    return f"{d} de {MONTHS_ES[m - 1]} de {y}" if lang == "es" else f"{MONTH_NAMES[m - 1]} {d}, {y}"


# Flag sentences shown to the client, in their language.
FLAG_TEXT = {
    "en": {
        "value": '"{value}" is not on the original paper. Double-check this.',
        "source": "We couldn't find where this step is on the paper. Double-check this.",
        "page": "Page {n} was hard to read{problem}. Check it against your paper, or retake the photo.",
    },
    "es": {
        "value": '"{value}" no está en el papel original. Revíselo.',
        "source": "No encontramos en qué parte del papel está este paso. Revíselo.",
        "page": "La página {n} era difícil de leer{problem}. Compárela con su papel o vuelva a tomar la foto.",
    },
}


def flag_text(lang: Optional[str]) -> dict[str, str]:
    return FLAG_TEXT["es" if lang == "es" else "en"]


def _unverified_values(text: str, idx: _Index) -> list[str]:
    """Values in a piece of generated text that are not on the original paper."""
    missing: dict[str, None] = {}   # ordered set
    for d in find_dates(text):
        ok = (d.iso in idx.iso_dates or d.month_day in idx.yearless_month_days) if d.iso \
            else d.month_day in idx.all_month_days
        if not ok:
            missing[d.value] = None
    for p in find_phones(text):
        if p.key not in idx.phones:
            missing[p.value] = None
    for m in find_money(text):
        if m.key not in idx.money:
            missing[m.value] = None
    for c in find_case_numbers(text):
        if c.key not in idx.case_numbers and re.sub(r"\D", "", c.key)[-10:] not in idx.phones:
            missing[c.value] = None
    return list(missing)


def verify(
    original: str, simplified: SimplifiedDocument, actions: list[ActionItem], lang: Optional[str] = "en",
) -> list[Flag]:
    idx = _index(original)
    msgs = flag_text(lang)
    date_lang = "es" if lang == "es" else "en"
    flags: list[Flag] = []

    def flag_value(value: str, action_id: Optional[str] = None) -> None:
        flags.append(Flag(kind="unverified_value", value=value, action_id=action_id,
                          detail=msgs["value"].format(value=value)))

    simplified_text = "\n".join([simplified.markdown, *(f"{g.term} {g.meaning}" for g in simplified.glossary)])
    for v in _unverified_values(simplified_text, idx):
        flag_value(v)

    for a in actions:
        parts = [a.title, a.details, a.location, a.consequence, a.contact.phone if a.contact else None, *(a.bring or [])]
        for v in _unverified_values("\n".join(p for p in parts if p), idx):
            flag_value(v, a.id)

        if a.due.type == "exact" and a.due.resolved_date:
            r = a.due.resolved_date
            if r not in idx.iso_dates and r[5:] not in idx.yearless_month_days:
                flag_value(_human_date(r, date_lang), a.id)   # "October 30, 2026", not 2026-10-30

        quote = normalize_quote(a.source_quote)
        if not quote or quote not in idx.quote_text:
            flags.append(Flag(kind="unverified_source", action_id=a.id,
                              detail=msgs["source"]))
    return flags
