"""
Rules for comparing the ORM metadata with a live database.

Shared by alembic/env.py (autogenerate) and scripts_2/schema_drift_check.py, so
both report the same differences. No app imports beyond SQLAlchemy: env.py
loads this before any engine exists.
"""
from sqlalchemy import text

# alembic_version is Alembic-internal; never part of a generated migration.
EXCLUDED_TABLES = {"alembic_version"}

# uq_feeds_fd_name_norm is an expression index (app.db.models.feed_name_key).
# Postgres returns the expression in its own spelling (TRIM(BOTH FROM ...),
# ::text casts), so Alembic always reports it as "remove + add" although the two
# are the same index. Migration e6f7a8b9c0d1 owns it; a unit test pins its SQL.
# Excluded from Alembic's comparison, it is checked by check_expression_indexes().
EXCLUDED_INDEXES = {"uq_feeds_fd_name_norm"}

# The definition Postgres prints for each excluded index (pg_get_indexdef on
# Test, 2026-10-27). The regex holds a backslash escape, not a no-break space.
EXPRESSION_INDEX_DEFS = {
    "uq_feeds_fd_name_norm": (
        r"CREATE UNIQUE INDEX uq_feeds_fd_name_norm ON public.feeds USING btree "
        r"(lower(TRIM(BOTH FROM regexp_replace(fd_name, '[\s\u00a0]+'::text, ' '::text, 'g'::text))))"
    ),
}

# Options passed to Alembic's MigrationContext. Server defaults are not compared:
# Postgres re-spells them (e.g. 'NULL::character varying'), which is noise.
# checkconstraint_byname (opt-in since Alembic 1.19.2) reports CHECK constraints
# added or removed, matched by name only: a changed expression under the same
# name is not seen. Every CheckConstraint in the models must therefore be named.
COMPARE_OPTS = {
    "compare_type": True,
    "compare_server_default": False,
    "autogenerate_plugins": ["alembic.autogenerate.*", "alembic.ext.checkconstraint_byname"],
}


def include_object(obj, name, type_, reflected, compare_to):
    if type_ == "table" and name in EXCLUDED_TABLES:
        return False
    if type_ == "index" and name in EXCLUDED_INDEXES:
        return False
    return True


def check_expression_indexes(connection) -> list[str]:
    """Problems with the indexes Alembic cannot compare: missing or a different definition."""
    problems = []
    for name, expected in EXPRESSION_INDEX_DEFS.items():
        actual = connection.execute(
            text("SELECT pg_get_indexdef(to_regclass(:n))"), {"n": f"public.{name}"},
        ).scalar()
        if actual is None:
            problems.append(f"missing_index: {name}")
        elif actual != expected:
            problems.append(f"modify_index: {name}  db={actual!r}  expected={expected!r}")
    return problems


def check_invalid_indexes(connection) -> list[str]:
    """Indexes Postgres marks invalid (e.g. a failed CREATE INDEX CONCURRENTLY).

    Alembic compares definitions only. An invalid index keeps its definition but
    is not used for queries, and an invalid unique index does not guarantee
    uniqueness, so each one is reported as drift.
    """
    rows = connection.execute(text(
        "SELECT c.relname FROM pg_index i "
        "JOIN pg_class c ON c.oid = i.indexrelid "
        "JOIN pg_namespace n ON n.oid = c.relnamespace "
        "WHERE n.nspname = 'public' AND NOT i.indisvalid ORDER BY c.relname"
    ))
    return [f"invalid_index: {name}" for (name,) in rows]
