"""feed_sync_log — widen trigger_type to allow 'file_upload'

Part of the bulk-upload/CLIMDES template unification plan
(docs/dev_docs/bulk_upload_changes/IMPLEMENTATION_PLAN.md, D2/D3): a manually
uploaded Excel file is run through the same sync engine as a CLIMDES fetch,
logged in the same feed_sync_log table, distinguished by this new trigger
type. Purely additive — no existing rows are affected.

Revision ID: b2c3d4e5f6a7
Revises: a7b8c9d0e1f2
Create Date: 2026-07-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('ck_feed_sync_log_trigger_type', 'feed_sync_log', type_='check')
    op.create_check_constraint(
        'ck_feed_sync_log_trigger_type',
        'feed_sync_log',
        "trigger_type IN ('scheduled', 'manual', 'file_upload')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_feed_sync_log_trigger_type', 'feed_sync_log', type_='check')
    op.create_check_constraint(
        'ck_feed_sync_log_trigger_type',
        'feed_sync_log',
        "trigger_type IN ('scheduled', 'manual')",
    )
