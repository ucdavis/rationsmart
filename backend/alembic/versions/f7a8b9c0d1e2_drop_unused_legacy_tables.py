"""drop unused legacy tables

Drops seven tables that no RationSmart (v4) code reads or writes: the older
feed master (master_feeds and its two children), the hand-made feeds_dup
backup, v3's system_metadata cache flag and diet_reports table, and breeds
(the breed dropdown comes from animal_field_spec.BREED_OPTIONS). v3 never runs
against this database again. Plan: docs/dev_docs/unused_tables/
v1_Unused_Tables_Removal_Plan.md.

Destructive: take a table-only pg_dump first and apply by hand (plan step E1).
No CASCADE, so an unknown view or foreign key on one of these tables stops the
migration instead of being dropped with it. IF EXISTS lets it run on a database
that never had them.

downgrade() recreates the tables empty, with the columns, keys and indexes
they had on Test; the rows come back from the table dump.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-10-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Children before master_feeds, which they reference.
DROP_ORDER = (
    'feed_country_availability',
    'feed_country_pricing',
    'master_feeds',
    'feeds_dup',
    'system_metadata',
    'diet_reports',
    'breeds',
)

# Captured from Test with pg_dump --schema-only on 2026-10-24.
RECREATE_SQL = (
    """
    CREATE TABLE master_feeds (
        id uuid NOT NULL PRIMARY KEY,
        fd_code text NOT NULL CONSTRAINT master_feeds_fd_code_key UNIQUE,
        fd_name text NOT NULL,
        fd_type text NOT NULL,
        fd_category text NOT NULL,
        fd_dm numeric(10,2),
        fd_ash numeric(10,2),
        fd_cp numeric(10,2),
        fd_npn_cp integer,
        fd_ee numeric(10,2),
        fd_cf numeric(10,2),
        fd_nfe numeric(10,2),
        fd_st numeric(10,2),
        fd_ndf numeric(10,2),
        fd_hemicellulose numeric(10,2),
        fd_adf numeric(10,2),
        fd_cellulose numeric(10,2),
        fd_lg numeric(10,2),
        fd_ndin numeric(10,2),
        fd_adin numeric(10,2),
        fd_ca numeric(10,2),
        fd_p numeric(10,2),
        fd_season text,
        fd_orginin text,
        fd_ipb_local_lab text,
        created_by uuid REFERENCES user_information(id) ON DELETE SET NULL,
        is_active boolean NOT NULL,
        created_at timestamp without time zone DEFAULT now() NOT NULL,
        updated_at timestamp without time zone DEFAULT now() NOT NULL
    )
    """,
    "CREATE INDEX ix_master_feeds_active ON master_feeds (is_active)",
    "CREATE INDEX ix_master_feeds_category ON master_feeds (fd_category)",
    "CREATE INDEX ix_master_feeds_type ON master_feeds (fd_type)",
    """
    CREATE TABLE feed_country_availability (
        id uuid NOT NULL PRIMARY KEY,
        master_feed_id uuid NOT NULL REFERENCES master_feeds(id) ON DELETE CASCADE,
        country_id uuid NOT NULL REFERENCES country(id) ON DELETE CASCADE,
        is_available boolean NOT NULL,
        local_name text,
        created_at timestamp without time zone DEFAULT now() NOT NULL,
        updated_at timestamp without time zone DEFAULT now() NOT NULL,
        CONSTRAINT uq_feed_country_availability UNIQUE (master_feed_id, country_id)
    )
    """,
    "CREATE INDEX ix_feed_availability_country ON feed_country_availability (country_id)",
    "CREATE INDEX ix_feed_availability_feed ON feed_country_availability (master_feed_id)",
    """
    CREATE TABLE feed_country_pricing (
        id uuid NOT NULL PRIMARY KEY,
        master_feed_id uuid NOT NULL REFERENCES master_feeds(id) ON DELETE CASCADE,
        country_id uuid NOT NULL REFERENCES country(id) ON DELETE CASCADE,
        price_per_kg numeric(10,2) NOT NULL,
        currency character varying(3) NOT NULL,
        set_by uuid REFERENCES user_information(id) ON DELETE SET NULL,
        is_active boolean NOT NULL,
        created_at timestamp without time zone DEFAULT now() NOT NULL,
        updated_at timestamp without time zone DEFAULT now() NOT NULL,
        CONSTRAINT uq_feed_country_pricing UNIQUE (master_feed_id, country_id)
    )
    """,
    "CREATE INDEX ix_feed_pricing_country ON feed_country_pricing (country_id)",
    "CREATE INDEX ix_feed_pricing_feed ON feed_country_pricing (master_feed_id)",
    """
    CREATE TABLE feeds_dup (
        id uuid,
        fd_code text,
        fd_country_name text,
        fd_country_cd text,
        fd_name text,
        fd_category text,
        fd_type text,
        fd_dm numeric(10,2),
        fd_ash numeric(10,2),
        fd_cp numeric(10,2),
        fd_npn_cp numeric(10,2),
        fd_ee numeric(10,2),
        fd_cf numeric(10,2),
        fd_nfe numeric(10,2),
        fd_st numeric(10,2),
        fd_ndf numeric(10,2),
        fd_hemicellulose numeric(10,2),
        fd_adf numeric(10,2),
        fd_cellulose numeric(10,2),
        fd_lg numeric(10,2),
        fd_ndin numeric(10,2),
        fd_adin numeric(10,2),
        fd_ca numeric(10,2),
        fd_p numeric(10,2),
        fd_season text,
        fd_orginin text,
        fd_ipb_local_lab text,
        fd_country_id uuid,
        created_at timestamp without time zone,
        updated_at timestamp without time zone,
        fd_category_id uuid,
        created_by uuid,
        baseline_price numeric(10,2),
        baseline_currency character varying(3)
    )
    """,
    """
    CREATE TABLE system_metadata (
        key character varying(255) NOT NULL PRIMARY KEY,
        value_timestamp timestamp with time zone,
        updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
    )
    """,
    """
    CREATE TABLE diet_reports (
        id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES user_information(id) ON DELETE CASCADE,
        simulation_id character varying(20) NOT NULL,
        report_name character varying(255) NOT NULL,
        file_name character varying(255) NOT NULL,
        pdf_data bytea NOT NULL,
        file_size integer NOT NULL,
        created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
    )
    """,
    "CREATE INDEX idx_diet_reports_case_id ON diet_reports (simulation_id)",
    "CREATE INDEX idx_diet_reports_case_lookup ON diet_reports (simulation_id, user_id)",
    "CREATE INDEX idx_diet_reports_created_at ON diet_reports (created_at)",
    "CREATE INDEX idx_diet_reports_simulation_id ON diet_reports (simulation_id)",
    "CREATE INDEX idx_diet_reports_user_created ON diet_reports (user_id, created_at DESC)",
    "CREATE INDEX idx_diet_reports_user_id ON diet_reports (user_id)",
    """
    CREATE TABLE breeds (
        id uuid NOT NULL PRIMARY KEY,
        name character varying(100) NOT NULL,
        country_id uuid NOT NULL REFERENCES country(id) ON DELETE CASCADE,
        description text,
        sort_order integer NOT NULL,
        is_active boolean NOT NULL,
        created_at timestamp without time zone DEFAULT now() NOT NULL,
        updated_at timestamp without time zone DEFAULT now() NOT NULL,
        CONSTRAINT uq_breeds_name_country UNIQUE (name, country_id)
    )
    """,
    "CREATE INDEX ix_breeds_country_active ON breeds (country_id, is_active)",
    "CREATE INDEX ix_breeds_country_id ON breeds (country_id)",
)


def upgrade() -> None:
    for table in DROP_ORDER:
        op.execute(f'DROP TABLE IF EXISTS "{table}"')


def downgrade() -> None:
    for statement in RECREATE_SQL:
        op.execute(statement)
