"""Date math for the document reader, ported case by case from the reader's dates.test.ts."""

from app.reader.dates import DateAnchors, add_business_days, finalize_actions, reresolve_actions, resolve_due
from app.reader.schemas import RawAction, RawDue


def due(**d) -> RawDue:
    base = dict(type="relative", text=None, exact_date=None, anchor=None,
                offset_hours=None, offset_days=None, business_days=None)
    return RawDue(**{**base, **d})


def action(**d) -> RawAction:
    base = dict(order=1, title="Step", details="", due=due(type="none"), location=None, contact=None,
                bring=[], priority="normal", consequence=None, source_quote="quote", source_page=1,
                confidence=0.9)
    return RawAction(**{**base, **d})


# ---------- resolve_due ----------

def test_72_hours_after_release_on_oct_9_is_oct_12():
    r = resolve_due(due(anchor="release_date", offset_hours=72), DateAnchors(release_date="2026-10-09"))
    assert r.resolved_date == "2026-10-12"
    assert r.explanation == "72 hours after your release on Oct 9 = Oct 12"


def test_rounds_partial_days_down():
    r = resolve_due(due(anchor="release_date", offset_hours=36), DateAnchors(release_date="2026-10-09"))
    assert r.resolved_date == "2026-10-10"


def test_skips_weekends_for_business_days():
    # Fri Oct 9 2026 + 10 business days = Fri Oct 23
    assert add_business_days("2026-10-09", 10) == "2026-10-23"
    r = resolve_due(due(anchor="document_date", offset_days=10, business_days=True),
                    DateAnchors(document_date="2026-10-09"))
    assert r.resolved_date == "2026-10-23"
    assert r.explanation == "10 business days after the date on the paper on Oct 9 = Oct 23"


def test_asks_for_the_missing_date_instead_of_guessing():
    r = resolve_due(due(anchor="release_date", offset_hours=72), DateAnchors())
    assert r.resolved_date is None
    assert "release date" in r.explanation


def test_passes_exact_dates_through_and_explains_in_spanish():
    assert resolve_due(due(type="exact", exact_date="2026-10-30"), DateAnchors()).resolved_date == "2026-10-30"
    es = resolve_due(due(anchor="release_date", offset_hours=72), DateAnchors(release_date="2026-10-09"), "es")
    assert es.explanation == "72 horas después de su salida el 9 oct = 12 oct"


# ---------- finalize_actions ----------

TODAY = "2026-10-09"


def test_marks_everything_on_a_parole_paper_urgent():
    out = finalize_actions([action(priority="low")], anchors=DateAnchors(), doc_type="parole_conditions", today=TODAY)
    assert out[0].priority == "urgent"


def test_marks_items_due_within_7_days_urgent_but_never_lowers_the_model():
    out = finalize_actions([
        action(title="Soon", due=due(type="exact", exact_date="2026-10-15")),
        action(title="Later", due=due(type="exact", exact_date="2026-11-30")),
        action(title="Model said urgent", priority="urgent"),
    ], anchors=DateAnchors(), doc_type="housing", today=TODAY)
    assert {a.title: a.priority for a in out} == {"Soon": "urgent", "Later": "normal", "Model said urgent": "urgent"}


def test_orders_urgent_first_then_soonest_and_numbers_the_result():
    out = finalize_actions([
        action(order=1, title="Undated"),
        action(order=2, title="Nov", due=due(type="exact", exact_date="2026-11-30")),
        action(order=3, title="Oct 12", due=due(type="exact", exact_date="2026-10-12")),
    ], anchors=DateAnchors(), doc_type="benefits", today=TODAY)
    assert [(a.id, a.order, a.title) for a in out] == [("a1", 1, "Oct 12"), ("a2", 2, "Nov"), ("a3", 3, "Undated")]


def test_re_resolves_once_the_release_date_is_added_later():
    [first] = finalize_actions([action(due=due(anchor="release_date", offset_hours=72))],
                               anchors=DateAnchors(), doc_type="benefits", today=TODAY)
    assert first.due.resolved_date is None
    [after] = reresolve_actions([first], anchors=DateAnchors(release_date="2026-10-09"),
                                doc_type="benefits", today=TODAY)
    assert after.due.resolved_date == "2026-10-12"
    assert after.priority == "urgent"


def test_wire_format_uses_the_readers_camel_case_names():
    [a] = finalize_actions([action(due=due(anchor="release_date", offset_hours=72))],
                           anchors=DateAnchors(release_date="2026-10-09"), doc_type="benefits", today=TODAY)
    wire = a.wire()
    assert wire["sourceQuote"] == "quote" and wire["sourcePage"] == 1
    assert wire["due"] == {"type": "relative", "anchor": "release_date", "offsetHours": 72.0,
                           "resolvedDate": "2026-10-12",
                           "explanation": "72 hours after your release on Oct 9 = Oct 12"}
    assert "location" not in wire   # unset optional fields are left out, as in the reader
