from functools import lru_cache
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import SecretStr, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    """Mirrors backend/.env. Only DATABASE_URL is required; the rest have safe defaults."""

    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    # ---------- App ----------
    node_env: str = "development"
    app_name: str = "SecondChance"
    app_base_url: str = "http://localhost:5173"
    api_base_url: str = "http://localhost:3000"
    port: int = 3000
    default_language: str = "en"
    supported_languages: str = "en,es"
    local_timezone: str = "America/New_York"  # schedules are shown in this zone

    # ---------- Security ----------
    session_secret: SecretStr = SecretStr("change-me")
    pin_pepper: SecretStr = SecretStr("change-me")
    data_encryption_key: SecretStr = SecretStr("change-me")
    session_timeout_minutes: int = 10
    pin_max_attempts: int = 5
    pin_lockout_minutes: int = 15
    transcript_retention_days: int = 30
    abandoned_upload_hours: int = 24

    # ---------- AI ----------
    doc_reader_provider: str = "anthropic"  # anthropic | gemini | bedrock
    agent_provider: str = "anthropic"
    anthropic_api_key: SecretStr = SecretStr("")
    anthropic_model: str = "claude-opus-5-5"
    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = ""
    reader_ai: str = "gemini"  # gemini | fake (document reader; fake needs no key)

    # ---------- Twilio ----------
    twilio_account_sid: str = ""
    twilio_auth_token: SecretStr = SecretStr("")
    twilio_phone_number: str = ""
    twilio_webhook_url: str = ""

    # ---------- ElevenLabs ----------
    elevenlabs_api_key: SecretStr = SecretStr("")
    elevenlabs_voice_id_en: str = ""
    elevenlabs_voice_id_es: str = ""
    elevenlabs_agent_id: str = ""

    # ---------- Auth0 ----------
    auth0_domain: str = ""
    auth0_client_id: str = ""
    auth0_client_secret: SecretStr = SecretStr("")
    auth0_audience: str = ""

    # ---------- AWS ----------
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: SecretStr = SecretStr("")
    dynamodb_table_prefix: str = ""
    s3_documents_bucket: str = ""
    kms_key_id: str = ""

    # ---------- Database (Neon Postgres) ----------
    database_url: str

    # ---------- Vultr ----------
    vultr_api_key: SecretStr = SecretStr("")
    vultr_object_storage_endpoint: str = ""
    vultr_object_storage_access_key: str = ""
    vultr_object_storage_secret_key: SecretStr = SecretStr("")
    vultr_bucket: str = ""

    # ---------- Maps / resources / safety ----------
    maps_api_key: SecretStr = SecretStr("")

    # ---------- Resource ingestion (python -m app.jobs.ingest_resources) ----------
    ingest_state: str = "GA"
    ingest_center: str = "33.749,-84.388"  # lat,lng; SAMHSA distance search is centered here
    ingest_radius_m: float = 80467.0  # 50 miles
    ingest_enabled: bool = False  # run the ingest on a timer inside the API process
    ingest_interval_hours: float = 6
    ingest_user_agent: str = "SecondChanceResourceBot/1.0 (reentry resource directory)"
    crisis_line: str = "988"
    emergency_number: str = "911"
    help_line: str = "211"

    # ---------- Text bot (Photon Spectrum sidecar) ----------
    # Shared secret the textbot sidecar sends as a bearer token, both directions.
    bot_service_secret: SecretStr = SecretStr("")
    textbot_url: str = "http://localhost:8787"  # sidecar's internal /send endpoint
    bot_idle_minutes: int = 15
    bot_session_max_hours: int = 3
    bot_max_failed_attempts: int = 5

    # ---------- Derived ----------
    @computed_field
    @property
    def debug(self) -> bool:
        return self.node_env == "development"

    @computed_field
    @property
    def cors_origins(self) -> list[str]:
        return [self.app_base_url.rstrip("/")]

    @computed_field
    @property
    def languages(self) -> list[str]:
        return [lang.strip() for lang in self.supported_languages.split(",") if lang.strip()]

    @property
    def async_database_url(self) -> str:
        """Neon URL rewritten for SQLAlchemy + asyncpg.

        asyncpg does not understand libpq params (sslmode, channel_binding),
        so they are stripped here and SSL is enabled via connect_args.
        """
        parts = urlsplit(self.database_url)
        query = [
            (k, v)
            for k, v in parse_qsl(parts.query)
            if k not in {"sslmode", "channel_binding"}
        ]
        return urlunsplit(
            parts._replace(scheme="postgresql+asyncpg", query=urlencode(query))
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
