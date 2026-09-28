"""add reports.report_html

Adds a nullable `reports.report_html` Text column: the report-specific HTML markup
generated at diet-compute time (recommendation/evaluation/baby-calf), used as the
bridge between "diet computed" and "Save Report clicked" for PDF generation. Static
branding icons are NOT embedded here (resolved from disk via WeasyPrint's base_url at
PDF-conversion time instead) to avoid duplicating ~2MB of identical image bytes into
every row — see docs/dev_docs/reports/save_report_pdf_gap_implementation_plan.md.

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-07-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'reports',
        sa.Column('report_html', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('reports', 'report_html')
