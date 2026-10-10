import uuid
from dataclasses import fields
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_staff
from app.db import get_session
from app.extraction import (
    ALLOWED_MIME,
    MAX_FILE_BYTES,
    MAX_FILES,
    ExtractionError,
    extract,
    to_decimal,
)
from app.schemas import (
    ClientBenefitCreate,
    ClientBenefitRead,
    ClientContactRead,
    ClientDetail,
    ClientIdRead,
    ClientMedicationRead,
    ClientObligationRead,
    DocumentListItem,
    ClientContactCreate,
    ClientCreate,
    ClientDraft,
    ClientIdCreate,
    ClientMedicationCreate,
    ClientObligationCreate,
    ClientRead,
    DocumentDraft,
    from_row,
)
from app.security import hash_pin_async
from app.tables import (
    Assignment,
    Client,
    ClientBenefit,
    ClientContact,
    ClientId,
    ClientMedication,
    ClientObligation,
    DataSource,
    Document,
    DocumentStatus,
    DocumentType,
    Staff,
)

router = APIRouter(prefix="/clients", tags=["clients"])


@router.get("", response_model=list[ClientRead])
async def list_my_clients(
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> list[ClientRead]:
    """All active clients actively assigned to the logged-in case worker ([] if none)."""
    stmt = (
        select(Client)
        .join(Assignment, Assignment.client_id == Client.id)
        .where(
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
            Client.is_active.is_(True),
        )
        .order_by(Client.last_name, Client.first_name)
        .distinct()
    )
    clients = (await session.scalars(stmt)).all()
    return [from_row(ClientRead, c) for c in clients]


def _validate(payload: ClientCreate) -> None:
    if not (payload.pin.isascii() and payload.pin.isdigit() and 4 <= len(payload.pin) <= 8):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "PIN must be 4-8 digits")
    if not payload.first_name.strip() or not payload.last_name.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Name is required")


def _rows(model, items, staff_id) -> list:
    """ORM rows from child dataclasses. The case worker reviewed these before
    submitting, so they start out verified by that case worker."""
    now = datetime.now(timezone.utc)
    return [
        model(
            **{f.name: getattr(i, f.name) for f in fields(i)},
            verified=True,
            verified_by_staff_id=staff_id,
            verified_at=now,
        )
        for i in items
    ]


@router.get("/{client_id}", response_model=ClientDetail)
async def get_client(
    client_id: uuid.UUID,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> ClientDetail:
    """One of my clients with all profile rows (and whether each is verified) and documents."""
    client = await session.scalar(
        select(Client)
        .join(Assignment, Assignment.client_id == Client.id)
        .where(
            Client.id == client_id,
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
        )
        .options(
            selectinload(Client.ids),
            selectinload(Client.benefits),
            selectinload(Client.medications),
            selectinload(Client.obligations),
            selectinload(Client.contacts),
            selectinload(Client.documents),
        )
    )
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    base = {f.name: getattr(client, f.name) for f in fields(ClientRead)}
    return ClientDetail(
        **base,
        ids=[from_row(ClientIdRead, r) for r in client.ids],
        benefits=[from_row(ClientBenefitRead, r) for r in client.benefits],
        medications=[from_row(ClientMedicationRead, r) for r in client.medications],
        obligations=[from_row(ClientObligationRead, r) for r in client.obligations],
        contacts=[from_row(ClientContactRead, r) for r in client.contacts],
        documents=[
            from_row(DocumentListItem, d)
            for d in sorted(client.documents, key=lambda d: d.created_at)
        ],
    )


@router.post("/{client_id}/confirm-all")
async def confirm_all_rows(
    client_id: uuid.UUID,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Mark every unverified profile row of one of my clients as verified by me."""
    assigned = await session.scalar(
        select(Assignment.id).where(
            Assignment.client_id == client_id,
            Assignment.staff_id == staff.id,
            Assignment.is_active.is_(True),
        )
    )
    if assigned is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    now = datetime.now(timezone.utc)
    confirmed = 0
    for model in (ClientId, ClientBenefit, ClientMedication, ClientObligation, ClientContact):
        result = await session.execute(
            update(model)
            .where(model.client_id == client_id, model.verified.is_(False))
            .values(verified=True, verified_by_staff_id=staff.id, verified_at=now)
        )
        confirmed += result.rowcount
    await session.commit()
    return {"confirmed": confirmed}


@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientCreate,
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> ClientRead:
    """Create a client, assign them to the logged-in case worker, and store any
    profile rows (ids, benefits, medications, obligations, contacts) sent with it."""
    _validate(payload)
    if payload.phone and await session.scalar(select(Client.id).where(Client.phone == payload.phone)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone number already in use")

    # Documents from /clients/extract: must be this case worker's and not yet attached
    wanted = set(payload.document_ids)
    documents = (
        (
            await session.scalars(
                select(Document).where(
                    Document.id.in_(wanted),
                    Document.uploaded_by_staff_id == staff.id,
                    Document.client_id.is_(None),
                )
            )
        ).all()
        if wanted
        else []
    )
    if len(documents) != len(wanted):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown or already-used document")
    for child in (*payload.ids, *payload.benefits, *payload.medications, *payload.obligations, *payload.contacts):
        if child.source_document_id is not None and child.source_document_id not in wanted:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Row refers to a document not in document_ids"
            )

    child_keys = {"pin", "ids", "benefits", "medications", "obligations", "contacts", "document_ids"}
    client = Client(
        **{f.name: getattr(payload, f.name) for f in fields(payload) if f.name not in child_keys},
        pin_hash=await hash_pin_async(payload.pin),
        created_by_staff_id=staff.id,
    )
    client.assignments.append(Assignment(staff_id=staff.id))
    client.ids = _rows(ClientId, payload.ids, staff.id)
    client.benefits = _rows(ClientBenefit, payload.benefits, staff.id)
    client.medications = _rows(ClientMedication, payload.medications, staff.id)
    client.obligations = _rows(ClientObligation, payload.obligations, staff.id)
    client.contacts = _rows(ClientContact, payload.contacts, staff.id)
    now = datetime.now(timezone.utc)
    for doc in documents:  # the case worker reviewed these by creating the client
        doc.status = DocumentStatus.CONFIRMED
        doc.reviewed_by_staff_id = staff.id
        doc.reviewed_at = now
        client.documents.append(doc)

    session.add(client)
    try:
        await session.commit()
    except IntegrityError:  # lost a race on the unique phone number
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Phone number already in use")
    await session.refresh(client)
    return from_row(ClientRead, client)


@router.post("/extract", response_model=ClientDraft)
async def extract_client_draft(
    files: list[UploadFile] = File(...),
    staff: Staff = Depends(get_current_staff),
    session: AsyncSession = Depends(get_session),
) -> ClientDraft:
    """Read the uploaded documents with Gemini and return a draft client profile.

    The files are saved (unattached) so POST /clients can link them to the client
    once the case worker has reviewed the draft; nothing else is created here.
    """
    if not files or len(files) > MAX_FILES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Send 1-{MAX_FILES} files")
    blobs: list[tuple[str, str, bytes]] = []
    for f in files:
        data = await f.read()
        if f.content_type not in ALLOWED_MIME:
            raise HTTPException(
                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, f"{f.filename}: use PDF, PNG, JPEG, WebP or HEIC"
            )
        if not data or len(data) > MAX_FILE_BYTES:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE, f"{f.filename}: must be 1 byte to {MAX_FILE_BYTES // 2**20} MB"
            )
        blobs.append((f.filename or "upload", f.content_type, data))

    docs = [
        Document(
            client_id=None,
            source=DataSource.CASE_WORKER,
            uploaded_by_staff_id=staff.id,
            status=DocumentStatus.PROCESSING,
            content=data,
            original_filename=name,
            mime_type=mime,
            size_bytes=len(data),
        )
        for name, mime, data in blobs
    ]
    session.add_all(docs)
    await session.flush()  # assigns ids

    try:
        result = await extract(blobs)
    except ExtractionError:
        await session.rollback()  # do not keep files from a failed read
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not read the documents; please try again")

    now = datetime.now(timezone.utc)
    by_file = {x.file: x for x in result.files}
    drafts: list[DocumentDraft] = []
    for i, doc in enumerate(docs):
        info = by_file.get(i)
        doc.doc_type = info.doc_type if info else DocumentType.OTHER
        doc.ai_summary = info.summary if info else None
        doc.ai_warnings = list(info.warnings) if info else []
        doc.ai_raw = result.model_dump(mode="json")
        doc.status = DocumentStatus.READ
        doc.processed_at = now
        drafts.append(
            DocumentDraft(
                id=doc.id,
                original_filename=doc.original_filename,
                mime_type=doc.mime_type,
                size_bytes=doc.size_bytes,
                doc_type=doc.doc_type,
                ai_summary=doc.ai_summary,
                ai_warnings=doc.ai_warnings,
            )
        )
    await session.commit()

    def src(row) -> dict:
        """Child fields for the draft, with source_file turned into a document id."""
        d = row.model_dump(exclude={"source_file"})
        d["source_document_id"] = docs[row.source_file].id if 0 <= row.source_file < len(docs) else None
        return d

    scalar_keys = [
        k for k in ClientDraft.__dataclass_fields__
        if k not in {"ids", "benefits", "medications", "obligations", "contacts", "documents", "monthly_income"}
    ]
    return ClientDraft(
        **{k: getattr(result, k) for k in scalar_keys},
        monthly_income=to_decimal(result.monthly_income),
        ids=[ClientIdCreate(**src(r)) for r in result.ids],
        benefits=[ClientBenefitCreate(**src(r)) for r in result.benefits],
        medications=[ClientMedicationCreate(**src(r)) for r in result.medications],
        obligations=[
            ClientObligationCreate(**{**src(r), "amount": to_decimal(r.amount)}) for r in result.obligations
        ],
        contacts=[ClientContactCreate(**src(r)) for r in result.contacts],
        documents=drafts,
    )
