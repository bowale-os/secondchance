"""The AI steps. Each builds its prompt, calls the AI through AiClient, and gets back output
already checked against the schemas."""

import asyncio
import base64
from dataclasses import dataclass
from typing import Optional

from app.reader.ai import AiClient, AiRequest
from app.reader.preprocess import Page
from app.reader.prompts import (
    CLASSIFY_SYSTEM,
    actions_system,
    document_text,
    extract_system,
    simplify_system,
)
from app.reader.schemas import (
    ActionsOutput,
    ClassifyOutput,
    ExtractOutput,
    RawAction,
    SimplifyOutput,
)

PAGE_CONCURRENCY = 4


@dataclass
class ReadPage:
    n: int
    text: str
    confidence: float
    problem: Optional[str]


@dataclass
class Extracted:
    pages: list[ReadPage]
    text: str


def page_block(page: Page) -> dict:
    if page.kind == "text":
        return {"type": "text", "text": page.text or ""}
    source = {"type": "base64", "media_type": page.mime_type, "data": base64.b64encode(page.data).decode()}
    return {"type": "document" if page.kind == "pdf" else "image", "source": source}


def _text(text: str) -> dict:
    return {"type": "text", "text": text}


async def extract_text(ai: AiClient, pages: list[Page], language: str = "en") -> Extracted:
    """Reads every page, several at a time. Typed text from Word files needs no AI."""
    gate = asyncio.Semaphore(PAGE_CONCURRENCY)

    async def read(page: Page) -> ReadPage:
        if page.kind == "text":
            return ReadPage(n=page.n, text=page.text or "", confidence=1, problem=None)
        async with gate:
            out: ExtractOutput = await ai.generate(AiRequest(
                step="extract",
                page=page.n,
                page_count=len(pages),
                system=extract_system(language),
                schema=ExtractOutput,
                content=[page_block(page), _text(f"Transcribe page {page.n}.")],
            ))
        return ReadPage(n=page.n, text=out.text, confidence=out.confidence, problem=out.problem)

    results = list(await asyncio.gather(*(read(p) for p in pages)))
    return Extracted(pages=results, text=document_text([(p.n, p.text) for p in results]))


def _doc(text: str) -> str:
    return f"<document>\n{text}\n</document>"


async def classify(ai: AiClient, text: str) -> ClassifyOutput:
    return await ai.generate(AiRequest(
        step="classify", system=CLASSIFY_SYSTEM, schema=ClassifyOutput, content=[_text(_doc(text))],
    ))


async def simplify(ai: AiClient, text: str, language: str) -> SimplifyOutput:
    return await ai.generate(AiRequest(
        step="simplify", system=simplify_system(language), schema=SimplifyOutput, content=[_text(_doc(text))],
    ))


async def extract_actions(ai: AiClient, text: str, meta: ClassifyOutput, language: str) -> list[RawAction]:
    context = (
        f"Document type: {meta.doc_type}\n"
        f"Date printed on the paper: {meta.document_date or 'none'}"
    )
    out: ActionsOutput = await ai.generate(AiRequest(
        step="actions", system=actions_system(language), schema=ActionsOutput,
        content=[_text(f"{context}\n\n{_doc(text)}")],
    ))
    return out.actions
