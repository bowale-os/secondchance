"""Places a client can name in a text ("FOOD near West End") -> approximate lat/lng.

A stand-in until server-side geocoding with MAPS_API_KEY (phase 4). Coordinates are
approximate station entrances / neighborhood centers, good enough to sort results by
distance; they are never shown to the client.
"""

import re
from typing import Optional

# name -> (lat, lng). Keys are normalized (lowercase, no punctuation, no "station").
_PLACES: dict[str, tuple[float, float]] = {
    # MARTA rail stations
    "five points": (33.7539, -84.3916),
    "peachtree center": (33.7597, -84.3875),
    "civic center": (33.7663, -84.3873),
    "north avenue": (33.7716, -84.3870),
    "midtown": (33.7810, -84.3864),
    "arts center": (33.7894, -84.3870),
    "lindbergh": (33.8233, -84.3694),
    "garnett": (33.7484, -84.3955),
    "west end": (33.7360, -84.4130),
    "oakland city": (33.7172, -84.4253),
    "lakewood": (33.7006, -84.4287),
    "east point": (33.6773, -84.4405),
    "college park": (33.6511, -84.4488),
    "airport": (33.6407, -84.4462),
    "georgia state": (33.7500, -84.3860),
    "king memorial": (33.7495, -84.3755),
    "inman park": (33.7573, -84.3524),
    "edgewood": (33.7618, -84.3401),
    "east lake": (33.7650, -84.3128),
    "decatur": (33.7748, -84.2963),
    "avondale": (33.7752, -84.2817),
    "kensington": (33.7724, -84.2518),
    "indian creek": (33.7699, -84.2295),
    "vine city": (33.7566, -84.4040),
    "ashby": (33.7564, -84.4176),
    "west lake": (33.7533, -84.4454),
    "hamilton e holmes": (33.7546, -84.4697),
    "bankhead": (33.7722, -84.4289),
    # Neighborhoods
    "downtown": (33.7550, -84.3900),
    "old fourth ward": (33.7650, -84.3720),
    "english avenue": (33.7700, -84.4130),
    "mechanicsville": (33.7350, -84.4000),
    "summerhill": (33.7380, -84.3830),
    "grant park": (33.7380, -84.3700),
    "kirkwood": (33.7520, -84.3220),
    "adair park": (33.7280, -84.4110),
    "pittsburgh": (33.7270, -84.3970),
    "castleberry hill": (33.7480, -84.4020),
    "sweet auburn": (33.7550, -84.3780),
}
_ALIASES = {
    "5 points": "five points", "north ave": "north avenue", "o4w": "old fourth ward",
    "gsu": "georgia state", "candler park": "edgewood", "ft mcpherson": "lakewood",
    "fort mcpherson": "lakewood", "hartsfield": "airport", "h e holmes": "hamilton e holmes",
    "holmes": "hamilton e holmes", "mlk": "king memorial", "dome": "vine city",
}


def _norm(s: str) -> str:
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    s = re.sub(r"\b(marta|station|stn|the|area|neighborhood|atl|atlanta|ga)\b", " ", s)
    return " ".join(s.split())


def lookup(name: str) -> Optional[tuple[str, tuple[float, float]]]:
    """('West End', (lat, lng)) or None."""
    key = _norm(name)
    key = _ALIASES.get(key, key)
    if key in _PLACES:
        return key.title().replace(" E ", " E. "), _PLACES[key]
    return None
