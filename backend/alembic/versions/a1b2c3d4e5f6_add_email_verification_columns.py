"""add email verification columns to user_information

Revision ID: a1b2c3d4e5f6
Revises: 66ef0528df33
Create Date: 2026-06-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '66ef0528df33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_information',
        sa.Column('is_email_verified', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')))
    op.add_column('user_information',
        sa.Column('email_verify_token', sa.String(64), nullable=True))
    op.add_column('user_information',
        sa.Column('email_verify_token_exp', sa.DateTime(timezone=True), nullable=True))
    op.add_column('user_information',
        sa.Column('requires_pin_reset', sa.Boolean(), nullable=False,
                  server_default=sa.text('false')))
    op.create_index('ix_user_information_email_verify_token',
                    'user_information', ['email_verify_token'])

    # Existing users are treated as verified so they can log in immediately.
    op.execute("UPDATE user_information SET is_email_verified = true")


def downgrade() -> None:
    op.drop_index('ix_user_information_email_verify_token',
                  table_name='user_information')
    op.drop_column('user_information', 'requires_pin_reset')
    op.drop_column('user_information', 'email_verify_token_exp')
    op.drop_column('user_information', 'email_verify_token')
    op.drop_column('user_information', 'is_email_verified')
