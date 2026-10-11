"""Backend -> sidecar calls, for messages the system starts on its own (welcome text,
nudges). Every proactive message must follow the no-content rule: nothing that
identifies the client or their case, since it lands on a lock screen."""

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


async def send_text(to_e164: str, text: str) -> bool:
    """Ask the sidecar to text one number. Returns False (and logs) if it's unreachable,
    so callers can report 'not sent' instead of failing the whole request."""
    s = get_settings()
    secret = s.bot_service_secret.get_secret_value()
    if not secret:
        logger.warning("BOT_SERVICE_SECRET not set; proactive text not sent")
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            r = await http.post(
                f"{s.textbot_url.rstrip('/')}/send",
                json={"to": to_e164, "text": text},
                headers={"Authorization": f"Bearer {secret}"},
            )
            r.raise_for_status()
            return True
    except httpx.HTTPError as exc:
        logger.warning("Proactive text failed: %s", type(exc).__name__)
        return False
