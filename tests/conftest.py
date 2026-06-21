"""
Shared pytest configuration.

Sets required environment variables before any module under `app/` or
`services/` is imported. This prevents Settings() from raising a
ValidationError about missing required fields during test collection.
"""
import os

# Minimal set needed so pydantic-settings can instantiate Settings()
_REQUIRED_ENV = {
    "JWT_SECRET_KEY": "test-secret-key-do-not-use-in-production-0000000000000000",
    "POSTGRES_USER": "test",
    "POSTGRES_PASSWORD": "test",
    "POSTGRES_DB": "test",
    "POSTGRES_HOST": "localhost",
    "POSTGRES_PORT": "5432",
    "SMTP_SERVER": "localhost",
    "SMTP_PORT": "1025",
    "SMTP_USERNAME": "test@example.com",
    "SMTP_PASSWORD": "test",
    "FROM_EMAIL": "test@example.com",
    "FROM_NAME": "Test",
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    "AWS_REGION": "us-east-1",
    "AWS_S3_BUCKET": "test-bucket",
    "API_BASE_URL": "http://localhost:8000",
}

for key, value in _REQUIRED_ENV.items():
    os.environ.setdefault(key, value)
