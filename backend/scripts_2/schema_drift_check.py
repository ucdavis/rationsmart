"""Compare app/db/models.py with a database schema and report every difference.

The models, the Alembic chain and every database must describe the same schema
(docs/dev_docs/db_model_alignment). This is the check:

    python -m scripts_2.schema_drift_check                   # the .env database, read-only
    python -m scripts_2.schema_drift_check --url URL         # another database, read-only
    python -m scripts_2.schema_drift_check --fresh --url URL # EMPTY database: upgrade head, then compare

On the Test server: docker compose exec -T api python -m scripts_2.schema_drift_check

Exit code 0 = no drift, 1 = drift (each difference is printed), 2 = usage error.
The comparison uses the same rules as `alembic revision --autogenerate`
(app/db/schema_compare.py), so "no drift" means autogenerate would write nothing,
plus a definition check of the expression index Alembic cannot compare.

What it compares: tables, columns, types, nullability, comments, indexes, unique
and foreign-key constraints, and CHECK constraints **by name** (a changed
condition under the same name is not seen). What it does not: server defaults,
triggers and functions (the baseline migration owns those).
"""
import argparse
import pathlib
import sys

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text

_BACKEND = pathlib.Path(__file__).resolve().parents[1]


def _flatten(diffs):
    for d in diffs:
        if isinstance(d, list):  # column-level changes come grouped per column
            yield from d
        else:
            yield d


def _describe(d) -> str:
    kind = d[0]
    if kind in ("add_index", "remove_index"):
        return f"{kind}: {d[1].table.name}.{d[1].name}"
    if kind in ("add_constraint", "remove_constraint", "add_fk", "remove_fk"):
        c = d[1]
        table = c.parent.name if kind.endswith("_fk") else c.table.name
        return f"{kind}: {table}.{c.name}"
    if kind in ("add_table", "remove_table", "add_table_comment", "remove_table_comment"):
        return f"{kind}: {d[1].name}"
    if kind in ("add_column", "remove_column"):
        return f"{kind}: {d[2]}.{d[3].name}"
    if kind.startswith("modify_"):
        return f"{kind}: {d[2]}.{d[3]}  db={d[5]!r}  model={d[6]!r}"
    return repr(d)


def _alembic_config() -> Config:
    return Config(str(_BACKEND / "alembic.ini"))


def compare(connection) -> list[str]:
    """Differences between the models and the connection's database (read-only)."""
    from app.db.base import Base
    import app.db.models  # noqa: F401 — registers every model on Base.metadata
    from app.db.schema_compare import COMPARE_OPTS, check_expression_indexes, include_object

    ctx = MigrationContext.configure(
        connection, opts={"include_object": include_object, **COMPARE_OPTS},
    )
    diffs = [_describe(d) for d in _flatten(compare_metadata(ctx, Base.metadata))]
    return diffs + check_expression_indexes(connection)


def build_fresh(engine) -> None:
    """Run `alembic upgrade head` on an empty database."""
    with engine.connect() as conn:
        if inspect(conn).get_table_names():
            raise SystemExit("--fresh needs an EMPTY database; this one has tables.")
    with engine.begin() as conn:
        cfg = _alembic_config()
        cfg.attributes["connection"] = conn
        command.upgrade(cfg, "head")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--url", help="postgresql:// URL (default: the .env database)")
    parser.add_argument("--fresh", action="store_true",
                        help="build the EMPTY database at --url with `alembic upgrade head` first")
    args = parser.parse_args(argv)

    if args.fresh and not args.url:
        parser.error("--fresh needs --url (it never touches the .env database)")
    if args.url:
        url = args.url
    else:
        from app.config import settings
        url = settings.database_url

    engine = create_engine(url)
    try:
        if args.fresh:
            build_fresh(engine)
        with engine.connect() as conn:
            conn.execute(text("SET TRANSACTION READ ONLY"))
            db_rev = MigrationContext.configure(conn).get_current_revision()
            diffs = compare(conn)
    finally:
        engine.dispose()

    head = ScriptDirectory.from_config(_alembic_config()).get_current_head()
    print(f"alembic head (code): {head}")
    print(f"alembic_version (db): {db_rev}")
    for line in diffs:
        print("  " + line)
    behind = db_rev != head
    if behind:
        print("Database is not at the code's head revision.")
    print(f"{len(diffs)} difference(s)")
    return 1 if diffs or behind else 0


if __name__ == "__main__":
    sys.exit(main())
