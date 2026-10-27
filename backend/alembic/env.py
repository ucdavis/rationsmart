from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

from alembic import context

# Load app config and all ORM models so metadata is populated
from app.config import settings
from app.db.base import Base
from app.db import models  # registers all 15 tables on Base.metadata  # noqa: F401
# Indexes, comments and constraints are all compared; the few exclusions live in
# app/db/schema_compare.py, shared with scripts_2/schema_drift_check.py.
from app.db.schema_compare import COMPARE_OPTS, include_object

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


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


def _run_on(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_object=include_object,
        include_schemas=False,
        **COMPARE_OPTS,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # A caller (scripts_2/schema_drift_check.py, tests) may hand over its own
    # connection to migrate a database other than the one in .env.
    connection = config.attributes.get("connection")
    if connection is not None:
        _run_on(connection)
        return

    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = settings.database_url

    connectable = engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        _run_on(connection)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
