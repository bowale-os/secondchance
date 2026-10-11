"""Number checks for the document reader, ported from the reader's verify.test.ts."""

from app.reader.schemas import ActionItem, DueDate, SimplifiedDocument
from app.reader.verify import find_case_numbers, find_dates, find_money, find_phones, verify

ORIGINAL = """Case No. 2026-CR-0412. Report within 72 hours. Officer J. Smith, (404) 555-0100.
Pay a fee of $1,250.00 by October 30, 2026. Hearing on 11/02/2026. Bring this by Dec 3."""


def action(**a) -> ActionItem:
    base = dict(id="a1", order=1, title="Pay the fee", details="", due=DueDate(type="none"), priority="normal",
                source_quote="Pay a fee of $1,250.00 by October 30, 2026.", source_page=1, confidence=0.9)
    return ActionItem(**{**base, **a})


def simple(markdown: str) -> SimplifiedDocument:
    return SimplifiedDocument(markdown=markdown, glossary=[])


def test_reads_dates_in_english_spanish_and_numeric_forms():
    found = find_dates("October 30, 2026 · Oct. 30 2026 · 30 de octubre de 2026 · 10/30/2026 · 2026-10-30")
    assert [d.iso for d in found] == ["2026-10-30"] * 5
    d = find_dates("by Dec 3")[0]
    assert d.iso is None and d.month_day == "12-03"


def test_reads_phones_money_and_case_numbers_but_not_ordinary_words():
    assert [p.key for p in find_phones("Call (404) 555-0100 or 404.555.0100")] == ["4045550100", "4045550100"]
    assert [m.key for m in find_money("$1,250.00 and $30")] == ["1250.00", "30.00"]
    assert [c.value for c in find_case_numbers("Case 2026-CR-0412, a 10-day wait, ZIP 30303")] == ["2026-CR-0412", "30303"]


def test_passes_when_every_value_matches_the_paper_in_any_format():
    flags = verify(ORIGINAL, simple(
        "Pay $1,250 by Oct 30, 2026. Call 404-555-0100. Case 2026-CR-0412. Hearing: November 2, 2026. By December 3."
    ), [action(due=DueDate(type="exact", resolved_date="2026-10-30"))])
    assert flags == []


def test_flags_a_changed_amount_date_phone_or_case_number():
    flags = verify(ORIGINAL, simple("Pay $1,500 by October 31, 2026. Call (404) 555-0199. Case 2026-CR-0413."), [])
    assert [f.value for f in flags] == ["October 31, 2026", "(404) 555-0199", "$1,500", "2026-CR-0413"]
    assert "Double-check this" in flags[0].detail


def test_flags_an_action_whose_due_date_or_source_quote_is_not_on_the_paper():
    flags = verify(ORIGINAL, simple("ok"), [
        action(id="a1", due=DueDate(type="exact", resolved_date="2026-10-31")),
        action(id="a2", source_quote="Attend anger management every Tuesday."),
        action(id="a3", source_quote="Report within 72 hours..."),   # trimmed quotes are fine
    ])
    assert [(f.kind, f.action_id) for f in flags] == [("unverified_value", "a1"), ("unverified_source", "a2")]


def test_accepts_a_year_the_model_filled_in_for_a_yearless_date():
    flags = verify(ORIGINAL, simple("ok"), [action(due=DueDate(type="exact", resolved_date="2026-12-03"))])
    assert flags == []
