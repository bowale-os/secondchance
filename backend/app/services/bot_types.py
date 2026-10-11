from dataclasses import dataclass


@dataclass
class BotImage:
    """An image reply (e.g. the resource map). Sent after the text before it."""
    data: bytes
    name: str = "map.png"
    mime_type: str = "image/png"


@dataclass
class BotAudio:
    """A voice reply (spoken summary). Sent after the text before it."""
    data: bytes
    name: str = "summary.mp3"
    mime_type: str = "audio/mpeg"
