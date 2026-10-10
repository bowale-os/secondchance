"""Free-text router: maps a signed-in client's message to one of a fixed set of tools.

The model only classifies. It never sees client data (only the message text) and never
queries anything; the backend runs the chosen tool and enforces scope. If Gemini isn't
configured or fails, callers fall back to the keyword menu.
"""

import asyncio
import logging
from typing import Literal, Optional

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

from app.config import get_settings

logger = logging.getLogger(__name__)

MAX_CHARS = 500
TIMEOUT_S = 8


class Intent(BaseModel):
    tool: Literal[
        "get_schedule", "search_resources", "resource_detail", "more_results", "send_map", "menu", "unknown"
    ]
    schedule_range: Optional[Literal["day", "tomorrow", "week"]] = None
    category: Optional[Literal["food", "shelter", "jobs", "addiction", "classes", "events"]] = None
    near_place: Optional[str] = Field(None, description="Place name the user mentioned, as written")
    keywords: Optional[str] = Field(None, description="Extra search words, e.g. 'warehouse'")
    item_number: Optional[int] = None


PROMPT = """You route text messages from a social-services text line in Atlanta.
Messages may be in English or Spanish (or a mix); route them the same way.
Pick exactly one tool for the user's message and fill only the arguments it needs.

Tools:
- get_schedule: the user asks what they have today, tomorrow or this week (appointments,
  court, check-ins, payments). schedule_range: day | tomorrow | week.
- search_resources: the user wants a place or service. category:
    food (meals, pantry, groceries), shelter (a bed, somewhere to stay),
    jobs (work, hiring), classes (GED, training), events,
    addiction (ONLY if the user explicitly asks for recovery, treatment, rehab, detox,
    NA/AA or similar; never infer it from anything else).
  near_place: the place they name ("near Five Points" / "cerca de Five Points" -> "Five Points"), else null.
  keywords: extra words that narrow the search, else null.
- resource_detail: the user asks about item N of a list they just got ("tell me about 2").
- more_results: the user wants more of the same list.
- send_map: the user wants a map or directions for the list they just got.
- menu: the user asks what you can do, or for help using the service.
- unknown: anything else, including questions about their case, legal advice,
  medical questions, or chit-chat.

Never answer the user yourself. Output only the JSON."""

_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().gemini_api_key.get_secret_value())
    return _client


def configured() -> bool:
    s = get_settings()
    return bool(s.gemini_api_key.get_secret_value() and s.gemini_model)


CONFIG = types.GenerateContentConfig(
    system_instruction=PROMPT,
    response_mime_type="application/json",
    response_schema=Intent,
    temperature=0,
    max_output_tokens=200,
    thinking_config=types.ThinkingConfig(thinking_budget=0),
)


async def classify(text: str) -> Optional[Intent]:
    """None when the router is unavailable; callers then use the keyword menu."""
    if not configured():
        return None
    try:
        resp = await asyncio.wait_for(
            _get_client().aio.models.generate_content(
                model=get_settings().gemini_model, contents=text[:MAX_CHARS], config=CONFIG
            ),
            timeout=TIMEOUT_S,
        )
    except (errors.APIError, asyncio.TimeoutError) as exc:
        logger.warning("Intent router failed: %s", type(exc).__name__)
        return None
    intent = resp.parsed
    return intent if isinstance(intent, Intent) else None
