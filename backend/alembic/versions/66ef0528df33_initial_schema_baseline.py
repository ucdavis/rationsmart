"""initial_schema_baseline

Revision ID: 66ef0528df33
Revises: 
Create Date: 2026-06-12 15:29:19.274328

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '66ef0528df33'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Baseline only — DB already at this state. Nothing to run."""
    pass


def _unused_upgrade() -> None:
    """Kept for reference: autogenerate detected only column-comment differences,
    which are DB documentation and not tracked in the ORM."""
    op.alter_column('country', 'currency',
               existing_type=sa.VARCHAR(length=10),
               comment=None,
               existing_comment='Currency code for the country (e.g., USD, EUR, INR)',
               existing_nullable=True,
               existing_server_default=sa.text('NULL::character varying'))
    op.alter_column('country', 'is_active',
               existing_type=sa.BOOLEAN(),
               comment=None,
               existing_comment='Boolean flag to control if country is active for user registration',
               existing_nullable=False,
               existing_server_default=sa.text('false'))
    op.alter_column('custom_feeds', 'id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Primary key, auto-generated UUID',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.alter_column('custom_feeds', 'user_id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Foreign key to user_information table',
               existing_nullable=False)
    op.alter_column('custom_feeds', 'fd_code',
               existing_type=sa.TEXT(),
               comment=None,
               existing_comment='Unique feed code (e.g., IND-1234)',
               existing_nullable=False)
    op.alter_column('custom_feeds', 'fd_name',
               existing_type=sa.VARCHAR(length=100),
               comment=None,
               existing_comment='Feed name (required)',
               existing_nullable=False)
    op.alter_column('custom_feeds', 'fd_dm',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ash',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_cp',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ee',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_cf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_nfe',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_st',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ndf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_hemicellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_adf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_cellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_lg',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ndin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_adin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ca',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_p',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.drop_table_comment(
        'custom_feeds',
        existing_comment='Custom feeds created by users, replica of feeds table with user_id foreign key',
        schema=None
    )
    op.alter_column('diet_reports', 'id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Primary key - UUID',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.alter_column('diet_reports', 'user_id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Foreign key to user_information table',
               existing_nullable=False)
    op.alter_column('diet_reports', 'simulation_id',
               existing_type=sa.VARCHAR(length=20),
               comment=None,
               existing_comment='Case identifier (e.g., abc-1234)',
               existing_nullable=False)
    op.alter_column('diet_reports', 'report_name',
               existing_type=sa.VARCHAR(length=255),
               comment=None,
               existing_comment='Human-readable report name',
               existing_nullable=False)
    op.alter_column('diet_reports', 'file_name',
               existing_type=sa.VARCHAR(length=255),
               comment=None,
               existing_comment='Original filename of the PDF',
               existing_nullable=False)
    op.alter_column('diet_reports', 'pdf_data',
               existing_type=postgresql.BYTEA(),
               comment=None,
               existing_comment='The actual PDF file as binary data',
               existing_nullable=False)
    op.alter_column('diet_reports', 'file_size',
               existing_type=sa.INTEGER(),
               comment=None,
               existing_comment='Size of the PDF file in bytes',
               existing_nullable=False)
    op.alter_column('diet_reports', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               comment=None,
               existing_comment='Timestamp when report was created',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('diet_reports', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               comment=None,
               existing_comment='Timestamp when report was last updated',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.drop_table_comment(
        'diet_reports',
        existing_comment='Stores PDF diet recommendation reports generated for users',
        schema=None
    )
    op.alter_column('feed_categories', 'feed_type_id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Foreign key to feed_types table',
               existing_nullable=False)
    op.drop_table_comment(
        'feed_categories',
        existing_comment='Master table for feed categories, linked to feed types',
        schema=None
    )
    op.drop_table_comment(
        'feed_types',
        existing_comment='Master table for feed types (Forage, Concentrate)',
        schema=None
    )
    op.alter_column('feeds', 'fd_code',
               existing_type=sa.TEXT(),
               comment=None,
               existing_comment='Feed code (format: country_code-number). Can be null for bulk uploaded feeds without specific codes.',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_dm',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ash',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_cp',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ee',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_cf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_nfe',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_st',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ndf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_hemicellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_adf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_cellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_lg',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ndin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_adin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ca',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_p',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment=None,
               existing_comment='Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_category_id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Foreign key reference to feed_categories.id for data integrity validation',
               existing_nullable=True)
    op.drop_table_comment(
        'feeds',
        existing_comment='Updated: Removed deprecated fd_country column - use fd_country_name instead',
        schema=None
    )
    op.alter_column('reports', 'id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Primary key UUID',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.alter_column('reports', 'report_id',
               existing_type=sa.VARCHAR(length=50),
               comment=None,
               existing_comment='Unique report identifier in format rec-xxxxxx or eval-xxxxxx',
               existing_nullable=False)
    op.alter_column('reports', 'report_type',
               existing_type=sa.VARCHAR(length=10),
               comment=None,
               existing_comment='Type of report: rec (recommendation) or eval (evaluation)',
               existing_nullable=False)
    op.alter_column('reports', 'user_id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Foreign key to user_information table',
               existing_nullable=False)
    op.alter_column('reports', 'bucket_url',
               existing_type=sa.TEXT(),
               comment=None,
               existing_comment='URL of PDF report stored in AWS S3 bucket',
               existing_nullable=True)
    op.alter_column('reports', 'json_result',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment=None,
               existing_comment='Complete API response JSON data',
               existing_nullable=True)
    op.alter_column('reports', 'saved_to_bucket',
               existing_type=sa.BOOLEAN(),
               comment=None,
               existing_comment='Boolean flag indicating if PDF was successfully saved to AWS bucket',
               existing_nullable=True,
               existing_server_default=sa.text('false'))
    op.alter_column('reports', 'report',
               existing_type=postgresql.BYTEA(),
               comment=None,
               existing_comment='Binary PDF file data',
               existing_nullable=True)
    op.alter_column('reports', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               comment=None,
               existing_comment='Timestamp when report was created',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('reports', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               comment=None,
               existing_comment='Timestamp when report was last updated',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('reports', 'save_report',
               existing_type=sa.BOOLEAN(),
               comment=None,
               existing_comment='Flag to indicate if user has explicitly saved the report (set by /save-report-to-bucket/ API)',
               existing_nullable=False,
               existing_server_default=sa.text('false'))
    op.drop_table_comment(
        'reports',
        existing_comment='Stores PDF reports and JSON results for diet recommendations and evaluations',
        schema=None
    )
    op.alter_column('user_feedback', 'id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Unique identifier for the feedback entry',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.alter_column('user_feedback', 'user_id',
               existing_type=sa.UUID(),
               comment=None,
               existing_comment='Reference to the user who submitted the feedback',
               existing_nullable=False)
    op.alter_column('user_feedback', 'overall_rating',
               existing_type=sa.INTEGER(),
               comment=None,
               existing_comment='Star rating from 1 to 5 representing overall app experience',
               existing_nullable=True)
    op.alter_column('user_feedback', 'text_feedback',
               existing_type=sa.TEXT(),
               comment=None,
               existing_comment='Optional text feedback with maximum 1000 characters',
               existing_nullable=True)
    op.alter_column('user_feedback', 'feedback_type',
               existing_type=sa.VARCHAR(length=50),
               comment=None,
               existing_comment='Type of feedback: General, Bug, or Feature Request',
               existing_nullable=True,
               existing_server_default=sa.text("'General'::character varying"))
    op.alter_column('user_feedback', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               comment=None,
               existing_comment='Timestamp when feedback was submitted',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('user_feedback', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               comment=None,
               existing_comment='Timestamp when feedback was last updated',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.drop_table_comment(
        'user_feedback',
        existing_comment='Stores user feedback for the mobile application',
        schema=None
    )
    op.alter_column('user_information', 'is_admin',
               existing_type=sa.BOOLEAN(),
               comment=None,
               existing_comment='Flag to indicate if user has admin privileges for feedback management',
               existing_nullable=True,
               existing_server_default=sa.text('false'))
    op.alter_column('user_information', 'is_active',
               existing_type=sa.BOOLEAN(),
               comment=None,
               existing_comment='Flag to indicate if user account is active (enabled/disabled by admin)',
               existing_nullable=False,
               existing_server_default=sa.text('true'))
    # ### end Alembic commands ###


def downgrade() -> None:
    """Baseline — no downgrade path."""
    pass


def _unused_downgrade() -> None:
    op.alter_column('user_information', 'is_active',
               existing_type=sa.BOOLEAN(),
               comment='Flag to indicate if user account is active (enabled/disabled by admin)',
               existing_nullable=False,
               existing_server_default=sa.text('true'))
    op.alter_column('user_information', 'is_admin',
               existing_type=sa.BOOLEAN(),
               comment='Flag to indicate if user has admin privileges for feedback management',
               existing_nullable=True,
               existing_server_default=sa.text('false'))
    op.create_table_comment(
        'user_feedback',
        'Stores user feedback for the mobile application',
        existing_comment=None,
        schema=None
    )
    op.alter_column('user_feedback', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               comment='Timestamp when feedback was last updated',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('user_feedback', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               comment='Timestamp when feedback was submitted',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('user_feedback', 'feedback_type',
               existing_type=sa.VARCHAR(length=50),
               comment='Type of feedback: General, Bug, or Feature Request',
               existing_nullable=True,
               existing_server_default=sa.text("'General'::character varying"))
    op.alter_column('user_feedback', 'text_feedback',
               existing_type=sa.TEXT(),
               comment='Optional text feedback with maximum 1000 characters',
               existing_nullable=True)
    op.alter_column('user_feedback', 'overall_rating',
               existing_type=sa.INTEGER(),
               comment='Star rating from 1 to 5 representing overall app experience',
               existing_nullable=True)
    op.alter_column('user_feedback', 'user_id',
               existing_type=sa.UUID(),
               comment='Reference to the user who submitted the feedback',
               existing_nullable=False)
    op.alter_column('user_feedback', 'id',
               existing_type=sa.UUID(),
               comment='Unique identifier for the feedback entry',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.create_table_comment(
        'reports',
        'Stores PDF reports and JSON results for diet recommendations and evaluations',
        existing_comment=None,
        schema=None
    )
    op.alter_column('reports', 'save_report',
               existing_type=sa.BOOLEAN(),
               comment='Flag to indicate if user has explicitly saved the report (set by /save-report-to-bucket/ API)',
               existing_nullable=False,
               existing_server_default=sa.text('false'))
    op.alter_column('reports', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               comment='Timestamp when report was last updated',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('reports', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               comment='Timestamp when report was created',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('reports', 'report',
               existing_type=postgresql.BYTEA(),
               comment='Binary PDF file data',
               existing_nullable=True)
    op.alter_column('reports', 'saved_to_bucket',
               existing_type=sa.BOOLEAN(),
               comment='Boolean flag indicating if PDF was successfully saved to AWS bucket',
               existing_nullable=True,
               existing_server_default=sa.text('false'))
    op.alter_column('reports', 'json_result',
               existing_type=postgresql.JSONB(astext_type=sa.Text()),
               comment='Complete API response JSON data',
               existing_nullable=True)
    op.alter_column('reports', 'bucket_url',
               existing_type=sa.TEXT(),
               comment='URL of PDF report stored in AWS S3 bucket',
               existing_nullable=True)
    op.alter_column('reports', 'user_id',
               existing_type=sa.UUID(),
               comment='Foreign key to user_information table',
               existing_nullable=False)
    op.alter_column('reports', 'report_type',
               existing_type=sa.VARCHAR(length=10),
               comment='Type of report: rec (recommendation) or eval (evaluation)',
               existing_nullable=False)
    op.alter_column('reports', 'report_id',
               existing_type=sa.VARCHAR(length=50),
               comment='Unique report identifier in format rec-xxxxxx or eval-xxxxxx',
               existing_nullable=False)
    op.alter_column('reports', 'id',
               existing_type=sa.UUID(),
               comment='Primary key UUID',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.create_table_comment(
        'feeds',
        'Updated: Removed deprecated fd_country column - use fd_country_name instead',
        existing_comment=None,
        schema=None
    )
    op.alter_column('feeds', 'fd_category_id',
               existing_type=sa.UUID(),
               comment='Foreign key reference to feed_categories.id for data integrity validation',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_p',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ca',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_adin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ndin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_lg',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_cellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_adf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_hemicellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ndf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_st',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_nfe',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_cf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ee',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_cp',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_ash',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_dm',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('feeds', 'fd_code',
               existing_type=sa.TEXT(),
               comment='Feed code (format: country_code-number). Can be null for bulk uploaded feeds without specific codes.',
               existing_nullable=True)
    op.create_table_comment(
        'feed_types',
        'Master table for feed types (Forage, Concentrate)',
        existing_comment=None,
        schema=None
    )
    op.create_table_comment(
        'feed_categories',
        'Master table for feed categories, linked to feed types',
        existing_comment=None,
        schema=None
    )
    op.alter_column('feed_categories', 'feed_type_id',
               existing_type=sa.UUID(),
               comment='Foreign key to feed_types table',
               existing_nullable=False)
    op.create_table_comment(
        'diet_reports',
        'Stores PDF diet recommendation reports generated for users',
        existing_comment=None,
        schema=None
    )
    op.alter_column('diet_reports', 'updated_at',
               existing_type=postgresql.TIMESTAMP(),
               comment='Timestamp when report was last updated',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('diet_reports', 'created_at',
               existing_type=postgresql.TIMESTAMP(),
               comment='Timestamp when report was created',
               existing_nullable=True,
               existing_server_default=sa.text('CURRENT_TIMESTAMP'))
    op.alter_column('diet_reports', 'file_size',
               existing_type=sa.INTEGER(),
               comment='Size of the PDF file in bytes',
               existing_nullable=False)
    op.alter_column('diet_reports', 'pdf_data',
               existing_type=postgresql.BYTEA(),
               comment='The actual PDF file as binary data',
               existing_nullable=False)
    op.alter_column('diet_reports', 'file_name',
               existing_type=sa.VARCHAR(length=255),
               comment='Original filename of the PDF',
               existing_nullable=False)
    op.alter_column('diet_reports', 'report_name',
               existing_type=sa.VARCHAR(length=255),
               comment='Human-readable report name',
               existing_nullable=False)
    op.alter_column('diet_reports', 'simulation_id',
               existing_type=sa.VARCHAR(length=20),
               comment='Case identifier (e.g., abc-1234)',
               existing_nullable=False)
    op.alter_column('diet_reports', 'user_id',
               existing_type=sa.UUID(),
               comment='Foreign key to user_information table',
               existing_nullable=False)
    op.alter_column('diet_reports', 'id',
               existing_type=sa.UUID(),
               comment='Primary key - UUID',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.create_table_comment(
        'custom_feeds',
        'Custom feeds created by users, replica of feeds table with user_id foreign key',
        existing_comment=None,
        schema=None
    )
    op.alter_column('custom_feeds', 'fd_p',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ca',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_adin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ndin',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_lg',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_cellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_adf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_hemicellulose',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ndf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_st',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_nfe',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_cf',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ee',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_cp',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_ash',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_dm',
               existing_type=sa.NUMERIC(precision=10, scale=2),
               comment='Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places',
               existing_nullable=True)
    op.alter_column('custom_feeds', 'fd_name',
               existing_type=sa.VARCHAR(length=100),
               comment='Feed name (required)',
               existing_nullable=False)
    op.alter_column('custom_feeds', 'fd_code',
               existing_type=sa.TEXT(),
               comment='Unique feed code (e.g., IND-1234)',
               existing_nullable=False)
    op.alter_column('custom_feeds', 'user_id',
               existing_type=sa.UUID(),
               comment='Foreign key to user_information table',
               existing_nullable=False)
    op.alter_column('custom_feeds', 'id',
               existing_type=sa.UUID(),
               comment='Primary key, auto-generated UUID',
               existing_nullable=False,
               existing_server_default=sa.text('gen_random_uuid()'))
    op.alter_column('country', 'is_active',
               existing_type=sa.BOOLEAN(),
               comment='Boolean flag to control if country is active for user registration',
               existing_nullable=False,
               existing_server_default=sa.text('false'))
    op.alter_column('country', 'currency',
               existing_type=sa.VARCHAR(length=10),
               comment='Currency code for the country (e.g., USD, EUR, INR)',
               existing_nullable=True,
               existing_server_default=sa.text('NULL::character varying'))
    # ### end Alembic commands ###
