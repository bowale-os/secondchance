"""
schemas.py — API request/response shapes (dataclasses).

These are what FastAPI accepts and returns. They are separate from the
SQLAlchemy models in tables.py so we control exactly which fields leave the API
(e.g. Client.pin_hash is never exposed).
"""

import uuid
from dataclasses import dataclass, field, fields
from datetime import date, datetime
from decimal import Decimal
from typing import Optional

from app.tables import (
    AssignmentRole,
    BenefitStatus,
    BenefitType,
    ContactMethod,
    ContactType,
    DataSource,
    DocumentStatus,
    DocumentType,
    EmploymentStatus,
    HousingStatus,
    IdStatus,
    IdType,
    ObligationStatus,
    ObligationType,
    StaffRole,
)


def from_row(cls, row):
    """Build a response dataclass from an ORM row (only the fields the schema lists)."""
    return cls(**{f.name: getattr(row, f.name) for f in fields(cls)})


@dataclass
class HealthRead:
    status: str
    database: bool


# ============================================================
# Staff (case worker)
# ============================================================

@dataclass
class StaffSignup:
    """Body of POST /auth/signup; auth0_id comes from the verified token."""
    email: str
    full_name: str
    organization_name: Optional[str] = None
    phone: Optional[str] = None


@dataclass
class ClientLogin:
    first_name: str
    last_name: str
    pin: str


@dataclass
class ClientToken:
    access_token: str
    expires_in: int
    token_type: str = "bearer"


@dataclass
class StaffCreate:
    auth0_id: str
    email: str
    full_name: str
    organization_name: Optional[str] = None
    phone: Optional[str] = None


@dataclass
class StaffRead:
    id: uuid.UUID
    auth0_id: str
    email: str
    full_name: str
    role: StaffRole
    organization_name: Optional[str]
    phone: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============================================================
# Client
# ============================================================

@dataclass
class ClientCreate:
    first_name: str
    last_name: str
    pin: str  # raw PIN in; hashed before storing, never returned
    preferred_name: Optional[str] = None
    phone: Optional[str] = None
    language: str = "en"
    state: str = "GA"
    release_date: Optional[date] = None
    date_of_birth: Optional[date] = None
    email: Optional[str] = None
    preferred_contact_method: Optional[ContactMethod] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None
    housing_status: Optional[HousingStatus] = None
    employment_status: Optional[EmploymentStatus] = None
    monthly_income: Optional[Decimal] = None
    has_transportation: Optional[bool] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None
    # Optional child rows, so a full profile can be sent in one call
    ids: list["ClientIdCreate"] = field(default_factory=list)
    benefits: list["ClientBenefitCreate"] = field(default_factory=list)
    medications: list["ClientMedicationCreate"] = field(default_factory=list)
    obligations: list["ClientObligationCreate"] = field(default_factory=list)
    contacts: list["ClientContactCreate"] = field(default_factory=list)
    # Documents uploaded via POST /clients/extract that belong to this client
    document_ids: list[uuid.UUID] = field(default_factory=list)


@dataclass
class ClientUpdate:
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = None
    state: Optional[str] = None
    release_date: Optional[date] = None
    is_active: Optional[bool] = None
    date_of_birth: Optional[date] = None
    email: Optional[str] = None
    preferred_contact_method: Optional[ContactMethod] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None
    housing_status: Optional[HousingStatus] = None
    employment_status: Optional[EmploymentStatus] = None
    monthly_income: Optional[Decimal] = None
    has_transportation: Optional[bool] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None


@dataclass
class ClientRead:
    id: uuid.UUID
    first_name: str
    last_name: str
    preferred_name: Optional[str]
    phone: Optional[str]
    language: str
    state: str
    release_date: Optional[date]
    is_active: bool
    date_of_birth: Optional[date]
    email: Optional[str]
    preferred_contact_method: Optional[ContactMethod]
    address_line: Optional[str]
    city: Optional[str]
    zip_code: Optional[str]
    housing_status: Optional[HousingStatus]
    employment_status: Optional[EmploymentStatus]
    monthly_income: Optional[Decimal]
    has_transportation: Optional[bool]
    emergency_contact_name: Optional[str]
    emergency_contact_phone: Optional[str]
    notes: Optional[str]
    created_by_staff_id: Optional[uuid.UUID]
    created_at: datetime
    updated_at: datetime


@dataclass
class ClientLogin:
    first_name: str
    last_name: str
    pin: str


# ============================================================
# Client profile child rows (AI-filled from documents, then verified)
# ============================================================

@dataclass
class ClientIdCreate:
    id_type: IdType
    status: IdStatus = IdStatus.HELD
    expires_on: Optional[date] = None
    source_document_id: Optional[uuid.UUID] = None


@dataclass
class ClientBenefitCreate:
    benefit_type: BenefitType
    status: BenefitStatus = BenefitStatus.PENDING
    case_number: Optional[str] = None
    source_document_id: Optional[uuid.UUID] = None


@dataclass
class ClientMedicationCreate:
    name: str
    dose: Optional[str] = None
    prescriber: Optional[str] = None
    pharmacy: Optional[str] = None
    next_refill_on: Optional[date] = None
    source_document_id: Optional[uuid.UUID] = None


@dataclass
class ClientObligationCreate:
    obligation_type: ObligationType
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    due_date: Optional[date] = None
    status: ObligationStatus = ObligationStatus.OPEN
    source_document_id: Optional[uuid.UUID] = None


@dataclass
class ClientContactCreate:
    contact_type: ContactType
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    source_document_id: Optional[uuid.UUID] = None


@dataclass
class ClientIdRead:
    id: uuid.UUID
    client_id: uuid.UUID
    id_type: IdType
    status: IdStatus
    expires_on: Optional[date]
    source_document_id: Optional[uuid.UUID]
    verified: bool
    verified_by_staff_id: Optional[uuid.UUID]
    verified_at: Optional[datetime]


@dataclass
class ClientBenefitRead:
    id: uuid.UUID
    client_id: uuid.UUID
    benefit_type: BenefitType
    status: BenefitStatus
    case_number: Optional[str]
    source_document_id: Optional[uuid.UUID]
    verified: bool
    verified_by_staff_id: Optional[uuid.UUID]
    verified_at: Optional[datetime]


@dataclass
class ClientMedicationRead:
    id: uuid.UUID
    client_id: uuid.UUID
    name: str
    dose: Optional[str]
    prescriber: Optional[str]
    pharmacy: Optional[str]
    next_refill_on: Optional[date]
    source_document_id: Optional[uuid.UUID]
    verified: bool
    verified_by_staff_id: Optional[uuid.UUID]
    verified_at: Optional[datetime]


@dataclass
class ClientObligationRead:
    id: uuid.UUID
    client_id: uuid.UUID
    obligation_type: ObligationType
    description: Optional[str]
    amount: Optional[Decimal]
    due_date: Optional[date]
    status: ObligationStatus
    source_document_id: Optional[uuid.UUID]
    verified: bool
    verified_by_staff_id: Optional[uuid.UUID]
    verified_at: Optional[datetime]


@dataclass
class ClientContactRead:
    id: uuid.UUID
    client_id: uuid.UUID
    contact_type: ContactType
    name: str
    phone: Optional[str]
    email: Optional[str]
    source_document_id: Optional[uuid.UUID]
    verified: bool
    verified_by_staff_id: Optional[uuid.UUID]
    verified_at: Optional[datetime]


@dataclass
class DocumentListItem:
    """A stored document's metadata (never the file bytes or raw AI output)."""
    id: uuid.UUID
    original_filename: Optional[str]
    mime_type: Optional[str]
    size_bytes: Optional[int]
    doc_type: DocumentType
    status: DocumentStatus
    ai_summary: Optional[str]
    ai_warnings: Optional[list]
    created_at: datetime


@dataclass
class ClientDetail(ClientRead):
    """GET /clients/{id}: the client plus every profile row and document."""
    ids: list[ClientIdRead]
    benefits: list[ClientBenefitRead]
    medications: list[ClientMedicationRead]
    obligations: list[ClientObligationRead]
    contacts: list[ClientContactRead]
    documents: list[DocumentListItem]


# ============================================================
# AI extraction draft (returned for the case worker to review)
# ============================================================

@dataclass
class DocumentDraft:
    id: uuid.UUID
    original_filename: Optional[str]
    mime_type: Optional[str]
    size_bytes: Optional[int]
    doc_type: DocumentType
    ai_summary: Optional[str]
    ai_warnings: list[str]


@dataclass
class ClientDraft:
    """What Gemini read from the uploaded documents. Anything the documents did not
    say is null/empty. The case worker completes it, adds a PIN, and sends it to
    POST /clients as a ClientCreate."""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    phone: Optional[str] = None
    language: Optional[str] = None
    release_date: Optional[date] = None
    date_of_birth: Optional[date] = None
    email: Optional[str] = None
    preferred_contact_method: Optional[ContactMethod] = None
    address_line: Optional[str] = None
    city: Optional[str] = None
    zip_code: Optional[str] = None
    housing_status: Optional[HousingStatus] = None
    employment_status: Optional[EmploymentStatus] = None
    monthly_income: Optional[Decimal] = None
    has_transportation: Optional[bool] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None
    ids: list[ClientIdCreate] = field(default_factory=list)
    benefits: list[ClientBenefitCreate] = field(default_factory=list)
    medications: list[ClientMedicationCreate] = field(default_factory=list)
    obligations: list[ClientObligationCreate] = field(default_factory=list)
    contacts: list[ClientContactCreate] = field(default_factory=list)
    documents: list[DocumentDraft] = field(default_factory=list)


# ============================================================
# Assignment (case worker <-> client)
# ============================================================

@dataclass
class AssignmentCreate:
    client_id: uuid.UUID
    staff_id: uuid.UUID
    role: AssignmentRole = AssignmentRole.CASE_WORKER


@dataclass
class AssignmentRead:
    id: uuid.UUID
    client_id: uuid.UUID
    staff_id: uuid.UUID
    role: AssignmentRole
    is_active: bool
    started_on: date
    ended_on: Optional[date]
    created_at: datetime
    updated_at: datetime


# ============================================================
# Document
# ============================================================

@dataclass
class DocumentCreate:
    client_id: uuid.UUID
    storage_key: str
    source: DataSource = DataSource.CASE_WORKER
    doc_type: DocumentType = DocumentType.OTHER
    original_filename: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    uploaded_by_staff_id: Optional[uuid.UUID] = None


@dataclass
class DocumentRead:
    id: uuid.UUID
    client_id: uuid.UUID
    source: DataSource
    doc_type: DocumentType
    status: DocumentStatus
    storage_key: str
    original_filename: Optional[str]
    mime_type: Optional[str]
    size_bytes: Optional[int]
    uploaded_by_staff_id: Optional[uuid.UUID]
    ai_summary: Optional[str]
    ai_warnings: Optional[list]
    ai_raw: Optional[dict]
    processed_at: Optional[datetime]
    reviewed_by_staff_id: Optional[uuid.UUID]
    reviewed_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


@dataclass
class DocumentReview:
    """Case worker confirms (and optionally corrects) the AI reading."""
    doc_type: Optional[DocumentType] = None
    ai_summary: Optional[str] = None
    ai_warnings: Optional[list] = None


# ============================================================
# Text bot
# ============================================================

@dataclass
class BotInbound:
    """Sidecar -> backend: one (debounced) inbound message."""
    sender: str
    text: str = ""
    channel: Optional[str] = None
    attachment_count: int = 0
    message_id: Optional[str] = None


@dataclass
class BotReply:
    text: str


@dataclass
class BotInboundResult:
    replies: list[BotReply] = field(default_factory=list)


@dataclass
class TextingEnroll:
    phone: str
    consent: bool  # case worker confirms the client agreed to texts


@dataclass
class TextingStatus:
    enrolled: bool
    status: Optional[str] = None       # active | stopped | locked | revoked
    phone_last4: Optional[str] = None
    channel: Optional[str] = None
    consent_at: Optional[datetime] = None
    locked_at: Optional[datetime] = None
    welcome_sent: Optional[bool] = None
