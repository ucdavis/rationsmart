"""feed names unique per country, not across the library

Replaces uq_feeds_fd_name_norm (library-wide) with uq_feeds_country_fd_name_norm
on (fd_country_id, normalized fd_name), NULLS NOT DISTINCT
(docs/dev_docs/feed_name_per_country/v1_Feed_Name_Per_Country_Plan.md). The
same English name may then be used in different countries; within one country
it stays unique, compared as before (lowercase, trimmed, whitespace collapsed).

The name expression is the same literal copy of app.db.models.feed_name_key as
in e6f7a8b9c0d1 (a unit test compares them). Postgres only uses the index for a
lookup whose expression matches exactly, so change both together, in a new
migration.

Upgrade can't fail on data: every library-wide unique name is also unique per
country. The new index is built before the old one is dropped, in the same
transaction, so uniqueness is enforced throughout.

Downgrade refuses while a name is used in more than one country, listing them,
rather than failing on a bare unique violation: rename or remove those feeds
first.

Plain CREATE INDEX (not CONCURRENTLY), as in e6f7a8b9c0d1: it blocks writes to
`feeds` for milliseconds on a library of hundreds to a few thousand rows.

Revision ID: f3a4b5c6d7e8
Revises: e2f3a4b5c6d7
Create Date: 2026-11-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f3a4b5c6d7e8'
down_revision: Union[str, Sequence[str], None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = 'uq_feeds_country_fd_name_norm'
OLD_INDEX_NAME = 'uq_feeds_fd_name_norm'
NAME_KEY_SQL = r"lower(trim(regexp_replace(fd_name, '[\s\u00a0]+', ' ', 'g')))"
SHOW_DUPLICATES = 20


def _library_wide_duplicates(conn):
    return conn.execute(sa.text(
        "SELECT " + NAME_KEY_SQL + " AS name_key, count(*) AS n, "
        "string_agg(fd_code, ', ' ORDER BY fd_code) AS codes "
        "FROM feeds GROUP BY 1 HAVING count(*) > 1 ORDER BY 2 DESC, 1"
    )).fetchall()


def upgrade() -> None:
    op.execute(
        f"CREATE UNIQUE INDEX {INDEX_NAME} ON feeds (fd_country_id, {NAME_KEY_SQL}) "
        "NULLS NOT DISTINCT"
    )
    op.drop_index(OLD_INDEX_NAME, table_name='feeds')


def downgrade() -> None:
    duplicates = _library_wide_duplicates(op.get_bind())
    if duplicates:
        shown = "; ".join(
            f"'{row.name_key}' x{row.n} ({row.codes})" for row in duplicates[:SHOW_DUPLICATES]
        )
        raise RuntimeError(
            f"Cannot restore {OLD_INDEX_NAME}: {len(duplicates)} feed name(s) are used by "
            "more than one feed (compared ignoring case and extra spaces), in different "
            "countries. Rename or remove them first, then re-run the downgrade. "
            f"First {SHOW_DUPLICATES}: {shown}"
        )
    op.create_index(OLD_INDEX_NAME, 'feeds', [sa.text(NAME_KEY_SQL)], unique=True)
    op.drop_index(INDEX_NAME, table_name='feeds')
