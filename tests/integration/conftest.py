"""
Integration-test configuration.

Points the app/Alembic at the ISOLATED throwaway test Postgres (a dedicated
Docker container with its own credentials — never any real data). These env
vars are set at import time, before `app.config` is first imported, so they win
over the project `.env` (pydantic-settings: env vars > .env file).

Run these tests in their own invocation so the global Settings singleton is
built from this DB:

    ./.venv/bin/python -m pytest tests/integration
"""
import os

# Override DB target -> the test container on localhost:5455.
os.environ["POSTGRES_HOST"] = "localhost"
os.environ["POSTGRES_PORT"] = "5455"
os.environ["POSTGRES_USER"] = "rs_test"
os.environ["POSTGRES_PASSWORD"] = "rs_test"
os.environ["POSTGRES_DB"] = "rationsmart_test"

# Non-DB required settings (also provided by the root conftest via setdefault).
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-do-not-use-in-production-0000000000000000")
os.environ.setdefault("API_BASE_URL", "http://localhost:8000")
os.environ.setdefault("SMTP_SERVER", "localhost")
os.environ.setdefault("SMTP_USERNAME", "test@example.com")
os.environ.setdefault("SMTP_PASSWORD", "test")
os.environ.setdefault("FROM_EMAIL", "test@example.com")
