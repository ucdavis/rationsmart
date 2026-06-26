"""i18n foundation — languages, country_languages, feed/vocabulary translations

Adds the multi-language data model from the i18n V2 plan (§4.2):
  - languages                 (runtime-managed language registry, I4)
  - country_languages         (country ↔ language junction)
  - feed_translations         (feed NAME translations, keyed by feed_id)
  - vocabulary_translations   (feed TYPE/CATEGORY translations, country-scoped, I5)
  - user_information.preferred_language  (FK → languages.code, default 'en')

The 'en' baseline language row is inserted by this migration BEFORE the
preferred_language column is added, so the NOT NULL DEFAULT 'en' backfill on
existing users satisfies the FK. 'en' lives in `languages` because it is a real
selectable language (I3); it just never appears as a translation *row*.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── languages (I4) ────────────────────────────────────────────────────────
    op.create_table(
        'languages',
        sa.Column('code', sa.String(length=10), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('code', name='languages_pkey'),
    )

    # Seed the 'en' baseline row immediately — required so the FK on the
    # preferred_language column (added below, default 'en') is satisfiable.
    op.execute(
        "INSERT INTO languages (code, name, is_active) "
        "VALUES ('en', 'English', true) ON CONFLICT (code) DO NOTHING"
    )

    # ── country_languages ─────────────────────────────────────────────────────
    op.create_table(
        'country_languages',
        sa.Column('country_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('language_code', sa.String(length=10), nullable=False),
        sa.ForeignKeyConstraint(['country_id'], ['country.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language_code'], ['languages.code'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('country_id', 'language_code', name='country_languages_pkey'),
    )

    # ── feed_translations (name) ──────────────────────────────────────────────
    op.create_table(
        'feed_translations',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('feed_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('language', sa.String(length=10), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['feed_id'], ['feeds.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language'], ['languages.code'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name='feed_translations_pkey'),
        sa.UniqueConstraint('feed_id', 'language', name='uq_feed_translations_feed_lang'),
    )
    op.create_index(
        'idx_feed_translations_feed_lang', 'feed_translations', ['feed_id', 'language']
    )

    # ── vocabulary_translations (type + category, country-scoped, I5) ─────────
    op.create_table(
        'vocabulary_translations',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('country_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('source_value', sa.Text(), nullable=False),
        sa.Column('language', sa.String(length=10), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['country_id'], ['country.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['language'], ['languages.code'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name='vocabulary_translations_pkey'),
        sa.UniqueConstraint(
            'country_id', 'kind', 'source_value', 'language',
            name='uq_vocabulary_translations_scope',
        ),
        sa.CheckConstraint(
            "kind IN ('feed_type', 'feed_category')",
            name='ck_vocabulary_translations_kind',
        ),
    )

    # ── user_information.preferred_language ───────────────────────────────────
    # 'en' already exists in languages (seeded above), so the NOT NULL DEFAULT
    # 'en' backfill on existing rows satisfies the FK.
    op.add_column(
        'user_information',
        sa.Column(
            'preferred_language', sa.String(length=10),
            nullable=False, server_default=sa.text("'en'"),
        ),
    )
    op.create_foreign_key(
        'fk_user_information_preferred_language',
        'user_information', 'languages',
        ['preferred_language'], ['code'], ondelete='RESTRICT',
    )


def downgrade() -> None:
    # Drop children/column referencing `languages` before dropping `languages`.
    op.drop_constraint(
        'fk_user_information_preferred_language', 'user_information', type_='foreignkey'
    )
    op.drop_column('user_information', 'preferred_language')

    op.drop_table('vocabulary_translations')

    op.drop_index('idx_feed_translations_feed_lang', table_name='feed_translations')
    op.drop_table('feed_translations')

    op.drop_table('country_languages')

    op.drop_table('languages')
