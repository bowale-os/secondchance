"""Saving a kept paper and reading it back.

Only /reader/keep writes here, after the receipt checks pass. The simple version is
encrypted with DATA_ENCRYPTION_KEY; due dates and urgency are recomputed every time a
reading is loaded, from the client's current release date and today's date.
"""

import base64
import hashlib
import hmac
import io
from datetime import date, datetime
from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet
from PIL import Image
from pypdf import PdfReader, PdfWriter
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.extraction import downscale
from app.reader.dates import DateAnchors, finalize_actions
from app.reader.preprocess import UploadFile
from app.reader.receipt import ReceiptBody
from app.reader.schemas import (
    ActionItem,
    CamelModel,
    DocumentMeta,
    Flag,
    GlossaryEntry,
    RawAction,
    RawContact,
    RawDue,
    SimplifiedDocument,
)
from app.tables import (
    Client,
    DataSource,
    Document,
    DocumentAction,
    DocumentReading,
    DocumentStatus,
    DocumentType,
    Staff,
)

# Reader document types -> the case-worker app's document types.
DOCUMENT_TYPES = {
    "parole_conditions": DocumentType.SUPERVISION_PAPERS,
    "probation": DocumentType.SUPERVISION_PAPERS,
    "court_order": DocumentType.COURT_NOTICE,
    "benefits": DocumentType.BENEFITS_LETTER,
    "housing": DocumentType.HOUSING_AGREEMENT,
    "medical": DocumentType.MEDICAL_DISCHARGE,
    "id": DocumentType.ID_DOCUMENT,
    "child_support": DocumentType.PAYMENT_NOTICE,
}


# ---------- encryption ----------

@lru_cache
def _fernet() -> Fernet:
    key = get_settings().data_encryption_key.get_secret_value().encode()
    return Fernet(base64.urlsafe_b64encode(hmac.new(key, b"document-reading-text", hashlib.sha256).digest()))


def encrypt_text(text: str) -> str:
    return _fernet().encrypt(text.encode()).decode()


def decrypt_text(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


# ---------- the stored file ----------

def merge_pages(files: list[UploadFile]) -> tuple[bytes, str, str]:
    """One kept paper is one Document: a single upload is stored as sent, several photos
    and PDFs are combined into one PDF in page order (preprocess only lets a Word file
    come alone). Returns (bytes, mime, filename)."""
    if len(files) == 1:
        f = files[0]
        return f.data, f.mime_type, f.name
    out = PdfWriter()
    for f in files:
        if f.mime_type == "application/pdf":
            src = PdfReader(io.BytesIO(f.data))
        else:
            jpeg, _ = downscale(f.data, f.mime_type)
            buf = io.BytesIO()
            Image.open(io.BytesIO(jpeg)).save(buf, "PDF")
            src = PdfReader(io.BytesIO(buf.getvalue()))
        for page in src.pages:
            out.add_page(page)
    buf = io.BytesIO()
    out.write(buf)
    return buf.getvalue(), "application/pdf", "pages.pdf"


# ---------- save ----------

async def save_kept(
    session: AsyncSession, body: ReceiptBody, files: list[UploadFile], client: Client,
    staff: Optional[Staff], now: datetime,
) -> DocumentReading:
    data, mime, filename = merge_pages(files)
    doc = Document(
        client_id=client.id,
        source=DataSource.CASE_WORKER if staff else DataSource.CLIENT,
        uploaded_by_staff_id=staff.id if staff else None,
        doc_type=DOCUMENT_TYPES.get(body.meta.doc_type, DocumentType.OTHER),
        status=DocumentStatus.READ,   # waiting for case-worker review
        content=data,
        original_filename=filename,
        mime_type=mime,
        size_bytes=len(data),
        ai_summary=body.meta.title,
        processed_at=now,
    )
    session.add(doc)
    await session.flush()

    reading = DocumentReading(
        document_id=doc.id,
        client_id=client.id,
        language=body.language,
        doc_type=body.meta.doc_type,
        title=body.meta.title,
        issuer=body.meta.issuer,
        document_date=date.fromisoformat(body.meta.document_date) if body.meta.document_date else None,
        received_date=date.fromisoformat(body.received_date),
        simplified_encrypted=encrypt_text(body.simplified.markdown),
        glossary=[g.wire() for g in body.simplified.glossary],
        flags=[f.wire() for f in body.flags],
        reader_version=body.reader_version,
        created_by_staff_id=staff.id if staff else None,
    )
    for pos, item in enumerate(body.actions, 1):
        r = item.raw
        reading.actions.append(DocumentAction(
            client_id=client.id,
            position=pos,
            title=r.title,
            details=r.details,
            due_type=r.due.type,
            due_text=r.due.text,
            due_exact_date=date.fromisoformat(r.due.exact_date) if r.due.exact_date else None,
            due_anchor=r.due.anchor,
            due_offset_hours=r.due.offset_hours,
            due_offset_days=r.due.offset_days,
            due_business_days=r.due.business_days,
            priority=r.priority,
            consequence=r.consequence,
            location=r.location,
            contact=r.contact.model_dump() if r.contact else None,
            bring=r.bring,
            source_quote=r.source_quote,
            source_page=r.source_page,
            confidence=r.confidence,
            flags=[f.wire() for f in item.flags],
        ))
    session.add(reading)
    await session.flush()
    return reading


# ---------- load ----------

class ReadingView(CamelModel):
    id: str
    document_id: str
    language: str
    meta: DocumentMeta
    simplified: SimplifiedDocument
    actions: list[ActionItem]
    flags: list[Flag]


def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def _raw(a: DocumentAction) -> RawAction:
    return RawAction(
        order=a.position, title=a.title, details=a.details,
        due=RawDue(
            type=a.due_type, text=a.due_text, exact_date=_iso(a.due_exact_date), anchor=a.due_anchor,
            offset_hours=a.due_offset_hours, offset_days=a.due_offset_days, business_days=a.due_business_days,
        ),
        location=a.location,
        contact=RawContact(**a.contact) if a.contact else None,
        bring=a.bring or [],
        priority=a.priority,
        consequence=a.consequence,
        source_quote=a.source_quote,
        source_page=a.source_page,
        confidence=a.confidence,
    )


def load_reading(reading: DocumentReading, client: Client, today: str) -> ReadingView:
    """`reading.actions` must be loaded. Dates and urgency are worked out fresh."""
    rows = list(reading.actions)
    actions = finalize_actions(
        [_raw(a) for a in rows],
        anchors=DateAnchors(
            document_date=_iso(reading.document_date),
            release_date=_iso(client.release_date),
            received_date=_iso(reading.received_date),
        ),
        doc_type=reading.doc_type,
        today=today,
        language=reading.language,
        ids=[str(a.id) for a in rows],
    )
    by_id = {str(a.id): a for a in rows}
    actions = [
        a.model_copy(update={
            "completed": by_id[a.id].completed_at is not None,
            "completed_at": by_id[a.id].completed_at.isoformat() if by_id[a.id].completed_at else None,
        })
        for a in actions
    ]
    flags = [Flag.model_validate(f) for f in reading.flags]
    for a in rows:
        flags += [Flag.model_validate({**f, "actionId": str(a.id)}) for f in a.flags]
    return ReadingView(
        id=str(reading.id),
        document_id=str(reading.document_id),
        language=reading.language,
        meta=DocumentMeta(
            doc_type=reading.doc_type, title=reading.title, issuer=reading.issuer,
            document_date=_iso(reading.document_date),
        ),
        simplified=SimplifiedDocument(
            markdown=decrypt_text(reading.simplified_encrypted),
            glossary=[GlossaryEntry.model_validate(g) for g in reading.glossary],
        ),
        actions=actions,
        flags=flags,
    )

