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
from typing import Any, Literal, Optional, Union

from pydantic import TypeAdapter

from app.ingest.common import street_key

from app.tables import (
    AccessMethod,
    AddictionSetting,
    AssignmentRole,
    BenefitStatus,
    BenefitType,
    Confidence,
    ContactMethod,
    ContactType,
    CostType,
    DataSource,
    DocumentStatus,
    DocumentType,
    EmploymentStatus,
    FieldSource,
    FoodKind,
    Gender,
    HousingStatus,
    IdStatus,
    IdType,
    ObligationStatus,
    ObligationType,
    RecordsPolicy,
    RequiredDocument,
    ResourceCategory,
    ScrapeSource,
    StaffRole,
    Tri,
    VerificationStatus,
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
# Community resources (mirrors frontend/src/types/resource.types.ts)
# ============================================================

TRANSIT_RADIUS_M = 1609  # "close to public transportation" = within 1 mile


@dataclass
class LatLng:
    lat: float
    lng: float


@dataclass
class Address:
    street: str
    city: str
    state: str = "GA"
    zip: str = ""


@dataclass
class OpeningHours:
    day: int  # 0 = Monday, same as datetime.weekday()
    opens: str  # "HH:MM", 24-hour, local
    closes: str
    label: Optional[str] = None  # e.g. "Bed check-in"

    def __post_init__(self):
        if not 0 <= self.day <= 6:
            raise ValueError(f"day must be 0-6, got {self.day}")
        for t in (self.opens, self.closes):
            hh, _, mm = t.partition(":")
            if not (hh.isdigit() and mm.isdigit() and int(hh) < 24 and int(mm) < 60):
                raise ValueError(f"time must be HH:MM, got {t!r}")


@dataclass
class TransitStop:
    stop_name: str
    lat: float
    lng: float
    distance_m: float  # straight-line
    routes: list[str] = field(default_factory=list)


@dataclass
class FieldMeta:
    """How one uncertain field got its value."""
    source: FieldSource
    confidence: Confidence = Confidence.LOW
    confirmed_at: Optional[datetime] = None


# ---- Category details (stored in resources.details) ----

@dataclass
class ShelterDetails:
    check_in_time: Optional[str] = None
    curfew: Optional[str] = None
    max_stay_days: Optional[int] = None
    sober_required: Tri = Tri.UNKNOWN


@dataclass
class FoodDetails:
    kind: list[FoodKind] = field(default_factory=list)
    visit_limit: Optional[str] = None  # e.g. "Once per week"


@dataclass
class JobStep:
    title: str  # e.g. "Gather documents"
    detail: str  # plain-language instructions
    documents: list[RequiredDocument] = field(default_factory=list)  # matched against document_checks


@dataclass
class JobDetails:
    employer: str = ""
    pay_note: Optional[str] = None  # e.g. "$15-17/hr"
    shift_note: Optional[str] = None  # e.g. "Early mornings"
    apply_url: Optional[str] = None
    steps: list[JobStep] = field(default_factory=list)  # empty = frontend shows default steps


@dataclass
class AddictionDetails:
    setting: list[AddictionSetting] = field(default_factory=list)
    medication_assisted: Tri = Tri.UNKNOWN


@dataclass
class ClassEventDetails:
    """Used for both CLASSES and EVENTS."""
    starts_at: Optional[datetime] = None  # None if ongoing
    ends_at: Optional[datetime] = None
    recurrence: Optional[str] = None  # plain text, e.g. "Every Thursday"
    signup_required: Tri = Tri.UNKNOWN


ResourceDetails = Union[ShelterDetails, FoodDetails, JobDetails, AddictionDetails, ClassEventDetails]

DETAILS_FOR: dict[ResourceCategory, type] = {
    ResourceCategory.SHELTER: ShelterDetails,
    ResourceCategory.FOOD: FoodDetails,
    ResourceCategory.JOBS: JobDetails,
    ResourceCategory.ADDICTION: AddictionDetails,
    ResourceCategory.CLASSES: ClassEventDetails,
    ResourceCategory.EVENTS: ClassEventDetails,
}


def coerce_details(category: ResourceCategory, details: Any) -> ResourceDetails:
    """Return details as the dataclass that matches `category` (None -> all-unknown defaults)."""
    expected = DETAILS_FOR[category]
    if details is None:
        return expected()
    if isinstance(details, expected):
        return details
    if isinstance(details, dict):
        return TypeAdapter(expected).validate_python(details)
    raise TypeError(f"{category.value} needs {expected.__name__}, got {type(details).__name__}")


# ---- What a scraper produces ----

@dataclass
class ResourceUpsert:
    """
    Normalized scrape result. Only name, category and source are required: anything the
    page did not say stays UNKNOWN / None. near_transit and nearest_stops are not set
    here; they are computed after geocoding.
    """
    name: str
    category: ResourceCategory
    source: ScrapeSource

    description: Optional[str] = None
    address: Optional[Address] = None
    location: Optional[LatLng] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    hours: list[OpeningHours] = field(default_factory=list)
    hours_note: Optional[str] = None

    gender: Gender = Gender.UNKNOWN
    families_welcome: Tri = Tri.UNKNOWN
    records_policy: RecordsPolicy = RecordsPolicy.UNKNOWN
    restrictions_note: Optional[str] = None
    languages: list[str] = field(default_factory=list)
    cost_type: CostType = CostType.UNKNOWN
    access_methods: list[AccessMethod] = field(default_factory=list)
    required_documents: list[RequiredDocument] = field(default_factory=list)

    details: Optional[ResourceDetails] = None

    source_url: Optional[str] = None
    scraped_at: Optional[datetime] = None
    field_meta: dict[str, FieldMeta] = field(default_factory=dict)

    def __post_init__(self):
        self.details = coerce_details(self.category, self.details)

    def dedupe_key(self) -> str:
        """Same place from two sources should collapse to one row."""
        def norm(s: str) -> str:
            return "".join(c for c in s.lower() if c.isalnum())

        street = street_key(self.address.street) if self.address else ""
        # no street: fall back to ~100 m of position, so two branches with one name stay apart
        where = street or (f"{self.location.lat:.3f},{self.location.lng:.3f}" if self.location else "")
        return f"{self.category.value}:{norm(self.name)}:{where}"[:300]


def _json(value: Any) -> Any:
    """Dataclasses/enums/datetimes -> plain JSON values, for the JSON columns."""
    return TypeAdapter(Any).dump_python(value, mode="json")


def resource_columns(r: ResourceUpsert) -> dict[str, Any]:
    """Column values for `resources`, ready for insert or update. Leaves verification,
    near_transit and nearest_stops out, so a re-scrape does not undo a case worker's review."""
    return {
        "dedupe_key": r.dedupe_key(),
        "name": r.name,
        "category": r.category,
        "description": r.description,
        "address": _json(r.address),
        "lat": r.location.lat if r.location else None,
        "lng": r.location.lng if r.location else None,
        "phone": r.phone,
        "website": r.website,
        "hours": _json(r.hours),
        "hours_note": r.hours_note,
        "starts_at": getattr(r.details, "starts_at", None),
        "gender": r.gender,
        "families_welcome": r.families_welcome,
        "records_policy": r.records_policy,
        "restrictions_note": r.restrictions_note,
        "languages": r.languages,
        "cost_type": r.cost_type,
        "access_methods": _json(r.access_methods),
        "required_documents": _json(r.required_documents),
        "requires_id": bool(r.required_documents),
        "details": _json(r.details),
        "source": r.source,
        "source_url": r.source_url,
        "scraped_at": r.scraped_at,
        "field_meta": _json(r.field_meta),
    }


# ---- What the API returns ----

@dataclass
class ResourceSummary:
    """A card and a map pin. Address and phone stay in ResourceRead."""
    id: uuid.UUID
    name: str
    category: ResourceCategory
    location: Optional[LatLng]
    distance_m: Optional[float]  # from the query's origin
    near_transit: Optional[bool]
    open_now: Optional[bool]  # None = hours unknown
    starts_at: Optional[datetime]
    verification: VerificationStatus


@dataclass
class DocumentCheck:
    document: RequiredDocument
    status: Literal["have", "missing", "expired"]


@dataclass
class ResourceRead:
    id: uuid.UUID
    name: str
    category: ResourceCategory
    description: Optional[str]
    address: Optional[Address]
    location: Optional[LatLng]
    phone: Optional[str]
    website: Optional[str]
    hours: list[OpeningHours]
    hours_note: Optional[str]
    gender: Gender
    families_welcome: Tri
    records_policy: RecordsPolicy
    restrictions_note: Optional[str]
    languages: list[str]
    cost_type: CostType
    access_methods: list[AccessMethod]
    required_documents: list[RequiredDocument]
    near_transit: Optional[bool]
    nearest_stops: list[TransitStop]
    details: ResourceDetails
    verification: VerificationStatus
    source_url: Optional[str]
    last_verified_at: Optional[datetime]
    updated_at: datetime
    field_meta: dict[str, FieldMeta]
    # Computed per request, not stored
    document_checks: Optional[list[DocumentCheck]] = None  # only in a client context


def _load(tp: Any, value: Any) -> Any:
    return TypeAdapter(tp).validate_python(value)


def _location(row) -> Optional[LatLng]:
    return LatLng(row.lat, row.lng) if row.lat is not None and row.lng is not None else None


def resource_summary(row, *, distance_m: Optional[float] = None, open_now: Optional[bool] = None) -> ResourceSummary:
    return ResourceSummary(
        id=row.id,
        name=row.name,
        category=row.category,
        location=_location(row),
        distance_m=distance_m,
        near_transit=row.near_transit,
        open_now=open_now,
        starts_at=row.starts_at,
        verification=row.verification,
    )


def resource_read(row, *, document_checks: Optional[list[DocumentCheck]] = None) -> ResourceRead:
    return ResourceRead(
        id=row.id,
        name=row.name,
        category=row.category,
        description=row.description,
        address=_load(Optional[Address], row.address),
        location=_location(row),
        phone=row.phone,
        website=row.website,
        hours=_load(list[OpeningHours], row.hours or []),
        hours_note=row.hours_note,
        gender=row.gender,
        families_welcome=row.families_welcome,
        records_policy=row.records_policy,
        restrictions_note=row.restrictions_note,
        languages=row.languages or [],
        cost_type=row.cost_type,
        access_methods=_load(list[AccessMethod], row.access_methods or []),
        required_documents=_load(list[RequiredDocument], row.required_documents or []),
        near_transit=row.near_transit,
        nearest_stops=_load(list[TransitStop], row.nearest_stops or []),
        details=_load(DETAILS_FOR[row.category], row.details or {}),
        verification=row.verification,
        source_url=row.source_url,
        last_verified_at=row.last_verified_at,
        updated_at=row.updated_at,
        field_meta=_load(dict[str, FieldMeta], row.field_meta or {}),
        document_checks=document_checks,
    )


# ---- Search ----

@dataclass
class ResourceQuery:
    """Filters never exclude on UNKNOWN; only on a definite mismatch."""
    q: Optional[str] = None
    categories: Optional[list[ResourceCategory]] = None
    near_transit: Optional[bool] = None
    open_now: Optional[bool] = None
    no_id_required: Optional[bool] = None
    records_accepted: Optional[bool] = None  # accepted or case_by_case
    gender: Optional[Gender] = None
    families: Optional[bool] = None
    free_only: Optional[bool] = None
    language: Optional[str] = None
    origin: Optional[LatLng] = None  # client address or office
    radius_m: Optional[float] = None
    starts_within_days: Optional[int] = None  # classes/events starting in the next N days
    cursor: Optional[str] = None


@dataclass
class ResourceSearchResponse:
    items: list[ResourceSummary]
    total: int
    next_cursor: Optional[str] = None


# ---- Client matching ----

@dataclass
class AppliedFilter:
    key: str  # a ResourceQuery field name
    reason: str  # "profile" | "manual"


@dataclass
class ClientResourceMatch:
    query: ResourceQuery
    applied: list[AppliedFilter]
    results: ResourceSearchResponse
