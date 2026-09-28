"""CLIMDES feed-library sync — feed_sync_config + feed_sync_log

Adds the two tables from climdes_IMPLEMENTATION_PLAN_v2 §9.3:
  - feed_sync_config  (singleton settings row: endpoint, auth, sync day, toggle)
  - feed_sync_log     (one row per sync run, with feed + translation counts)

The config is a SINGLETON: this migration seeds exactly one row —
scheduler disabled, sync day Wednesday (2, Python weekday() convention), and
endpoint_url pre-filled with the known CLIMDES default URL (D25). The Admin
can overwrite the URL from the UI at any time; the DB value is authoritative.

No changes to feeds / feed_translations / languages / country_languages —
the sync reuses them as-is.

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-07-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DEFAULT_ENDPOINT_URL = (
    "https://api.msu.climdesdata.com/api/v1/product/export/digital_green"
)


def upgrade() -> None:
    # ── feed_sync_config (singleton) ──────────────────────────────────────────
    op.create_table(
        'feed_sync_config',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('endpoint_url', sa.Text(), nullable=True),
        sa.Column('auth_type', sa.String(length=20), nullable=False, server_default=sa.text("'none'")),
        sa.Column('auth_header_name', sa.String(length=100), nullable=True),
        sa.Column('auth_token', sa.Text(), nullable=True),
        sa.Column('sync_day_of_week', sa.SmallInteger(), nullable=False, server_default=sa.text('2')),
        sa.Column('scheduler_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('scheduler_toggled_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('scheduler_toggled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_run_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_success_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['scheduler_toggled_by'], ['user_information.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='feed_sync_config_pkey'),
        sa.CheckConstraint(
            "auth_type IN ('none', 'api_key', 'bearer')",
            name='ck_feed_sync_config_auth_type',
        ),
        sa.CheckConstraint(
            'sync_day_of_week BETWEEN 0 AND 6',
            name='ck_feed_sync_config_day_of_week',
        ),
    )

    # Seed the singleton row (D25: default URL; scheduler off; Wednesday).
    op.execute(
        "INSERT INTO feed_sync_config "
        "(endpoint_url, auth_type, sync_day_of_week, scheduler_enabled) "
        f"VALUES ('{DEFAULT_ENDPOINT_URL}', 'none', 2, false)"
    )

    # ── feed_sync_log ─────────────────────────────────────────────────────────
    op.create_table(
        'feed_sync_log',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default=sa.text("'running'")),
        sa.Column('trigger_type', sa.String(length=20), nullable=False),
        sa.Column('triggered_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('http_status', sa.Integer(), nullable=True),
        sa.Column('total_rows', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('inserted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('updated', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('skipped', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('translations_inserted', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('translations_updated', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('translations_skipped', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('failed_rows', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('skipped_translations', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['triggered_by'], ['user_information.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name='feed_sync_log_pkey'),
        sa.CheckConstraint(
            "status IN ('running', 'success', 'failed')",
            name='ck_feed_sync_log_status',
        ),
        sa.CheckConstraint(
            "trigger_type IN ('scheduled', 'manual')",
            name='ck_feed_sync_log_trigger_type',
        ),
    )
    op.create_index('idx_feed_sync_log_started_at', 'feed_sync_log', ['started_at'])
    op.create_index('idx_feed_sync_log_status', 'feed_sync_log', ['status'])


def downgrade() -> None:
    op.drop_index('idx_feed_sync_log_status', table_name='feed_sync_log')
    op.drop_index('idx_feed_sync_log_started_at', table_name='feed_sync_log')
    op.drop_table('feed_sync_log')
    op.drop_table('feed_sync_config')
