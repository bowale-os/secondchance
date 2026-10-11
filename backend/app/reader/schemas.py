"""Shapes for the document reader, ported from second-chance-reader's shared package.

Two kinds of model live here:

- AI outputs (ExtractOutput ... ActionsOutput) are sent to Claude as the structured-output
  schema and checked again on our side. Every field is required-but-nullable, and format rules
  (ISO dates, 0-1 confidence, non-empty strings) are validators rather than schema
  constraints, so the schema Claude sees stays plain types.
- App shapes (ActionItem, Flag, ProgressEvent ...) are what the API streams to the browser.

Python names are snake_case. On the wire (both to Claude and to the browser) every model
uses the reader's camelCase names, so the prompts and the frontend types map one-to-one.
Dump app shapes with `wire()` to match the reader's optional fields.
"""

import re
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import AfterValidator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DocType = Literal[
    "parole_conditions", "probation", "court_order", "benefits", "housing",
    "employment", "medical", "id", "child_support", "other",
]
Anchor = Literal["document_date", "release_date", "received_date"]
Priority = Literal["urgent", "normal", "low"]

# Items due within this many days are pinned to the top as urgent.
URGENT_WINDOW_DAYS = 7
# Document types where any action counts as urgent: missing one can mean a violation.
LEGAL_DOC_TYPES: tuple[DocType, ...] = ("parole_conditions", "probation", "court_order")
# Below this per-page confidence the app asks the user to retake the page.
LOW_CONFIDENCE_THRESHOLD = 0.7

DISCLAIMER = {
    "en": "This is a helper, not legal advice. Check the original paper and ask your case "
          "manager or legal aid if anything is unclear.",
    "es": "Esto es una ayuda, no consejo legal. Revise el papel original y pregunte a su "
          "administrador de caso o a ayuda legal si algo no está claro.",
}

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _iso_date(v: str) -> str:
    if not _ISO_DATE.match(v):
        raise ValueError("Use YYYY-MM-DD")
    return v


def _non_empty(v: str) -> str:
    if not v.strip():
        raise ValueError("Must not be empty")
    return v


def _unit(v: float) -> float:
    if not 0 <= v <= 1:
        raise ValueError("Must be between 0 and 1")
    return v


def _positive(v: int) -> int:
    if v < 1:
        raise ValueError("Must be 1 or more")
    return v


IsoDate = Annotated[str, AfterValidator(_iso_date)]
NonEmpty = Annotated[str, AfterValidator(_non_empty)]
Unit = Annotated[float, AfterValidator(_unit)]
PositiveInt = Annotated[int, AfterValidator(_positive)]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    def wire(self) -> dict[str, Any]:
        """JSON-ready dict with camelCase keys; unset optional fields are left out."""
        return self.model_dump(mode="json", by_alias=True, exclude_none=True)


# ---------- AI outputs ----------

class ExtractOutput(CamelModel):
    text: str                 # full text of the page, in reading order
    confidence: Unit          # how sure the model is it read the page correctly
    problem: Optional[str]    # e.g. "bottom third is blurry"


class ClassifyOutput(CamelModel):
    doc_type: DocType
    title: NonEmpty
    issuer: Optional[str]
    document_date: Optional[IsoDate]


class GlossaryEntry(CamelModel):
    term: str
    meaning: str


class SimplifyOutput(CamelModel):
    markdown: NonEmpty
    glossary: list[GlossaryEntry]


class RawDue(CamelModel):
    type: Literal["exact", "relative", "none"]
    text: Optional[str]
    # Exact dates the model read off the paper, as ISO; relative ones are resolved in code.
    exact_date: Optional[IsoDate]
    anchor: Optional[Anchor]
    offset_hours: Optional[float]
    offset_days: Optional[int]
    business_days: Optional[bool]


class RawContact(CamelModel):
    name: Optional[str]
    phone: Optional[str]
    email: Optional[str]


class RawAction(CamelModel):
    order: PositiveInt
    title: NonEmpty
    details: str
    due: RawDue
    location: Optional[str]
    contact: Optional[RawContact]
    bring: list[str]
    priority: Priority
    consequence: Optional[str]
    source_quote: NonEmpty
    source_page: PositiveInt
    confidence: Unit


class ActionsOutput(CamelModel):
    actions: list[RawAction]


# ---------- App shapes ----------

class DueDate(CamelModel):
    type: Literal["exact", "relative", "none"]
    text: Optional[str] = None
    anchor: Optional[Anchor] = None
    offset_hours: Optional[float] = None
    offset_days: Optional[int] = None
    business_days: Optional[bool] = None
    resolved_date: Optional[str] = None   # ISO date set by dates.py, never by the model
    explanation: Optional[str] = None     # "72 hours after your release on Oct 9 = Oct 12"


class Contact(CamelModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None


class ActionItem(CamelModel):
    id: str
    order: int
    title: str
    details: str
    due: DueDate
    location: Optional[str] = None
    contact: Optional[Contact] = None
    bring: Optional[list[str]] = None
    priority: Priority
    consequence: Optional[str] = None
    source_quote: str
    source_page: int
    confidence: float
    completed: bool = False
    completed_at: Optional[str] = None
    # A case worker added it to the schedule (kept papers only).
    checked_by_case_worker: bool = False
    # What the model said before the urgency rules ran; kept for saving, never sent.
    model_priority: Optional[Priority] = Field(default=None, exclude=True)


class SimplifiedDocument(CamelModel):
    markdown: str
    glossary: list[GlossaryEntry]


FlagKind = Literal["unverified_value", "unverified_source", "low_confidence_page"]


class Flag(CamelModel):
    kind: FlagKind
    detail: str                   # plain sentence shown to the client
    value: Optional[str] = None   # the date / amount / number to highlight
    action_id: Optional[str] = None
    page: Optional[int] = None


class DocumentMeta(CamelModel):
    doc_type: DocType
    title: str
    issuer: Optional[str] = None
    document_date: Optional[str] = None   # ISO date, only when printed on the paper


class ExtractedPage(CamelModel):
    n: int
    text: str
    confidence: float


# ---------- Progress events (one NDJSON line each) ----------

class ReadingEvent(CamelModel):
    stage: Literal["reading"] = "reading"


class ExtractedEvent(CamelModel):
    stage: Literal["extracted"] = "extracted"
    pages: list[ExtractedPage]
    text: str


class RetakeSuggestedEvent(CamelModel):
    stage: Literal["retake_suggested"] = "retake_suggested"
    pages: list[int]


class ClassifiedEvent(CamelModel):
    stage: Literal["classified"] = "classified"
    meta: DocumentMeta


class SimplifyingEvent(CamelModel):
    stage: Literal["simplifying"] = "simplifying"


class SimplifiedEvent(CamelModel):
    stage: Literal["simplified"] = "simplified"
    simplified: SimplifiedDocument


class FindingActionsEvent(CamelModel):
    stage: Literal["finding_actions"] = "finding_actions"


class ActionsEvent(CamelModel):
    stage: Literal["actions"] = "actions"
    actions: list[ActionItem]
    flags: list[Flag]


class DoneEvent(CamelModel):
    stage: Literal["done"] = "done"
    receipt: Optional[str] = None      # signed result for /reader/keep
    reading_id: Optional[str] = None   # a stored paper read by a case worker: saved already


class ErrorEvent(CamelModel):
    stage: Literal["error"] = "error"
    message: str


ProgressEvent = Annotated[
    Union[
        ReadingEvent, ExtractedEvent, RetakeSuggestedEvent, ClassifiedEvent, SimplifyingEvent,
        SimplifiedEvent, FindingActionsEvent, ActionsEvent, DoneEvent, ErrorEvent,
    ],
    Field(discriminator="stage"),
]
