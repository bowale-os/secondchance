"""The pipeline talks to the AI only through AiClient, so the Claude client and the fake one
used for development and tests are interchangeable.

Errors: UserFacingError messages are safe to show a client and never include document
text. Anything else that escapes is internal and is shown as a generic message.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Any, Callable, Literal, Optional, Protocol, Union

import anthropic
from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.reader import fake_fixtures as fx

logger = logging.getLogger(__name__)

AiStep = Literal["extract", "classify", "simplify", "actions"]


@dataclass
class AiRequest:
    step: AiStep
    system: str
    content: list[dict]           # Anthropic content blocks (image / document / text)
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


# ---------- Claude ----------

@dataclass(frozen=True)
class StepSettings:
    model: str
    effort: Literal["low", "medium", "high", "xhigh", "max"]
    # Re-run on another model server-side if a safety classifier declines (Opus 5.5 only).
    fallbacks: bool


# Claude Opus 5.5 reads the page images (messy photos are where accuracy matters most);
# Claude Haiku 5.5 handles the text-only steps. Same settings as the reader.
STEP_SETTINGS: dict[AiStep, StepSettings] = {
    "extract": StepSettings("claude-opus-5-5", "medium", fallbacks=True),
    "classify": StepSettings("claude-haiku-5-5", "low", fallbacks=False),
    "simplify": StepSettings("claude-haiku-5-5", "medium", fallbacks=False),
    # Deadlines are the product: give the action list the most thinking.
    "actions": StepSettings("claude-haiku-5-5", "high", fallbacks=False),
}

FALLBACK_BETA = "server-side-fallback-2026-07-01"
MAX_TOKENS = 16000
OUTPUT_ATTEMPTS = 2   # one retry if the output fails our checks


class ClaudeAiClient:
    name = "claude"

    def __init__(self, client: Optional[anthropic.AsyncAnthropic] = None):
        # The SDK itself retries 429 / 5xx / connection errors with backoff.
        self.client = client or anthropic.AsyncAnthropic(
            api_key=get_settings().anthropic_api_key.get_secret_value() or None, max_retries=3,
        )

    async def generate(self, req: AiRequest) -> Any:
        s = STEP_SETTINGS[req.step]
        params: dict[str, Any] = dict(
            model=s.model,
            max_tokens=MAX_TOKENS,
            system=req.system,
            messages=[{"role": "user", "content": req.content}],
            output_config={
                "effort": s.effort,
                "format": {"type": "json_schema", "schema": anthropic.transform_schema(req.schema.model_json_schema())},
            },
        )
        if s.fallbacks:
            params.update(betas=[FALLBACK_BETA], fallbacks="default")

        for _ in range(OUTPUT_ATTEMPTS):
            try:
                resp = await self.client.beta.messages.create(**params)
            except anthropic.APIStatusError as exc:
                logger.warning("reader %s: Claude error %s", req.step, exc.status_code)
                raise AiOutputError(req.step) from None
            except anthropic.APIConnectionError:
                logger.warning("reader %s: could not reach Claude", req.step)
                raise AiOutputError(req.step) from None

            if resp.stop_reason == "refusal":
                raise AiRefusalError(req.step)
            text = next((b.text for b in resp.content if b.type == "text"), "")
            if not text.strip():
                raise AiRefusalError(req.step)
            if resp.stop_reason == "end_turn":
                try:
                    return req.schema.model_validate_json(text)
                except ValidationError:
                    pass
            # Never log the output or the validation error: both quote document text.
            logger.warning("reader %s: output failed checks (stop_reason=%s)", req.step, resp.stop_reason)
        raise AiOutputError(req.step)


# ---------- Fake ----------

Override = Union[dict, Callable[[AiRequest], Any]]


class FakeAiClient:
    """Stand-in for Claude with no API key. Returns the sample parole letter for any upload,
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
    """READER_AI=fake gives the fake client; otherwise Claude."""
    return FakeAiClient(delay_s=0.4) if get_settings().reader_ai == "fake" else ClaudeAiClient()
