"""The Claude client's handling of answers, refusals and errors, with the SDK stubbed out,
plus the Spanish flag messages."""

import json
from types import SimpleNamespace

import anthropic
import httpx
import pytest

from app.reader import fake_fixtures as fx
from app.reader.ai import AiOutputError, AiRefusalError, AiRequest, ClaudeAiClient
from app.reader.schemas import ActionItem, ActionsOutput, ClassifyOutput, DueDate, ExtractOutput, SimplifiedDocument, SimplifyOutput
from app.reader.verify import verify


def reply(text: str, stop_reason: str = "end_turn"):
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])


class StubMessages:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.calls: list[dict] = []

    async def create(self, **params):
        self.calls.append(params)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def client(*replies):
    stub = StubMessages(*replies)
    return ClaudeAiClient(client=SimpleNamespace(beta=SimpleNamespace(messages=stub))), stub


def classify_req():
    return AiRequest(step="classify", system="s", content=[{"type": "text", "text": "doc"}], schema=ClassifyOutput)


@pytest.mark.parametrize("schema", [ExtractOutput, ClassifyOutput, SimplifyOutput, ActionsOutput])
def test_every_schema_converts_for_structured_outputs(schema):
    out = anthropic.transform_schema(schema.model_json_schema())
    assert json.dumps(out)   # no exotic types left behind


@pytest.mark.asyncio
async def test_returns_parsed_output_with_the_step_settings():
    ai, stub = client(reply(json.dumps(fx.FAKE_CLASSIFY)))
    out = await ai.generate(classify_req())
    assert out.doc_type == "parole_conditions"
    call = stub.calls[0]
    assert call["model"] == "claude-haiku-5-5"
    assert call["output_config"]["effort"] == "low"
    assert "fallbacks" not in call   # Haiku has no server-side fallback


@pytest.mark.asyncio
async def test_page_reading_uses_opus_with_fallbacks():
    ai, stub = client(reply(json.dumps(fx.FAKE_PAGES[0])))
    await ai.generate(AiRequest(step="extract", system="s", content=[], schema=ExtractOutput, page=1, page_count=1))
    call = stub.calls[0]
    assert (call["model"], call["fallbacks"], call["betas"]) == ("claude-opus-5-5", "default", ["server-side-fallback-2026-07-01"])


@pytest.mark.asyncio
async def test_a_refusal_becomes_the_case_manager_message():
    ai, _ = client(reply("", stop_reason="refusal"))
    with pytest.raises(AiRefusalError, match="case manager"):
        await ai.generate(classify_req())


@pytest.mark.asyncio
async def test_bad_output_is_retried_once_then_fails_plainly():
    bad = reply(json.dumps({**fx.FAKE_CLASSIFY, "documentDate": "Oct 5"}))
    ai, stub = client(bad, reply(json.dumps(fx.FAKE_CLASSIFY)))
    assert (await ai.generate(classify_req())).title == "Parole conditions"

    ai, stub = client(bad, bad)
    with pytest.raises(AiOutputError) as exc:
        await ai.generate(classify_req())
    assert "Oct 5" not in str(exc.value)   # never echoes document content
    assert len(stub.calls) == 2


@pytest.mark.asyncio
async def test_api_errors_become_a_generic_message():
    err = anthropic.BadRequestError(
        "secret detail", response=httpx.Response(400, request=httpx.Request("POST", "https://x")), body=None,
    )
    ai, _ = client(err)
    with pytest.raises(AiOutputError) as exc:
        await ai.generate(classify_req())
    assert "secret" not in str(exc.value)


def test_flags_in_spanish():
    action = ActionItem(id="a1", order=1, title="Pague", details="", due=DueDate(type="exact", resolved_date="2026-10-31"),
                        priority="normal", source_quote="No está en el papel.", source_page=1, confidence=0.9)
    flags = verify("Pague $30.00 antes del 30 de octubre de 2026.",
                   SimplifiedDocument(markdown="Pague $300.00.", glossary=[]), [action], "es")
    assert [f.detail for f in flags] == [
        '"$300.00" no está en el papel original. Revíselo.',
        '"31 de octubre de 2026" no está en el papel original. Revíselo.',
        "No encontramos en qué parte del papel está este paso. Revíselo.",
    ]
