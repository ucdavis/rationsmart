"""user_information: record who deactivated an account, and when

Deleting one's own account and an admin's "disable" both only set
is_active = false, so the app could not tell them apart: login could not say
what happened (F27), and a user who deleted their own account could not come
back without also letting admin-blocked users back in (F60). Two nullable
columns record it:

  deactivated_by  'self' (Delete account) | 'admin' (admin disable) | NULL
  deactivated_at  when; NULL while active

A third column ends every login made before a deactivation, so a token from
before Delete account / an admin disable never works again, even once the
account is active again (re-registration or admin enable):

  sessions_valid_after  tokens issued (JWT iat) before this time are refused

Existing inactive accounts whose email is verified are back-filled as 'admin':
their history is unknown, and 'admin' keeps them blocked until an admin decides.
Their sessions_valid_after is set to the migration time, so re-enabling one
can't revive a login token from before.
Never-verified registrations are pending, not deactivated, and stay NULL.
Plan: docs/defects/branches/v1_F27_F60_Account_Deactivation_Plan.md.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-11-01 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Bounded wait for the table lock (SET LOCAL: this migration's transaction only).
LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout = '5s'"


def upgrade() -> None:
    op.execute(LOCK_TIMEOUT_SQL)
    op.add_column('user_information', sa.Column(
        'deactivated_by', sa.String(length=10), nullable=True,
        comment="Who deactivated the account: 'self' (Delete account) or 'admin'; NULL while active",
    ))
    op.add_column('user_information', sa.Column(
        'deactivated_at', sa.DateTime(), nullable=True,
        comment='When the account was deactivated; NULL while active',
    ))
    op.add_column('user_information', sa.Column(
        'sessions_valid_after', sa.DateTime(), nullable=True,
        comment='Login tokens issued before this time are refused (set on Delete account / admin disable)',
    ))
    op.create_check_constraint(
        'ck_user_deactivated_by', 'user_information',
        "deactivated_by IS NULL OR deactivated_by IN ('self', 'admin')",
    )
    op.execute(
        "UPDATE public.user_information SET deactivated_by = 'admin', sessions_valid_after = timezone('utc', now()) "
        "WHERE is_active = false AND is_email_verified = true"
    )


def downgrade() -> None:
    op.execute(LOCK_TIMEOUT_SQL)
    op.drop_constraint('ck_user_deactivated_by', 'user_information', type_='check')
    op.drop_column('user_information', 'sessions_valid_after')
    op.drop_column('user_information', 'deactivated_at')
    op.drop_column('user_information', 'deactivated_by')
