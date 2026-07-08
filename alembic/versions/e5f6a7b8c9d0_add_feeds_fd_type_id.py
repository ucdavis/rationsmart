"""add feeds.fd_type_id FK to feed_types

Adds a nullable taxonomy FK column `feeds.fd_type_id` (→ feed_types.id), the
counterpart to the existing `feeds.fd_category_id`. Populated going forward by the
admin bulk-upload path once taxonomy validation is in place; existing rows are left
as NULL (no backfill — see docs/dev_docs/bulk_upload_change/IMPLEMENTATION_PLAN.md §3, 6a).

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-07-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'feeds',
        sa.Column('fd_type_id', postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_feeds_fd_type_id',
        'feeds',
        'feed_types',
        ['fd_type_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_feeds_fd_type_id', 'feeds', type_='foreignkey')
    op.drop_column('feeds', 'fd_type_id')
