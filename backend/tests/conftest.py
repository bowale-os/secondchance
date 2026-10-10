import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/unused")  # lazy engine; tests use SQLite
os.environ.setdefault("BOT_SERVICE_SECRET", "test-sidecar-secret")
os.environ.setdefault("PIN_PEPPER", "test-pepper")
os.environ.setdefault("DATA_ENCRYPTION_KEY", "test-encryption-key")
