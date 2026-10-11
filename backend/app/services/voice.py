"""Text-to-speech for voice summaries (ElevenLabs).

Returns None when ElevenLabs isn't configured or the call fails, so the text reply
still goes out on its own. The text sent here is the same summary the client is
already getting; nothing else about them is included.
"""

import logging
from typing import Optional

import httpx

from app.config import get_settings
from app.services.bot_types import BotAudio

logger = logging.getLogger(__name__)

TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
MODEL_ID = "eleven_multilingual_v2"  # handles Spanish and most other target languages
MAX_CHARS = 1000
TIMEOUT_S = 20


def _voice_id(language: str) -> str:
    s = get_settings()
    if language.strip().lower() in ("spanish", "es", "español", "espanol"):
        return s.elevenlabs_voice_id_es or s.elevenlabs_voice_id_en
    return s.elevenlabs_voice_id_en


def configured() -> bool:
    return bool(get_settings().elevenlabs_api_key.get_secret_value() and get_settings().elevenlabs_voice_id_en)


async def synthesize(text: str, language: str = "English", http: Optional[httpx.AsyncClient] = None) -> Optional[BotAudio]:
    """MP3 of `text` read aloud in `language`, or None."""
    text = " ".join(text.split())[:MAX_CHARS]
    if not text or not configured():
        return None
    client = http or httpx.AsyncClient(timeout=TIMEOUT_S)
    try:
        res = await client.post(
            TTS_URL.format(voice_id=_voice_id(language)),
            params={"output_format": "mp3_44100_64"},
            headers={"xi-api-key": get_settings().elevenlabs_api_key.get_secret_value()},
            json={"text": text, "model_id": MODEL_ID},
        )
        res.raise_for_status()
        return BotAudio(res.content) if res.content else None
    except httpx.HTTPError as exc:
        logger.warning("voice summary failed: %s", type(exc).__name__)  # no text or URL in logs
        return None
    finally:
        if http is None:
            await client.aclose()
