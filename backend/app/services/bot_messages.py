"""Every string the bot sends, in one place so the Spanish pass (phase 6) is one file.

Rules: nothing here may contain client data. Anything sent before sign-in, or sent
by the system on its own, must make sense on a lock screen."""

from app.config import get_settings

NOT_ENROLLED = (
    "This service is for enrolled clients. Ask your case worker to set it up."
)
WELCOME = (
    "Your case worker set up texting with this number. "
    "Text anything to sign in. Reply HELP for help or STOP to opt out."
)
ASK_NAME = "Reply with your full name."
ASK_PIN = "Now reply with your PIN."
BAD_LOGIN = "That name and PIN don't match. Reply with your full name to try again."
LOCKED = "Too many tries. Contact your case worker to unlock texting."
SESSION_ENDED = "You were signed out to keep your info safe. Reply with your full name to sign in."
SIGNED_IN = "You're signed in. Reply MENU to see what I can do."
SIGNED_OUT = "You're signed out. Text anything to sign in again."
STOPPED = "You won't get any more texts. Reply START to turn texting back on."
STARTED = "Texting is back on. Reply with your full name to sign in."
NOT_AVAILABLE_YET = "That isn't available yet. Reply MENU to see what I can do."
MENU = (
    "Reply with a word:\n"
    "TODAY - today's schedule\n"
    "TOMORROW - tomorrow's schedule\n"
    "WEEK - the next 7 days\n"
    "FOOD, SHELTER, JOBS - places near you (coming soon)\n"
    "SIGN OUT - end this session"
)


def help_text() -> str:
    s = get_settings()
    return (
        f"{s.app_name} texting. Text anything to sign in with your name and PIN. "
        f"Forgot your PIN? Ask your case worker. In an emergency call {s.emergency_number}. "
        "Reply STOP to opt out."
    )


def crisis_text() -> str:
    s = get_settings()
    return (
        f"If you are in danger or someone overdosed, call {s.emergency_number} now. "
        f"To talk to someone any time, call or text {s.crisis_line}. "
        f"For a place to sleep tonight, call {s.help_line}."
    )
