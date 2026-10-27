"""
Rules for comparing the ORM metadata with a live database.

Shared by alembic/env.py (autogenerate) and scripts_2/schema_drift_check.py, so
both report the same differences. No app imports beyond SQLAlchemy: env.py
loads this before any engine exists.
"""

# alembic_version is Alembic-internal; never part of a generated migration.
EXCLUDED_TABLES = {"alembic_version"}

# uq_feeds_fd_name_norm is an expression index (app.db.models.feed_name_key).
# Postgres returns the expression in its own spelling (TRIM(BOTH FROM ...),
# ::text casts), so Alembic always reports it as "remove + add" although the two
# are the same index. Migration e6f7a8b9c0d1 owns it; a unit test pins its SQL.
EXCLUDED_INDEXES = {"uq_feeds_fd_name_norm"}

# Options passed to Alembic's MigrationContext. Server defaults are not compared:
# Postgres re-spells them (e.g. 'NULL::character varying'), which is noise.
COMPARE_OPTS = {"compare_type": True, "compare_server_default": False}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and name in EXCLUDED_TABLES:
        return False
    if type_ == "index" and name in EXCLUDED_INDEXES:
        return False
    return True
