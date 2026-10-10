"""Pre-sign-in checks: compliance keywords and the crisis exception.

The crisis check is deliberately broad and keyword-based: a false positive costs one
extra text with hotline numbers; a false negative could cost much more."""

import re

STOP_WORDS = {"STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT"}
START_WORDS = {"START", "UNSTOP"}
HELP_WORDS = {"HELP", "INFO"}
SIGN_OUT_WORDS = {"SIGNOUT", "LOGOUT", "LOGOFF", "BYE"}
MENU_WORDS = {"MENU", "0"}
SCHEDULE_WORDS = {
    "TODAY": "day", "SCHEDULE": "day", "MYSCHEDULE": "day",
    "TOMORROW": "tomorrow",
    "WEEK": "week", "THISWEEK": "week",
}

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
    # Spanish
    r"\bsobredosis\b", r"\bsuicid", r"\bquiero morir\b", r"\bmatarme\b",
    r"\bno tengo donde dormir\b",
]
_CRISIS_RE = re.compile("|".join(_CRISIS_PATTERNS), re.IGNORECASE)


def keyword(text: str) -> str:
    """Uppercased message with spaces and punctuation removed: 'Sign out.' -> 'SIGNOUT'."""
    return re.sub(r"[^A-Za-z0-9]", "", text).upper()


def is_crisis(text: str) -> bool:
    return bool(_CRISIS_RE.search(text))
