"""user_information.id defaults to the built-in gen_random_uuid()

user_information came from RationSmart v3 with DEFAULT uuid_generate_v4(),
which needs the uuid-ossp extension. Every other table already uses the
built-in gen_random_uuid() (Postgres 13+). Azure allows an extension only after
a DB admin lists it in azure.extensions, so this removes the last need for it
(plan: docs/dev_docs/azure_migration/v1_Native_UUID_Default_Plan.md).

The default never fires in practice: the app sets the id in Python
(models.UserInformationModel, default=uuid.uuid4). Both functions return a
random version-4 UUID, and no row changes.

The baseline (66ef0528df33_schema.sql) was edited in the same change so a fresh
`upgrade head` no longer creates the extension; databases that already exist
never replay the baseline, so this migration updates them. The uuid-ossp
extension itself is left installed where it is (dropping it gains nothing).

SET DEFAULT changes catalog metadata only, but takes a short exclusive lock on
the table; the 5 s lock_timeout makes a busy table fail fast and roll back.

Revision ID: d1e2f3a4b5c6
Revises: c0d1e2f3a4b5
Create Date: 2026-10-30 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = 'c0d1e2f3a4b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Bounded wait for the table lock (SET LOCAL: this migration's transaction only).
LOCK_TIMEOUT_SQL = "SET LOCAL lock_timeout = '5s'"


def upgrade() -> None:
    op.execute(LOCK_TIMEOUT_SQL)
    op.execute("ALTER TABLE public.user_information ALTER COLUMN id SET DEFAULT gen_random_uuid()")


def downgrade() -> None:
    # A database built after this change (Azure) never had uuid-ossp, so the old
    # default can only come back where the function still exists.
    op.execute(LOCK_TIMEOUT_SQL)
    op.execute("""
        DO $$
        BEGIN
          IF to_regprocedure('public.uuid_generate_v4()') IS NOT NULL THEN
            ALTER TABLE public.user_information ALTER COLUMN id SET DEFAULT public.uuid_generate_v4();
          END IF;
        END $$
    """)
