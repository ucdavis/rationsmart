"""add custom_feeds.fd_type_id / fd_category_id FKs

Ticket B (taxonomy ID contract, Phase 2): give custom_feeds the same additive
taxonomy FK columns that `feeds` already carries, so both tables filter by FK on
an identical code path. Both columns are NULLABLE (legacy/imported rows without a
taxonomy match are tolerated) and populated going forward by the custom-feed
create/update path once taxonomy validation is in place — no backfill (the table
is emptied of throwaway test data as part of this ticket).

INVARIANT T1: the denormalized English text columns custom_feeds.fd_type /
fd_category STAY. The optimizer keys on the text (concentrate/forage masks) and
the vocabulary-translation join uses it. These FK columns are ADDITIVE ONLY.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'custom_feeds',
        sa.Column('fd_type_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        'custom_feeds',
        sa.Column('fd_category_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_custom_feeds_fd_type_id',
        'custom_feeds',
        'feed_types',
        ['fd_type_id'],
        ['id'],
    )
    op.create_foreign_key(
        'fk_custom_feeds_fd_category_id',
        'custom_feeds',
        'feed_categories',
        ['fd_category_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_custom_feeds_fd_category_id', 'custom_feeds', type_='foreignkey')
    op.drop_constraint('fk_custom_feeds_fd_type_id', 'custom_feeds', type_='foreignkey')
    op.drop_column('custom_feeds', 'fd_category_id')
    op.drop_column('custom_feeds', 'fd_type_id')
