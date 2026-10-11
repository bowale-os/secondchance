"""Turns uploads into a list of single pages. Photos are downscaled to JPEG (HEIC included),
PDFs are split into one-page PDFs, and Word files become text. Each page is read
separately, which gives a confidence score per page and keeps every AI call small.

All upload limits live here.
"""

import asyncio
import io
from dataclasses import dataclass
from typing import Literal, Optional

import mammoth
from pypdf import PdfReader, PdfWriter
from pypdf.errors import PdfReadError

from app.extraction import ExtractionError, downscale
from app.reader.ai import UserFacingError

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_PAGES = 30

DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
ACCEPTED_MIME_TYPES = IMAGE_TYPES | {"application/pdf", DOCX}


@dataclass
class UploadFile:
    name: str
    mime_type: str
    data: bytes


@dataclass
class Page:
    n: int
    kind: Literal["image", "pdf", "text"]
    mime_type: Optional[str] = None   # image/jpeg or application/pdf
    data: Optional[bytes] = None
    text: Optional[str] = None


def _too_many() -> UserFacingError:
    return UserFacingError(
        f"That's more than {MAX_PAGES} pages. Please send {MAX_PAGES} pages or fewer at a time."
    )


async def preprocess(files: list[UploadFile]) -> list[Page]:
    if not files:
        raise UserFacingError("No pages were sent. Please take a photo or pick a file.")
    if len(files) > 1 and any(f.mime_type == DOCX for f in files):
        raise UserFacingError("Please send a Word file by itself, without photos or other files.")
    if sum(len(f.data) for f in files) > MAX_UPLOAD_BYTES:
        raise UserFacingError("These files are too big. Please send less than 20 MB at a time.")

    pages: list[Page] = []
    for f in files:
        if f.mime_type in IMAGE_TYPES:
            try:
                data, mime = await asyncio.to_thread(downscale, f.data, f.mime_type)
            except ExtractionError:
                raise UserFacingError(
                    f'We couldn\'t open "{f.name}". Try taking the photo again.'
                ) from None
            pages.append(Page(n=len(pages) + 1, kind="image", mime_type=mime, data=data))
        elif f.mime_type == "application/pdf":
            for data in await asyncio.to_thread(split_pdf, f.data, MAX_PAGES - len(pages)):
                pages.append(Page(n=len(pages) + 1, kind="pdf", mime_type="application/pdf", data=data))
        elif f.mime_type == DOCX:
            text = (await asyncio.to_thread(docx_text, f)).strip()
            if text:
                pages.append(Page(n=len(pages) + 1, kind="text", text=text))
        else:
            raise UserFacingError(
                f'"{f.name}" is not a file type we can read. Use a photo, PDF, or Word file.'
            )
        if len(pages) > MAX_PAGES:
            raise _too_many()

    if not pages:
        raise UserFacingError("These files look empty. Please try a photo of the paper.")
    return pages


def split_pdf(data: bytes, max_pages: int) -> list[bytes]:
    try:
        src = PdfReader(io.BytesIO(data))
        if src.is_encrypted:
            raise PdfReadError("encrypted")
        count = len(src.pages)
    except Exception:
        raise UserFacingError(
            "We couldn't open this PDF. If it has a password, take photos of the pages instead."
        ) from None
    if count > max_pages:
        raise _too_many()

    out = []
    for page in src.pages:
        single = PdfWriter()
        single.add_page(page)
        buf = io.BytesIO()
        single.write(buf)
        out.append(buf.getvalue())
    return out


def docx_text(f: UploadFile) -> str:
    """Typed text from a Word file. No AI call needed."""
    try:
        return mammoth.extract_raw_text(io.BytesIO(f.data)).value
    except Exception:
        raise UserFacingError(
            f'We couldn\'t open "{f.name}". Try taking a photo of the paper instead.'
        ) from None
