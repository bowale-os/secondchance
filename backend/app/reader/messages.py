"""Every sentence the reader can show a client when something goes wrong, in English and
Spanish. Errors carry a key, and the router picks the client's language when it sends them.
None of these ever include document text."""

from typing import Optional

MESSAGES: dict[str, dict[str, str]] = {
    "refused": {
        "en": "We couldn't finish this paper; please show it to your case manager.",
        "es": "No pudimos terminar este papel; por favor muéstrelo a su administrador de caso.",
    },
    "failed": {
        "en": "Something went wrong reading this paper. Please try again.",
        "es": "Algo salió mal al leer este papel. Por favor, inténtelo de nuevo.",
    },
    "no_pages": {
        "en": "No pages were sent. Please take a photo or pick a file.",
        "es": "No se envió ninguna página. Tome una foto o elija un archivo.",
    },
    "word_alone": {
        "en": "Please send a Word file by itself, without photos or other files.",
        "es": "Envíe el archivo de Word solo, sin fotos ni otros archivos.",
    },
    "too_big": {
        "en": "These files are too big. Please send less than 20 MB at a time.",
        "es": "Estos archivos son demasiado grandes. Envíe menos de 20 MB a la vez.",
    },
    "too_many": {
        "en": "That's more than {max} pages. Please send {max} pages or fewer at a time.",
        "es": "Son más de {max} páginas. Envíe {max} páginas o menos a la vez.",
    },
    "bad_type": {
        "en": '"{name}" is not a file type we can read. Use a photo, PDF, or Word file.',
        "es": '"{name}" no es un tipo de archivo que podamos leer. Use una foto, un PDF o un archivo de Word.',
    },
    "bad_image": {
        "en": 'We couldn\'t open "{name}". Try taking the photo again.',
        "es": 'No pudimos abrir "{name}". Intente tomar la foto otra vez.',
    },
    "bad_pdf": {
        "en": "We couldn't open this PDF. If it has a password, take photos of the pages instead.",
        "es": "No pudimos abrir este PDF. Si tiene contraseña, tome fotos de las páginas.",
    },
    "bad_word": {
        "en": 'We couldn\'t open "{name}". Try taking a photo of the paper instead.',
        "es": 'No pudimos abrir "{name}". Intente tomar una foto del papel.',
    },
    "empty": {
        "en": "These files look empty. Please try a photo of the paper.",
        "es": "Estos archivos parecen vacíos. Intente con una foto del papel.",
    },
    "expired": {
        "en": "This reading has expired. Please read the paper again to keep it.",
        "es": "Esta lectura venció. Lea el papel otra vez para guardarlo.",
    },
    "cant_save": {
        "en": "We couldn't save this paper. Please read it again.",
        "es": "No pudimos guardar este papel. Por favor, léalo otra vez.",
    },
    "wrong_pages": {
        "en": "These aren't the same pages that were read. Please read the paper again.",
        "es": "Estas no son las mismas páginas que se leyeron. Lea el papel otra vez.",
    },
    "rate_limited": {
        "en": "Too many papers at once. Please wait a minute and try again.",
        "es": "Demasiados papeles a la vez. Espere un minuto e inténtelo de nuevo.",
    },
}


def say(key: str, lang: Optional[str] = "en", **params) -> str:
    return MESSAGES[key]["es" if lang == "es" else "en"].format(**params)


class UserFacingError(Exception):
    """An error whose message is safe to show a client. str() is the English sentence;
    text(lang) gives it in the client's language."""

    def __init__(self, key: str, **params):
        super().__init__(say(key, "en", **params))
        self.key = key
        self.params = params

    def text(self, lang: Optional[str]) -> str:
        return say(self.key, lang, **self.params)
