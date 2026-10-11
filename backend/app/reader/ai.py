"""The pipeline talks to the AI only through AiClient, so the Gemini client and the fake one
used for development and tests are interchangeable.

Errors: UserFacingError messages are safe to show a client and never include document
text. Anything else that escapes is internal and is shown as a generic message.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional, Protocol, Union

from google import genai
from google.genai import errors, types
from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.reader import fake_fixtures as fx

logger = logging.getLogger(__name__)

AiStep = Literal["extract", "classify", "simplify", "actions"]


@dataclass
class AiRequest:
    step: AiStep
    system: str
    parts: list[Union[str, types.Part]]
    schema: type[BaseModel]
    # Which page an extract call is for, and how many pages there are (used by the fake client).
    page: Optional[int] = None
    page_count: Optional[int] = None


class AiClient(Protocol):
    name: str

    async def generate(self, req: AiRequest) -> Any: ...


class UserFacingError(Exception):
    """An error whose message is safe to show a client. Never includes document text."""


class AiRefusalError(UserFacingError):
    def __init__(self, step: AiStep):
        super().__init__("We couldn't finish this paper; please show it to your case manager.")
        self.step = step


class AiOutputError(UserFacingError):
    def __init__(self, step: AiStep):
        super().__init__("Something went wrong reading this paper. Please try again.")
        self.step = step


# ---------- Gemini ----------

# Thinking off everywhere for speed. If test_docs/ shows missed deadlines, give "actions"
# a small budget (e.g. 1024) before anything else.
THINKING_BUDGET: dict[AiStep, int] = {"extract": 0, "classify": 0, "simplify": 0, "actions": 0}

RETRY_CODES = (429, 500, 503)   # Gemini load spikes; anything else will not fix itself
API_ATTEMPTS = 4
OUTPUT_ATTEMPTS = 2             # one retry if the output fails our checks

BLOCKED_FINISH = {
    types.FinishReason.SAFETY, types.FinishReason.PROHIBITED_CONTENT, types.FinishReason.BLOCKLIST,
    types.FinishReason.SPII, types.FinishReason.RECITATION,
}


class GeminiAiClient:
    name = "gemini"

    def __init__(self, client: Optional[genai.Client] = None, model: Optional[str] = None):
        settings = get_settings()
        self.client = client or genai.Client(api_key=settings.gemini_api_key.get_secret_value())
        self.model = model or settings.gemini_model

    async def generate(self, req: AiRequest) -> Any:
        config = types.GenerateContentConfig(
            system_instruction=req.system,
            response_mime_type="application/json",
            response_schema=req.schema,
            temperature=0,
            thinking_config=types.ThinkingConfig(thinking_budget=THINKING_BUDGET[req.step]),
        )
        for _ in range(OUTPUT_ATTEMPTS):
            resp = await self._call(req, config)
            if _blocked(resp):
                raise AiRefusalError(req.step)
            try:
                return req.schema.model_validate_json(resp.text or "")
            except ValidationError:
                # Never log the error itself: it quotes the model's output, i.e. document text.
                logger.warning("reader %s: output failed schema checks", req.step)
        raise AiOutputError(req.step)

    async def _call(self, req: AiRequest, config: types.GenerateContentConfig):
        for attempt in range(API_ATTEMPTS):
            try:
                return await self.client.aio.models.generate_content(
                    model=self.model, contents=req.parts, config=config
                )
            except errors.APIError as exc:
                if exc.code in RETRY_CODES and attempt < API_ATTEMPTS - 1:
                    await asyncio.sleep(2 * 2**attempt)
                    continue
                logger.warning("reader %s: Gemini error %s", req.step, exc.code)
                raise AiOutputError(req.step) from None


def _blocked(resp: types.GenerateContentResponse) -> bool:
    """A safety block or an empty answer: the paper can't be finished by retrying."""
    if resp.prompt_feedback and resp.prompt_feedback.block_reason:
        return True
    if not resp.candidates:
        return True
    if resp.candidates[0].finish_reason in BLOCKED_FINISH:
        return True
    return not (resp.text or "").strip()


# ---------- Fake ----------

Override = Union[dict, Callable[[AiRequest], Any]]


class FakeAiClient:
    """Stand-in for Gemini with no API key. Returns the sample parole letter for any upload,
    after an optional delay, and checks its own answers against the same schemas real
    responses must pass. It does not look at the uploaded pages."""

    name = "fake"

    def __init__(self, delay_s: float = 0, overrides: Optional[dict[AiStep, Override]] = None):
        self.delay_s = delay_s
        self.overrides = overrides or {}
        self.calls: list[AiRequest] = []

    async def generate(self, req: AiRequest) -> Any:
        self.calls.append(req)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        override = self.overrides.get(req.step)
        if override is None:
            answer = self._default(req)
        else:
            answer = override(req) if callable(override) else override
        return req.schema.model_validate(answer)

    def _default(self, req: AiRequest) -> dict:
        if req.step == "extract":
            # Fewer uploads than sample pages: the last upload carries the rest of the letter,
            # so a one-photo demo still matches the sample simple version and to-do list.
            n = req.page or 1
            count = req.page_count or len(fx.FAKE_PAGES)
            if n == count and count < len(fx.FAKE_PAGES):
                rest = fx.FAKE_PAGES[n - 1:]
                return {**rest[0], "text": "\n\n".join(p["text"] for p in rest)}
            return fx.FAKE_PAGES[(n - 1) % len(fx.FAKE_PAGES)]
        return {"classify": fx.FAKE_CLASSIFY, "simplify": fx.FAKE_SIMPLIFY, "actions": fx.FAKE_ACTIONS}[req.step]


def get_ai_client() -> AiClient:
    """READER_AI=fake gives the fake client; otherwise Gemini."""
    return FakeAiClient(delay_s=0.4) if get_settings().reader_ai == "fake" else GeminiAiClient()

