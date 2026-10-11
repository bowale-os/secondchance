"""Pre-sign-in checks: compliance keywords and the crisis exception.

The crisis check is deliberately broad and keyword-based: a false positive costs one
extra text with hotline numbers; a false negative could cost much more."""

import re
import unicodedata

# English and Spanish. Matched after keyword(): accents, spaces and punctuation removed,
# uppercased ("Mañana." -> "MANANA", "cerrar sesión" -> "CERRARSESION").
STOP_WORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT",
              "PARAR", "BAJA", "CANCELAR", "DETENER"}
START_WORDS = {"START", "UNSTOP", "INICIAR", "COMENZAR", "ALTA"}
HELP_WORDS = {"HELP", "INFO", "AYUDA"}
SIGN_OUT_WORDS = {"SIGNOUT", "LOGOUT", "LOGOFF", "BYE", "SALIR", "CERRARSESION", "ADIOS"}
MENU_WORDS = {"MENU", "0", "OPCIONES"}
MORE_WORDS = {"MORE", "MAS"}
MAP_WORDS = {"MAP", "MAPS", "MAPA"}
SAVE_WORDS = {"SAVE", "GUARDAR"}
SCHEDULE_WORDS = {
    "TODAY": "day", "SCHEDULE": "day", "MYSCHEDULE": "day",
    "TOMORROW": "tomorrow",
    "WEEK": "week", "THISWEEK": "week",
    "HOY": "day", "AGENDA": "day", "MIAGENDA": "day", "HORARIO": "day",
    "MANANA": "tomorrow",
    "SEMANA": "week", "ESTASEMANA": "week",
}


def strip_accents(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))

_CRISIS_PATTERNS = [
    # overdose
    r"\bover ?dos(e|ed|ing)\b", r"\bo\.?d\.?(ed|'d|ing)?\b", r"\bnarcan\b", r"\bnaloxone\b",
    r"\bnot breathing\b", r"\bwon'?t wake up\b",
    # self-harm
    r"\bkill(ing)? my ?self\b", r"\bsuicid", r"\bend (it all|my life)\b",
    r"\bwant to die\b", r"\bhurt(ing)? my ?self\b", r"\bself[- ]?harm\b",
    r"\bdon'?t want to (live|be alive)\b",
    # nowhere to sleep tonight
    r"\bnowhere to (sleep|stay|go)\b", r"\bno ?where to (sleep|stay)\b",
    r"\bno place to (sleep|stay)\b", r"\bsleeping (outside|on the street)\b",
    r"\bkicked out\b.*\btonight\b", r"\bhomeless tonight\b",
    # Spanish (matched without accents)
    r"\bsobredosis\b", r"\bquiero morir(me)?\b", r"\bme quiero morir\b", r"\bmatarme\b",
    r"\bhacerme dano\b", r"\bno quiero vivir\b", r"\bno respira\b", r"\bno despierta\b",
    r"\bno tengo (donde|a donde) (dormir|quedarme|ir)\b", r"\bdurmiendo en la calle\b",
    r"\bme (echaron|corrieron)\b.*\besta noche\b",
]
_CRISIS_RE = re.compile("|".join(_CRISIS_PATTERNS), re.IGNORECASE)


def keyword(text: str) -> str:
    """Uppercased, accents/spaces/punctuation removed: 'Sign out.' -> 'SIGNOUT', 'Mañana' -> 'MANANA'."""
    return re.sub(r"[^A-Za-z0-9]", "", strip_accents(text)).upper()


def is_crisis(text: str) -> bool:
    return bool(_CRISIS_RE.search(strip_accents(text)))


_NUDGE_RE = re.compile(
    r"^\s*(?:nudge|reminder|reminders|aviso|avisos|recordatorio|recordatorios)\s*"
    r"(on|off|si|no|activar|desactivar|(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?)?\s*[.!]?\s*$",
    re.IGNORECASE,
)
_ON = {"on", "si", "activar"}
_OFF = {"off", "no", "desactivar"}


def parse_nudge(text: str):
    """'NUDGE ON' -> ('on', None); 'nudge off' -> ('off', None);
    'nudge 7:30' -> ('on', time(7, 30)); 'nudge 6pm' -> ('on', time(18, 0));
    'nudge 3' / 'nudge 25' -> ('bad_time', None); anything else -> None.
    A bare hour of 1-11 means AM. Allowed window: 5:00 AM to 9:00 PM."""
    from datetime import time

    m = _NUDGE_RE.match(strip_accents(text or ""))
    if not m:
        return None
    word, hour, minute, ampm = m.group(1), m.group(2), m.group(3), m.group(4)
    if word is None or word.lower() in _ON:
        return ("on", None)
    if word.lower() in _OFF:
        return ("off", None)
    h, mi = int(hour), int(minute or 0)
    if ampm:
        if not 1 <= h <= 12:
            return ("bad_time", None)
        h = (h % 12) + (12 if ampm.lower().startswith("p") else 0)
    if not (0 <= h <= 23 and 0 <= mi <= 59) or not (time(5, 0) <= time(h, mi) <= time(21, 0)):
        return ("bad_time", None)
    return ("on", time(h, mi))
