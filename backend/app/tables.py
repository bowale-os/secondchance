"""
models.py — SQLAlchemy 2.0 models (phase 1)
Scope: case worker accounts, client accounts, assignments, document upload.

Install:  pip install sqlalchemy psycopg[binary]
"""

import enum
import uuid
from datetime import date, datetime, time
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ============================================================
# Enums
# ============================================================

class StaffRole(enum.Enum):
    CASE_WORKER = "case_worker"


class AssignmentRole(enum.Enum):
    CASE_WORKER = "case_worker"


class DataSource(enum.Enum):
    CASE_WORKER = "case_worker"   # case worker scanned/uploaded it
    CLIENT = "client"             # client sent it (web or text photo)


class DocumentType(enum.Enum):
    # Most common + highest stakes (deadlines that can cause a violation)
    SUPERVISION_PAPERS = "supervision_papers"    # parole certificate/agreement, probation order,
                                                 # conditions, reporting instructions
    COURT_NOTICE = "court_notice"                # hearing dates, summons, court orders
    PAYMENT_NOTICE = "payment_notice"            # supervision fees, restitution, fines,
                                                 # payment plans, child support orders
    MONTHLY_REPORT = "monthly_report"            # recurring form the AI can pre-fill

    # Received by almost everyone at release
    RELEASE_PAPERS = "release_papers"            # release/discharge packet, pre-release plan

    # Health (hidden unless the client shares the HEALTH category)
    MEDICAL_DISCHARGE = "medical_discharge"      # medication release, refills, follow-up
                                                 # appointments, treatment referrals

    # Rebuilding life
    BENEFITS_LETTER = "benefits_letter"          # Medicaid, SNAP, Lifeline approvals/renewals
    ID_DOCUMENT = "id_document"                  # birth certificate, SSN card, state ID
    HOUSING_AGREEMENT = "housing_agreement"      # halfway house rules, shelter intake, lease
    PROGRAM_CERTIFICATE = "program_certificate"  # GED, classes, job training (helps job search)

    OTHER = "other"


class DocumentStatus(enum.Enum):
    UPLOADED = "uploaded"       # file saved
    PROCESSING = "processing"   # AI reading it
    READ = "read"               # AI done, waiting for case worker review
    CONFIRMED = "confirmed"     # case worker reviewed it
    FAILED = "failed"


class ContactMethod(enum.Enum):
    SMS = "sms"
    CALL = "call"
    WEB = "web"


class HousingStatus(enum.Enum):
    HOUSED = "housed"
    SHELTER = "shelter"
    TRANSITIONAL = "transitional"
    WITH_FAMILY = "with_family"
    UNSTABLE = "unstable"
    HOMELESS = "homeless"


class EmploymentStatus(enum.Enum):
    EMPLOYED = "employed"
    SEEKING = "seeking"
    NOT_WORKING = "not_working"
    DISABLED = "disabled"
    STUDENT = "student"


class IdType(enum.Enum):
    STATE_ID = "state_id"
    SSN_CARD = "ssn_card"
    BIRTH_CERTIFICATE = "birth_certificate"
    OTHER = "other"


class IdStatus(enum.Enum):
    HELD = "held"
    LOST = "lost"
    EXPIRED = "expired"
    APPLIED = "applied"


class BenefitType(enum.Enum):
    SNAP = "snap"
    MEDICAID = "medicaid"
    SSI = "ssi"
    OTHER = "other"


class BenefitStatus(enum.Enum):
    ACTIVE = "active"
    PENDING = "pending"
    DENIED = "denied"
    EXPIRED = "expired"
    NOT_APPLIED = "not_applied"


class ObligationType(enum.Enum):
    FEE = "fee"
    COURT_DATE = "court_date"
    CHECK_IN = "check_in"
    REPORT = "report"
    OTHER = "other"  # anything else a client adds to their own calendar


class ObligationStatus(enum.Enum):
    OPEN = "open"
    DONE = "done"
    OVERDUE = "overdue"


class ContactType(enum.Enum):
    PAROLE_OFFICER = "parole_officer"
    DOCTOR = "doctor"
    LANDLORD = "landlord"
    EMPLOYER = "employer"
    OTHER = "other"


# ---- Community resources (mirrors frontend/src/types/resource.types.ts) ----

class ResourceCategory(enum.Enum):
    SHELTER = "shelter"
    FOOD = "food"
    JOBS = "jobs"  # fair-chance employers
    ADDICTION = "addiction"
    CLASSES = "classes"
    EVENTS = "events"


class Tri(enum.Enum):
    """A yes/no fact the scrape may not have found. UNKNOWN is not NO:
    filters only exclude on NO, and the UI shows UNKNOWN as "call to confirm"."""
    YES = "yes"
    NO = "no"
    UNKNOWN = "unknown"


class Gender(enum.Enum):
    MEN = "men"
    WOMEN = "women"
    ANY = "any"
    UNKNOWN = "unknown"


class CostType(enum.Enum):
    FREE = "free"
    SLIDING_SCALE = "sliding_scale"
    FEE = "fee"
    UNKNOWN = "unknown"


class RecordsPolicy(enum.Enum):
    """Whether the place takes people with a criminal record. Rarely stated online."""
    ACCEPTED = "accepted"
    CASE_BY_CASE = "case_by_case"
    NOT_ACCEPTED = "not_accepted"
    UNKNOWN = "unknown"


class VerificationStatus(enum.Enum):
    UNVERIFIED = "unverified"   # scraped, no human has looked
    VERIFIED = "verified"       # a case worker confirmed it
    FLAGGED = "flagged"         # reported wrong or out of date


class ScrapeSource(enum.Enum):
    # Official / structured
    SAMHSA = "samhsa"                        # FindTreatment.gov (addiction)
    HRSA = "hrsa"                            # federally funded health centers
    LSC = "lsc"                              # federally funded legal aid
    GOV_OFFICE = "gov_office"                # SSA, DMV/driver services, vital records
    TWO_ONE_ONE = "two_one_one"              # 211 / Open Referral (HSDS) feeds

    # Local / community
    CONTINUUM_OF_CARE = "continuum_of_care"  # local homeless system shelter lists
    FOOD_BANK = "food_bank"                  # food bank partner pantries
    REENTRY_GUIDE = "reentry_guide"          # state DOC / reentry council guides
    MEETING_GUIDE = "meeting_guide"          # AA / NA / recovery meetings
    EVENT_CALENDAR = "event_calendar"        # library and city calendars
    ORG_WEBSITE = "org_website"              # the organization's own site
    OSM = "osm"                              # OpenStreetMap (supplementary)
    FEED_AMERICA = "feed_america"            # feedam.org food directory (CC BY 4.0)

    # Manual
    CURATED_IMPORT = "curated_import"        # hand-checked CSV/JSON seed
    CASE_WORKER = "case_worker"              # entered in the app
    OTHER = "other"


# The enums below live only inside the JSON columns of `resources`, so they have no DB type.

class AccessMethod(enum.Enum):
    WALK_IN = "walk_in"
    APPOINTMENT = "appointment"
    REFERRAL_REQUIRED = "referral_required"
    PHONE_ONLY = "phone_only"


class RequiredDocument(enum.Enum):
    PHOTO_ID = "photo_id"
    SSN_CARD = "ssn_card"
    BIRTH_CERTIFICATE = "birth_certificate"
    PROOF_OF_INCOME = "proof_of_income"
    PROOF_OF_ADDRESS = "proof_of_address"
    RELEASE_PAPERS = "release_papers"
    REFERRAL_LETTER = "referral_letter"


class FieldSource(enum.Enum):
    SCRAPED = "scraped"
    LLM = "llm"
    CASE_WORKER = "case_worker"
    CLIENT_REPORT = "client_report"


class Confidence(enum.Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class FoodKind(enum.Enum):
    PANTRY = "pantry"
    HOT_MEAL = "hot_meal"
    SNAP_HELP = "snap_help"


class AddictionSetting(enum.Enum):
    OUTPATIENT = "outpatient"
    INPATIENT = "inpatient"
    SUPPORT_GROUP = "support_group"


# ============================================================
# Base + mixins
# ============================================================

class Base(DeclarativeBase):
    pass


class IdMixin:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ============================================================
# Case worker account
# ============================================================

class Staff(IdMixin, TimestampMixin, Base):
    __tablename__ = "staff"

    auth0_id: Mapped[str] = mapped_column(String(128), unique=True)  # from Auth0 login
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(200))
    role: Mapped[StaffRole] = mapped_column(default=StaffRole.CASE_WORKER)
    organization_name: Mapped[Optional[str]] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    assignments: Mapped[list["Assignment"]] = relationship(back_populates="staff")
    uploaded_documents: Mapped[list["Document"]] = relationship(
        back_populates="uploaded_by", foreign_keys="Document.uploaded_by_staff_id"
    )


# ============================================================
# Client account
# ============================================================

class Client(IdMixin, TimestampMixin, Base):
    """
    Created by a case worker. Deliberately NO criminal history or charge fields.
    """
    __tablename__ = "clients"

    first_name: Mapped[str] = mapped_column(String(100))
    last_name: Mapped[str] = mapped_column(String(100))
    preferred_name: Mapped[Optional[str]] = mapped_column(String(100))

    # Login for web, text and call: name + PIN (hash only, never the raw PIN)
    pin_hash: Mapped[str] = mapped_column(String(255))
    pin_failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    pin_locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    phone: Mapped[Optional[str]] = mapped_column(String(20), unique=True)
    language: Mapped[str] = mapped_column(String(10), default="en")
    state: Mapped[str] = mapped_column(String(2), default="GA")
    release_date: Mapped[Optional[date]] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Profile: single-valued facts the AI agent needs to answer questions
    date_of_birth: Mapped[Optional[date]] = mapped_column(Date)
    email: Mapped[Optional[str]] = mapped_column(String(255))
    preferred_contact_method: Mapped[Optional[ContactMethod]] = mapped_column()
    address_line: Mapped[Optional[str]] = mapped_column(String(255))
    city: Mapped[Optional[str]] = mapped_column(String(100))
    zip_code: Mapped[Optional[str]] = mapped_column(String(10))
    housing_status: Mapped[Optional[HousingStatus]] = mapped_column()
    employment_status: Mapped[Optional[EmploymentStatus]] = mapped_column()
    monthly_income: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    has_transportation: Mapped[Optional[bool]] = mapped_column(Boolean)
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(200))
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(20))
    notes: Mapped[Optional[str]] = mapped_column(Text)  # case worker context for the agent

    created_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )

    assignments: Mapped[list["Assignment"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    ids: Mapped[list["ClientId"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    benefits: Mapped[list["ClientBenefit"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    medications: Mapped[list["ClientMedication"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    obligations: Mapped[list["ClientObligation"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    contacts: Mapped[list["ClientContact"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )
    appointments: Mapped[list["Appointment"]] = relationship(
        back_populates="client", cascade="all, delete-orphan"
    )

    @property
    def display_name(self) -> str:
        return self.preferred_name or self.first_name


# ============================================================
# Link: one case worker -> many clients
# ============================================================

class Assignment(IdMixin, TimestampMixin, Base):
    __tablename__ = "assignments"
    __table_args__ = (
        UniqueConstraint("client_id", "staff_id", "role", name="uq_assignment"),
    )

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    staff_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("staff.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[AssignmentRole] = mapped_column(default=AssignmentRole.CASE_WORKER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    started_on: Mapped[date] = mapped_column(Date, server_default=func.current_date())
    ended_on: Mapped[Optional[date]] = mapped_column(Date)

    client: Mapped["Client"] = relationship(back_populates="assignments")
    staff: Mapped["Staff"] = relationship(back_populates="assignments")


# ============================================================
# Document upload
# ============================================================

class Document(IdMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    # NULL while a case worker is still reviewing the draft: documents are uploaded
    # and read before the client exists, then attached when the client is created.
    client_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    source: Mapped[DataSource] = mapped_column(default=DataSource.CASE_WORKER)
    uploaded_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )

    doc_type: Mapped[DocumentType] = mapped_column(default=DocumentType.OTHER)
    status: Mapped[DocumentStatus] = mapped_column(default=DocumentStatus.UPLOADED)

    # File bytes live in Postgres (deferred: only loaded when explicitly requested).
    # storage_key stays for a future move to object storage.
    content: Mapped[Optional[bytes]] = mapped_column(LargeBinary, deferred=True)
    storage_key: Mapped[Optional[str]] = mapped_column(String(500))
    original_filename: Mapped[Optional[str]] = mapped_column(String(255))
    mime_type: Mapped[Optional[str]] = mapped_column(String(100))
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer)

    # AI reading results (filled in after upload)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text)      # plain-language summary
    ai_warnings: Mapped[Optional[list]] = mapped_column(JSON)    # e.g. ["$250 due Nov 3"]
    ai_raw: Mapped[Optional[dict]] = mapped_column(JSON)         # full structured extraction
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Case worker review
    reviewed_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    client: Mapped[Optional["Client"]] = relationship(back_populates="documents")
    uploaded_by: Mapped[Optional["Staff"]] = relationship(
        back_populates="uploaded_documents", foreign_keys=[uploaded_by_staff_id]
    )

# ============================================================
# Client profile child tables (filled by AI from documents,
# then verified by the case worker)
# ============================================================

class ProvenanceMixin:
    """Where a row came from and whether a case worker has confirmed it."""

    source_document_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), index=True
    )
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    verified_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class ClientId(IdMixin, TimestampMixin, ProvenanceMixin, Base):
    """Which identity documents the client holds."""
    __tablename__ = "client_ids"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    id_type: Mapped[IdType] = mapped_column()
    status: Mapped[IdStatus] = mapped_column(default=IdStatus.HELD)
    expires_on: Mapped[Optional[date]] = mapped_column(Date)

    client: Mapped["Client"] = relationship(back_populates="ids")


class ClientBenefit(IdMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "client_benefits"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    benefit_type: Mapped[BenefitType] = mapped_column()
    status: Mapped[BenefitStatus] = mapped_column(default=BenefitStatus.PENDING)
    case_number: Mapped[Optional[str]] = mapped_column(String(100))

    client: Mapped["Client"] = relationship(back_populates="benefits")


class ClientMedication(IdMixin, TimestampMixin, ProvenanceMixin, Base):
    __tablename__ = "client_medications"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200))
    dose: Mapped[Optional[str]] = mapped_column(String(100))
    prescriber: Mapped[Optional[str]] = mapped_column(String(200))
    pharmacy: Mapped[Optional[str]] = mapped_column(String(200))
    next_refill_on: Mapped[Optional[date]] = mapped_column(Date)

    client: Mapped["Client"] = relationship(back_populates="medications")


class ClientObligation(IdMixin, TimestampMixin, ProvenanceMixin, Base):
    """Fees, court dates, check-ins, reports: things the client must do or pay."""
    __tablename__ = "client_obligations"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    obligation_type: Mapped[ObligationType] = mapped_column()
    description: Mapped[Optional[str]] = mapped_column(Text)
    amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2))
    due_date: Mapped[Optional[date]] = mapped_column(Date)
    due_time: Mapped[Optional[time]] = mapped_column(Time)
    location: Mapped[Optional[str]] = mapped_column(String(300))
    status: Mapped[ObligationStatus] = mapped_column(default=ObligationStatus.OPEN)
    # Events the client adds themselves after registration. The case worker is told
    # about them (added_by_client with staff_seen_at empty) but does not edit them.
    added_by_client: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    staff_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    client: Mapped["Client"] = relationship(back_populates="obligations")
    appointments: Mapped[list["Appointment"]] = relationship(back_populates="obligation")


class ClientContact(IdMixin, TimestampMixin, ProvenanceMixin, Base):
    """Parole officer, doctor, landlord, employer, etc."""
    __tablename__ = "client_contacts"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    contact_type: Mapped[ContactType] = mapped_column()
    name: Mapped[str] = mapped_column(String(200))
    phone: Mapped[Optional[str]] = mapped_column(String(20))
    email: Mapped[Optional[str]] = mapped_column(String(255))

    client: Mapped["Client"] = relationship(back_populates="contacts")


# ============================================================
# Community resources (filled by web scraping, reviewed by case workers)
# ============================================================

class Resource(IdMixin, TimestampMixin, Base):
    """
    One shelter, pantry, treatment program, class or event. Not tied to any client.

    Columns exist for what search filters or sorts on. Everything else is JSON,
    validated by the dataclasses in schemas.py (Address, OpeningHours, ShelterDetails...).
    """
    __tablename__ = "resources"
    __table_args__ = (
        Index("ix_resources_category_transit", "category", "near_transit"),
    )

    # Same place from two sources collapses to one row (see schemas.dedupe_key)
    dedupe_key: Mapped[str] = mapped_column(String(300), unique=True)

    name: Mapped[str] = mapped_column(String(255), index=True)
    category: Mapped[ResourceCategory] = mapped_column(index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)  # 1-2 plain sentences

    # Where and how to reach it
    address: Mapped[Optional[dict]] = mapped_column(JSON)     # street, city, state, zip
    lat: Mapped[Optional[float]] = mapped_column(Float)
    lng: Mapped[Optional[float]] = mapped_column(Float)
    phone: Mapped[Optional[str]] = mapped_column(String(20))  # E.164
    website: Mapped[Optional[str]] = mapped_column(String(500))

    # When
    hours: Mapped[list] = mapped_column(JSON, default=list)   # [{day, opens, closes, label}]
    hours_note: Mapped[Optional[str]] = mapped_column(Text)
    starts_at: Mapped[Optional[datetime]] = mapped_column(    # classes/events, copied out of details
        DateTime(timezone=True), index=True
    )

    # Who it serves (UNKNOWN until a scrape or a case worker says otherwise)
    gender: Mapped[Gender] = mapped_column(default=Gender.UNKNOWN)
    families_welcome: Mapped[Tri] = mapped_column(default=Tri.UNKNOWN)
    records_policy: Mapped[RecordsPolicy] = mapped_column(default=RecordsPolicy.UNKNOWN)
    restrictions_note: Mapped[Optional[str]] = mapped_column(Text)
    languages: Mapped[list] = mapped_column(JSON, default=list)
    cost_type: Mapped[CostType] = mapped_column(default=CostType.UNKNOWN)

    # How to get in
    access_methods: Mapped[list] = mapped_column(JSON, default=list)
    required_documents: Mapped[list] = mapped_column(JSON, default=list)
    requires_id: Mapped[bool] = mapped_column(Boolean, default=False)  # derived, powers "no ID needed"

    # Getting there: computed once from location + transit stops, never scraped
    near_transit: Mapped[Optional[bool]] = mapped_column(Boolean)  # NULL = no location to measure
    nearest_stops: Mapped[list] = mapped_column(JSON, default=list)

    # Category-specific fields (ShelterDetails, FoodDetails, ...)
    details: Mapped[dict] = mapped_column(JSON, default=dict)

    # Can I trust this?
    verification: Mapped[VerificationStatus] = mapped_column(default=VerificationStatus.UNVERIFIED)
    source: Mapped[ScrapeSource] = mapped_column(default=ScrapeSource.OTHER)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000))
    scraped_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    verified_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )
    field_meta: Mapped[dict] = mapped_column(JSON, default=dict)  # {field: {source, confidence, confirmed_at}}


# ============================================================
# Text bot (Photon Spectrum). See docs/text-bot-plan.md.
# ============================================================

class BotChannel(enum.Enum):
    IMESSAGE = "imessage"
    RCS = "rcs"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    TELEGRAM = "telegram"
    OTHER = "other"


class BotEnrollmentStatus(enum.Enum):
    ACTIVE = "active"     # bot answers this number
    STOPPED = "stopped"   # client texted STOP; only START/HELP are answered
    LOCKED = "locked"     # too many failed sign-ins; case worker must unlock
    REVOKED = "revoked"   # case worker turned texting off


class BotSessionState(enum.Enum):
    AWAITING_NAME = "awaiting_name"
    AWAITING_PIN = "awaiting_pin"
    ACTIVE = "active"
    LOCKED = "locked"


class BotEnrollment(IdMixin, TimestampMixin, Base):
    """A client's opt-in to texting. The bot only engages with numbers that have an
    ACTIVE row here; everyone else gets one generic reply."""
    __tablename__ = "bot_enrollments"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), unique=True
    )
    # Phone in E.164. Stored encrypted; looked up by keyed hash (see services/phone.py).
    phone_encrypted: Mapped[str] = mapped_column(Text)
    phone_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    phone_last4: Mapped[str] = mapped_column(String(4))  # for case-worker display only
    channel: Mapped[Optional[BotChannel]] = mapped_column()  # last channel seen
    status: Mapped[BotEnrollmentStatus] = mapped_column(default=BotEnrollmentStatus.ACTIVE)
    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    enrolled_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Morning nudge: the client opts in by texting NUDGE ON. The nudge itself never
    # contains schedule details (it may show on a lock screen).
    nudge_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    nudge_time: Mapped[time] = mapped_column(Time, default=time(8, 0), server_default="08:00:00")
    last_nudged_on: Mapped[Optional[date]] = mapped_column(Date)  # local date; prevents repeats

    session: Mapped[Optional["BotSession"]] = relationship(
        back_populates="enrollment", cascade="all, delete-orphan", uselist=False
    )


class BotSession(IdMixin, TimestampMixin, Base):
    """Sign-in state for one enrolled number. Never stores the typed name or PIN."""
    __tablename__ = "bot_sessions"

    enrollment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("bot_enrollments.id", ondelete="CASCADE"), unique=True
    )
    state: Mapped[BotSessionState] = mapped_column(default=BotSessionState.AWAITING_NAME)
    # Result of the name check, kept until the PIN arrives so the reply never reveals
    # which part was wrong.
    name_matched: Mapped[bool] = mapped_column(Boolean, default=False)
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0)
    authenticated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    last_activity_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    # Last numbered list sent, so "2" / "MAP" / "MORE" can refer back to it.
    last_results: Mapped[Optional[dict]] = mapped_column(JSON)
    pending_attachment_ref: Mapped[Optional[str]] = mapped_column(String(255))

    enrollment: Mapped["BotEnrollment"] = relationship(back_populates="session")


class BotAuditLog(IdMixin, Base):
    """What the bot did, never what was said."""
    __tablename__ = "bot_audit_log"

    enrollment_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("bot_enrollments.id", ondelete="SET NULL"), index=True
    )
    intent: Mapped[str] = mapped_column(String(50))
    outcome: Mapped[str] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


# ============================================================
# Appointments (what the client's daily/weekly schedule is built from)
# ============================================================

class Appointment(IdMixin, TimestampMixin, Base):
    """A dated, timed thing the client must attend. Added by the case worker.
    Open obligations (fees, court dates) also appear on the schedule by due date."""
    __tablename__ = "appointments"

    client_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    location_name: Mapped[Optional[str]] = mapped_column(String(200))
    address: Mapped[Optional[str]] = mapped_column(String(255))
    # Typed by the case worker for now ("Five Points station, then the #3 bus").
    # Filled automatically once geocoding + MARTA stops exist (Resources ingest).
    transit_note: Mapped[Optional[str]] = mapped_column(String(255))
    documents_to_bring: Mapped[Optional[list]] = mapped_column(JSON)  # ["State ID", ...]
    # Optional link, e.g. the court date this appointment fulfils.
    obligation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("client_obligations.id", ondelete="SET NULL")
    )
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by_staff_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("staff.id", ondelete="SET NULL")
    )

    client: Mapped["Client"] = relationship(back_populates="appointments")
    obligation: Mapped[Optional["ClientObligation"]] = relationship(back_populates="appointments")
