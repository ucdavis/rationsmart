from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Load app config and all ORM models so metadata is populated
from app.config import settings
from app.db.base import Base
from app.db import models  # registers all 15 tables on Base.metadata  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# feeds_dup is a backup table with no PK; alembic_version is Alembic-internal.
# Exclude both from autogenerate so they never appear in generated migrations.
EXCLUDED_TABLES = {"feeds_dup", "alembic_version"}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and name in EXCLUDED_TABLES:
        return False
    # Indexes are performance-tuning concerns managed outside Alembic migrations.
    # Excluding them keeps autogenerate output clean.
    if type_ == "index":
        return False
    return True


def run_migrations_offline() -> None:
    url = settings.database_url
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = settings.database_url

    connectable = engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
            compare_server_default=False,  # server defaults are DB-side; not tracked in ORM
            include_schemas=False,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
