"""drop duplicate indexes and the duplicate feeds.created_by foreign key

Nine indexes repeat another index or a unique constraint on the same columns,
and feeds.created_by has two identical foreign keys. They hold no data; the
copy that stays does the same job (plan: docs/dev_docs/db_model_alignment,
§2.2, Q3).

No CASCADE and IF EXISTS, as in f7a8b9c0d1e2. One transaction: all ten go, or
none. downgrade() recreates each one exactly as pg_get_indexdef /
pg_get_constraintdef printed it on Test on 2026-10-27.

Revision ID: c0d1e2f3a4b5
Revises: b9c0d1e2f3a4
Create Date: 2026-10-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'c0d1e2f3a4b5'
down_revision: Union[str, Sequence[str], None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Dropped index -> its definition on Test. The copy kept is in the comment.
DUPLICATE_INDEXES = {
    # kept: country_name_key (unique)
    "idx_country_name": "CREATE INDEX idx_country_name ON public.country USING btree (name)",
    # kept: country_country_code_key (unique)
    "idx_country_code": "CREATE INDEX idx_country_code ON public.country USING btree (country_code)",
    # kept: custom_feeds_feed_code_key (unique)
    "idx_custom_feeds_feed_code":
        "CREATE INDEX idx_custom_feeds_feed_code ON public.custom_feeds USING btree (fd_code)",
    # kept: uq_feed_translations_feed_lang (unique)
    "idx_feed_translations_feed_lang":
        "CREATE INDEX idx_feed_translations_feed_lang ON public.feed_translations USING btree (feed_id, language)",
    # kept: idx_feeds_country_id
    "idx_feeds_fd_country_id": "CREATE INDEX idx_feeds_fd_country_id ON public.feeds USING btree (fd_country_id)",
    # kept: reports_report_id_key (unique)
    "idx_reports_report_id": "CREATE INDEX idx_reports_report_id ON public.reports USING btree (report_id)",
    # kept: idx_user_feedback_created_at (a one-column B-tree is read in both directions)
    "idx_user_feedback_admin":
        "CREATE INDEX idx_user_feedback_admin ON public.user_feedback USING btree (created_at DESC)",
    # kept: uq_user_email (unique)
    "idx_user_email": "CREATE INDEX idx_user_email ON public.user_information USING btree (email_id)",
    # kept: idx_user_country
    "idx_user_country_id":
        "CREATE INDEX idx_user_country_id ON public.user_information USING btree (country_id)",
}

# kept: feeds_created_by_fkey (same columns, target and ON DELETE)
DUPLICATE_FK = "fk_feeds_created_by"
DUPLICATE_FK_DEF = "FOREIGN KEY (created_by) REFERENCES user_information(id) ON DELETE SET NULL"


def upgrade() -> None:
    for name in DUPLICATE_INDEXES:
        op.execute(f'DROP INDEX IF EXISTS public."{name}"')
    op.execute(f'ALTER TABLE public.feeds DROP CONSTRAINT IF EXISTS "{DUPLICATE_FK}"')


def downgrade() -> None:
    for ddl in DUPLICATE_INDEXES.values():
        op.execute(ddl.replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ", 1))
    op.execute(
        "DO $$ BEGIN "
        f"IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '{DUPLICATE_FK}') THEN "
        f"ALTER TABLE public.feeds ADD CONSTRAINT {DUPLICATE_FK} {DUPLICATE_FK_DEF}; "
        "END IF; END $$"
    )
