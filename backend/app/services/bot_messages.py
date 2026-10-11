"""Every string the bot sends, English and Spanish, in one file for review.

Rules: nothing here may contain client data. Anything sent before sign-in, or sent by
the system on its own, must make sense on a lock screen.

Spanish: neutral US Spanish, "usted", plain words. Keywords clients type stay in both
languages (see bot_keywords.py), so the Spanish text names the Spanish keyword.
REVIEW: every ES string should be checked by a native speaker before piloting.

Use `Strings(lang)` (attribute access, falls back to English). The module-level
UPPERCASE names are the English strings, kept for existing callers and tests.
"""

from datetime import date

from app.config import get_settings

EN: dict[str, str] = {
    # ---------- sign-in and compliance ----------
    "NOT_ENROLLED": "This service is for enrolled clients. Ask your case worker to set it up.",
    "WELCOME": ("Your case worker set up texting with this number. "
                "Text anything to sign in. Reply HELP for help or STOP to opt out."),
    "ASK_NAME": "Reply with your full name.",
    "ASK_PIN": "Now reply with your PIN.",
    "BAD_LOGIN": "That name and PIN don't match. Reply with your full name to try again.",
    "LOCKED": "Too many tries. Contact your case worker to unlock texting.",
    "SESSION_ENDED": "You were signed out to keep your info safe. Reply with your full name to sign in.",
    "SIGNED_IN": "You're signed in. Reply MENU to see what I can do.",
    "SIGNED_OUT": "You're signed out. Text anything to sign in again.",
    "STOPPED": "You won't get any more texts. Reply START to turn texting back on.",
    "STARTED": "Texting is back on. Reply with your full name to sign in.",
    "PHOTO_SIGN_IN": "Got your photo. Sign in first and I'll read it: reply with your full name.",
    "PHOTO_ASK_PIN": "Got your photo. Now reply with your PIN and I'll read it.",
    "PHOTO_RESEND": "I couldn't open that file. Please send it again as a photo.",
    "NOT_AVAILABLE_YET": "I can't do that yet. Reply MENU to see what I can do.",
    "NOT_UNDERSTOOD": ("Sorry, I can only help with your schedule and finding places like food or shelter. "
                       "For anything else, contact your case worker. Reply MENU for options."),
    "MENU": ("Reply with a word:\n"
             "TODAY - today's schedule\n"
             "TOMORROW - tomorrow's schedule\n"
             "WEEK - the next 7 days\n"
             "NUDGE ON - a morning text on days you have something\n"
             "FOOD, SHELTER, JOBS, CLASSES - places near you (add \"near West End\")\n"
             "Send a photo of a letter - I'll explain or translate it\n"
             "SIGN OUT - end this session"),
    "HELP": ("{app} texting. Text anything to sign in with your name and PIN. "
             "Forgot your PIN? Ask your case worker. In an emergency call {emergency}. "
             "Reply STOP to opt out."),
    "CRISIS": ("If you are in danger or someone overdosed, call {emergency} now. "
               "To talk to someone any time, call or text {crisis}. "
               "For a place to sleep tonight, call {help}."),
    # ---------- morning nudge ----------
    "NUDGE": "Your schedule for today is ready. Reply to sign in. (Reply NUDGE OFF to stop these.)",
    "NUDGE_OFF": "Morning reminders are off. Reply NUDGE ON after signing in to turn them back on.",
    "NUDGE_BAD_TIME": "I didn't get that time. Try NUDGE 8 or NUDGE 7:30 (between 5 AM and 9 PM).",
    "NUDGE_ON": ("Morning reminders are on. On days you have something scheduled, you'll get a text "
                 "at {at}. It won't say what; reply to sign in and see it. "
                 "Reply NUDGE 7:30 to change the time or NUDGE OFF to stop."),
    "NUDGE_SIGN_IN_FIRST": "Sign in first, then reply NUDGE ON.",
    # ---------- schedule ----------
    "TODAY": "Today",
    "TOMORROW_LABEL": "Tomorrow",
    "SCHED_DAY_HEAD": "{label}, {day}:",
    "SCHED_DAY_EMPTY": "{label}, {day}: nothing on your schedule. Reply WEEK for the next 7 days.",
    "SCHED_DAY_FOOT": "Reply WEEK for the next 7 days.",
    "SCHED_WHERE": "Where",
    "SCHED_TRANSIT": "Transit",
    "SCHED_BRING": "Bring",
    "SCHED_WEEK_HEAD": "Next 7 days:",
    "SCHED_WEEK_EMPTY": "Nothing on your schedule for the next 7 days. Reply MENU for other options.",
    "SCHED_WEEK_FOOT": "Reply TODAY or TOMORROW for places and what to bring.",
    "OVERDUE": "OVERDUE",
    "OBL_fee": "Payment due",
    "OBL_court_date": "Court date",
    "OBL_check_in": "Check-in",
    "OBL_report": "Report due",
    "OBL_other": "Due",
    # ---------- resources ----------
    "CAT_food": "Food",
    "CAT_shelter": "Shelters",
    "CAT_jobs": "Fair-chance jobs",
    "CAT_classes": "Classes",
    "CAT_events": "Events",
    "CAT_addiction": "Recovery help",
    "RES_NEAR": "{title} near {place}",
    "RES_NEAR_YOU": "{title} near you",
    "RES_NONE": "{title}: I couldn't find any right now. Reply MENU for other options or ask your case worker.",
    "RES_UNKNOWN_PLACE": "(I couldn't find \"{place}\", so these aren't sorted from there. Try a MARTA station name.)",
    "RES_HINT_NEAR": "Add \"near\" and a MARTA station to sort by distance, like FOOD near West End.",
    "RES_FOOT_ONE": "Reply 1 for details",
    "RES_FOOT_MANY": "Reply 1-{n} for details",
    "RES_FOOT_MORE": ", MORE for more.",
    "RES_FOOT_END": ".",
    "RES_FOOT_MAP": " MAP for a map.",
    "RES_OPEN": "open now",
    "RES_CLOSED": "closed now",
    "RES_NEAR_TRANSIT": "near rail/bus",
    "RES_UNVERIFIED": "not verified yet",
    "RES_NO_LIST": "There's no list to continue. Try FOOD, SHELTER or JOBS.",
    "RES_ALL_SHOWN": "That's everything I found. Reply MENU for other options.",
    "RES_MORE_HEAD": "More {title}:",
    "RES_NEED_LIST": "Send FOOD, SHELTER or JOBS first, then a number for details.",
    "RES_PICK_ONE": "Reply 1 for details.",
    "RES_PICK_N": "Pick a number from 1 to {n}.",
    "RES_GONE": "That place isn't listed anymore. Reply MORE or try another number.",
    "RES_CALL": "Call {phone}",
    "RES_TODAY_HOURS": "Today {spans}",
    "RES_CLOSED_TODAY": "Closed today",
    "RES_SERVES": "Serves: ",
    "RES_HIRING": "Hiring: ",
    "SERVES_men": "men only",
    "SERVES_women": "women only",
    "SERVES_FAMILIES": "families welcome",
    "SERVES_RECORDS_OK": "accepts people with records",
    "SERVES_RECORDS_CASE": "records: case by case",
    "SERVES_FREE": "free",
    "RES_BRING": "Bring: ",
    "DOC_photo_id": "a photo ID",
    "DOC_ssn_card": "your Social Security card",
    "DOC_birth_certificate": "your birth certificate",
    "DOC_proof_of_income": "proof of income",
    "DOC_proof_of_address": "proof of address",
    "DOC_release_papers": "your release papers",
    "DOC_referral_letter": "a referral letter",
    "DOC_MISSING": " (we don't have one on file)",
    "DOC_EXPIRED": " (yours on file is expired)",
    "RES_DIRECTIONS": "Directions: ",
    "RES_NEAREST_STOP": "Nearest stop: {stop} ({dist})",
    "RES_CHECKED": "Checked by staff.",
    "RES_CHECKED_ON": "Checked by staff {date}.",
    "RES_UNVERIFIED_LONG": "Not verified yet: call before you go.",
    "MAP_NEED_LIST": "Send FOOD, SHELTER or JOBS first, then MAP.",
    "MAP_HEAD": "Map: {title}",
    "MAP_NO_ADDRESS": "No address for {nums} (call instead).",
    "MAP_FIRST_N": "Showing the first {n}.",
    "MAP_NONE": "None of these places have an address to map. Reply a number for details.",
    "MAP_NO_PICTURE": "(Map picture unavailable right now; links below.)",
    # ---------- photos ----------
    "PH_GONE": "I don't have your photo anymore. Please send it again.",
    "PH_NOT_AVAILABLE": "I can't read photos right now. Please show it to your case worker.",
    "PH_UNREADABLE": "I couldn't read that. Try again in good light, with the whole page in the photo.",
    "PH_UNSUPPORTED": "I can only read photos (JPG, PNG, HEIC) or PDFs under 10 MB.",
    "PH_SAVED": "Saved to your documents. Your case worker will look it over.",
    "PH_LEGAL": "This looks like a legal or court paper. Check with your case worker before you act on it.",
    "PH_TITLE": "This paper: {title}.",
    "PH_TODO": "What to do:",
    "PH_NOTHING_TO_DO": "This paper doesn't ask you to do anything.",
    "PH_MORE": "And {n} more.",
    "PH_CHECK": "Double-check:",
    "PH_SAVE_OFFER": "Reply SAVE to keep it. Your to-dos will be in your portal and your case worker can see it.",
}

ES: dict[str, str] = {
    "NOT_ENROLLED": "Este servicio es para clientes inscritos. Pídale a su trabajador social que lo active.",
    "WELCOME": ("Su trabajador social activó los mensajes de texto con este número. "
                "Escriba cualquier cosa para iniciar sesión. Responda AYUDA para ayuda o STOP para no recibir más mensajes."),
    "ASK_NAME": "Responda con su nombre completo.",
    "ASK_PIN": "Ahora responda con su PIN.",
    "BAD_LOGIN": "El nombre y el PIN no coinciden. Responda con su nombre completo para intentarlo otra vez.",
    "LOCKED": "Demasiados intentos. Comuníquese con su trabajador social para desbloquear los mensajes.",
    "SESSION_ENDED": "Cerramos su sesión para proteger su información. Responda con su nombre completo para entrar.",
    "SIGNED_IN": "Ya inició sesión. Responda MENU para ver lo que puedo hacer.",
    "SIGNED_OUT": "Cerró su sesión. Escriba cualquier cosa para entrar de nuevo.",
    "STOPPED": "No recibirá más mensajes. Responda START para volver a activarlos.",
    "STARTED": "Los mensajes están activos otra vez. Responda con su nombre completo para iniciar sesión.",
    "PHOTO_SIGN_IN": "Recibí su foto. Primero inicie sesión y la leeré: responda con su nombre completo.",
    "PHOTO_ASK_PIN": "Recibí su foto. Ahora responda con su PIN y la leeré.",
    "PHOTO_RESEND": "No pude abrir ese archivo. Por favor, envíelo otra vez como foto.",
    "NOT_AVAILABLE_YET": "Todavía no puedo hacer eso. Responda MENU para ver lo que puedo hacer.",
    "NOT_UNDERSTOOD": ("Lo siento, solo puedo ayudar con su agenda y a buscar lugares como comida o refugio. "
                       "Para todo lo demás, hable con su trabajador social. Responda MENU para ver las opciones."),
    "MENU": ("Responda con una palabra:\n"
             "HOY - su agenda de hoy\n"
             "MAÑANA - su agenda de mañana\n"
             "SEMANA - los próximos 7 días\n"
             "AVISO SI - un mensaje por la mañana los días que tenga algo\n"
             "COMIDA, REFUGIO, TRABAJO, CLASES - lugares cerca (agregue \"cerca de West End\")\n"
             "Envíe una foto de una carta - se la explico o la traduzco\n"
             "SALIR - cerrar la sesión"),
    "HELP": ("Mensajes de {app}. Escriba cualquier cosa para iniciar sesión con su nombre y PIN. "
             "¿Olvidó su PIN? Pregúntele a su trabajador social. En una emergencia llame al {emergency}. "
             "Responda STOP para no recibir más mensajes."),
    "CRISIS": ("Si está en peligro o alguien tuvo una sobredosis, llame al {emergency} ahora. "
               "Para hablar con alguien a cualquier hora, llame o escriba al {crisis}. "
               "Para un lugar donde dormir esta noche, llame al {help}."),
    "NUDGE": "Su agenda de hoy está lista. Responda para iniciar sesión. (Responda AVISO NO para no recibir estos mensajes.)",
    "NUDGE_OFF": "Los avisos de la mañana están desactivados. Responda AVISO SI después de iniciar sesión para activarlos.",
    "NUDGE_BAD_TIME": "No entendí la hora. Intente AVISO 8 o AVISO 7:30 (entre 5 AM y 9 PM).",
    "NUDGE_ON": ("Los avisos de la mañana están activos. Los días que tenga algo en su agenda, recibirá un mensaje "
                 "a las {at}. No dirá qué es; responda para iniciar sesión y verlo. "
                 "Responda AVISO 7:30 para cambiar la hora o AVISO NO para desactivarlos."),
    "NUDGE_SIGN_IN_FIRST": "Primero inicie sesión y luego responda AVISO SI.",
    "TODAY": "Hoy",
    "TOMORROW_LABEL": "Mañana",
    "SCHED_DAY_HEAD": "{label}, {day}:",
    "SCHED_DAY_EMPTY": "{label}, {day}: no tiene nada en su agenda. Responda SEMANA para ver los próximos 7 días.",
    "SCHED_DAY_FOOT": "Responda SEMANA para ver los próximos 7 días.",
    "SCHED_WHERE": "Dónde",
    "SCHED_TRANSIT": "Transporte",
    "SCHED_BRING": "Traiga",
    "SCHED_WEEK_HEAD": "Próximos 7 días:",
    "SCHED_WEEK_EMPTY": "No tiene nada en su agenda los próximos 7 días. Responda MENU para otras opciones.",
    "SCHED_WEEK_FOOT": "Responda HOY o MAÑANA para ver lugares y qué traer.",
    "OVERDUE": "VENCIDO",
    "OBL_fee": "Pago pendiente",
    "OBL_court_date": "Cita en la corte",
    "OBL_check_in": "Presentarse",
    "OBL_report": "Entregar reporte",
    "OBL_other": "Pendiente",
    "CAT_food": "Comida",
    "CAT_shelter": "Refugios",
    "CAT_jobs": "Trabajos que aceptan antecedentes",
    "CAT_classes": "Clases",
    "CAT_events": "Eventos",
    "CAT_addiction": "Ayuda para la recuperación",
    "RES_NEAR": "{title} cerca de {place}",
    "RES_NEAR_YOU": "{title} cerca de usted",
    "RES_NONE": "{title}: no encontré nada por ahora. Responda MENU para otras opciones o pregúntele a su trabajador social.",
    "RES_UNKNOWN_PLACE": "(No encontré \"{place}\", así que no están ordenados desde ahí. Pruebe el nombre de una estación de MARTA.)",
    "RES_HINT_NEAR": "Agregue \"cerca de\" y una estación de MARTA para ordenar por distancia, como COMIDA cerca de West End.",
    "RES_FOOT_ONE": "Responda 1 para ver detalles",
    "RES_FOOT_MANY": "Responda 1-{n} para ver detalles",
    "RES_FOOT_MORE": ", MAS para ver más.",
    "RES_FOOT_END": ".",
    "RES_FOOT_MAP": " MAPA para ver un mapa.",
    "RES_OPEN": "abierto ahora",
    "RES_CLOSED": "cerrado ahora",
    "RES_NEAR_TRANSIT": "cerca de tren/bus",
    "RES_UNVERIFIED": "sin verificar",
    "RES_NO_LIST": "No hay una lista para continuar. Pruebe COMIDA, REFUGIO o TRABAJO.",
    "RES_ALL_SHOWN": "Eso es todo lo que encontré. Responda MENU para otras opciones.",
    "RES_MORE_HEAD": "Más {title}:",
    "RES_NEED_LIST": "Primero envíe COMIDA, REFUGIO o TRABAJO, y luego un número para ver detalles.",
    "RES_PICK_ONE": "Responda 1 para ver detalles.",
    "RES_PICK_N": "Elija un número del 1 al {n}.",
    "RES_GONE": "Ese lugar ya no está en la lista. Responda MAS o pruebe otro número.",
    "RES_CALL": "Llame al {phone}",
    "RES_TODAY_HOURS": "Hoy {spans}",
    "RES_CLOSED_TODAY": "Cerrado hoy",
    "RES_SERVES": "Atiende a: ",
    "RES_HIRING": "Contrata: ",
    "SERVES_men": "solo hombres",
    "SERVES_women": "solo mujeres",
    "SERVES_FAMILIES": "familias bienvenidas",
    "SERVES_RECORDS_OK": "acepta personas con antecedentes",
    "SERVES_RECORDS_CASE": "antecedentes: depende del caso",
    "SERVES_FREE": "gratis",
    "RES_BRING": "Traiga: ",
    "DOC_photo_id": "una identificación con foto",
    "DOC_ssn_card": "su tarjeta del Seguro Social",
    "DOC_birth_certificate": "su acta de nacimiento",
    "DOC_proof_of_income": "comprobante de ingresos",
    "DOC_proof_of_address": "comprobante de domicilio",
    "DOC_release_papers": "sus papeles de salida",
    "DOC_referral_letter": "una carta de referencia",
    "DOC_MISSING": " (no tenemos una en su expediente)",
    "DOC_EXPIRED": " (la de su expediente está vencida)",
    "RES_DIRECTIONS": "Cómo llegar: ",
    "RES_NEAREST_STOP": "Parada más cercana: {stop} ({dist})",
    "RES_CHECKED": "Revisado por el personal.",
    "RES_CHECKED_ON": "Revisado por el personal el {date}.",
    "RES_UNVERIFIED_LONG": "Sin verificar: llame antes de ir.",
    "MAP_NEED_LIST": "Primero envíe COMIDA, REFUGIO o TRABAJO, y luego MAPA.",
    "MAP_HEAD": "Mapa: {title}",
    "MAP_NO_ADDRESS": "Sin dirección para {nums} (mejor llame).",
    "MAP_FIRST_N": "Se muestran los primeros {n}.",
    "MAP_NONE": "Ninguno de estos lugares tiene dirección para el mapa. Responda un número para ver detalles.",
    "MAP_NO_PICTURE": "(El mapa no está disponible ahora; abajo están los enlaces.)",
    "PH_GONE": "Ya no tengo su foto. Por favor, envíela otra vez.",
    "PH_NOT_AVAILABLE": "No puedo leer fotos en este momento. Por favor, muéstresela a su trabajador social.",
    "PH_UNREADABLE": "No pude leerla. Intente otra vez con buena luz y con toda la página en la foto.",
    "PH_UNSUPPORTED": "Solo puedo leer fotos (JPG, PNG, HEIC) o PDF de menos de 10 MB.",
    "PH_SAVED": "Se guardó en sus documentos. Su trabajador social lo revisará.",
    "PH_LEGAL": "Parece un papel legal o de la corte. Consúltelo con su trabajador social antes de hacer algo.",
    "PH_TITLE": "Este papel: {title}.",
    "PH_TODO": "Qué hacer:",
    "PH_NOTHING_TO_DO": "Este papel no le pide hacer nada.",
    "PH_MORE": "Y {n} más.",
    "PH_CHECK": "Revise:",
    "PH_SAVE_OFFER": "Responda GUARDAR para guardarlo. Sus tareas estarán en su portal y su trabajador social podrá verlo.",
}

_DAYS = {
    "en": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    "es": ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"],
}
_MONTHS = {
    "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    "es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
}


class Strings:
    """Strings for one language; missing Spanish keys fall back to English."""

    def __init__(self, lang: str | None = "en"):
        self.lang = "es" if (lang or "").lower().startswith("es") else "en"
        self._t = ES if self.lang == "es" else EN

    def __getattr__(self, key: str) -> str:
        if key.startswith("_"):
            raise AttributeError(key)
        try:
            return self._t.get(key) or EN[key]
        except KeyError:
            raise AttributeError(key) from None

    def get(self, key: str, **kw) -> str:
        s = self._t.get(key) or EN[key]
        return s.format(**kw) if kw else s

    # ---------- dates ----------
    def day(self, d: date) -> str:
        """'Sat Oct 10' / 'sáb 10 oct'"""
        wd, mo = _DAYS[self.lang][d.weekday()], _MONTHS[self.lang][d.month - 1]
        return f"{wd} {d.day} {mo}" if self.lang == "es" else f"{wd} {mo} {d.day}"

    def short_date(self, d: date) -> str:
        """'Oct 3' / '3 oct'"""
        mo = _MONTHS[self.lang][d.month - 1]
        return f"{d.day} {mo}" if self.lang == "es" else f"{mo} {d.day}"

    # ---------- templated ----------
    def help_text(self) -> str:
        s = get_settings()
        return self.get("HELP", app=s.app_name, emergency=s.emergency_number)

    def crisis_text(self) -> str:
        s = get_settings()
        return self.get("CRISIS", emergency=s.emergency_number, crisis=s.crisis_line, help=s.help_line)

    def nudge_on(self, at: str) -> str:
        return self.get("NUDGE_ON", at=at)


EN_STRINGS = Strings("en")
ES_STRINGS = Strings("es")


def both(key: str) -> str:
    """For senders whose language we don't know (unenrolled numbers)."""
    return f"{EN_STRINGS.get(key)}\n\n{ES_STRINGS.get(key)}"


def crisis_both() -> str:
    return f"{EN_STRINGS.crisis_text()}\n\n{ES_STRINGS.crisis_text()}"


# ---------- English names for existing callers ----------
NOT_ENROLLED = EN["NOT_ENROLLED"]
WELCOME = EN["WELCOME"]
ASK_NAME = EN["ASK_NAME"]
ASK_PIN = EN["ASK_PIN"]
BAD_LOGIN = EN["BAD_LOGIN"]
LOCKED = EN["LOCKED"]
SESSION_ENDED = EN["SESSION_ENDED"]
SIGNED_IN = EN["SIGNED_IN"]
SIGNED_OUT = EN["SIGNED_OUT"]
STOPPED = EN["STOPPED"]
STARTED = EN["STARTED"]
PHOTO_SIGN_IN = EN["PHOTO_SIGN_IN"]
PHOTO_ASK_PIN = EN["PHOTO_ASK_PIN"]
PHOTO_RESEND = EN["PHOTO_RESEND"]
NOT_AVAILABLE_YET = EN["NOT_AVAILABLE_YET"]
NOT_UNDERSTOOD = EN["NOT_UNDERSTOOD"]
MENU = EN["MENU"]
NUDGE = EN["NUDGE"]
NUDGE_OFF = EN["NUDGE_OFF"]
NUDGE_BAD_TIME = EN["NUDGE_BAD_TIME"]


def help_text() -> str:
    return EN_STRINGS.help_text()


def crisis_text() -> str:
    return EN_STRINGS.crisis_text()


def nudge_on(at: str) -> str:
    return EN_STRINGS.nudge_on(at)
