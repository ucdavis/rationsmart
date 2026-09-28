"""enforce feeds.fd_code NOT NULL and UNIQUE

Revision ID: c3d4e5f6a7b8
Revises: a1b2c3d4e5f6
Create Date: 2026-06-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Run the audit query first to confirm no NULLs or duplicates exist before applying:
    #   SELECT fd_code, COUNT(*) FROM feeds GROUP BY fd_code HAVING COUNT(*) > 1;
    #   SELECT COUNT(*) FROM feeds WHERE fd_code IS NULL OR fd_code = '';
    op.alter_column('feeds', 'fd_code', nullable=False)
    op.create_unique_constraint('uq_feeds_fd_code', 'feeds', ['fd_code'])


def downgrade() -> None:
    op.drop_constraint('uq_feeds_fd_code', 'feeds', type_='unique')
    op.alter_column('feeds', 'fd_code', nullable=True)
