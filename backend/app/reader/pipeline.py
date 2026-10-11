"""The pipeline: preprocess -> read pages -> classify -> simplify + find actions ->
calculate dates -> verify. Results stream back through `emit` as each stage finishes.

Nothing is stored or logged here: no document text, no images. Saving happens only when
the client chooses to keep the paper: `sign` turns the result into a signed receipt that
rides on the final event, and /reader/keep checks it (see receipt.py).
"""

import asyncio
from dataclasses import dataclass
from typing import Callable, Optional

from app.reader.ai import AiClient
from app.reader.dates import DateAnchors, finalize_actions
from app.reader.preprocess import UploadFile, preprocess
from app.reader.schemas import (
    LOW_CONFIDENCE_THRESHOLD,
    ActionItem,
    ActionsEvent,
    ClassifiedEvent,
    DocumentMeta,
    DoneEvent,
    ExtractedEvent,
    ExtractedPage,
    FindingActionsEvent,
    Flag,
    ProgressEvent,
    ReadingEvent,
    RetakeSuggestedEvent,
    SimplifiedDocument,
    SimplifiedEvent,
    SimplifyingEvent,
)
from app.reader.steps import Extracted, classify, extract_actions, extract_text, simplify
from app.reader.verify import flag_text, verify


@dataclass
class ProcessInput:
    files: list[UploadFile]
    language: str
    today: str                            # the client's local date (YYYY-MM-DD), for "due within 7 days"
    release_date: Optional[str] = None    # from the client profile
    received_date: Optional[str] = None


@dataclass
class ProcessResult:
    extracted: Extracted
    meta: DocumentMeta
    simplified: SimplifiedDocument
    actions: list[ActionItem]
    flags: list[Flag]


async def process_document(
    ai: AiClient, inp: ProcessInput, emit: Callable[[ProgressEvent], None],
    sign: Optional[Callable[["ProcessResult"], str]] = None,
) -> ProcessResult:
    pages = await preprocess(inp.files)

    emit(ReadingEvent())
    extracted = await extract_text(ai, pages, inp.language)
    emit(ExtractedEvent(
        pages=[ExtractedPage(n=p.n, text=p.text, confidence=p.confidence) for p in extracted.pages],
        text=extracted.text,
    ))

    low_conf = [p for p in extracted.pages if p.confidence < LOW_CONFIDENCE_THRESHOLD]
    if low_conf:
        emit(RetakeSuggestedEvent(pages=[p.n for p in low_conf]))

    classified = await classify(ai, extracted.text)
    meta = DocumentMeta(
        doc_type=classified.doc_type,
        title=classified.title,
        issuer=classified.issuer,
        document_date=classified.document_date,
    )
    emit(ClassifiedEvent(meta=meta))

    # Simplify and find actions at the same time; the simple version streams back first if ready.
    async def simplify_and_emit() -> SimplifiedDocument:
        s = await simplify(ai, extracted.text, inp.language)
        doc = SimplifiedDocument(markdown=s.markdown, glossary=s.glossary)
        emit(SimplifiedEvent(simplified=doc))
        return doc

    emit(SimplifyingEvent())
    simplified_task = asyncio.ensure_future(simplify_and_emit())
    emit(FindingActionsEvent())
    simplified, raw = await asyncio.gather(
        simplified_task, extract_actions(ai, extracted.text, classified, inp.language)
    )

    actions = finalize_actions(
        raw,
        anchors=DateAnchors(
            document_date=meta.document_date,
            release_date=inp.release_date,
            received_date=inp.received_date,
        ),
        doc_type=meta.doc_type,
        today=inp.today,
        language=inp.language,
    )

    page_text = flag_text(inp.language)["page"]
    flags = [
        *(Flag(
            kind="low_confidence_page",
            page=p.n,
            detail=page_text.format(n=p.n, problem=f" ({p.problem.lower()})" if p.problem else ""),
        ) for p in low_conf),
        *verify(extracted.text, simplified, actions, inp.language),
    ]
    emit(ActionsEvent(actions=actions, flags=flags))
    result = ProcessResult(extracted=extracted, meta=meta, simplified=simplified, actions=actions, flags=flags)
    emit(DoneEvent(receipt=sign(result) if sign else None))
    return result
