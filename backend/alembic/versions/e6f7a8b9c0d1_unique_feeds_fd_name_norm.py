"""unique index on the normalized feeds.fd_name

Feed names must be unique across the library, compared lowercase, trimmed and
with runs of whitespace (no-break space included) collapsed (unique-names plan
U1/U4, docs/dev_docs/climdes/unique_feed_names_IMPLEMENTATION_PLAN.md). The
import and the admin screens check this in code; this index is the guarantee
for every other writer and turns the name lookup into an index read.

The expression is a literal copy of app.db.models.feed_name_key (a unit test
compares them). Postgres only uses the index for a lookup whose expression
matches exactly, so change both together, in a new migration.

Refuses to run while duplicates exist, listing them, rather than failing on a
bare unique violation: empty or de-duplicate the feed library first (on Test,
scripts_2.db_reset, then a re-sync with this code in place).

A plain CREATE INDEX (not CONCURRENTLY): it blocks writes to `feeds` while it
builds, which takes milliseconds for a library of hundreds to a few thousand
rows, and it can run inside Alembic's transaction.

Revision ID: e6f7a8b9c0d1
Revises: c4d5e6f7a8b9
Create Date: 2026-10-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = 'uq_feeds_fd_name_norm'
NAME_KEY_SQL = r"lower(trim(regexp_replace(fd_name, '[\s\u00a0]+', ' ', 'g')))"
SHOW_DUPLICATES = 20


def _duplicate_names(conn):
    return conn.execute(sa.text(
        "SELECT " + NAME_KEY_SQL + " AS name_key, count(*) AS n, "
        "string_agg(fd_code, ', ' ORDER BY fd_code) AS codes "
        "FROM feeds GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC, 1"
    )).fetchall()


def upgrade() -> None:
    duplicates = _duplicate_names(op.get_bind())
    if duplicates:
        shown = "; ".join(
            f"'{row.name_key}' x{row.n} ({row.codes})" for row in duplicates[:SHOW_DUPLICATES]
        )
        raise RuntimeError(
            f"Cannot create {INDEX_NAME}: {len(duplicates)} feed name(s) are used by more "
            "than one feed (compared ignoring case and extra spaces). Remove the "
            f"duplicates first, then re-run the migration. First {SHOW_DUPLICATES}: {shown}"
        )
    op.create_index(INDEX_NAME, 'feeds', [sa.text(NAME_KEY_SQL)], unique=True)


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name='feeds')
