"""Gemini document reading: uploaded files in, a structured client draft out."""

import asyncio
import io
import logging
from datetime import date
from decimal import Decimal
from typing import Optional

from google import genai
from google.genai import errors, types
from PIL import Image, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener
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

register_heif_opener()  # lets Pillow open iPhone HEIC photos

ALLOWED_MIME = {"application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic"}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 10
MAX_IMAGE_SIDE = 2000  # px; small enough to be fast, big enough to read fine print

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


def downscale(data: bytes, mime: str) -> tuple[bytes, str]:
    """Shrink phone photos before sending them to Gemini. PDFs pass through untouched."""
    if not mime.startswith("image/"):
        return data, mime
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # apply phone rotation before EXIF is dropped
        img.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))  # keeps aspect ratio, never upscales
        out = io.BytesIO()
        img.convert("RGB").save(out, "JPEG", quality=85)
    except (UnidentifiedImageError, OSError) as exc:
        raise ExtractionError("Could not read an uploaded image") from exc
    return out.getvalue(), "image/jpeg"


_client: Optional[genai.Client] = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().gemini_api_key.get_secret_value())
    return _client


CONFIG = types.GenerateContentConfig(
    system_instruction=PROMPT,
    response_mime_type="application/json",
    response_schema=Extraction,
    temperature=0,
    # Extraction does not need reasoning; skipping it is the biggest latency win
    thinking_config=types.ThinkingConfig(thinking_budget=0),
)


async def extract_one(index: int, name: str, mime: str, data: bytes) -> Extraction:
    """Read a single file. Its rows are tagged with `index`, its position in the upload."""
    data, mime = await asyncio.to_thread(downscale, data, mime)
    parts = [f"file {index} ({name}):", types.Part.from_bytes(data=data, mime_type=mime)]
    for attempt in range(4):
        try:
            resp = await get_client().aio.models.generate_content(
                model=get_settings().gemini_model, contents=parts, config=CONFIG
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
    # One file per call, so every row came from this file whatever number the model wrote
    for row in (*result.ids, *result.benefits, *result.medications, *result.obligations, *result.contacts):
        row.source_file = index
    result.files = [f.model_copy(update={"file": index}) for f in result.files[:1]]
    return result


def merge(results: list[Extraction]) -> Extraction:
    """Combine per-file readings: first non-empty value wins for single fields, lists concatenate."""
    merged = Extraction()
    for field in Extraction.model_fields:
        values = [getattr(r, field) for r in results]
        if field == "notes":
            notes = [v for v in values if v]
            merged.notes = "\n".join(notes) or None
        elif isinstance(values[0], list):
            setattr(merged, field, [item for v in values for item in v])
        else:
            setattr(merged, field, next((v for v in values if v is not None), None))
    return merged


async def extract(files: list[tuple[str, str, bytes]]) -> Extraction:
    """files: (filename, mime_type, bytes). Reads each file concurrently and merges the results."""
    results = await asyncio.gather(
        *(extract_one(i, name, mime, data) for i, (name, mime, data) in enumerate(files))
    )
    return merge(list(results))
