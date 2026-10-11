import os

os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/unused")  # lazy engine; tests use SQLite
os.environ.setdefault("BOT_SERVICE_SECRET", "test-sidecar-secret")
os.environ.setdefault("PIN_PEPPER", "test-pepper")
os.environ.setdefault("SESSION_SECRET", "test-session-secret-at-least-32-bytes-long")
os.environ.setdefault("DATA_ENCRYPTION_KEY", "test-encryption-key")
os.environ.setdefault("READER_RECEIPT_SECRET", "test-receipt-secret-at-least-32-bytes-long")
