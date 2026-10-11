"""The document reader pipeline against the fake AI, ported from the reader's pipeline and
preprocess tests."""

import io

import pytest
from PIL import Image
from pydantic import ValidationError
from pypdf import PdfWriter

from app.reader import fake_fixtures as fx
from app.reader.ai import FakeAiClient, UserFacingError
from app.reader.pipeline import ProcessInput, process_document
from app.reader.preprocess import UploadFile, preprocess


def jpeg_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 60), "white").save(buf, "JPEG")
    return buf.getvalue()


def pdf_bytes(pages: int) -> bytes:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


PAGE = UploadFile("p.jpg", "image/jpeg", jpeg_bytes())


async def run(ai=None, **over):
    ai = ai or FakeAiClient()
    inp = ProcessInput(**{"files": [PAGE, PAGE], "language": "en", "today": "2026-10-09",
                          "release_date": "2026-10-09", **over})
    events = []
    result = await process_document(ai, inp, events.append)
    return events, result, ai


# ---------- pipeline ----------

@pytest.mark.asyncio
async def test_streams_stages_in_order_and_finishes():
    events, _, _ = await run()
    assert [e.stage for e in events] == [
        "reading", "extracted", "classified", "simplifying", "finding_actions", "simplified", "actions", "done",
    ]


@pytest.mark.asyncio
async def test_reads_each_page_separately_and_calls_the_ai_once_per_step():
    _, _, ai = await run()
    assert sorted(c.step for c in ai.calls) == ["actions", "classify", "extract", "extract", "simplify"]
    assert [c.page for c in ai.calls if c.step == "extract"] == [1, 2]


@pytest.mark.asyncio
async def test_turns_relative_deadlines_into_real_dates_and_puts_urgent_first():
    _, result, _ = await run()
    meet = next(a for a in result.actions if a.title == "Meet your parole officer")
    assert meet.due.resolved_date == "2026-10-12"
    assert meet.due.explanation == "72 hours after your release on Oct 9 = Oct 12"
    # "Within 10 business days of any change of address" counts from a move, not the paper's date.
    move = next(a for a in result.actions if a.title.startswith("Tell your officer"))
    assert (move.due.type, move.due.resolved_date) == ("none", None)
    assert move.due.text == "within 10 business days of any change of address or employment"
    assert all(a.priority == "urgent" for a in result.actions)   # parole paper
    assert result.actions[0].title == "Meet your parole officer"


@pytest.mark.asyncio
async def test_asks_for_the_release_date_when_it_is_missing():
    _, result, _ = await run(release_date=None)
    meet = next(a for a in result.actions if a.title == "Meet your parole officer")
    assert meet.due.resolved_date is None
    assert "release date" in meet.due.explanation


@pytest.mark.asyncio
async def test_raises_no_false_alarms_on_the_honest_sample_letter():
    _, result, _ = await run()
    assert result.flags == []


@pytest.mark.asyncio
async def test_flags_a_hard_to_read_page_and_suggests_a_retake():
    ai = FakeAiClient(overrides={
        "extract": lambda req: {**fx.FAKE_PAGES[1], "confidence": 0.4, "problem": "Glare across the middle"}
        if req.page == 2 else fx.FAKE_PAGES[0],
    })
    events, result, _ = await run(ai)
    assert any(e.stage == "retake_suggested" and e.pages == [2] for e in events)
    assert (result.flags[0].kind, result.flags[0].page) == ("low_confidence_page", 2)
    assert "glare across the middle" in result.flags[0].detail


@pytest.mark.asyncio
async def test_catches_a_number_the_ai_got_wrong():
    actions = [
        {**a, "due": {**a["due"], "exactDate": "2026-10-31"}} if a["order"] == 2 else a
        for a in fx.FAKE_ACTIONS["actions"]
    ]
    ai = FakeAiClient(overrides={
        "simplify": {**fx.FAKE_SIMPLIFY, "markdown": fx.FAKE_SIMPLIFY["markdown"].replace("$30.00", "$300.00")},
        "actions": {"actions": actions},
    })
    _, result, _ = await run(ai)
    assert [f.value for f in result.flags] == ["$300.00", "October 31, 2026"]


@pytest.mark.asyncio
async def test_one_photo_demo_still_gets_the_whole_sample_letter():
    _, result, _ = await run(files=[PAGE])
    assert len(result.extracted.pages) == 1
    assert "Reentry Orientation" in result.extracted.text
    assert result.flags == []


@pytest.mark.asyncio
async def test_rejects_ai_output_that_breaks_the_schema():
    ai = FakeAiClient(overrides={"classify": {"docType": "parole_conditions", "title": "", "issuer": None,
                                              "documentDate": "Oct 5"}})
    with pytest.raises(ValidationError):
        await run(ai)


@pytest.mark.asyncio
async def test_events_serialize_with_camel_case_names():
    events, _, _ = await run()
    classified = next(e for e in events if e.stage == "classified").wire()
    assert classified["meta"]["docType"] == "parole_conditions"
    assert classified["meta"]["documentDate"] == "2026-10-05"


# ---------- preprocess ----------

@pytest.mark.asyncio
async def test_splits_a_pdf_into_single_pages_and_numbers_everything_in_order():
    pages = await preprocess([PAGE, UploadFile("a.pdf", "application/pdf", pdf_bytes(3)), PAGE])
    assert [(p.n, p.kind) for p in pages] == [(1, "image"), (2, "pdf"), (3, "pdf"), (4, "pdf"), (5, "image")]
    from pypdf import PdfReader
    assert len(PdfReader(io.BytesIO(pages[1].data)).pages) == 1


@pytest.mark.asyncio
async def test_refuses_more_than_30_pages():
    with pytest.raises(UserFacingError, match="more than 30 pages"):
        await preprocess([UploadFile("big.pdf", "application/pdf", pdf_bytes(31))])


@pytest.mark.asyncio
async def test_refuses_unknown_types_and_damaged_files_with_a_plain_message():
    with pytest.raises(UserFacingError):
        await preprocess([UploadFile("x.zip", "application/zip", b"\0")])
    with pytest.raises(UserFacingError, match="couldn't open this PDF"):
        await preprocess([UploadFile("x.pdf", "application/pdf", b"\0")])
    with pytest.raises(UserFacingError, match="couldn't open"):
        await preprocess([UploadFile("x.jpg", "image/jpeg", b"not an image")])


@pytest.mark.asyncio
async def test_refuses_uploads_over_20_mb():
    with pytest.raises(UserFacingError, match="too big"):
        await preprocess([UploadFile("p.jpg", "image/jpeg", bytes(21 * 1024 * 1024))])


@pytest.mark.asyncio
async def test_images_are_downscaled_to_jpeg():
    buf = io.BytesIO()
    Image.new("RGB", (3000, 1500), "white").save(buf, "PNG")
    [page] = await preprocess([UploadFile("p.png", "image/png", buf.getvalue())])
    assert page.mime_type == "image/jpeg"
    assert max(Image.open(io.BytesIO(page.data)).size) == 2000
