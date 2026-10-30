"""user_information.id defaults to gen_random_uuid()

Every other table already uses the built-in gen_random_uuid() (PostgreSQL 13+).
user_information was the only one calling uuid_generate_v4() from the uuid-ossp
extension, which managed Postgres (Azure) does not allow-list. Only the column
default changes; existing ids and the extension itself are left alone.

On a database built from the baseline the default is already gen_random_uuid(),
so this is a no-op there.

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


def upgrade() -> None:
    op.execute("ALTER TABLE public.user_information ALTER COLUMN id SET DEFAULT gen_random_uuid()")


def downgrade() -> None:
    # Only where uuid-ossp is installed; otherwise gen_random_uuid() stays (same result).
    op.execute("""
        DO $$
        BEGIN
            IF to_regprocedure('public.uuid_generate_v4()') IS NOT NULL THEN
                ALTER TABLE public.user_information ALTER COLUMN id SET DEFAULT public.uuid_generate_v4();
            END IF;
        END $$;
    """)
