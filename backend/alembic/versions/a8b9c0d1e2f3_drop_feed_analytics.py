"""drop feed_analytics

Drops the feed_analytics table together with POST /v1/animal/feed-analytics,
its only writer. No client calls that endpoint (the PWA never did) and the
table never held a row. It was built to store field agents' and farmers' names
and phone numbers, with no consent screen in front of it. Follow-up to
f7a8b9c0d1e2 (plan: docs/dev_docs/unused_tables/v1_Unused_Tables_Removal_Plan.md,
decision D6).

No CASCADE and IF EXISTS, as in f7a8b9c0d1e2. downgrade() recreates the table
empty, with the columns, key and index it had on Test.

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-10-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, Sequence[str], None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Captured from Test with pg_dump --schema-only on 2026-10-24.
RECREATE_SQL = (
    """
    CREATE TABLE feed_analytics (
        da_name character varying(100) NOT NULL,
        da_phone_num character varying(100) NOT NULL,
        country_cd character varying(3) NOT NULL,
        country_name character varying(100) NOT NULL,
        animal_info text NOT NULL,
        sys_rcmd text NOT NULL,
        cust_rcmd text NOT NULL,
        farmer_name text NOT NULL,
        farmer_phone_num character varying(100) NOT NULL,
        rcmd_dt date DEFAULT CURRENT_DATE NOT NULL,
        farmer_adopted boolean,
        created_on timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_on timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        id uuid NOT NULL PRIMARY KEY
    )
    """,
    "CREATE INDEX idx_feed_analytics_id ON feed_analytics (id)",
)


def upgrade() -> None:
    op.execute('DROP TABLE IF EXISTS "feed_analytics"')


def downgrade() -> None:
    for statement in RECREATE_SQL:
        op.execute(statement)
