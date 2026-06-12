import os

# pydantic v2 moved BaseSettings to the pydantic-settings package.
# This try/except works with both pydantic v1 and v2.
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseSettings  # type: ignore[no-redef]  # pydantic v1

# Computed once at import time; can be overridden by OPTIMIZATION_POOL_WORKERS env var.
_default_pool_workers = max(1, (os.cpu_count() or 2) - 1)


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────────────────────────────────
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str
    postgres_port: int = 9900

    # ── SMTP ──────────────────────────────────────────────────────────────────
    smtp_server: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    from_email: str
    from_name: str = "RationSmart Feed Formulation"

    # ── AWS S3 (Phase 5: replaced by Azure Blob Storage) ──────────────────────
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-southeast-2"
    aws_s3_bucket: str = "ucd-reports"

    # ── Security (Phase 2 adds JWT fields) ────────────────────────────────────
    # jwt_secret_key: str
    # jwt_algorithm: str = "HS256"
    # jwt_access_token_expire_minutes: int = 60

    # ── Optimization ──────────────────────────────────────────────────────────
    optimization_pool_workers: int = _default_pool_workers
    allow_infeasible_reports: bool = False
    nsga3_verbose: bool = False

    # ── PIN migration ─────────────────────────────────────────────────────────
    force_pin_reset_for_legacy_users: bool = True

    # ── App ───────────────────────────────────────────────────────────────────
    workers: int = 3

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
