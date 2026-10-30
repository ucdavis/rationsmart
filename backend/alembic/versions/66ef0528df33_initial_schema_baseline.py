"""initial_schema_baseline

Revision ID: 66ef0528df33
Revises:
Create Date: 2026-06-12 15:29:19.274328

Creates the schema as it stood at this baseline, from
alembic/baseline/66ef0528df33_schema.sql, so `alembic upgrade head` can build a
database from empty (docs/dev_docs/db_model_alignment).

Until 2026-10-27 this upgrade() was empty ("DB already at this state"). Every
existing database (Test) is already past this revision, so Alembic never runs it
there again; the new body only runs on an empty database.
"""
from pathlib import Path
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '66ef0528df33'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

SCHEMA_SQL = Path(__file__).resolve().parents[1] / "baseline" / "66ef0528df33_schema.sql"


def upgrade() -> None:
    bind = op.get_bind()
    # A database that already holds the schema but has no alembic_version row
    # (restored from a dump, or created by hand) must be stamped, not built:
    # running the baseline there would fail half-way on "already exists".
    if bind.execute(sa.text("SELECT to_regclass('public.country')")).scalar() is not None:
        raise RuntimeError(
            "Table 'country' already exists, so this database already has a schema. "
            "Do not build it with the baseline: compare it with "
            "`python -m scripts_2.schema_drift_check --url ...` and then "
            "`alembic stamp <revision>` instead."
        )
    # exec_driver_sql with no parameters: psycopg2 sends the text as-is, so the
    # '::' casts and '%' in the dump are not read as bind parameters.
    bind.exec_driver_sql(SCHEMA_SQL.read_text(encoding="utf-8"))


def downgrade() -> None:
    """Baseline — no downgrade path. Never drop the whole schema from here."""
    raise NotImplementedError("Downgrading below the baseline (66ef0528df33) is not supported.")
