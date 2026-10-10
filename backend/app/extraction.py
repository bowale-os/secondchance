"""Gemini document reading: uploaded files in, a structured client draft out."""

import asyncio
import logging
from datetime import date
from decimal import Decimal
from typing import Optional

from google import genai
from google.genai import errors, types
from pydantic import BaseModel

from app.config import get_settings
from app.tables import (
    BenefitStatus,
    BenefitType,
    ContactMethod,
    ContactType,
    DocumentType,
    EmploymentStatus,
    HousingStatus,
    IdStatus,
    IdType,
    ObligationStatus,
    ObligationType,
)

logger = logging.getLogger(__name__)

ALLOWED_MIME = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 10

PROMPT = """You read documents for a reentry case worker and fill in a client profile.

The documents are numbered file 0, file 1, ... in the order given. Rules:
- Use ONLY what the documents explicitly say. If something is not stated, leave it null or empty. Never guess or infer.
- Dates are YYYY-MM-DD. Money is a plain number in dollars.
- For every extracted row, set source_file to the number of the file it came from.
- Do NOT record criminal charges, offenses, convictions or sentence details anywhere,
  including notes and summaries. Obligations (fees, court dates, check-ins, reports)
  are fine: describe what the client must do or pay and when, not what they were charged with.
- Put anything useful for helping the client that has no field in notes, in plain language.
- For each file, give its document type, a 1-2 sentence plain-language summary a client
  could understand, and warnings for anything time-sensitive or costly (e.g. "$250 due Nov 3").
- If a value is hard to read or ambiguous, leave it null and mention it in that file's warnings."""


class XId(BaseModel):
    id_type: IdType
    status: IdStatus = IdStatus.HELD
    expires_on: Optional[date] = None
    source_file: int


class XBenefit(BaseModel):
    benefit_type: BenefitType
    status: BenefitStatus = BenefitStatus.PENDING
    case_number: Optional[str] = None
    source_file: int


class XMedication(BaseModel):
    name: str
    dose: Optional[str] = None
    prescriber: Optional[str] = None
    pharmacy: Optional[str] = None
    next_refill_on: Optional[date] = None
    source_file: int


class XObligation(BaseModel):
    obligation_type: ObligationType
    description: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[date] = None
    status: ObligationStatus = ObligationStatus.OPEN
    source_file: int


class XContact(BaseModel):
    contact_type: ContactType
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    source_file: int


class XFile(BaseModel):
    file: int
    doc_type: DocumentType
    summary: Optional[str] = None
    warnings: list[str] = []


class Extraction(BaseModel):
    """Response schema handed to Gemini; mirrors schemas.ClientDraft."""
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
    monthly_income: Optional[float] = None
    has_transportation: Optional[bool] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None
    ids: list[XId] = []
    benefits: list[XBenefit] = []
    medications: list[XMedication] = []
    obligations: list[XObligation] = []
    contacts: list[XContact] = []
    files: list[XFile] = []


class ExtractionError(Exception):
    pass


def to_decimal(value: Optional[float]) -> Optional[Decimal]:
    return None if value is None else Decimal(str(value))


async def extract(files: list[tuple[str, str, bytes]]) -> Extraction:
    """files: (filename, mime_type, bytes). Returns Gemini's structured reading."""
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key.get_secret_value())

    parts: list = []
    for i, (name, mime, data) in enumerate(files):
        parts.append(f"file {i} ({name}):")
        parts.append(types.Part.from_bytes(data=data, mime_type=mime))

    config = types.GenerateContentConfig(
        system_instruction=PROMPT,
        response_mime_type="application/json",
        response_schema=Extraction,
        temperature=0,
    )
    for attempt in range(4):
        try:
            resp = await client.aio.models.generate_content(
                model=settings.gemini_model, contents=parts, config=config
            )
            break
        except errors.APIError as exc:
            # 429/503 are Gemini load spikes; anything else will not fix itself
            if exc.code in (429, 500, 503) and attempt < 3:
                await asyncio.sleep(2 * 2**attempt)
                continue
            logger.exception("Gemini request failed")
            raise ExtractionError(f"Gemini error {exc.code}") from exc
    result = resp.parsed
    if not isinstance(result, Extraction):
        raise ExtractionError("Gemini returned an unreadable response")
    return result
