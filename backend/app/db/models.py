"""
ORM models — ground truth from pg_dump taken 2026-06-12 (Task 2.1), re-aligned
with the live Test schema on 2026-10-27 (docs/dev_docs/db_model_alignment).

14 tables modelled; alembic_version excluded. Unused legacy tables were dropped
in migrations f7a8b9c0d1e2 and a8b9c0d1e2f3.
Single Base from app.db.base — no second declarative_base() anywhere.
Columns, constraints, indexes and comments mirror the DB: a model change needs
a migration, and `python -m scripts_2.schema_drift_check` must report no drift.
Triggers and the update_updated_at_column() function exist only in the DB
(created by the baseline migration); the ORM cannot declare them.
"""

import uuid

from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime,
    ForeignKey, ForeignKeyConstraint, Index, Integer, LargeBinary, Numeric, SmallInteger, String, Text,
    UniqueConstraint, literal_column,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func, text

from app.db.base import Base


class CountryModel(Base):
    __tablename__ = "country"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    country_code = Column(String(3), nullable=False, unique=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())
    currency = Column(String(10), nullable=True, comment="Currency code for the country (e.g., USD, EUR, INR)")
    is_active = Column(Boolean, nullable=False, server_default=text("false"), default=False, comment="Boolean flag to control if country is active for user registration")

    # Indexes below mirror the live DB (db_model_alignment plan). idx_country_name and
    # idx_country_code duplicate the unique constraints and are dropped in PR-2.
    __table_args__ = (
        Index("idx_country_active_new", is_active, name, postgresql_where=text("is_active = true")),
        Index("idx_country_code", country_code),
        Index("idx_country_is_active", is_active),
        Index("idx_country_name", name),
    )


class UserInformationModel(Base):
    __tablename__ = "user_information"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"), default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    email_id = Column(String(255), nullable=False, unique=True)
    pin_hash = Column(String(255), nullable=False)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())
    is_admin = Column(Boolean, server_default=text("false"), default=False, comment="Flag to indicate if user has admin privileges for feedback management")
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True, comment="Flag to indicate if user account is active (enabled/disabled by admin)")
    admin_level = Column(String(20), nullable=True)
    user_role = Column(String(30), nullable=True)
    # ── Task 2.7: email verification ──────────────────────────────────────────
    is_email_verified = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    email_verify_token = Column(String(64), nullable=True, index=True)
    email_verify_token_exp = Column(DateTime(timezone=True), nullable=True)
    requires_pin_reset = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    # ── i18n Phase 1: user language preference ─────────────────────────────────
    # FK to languages.code; defaults to 'en' (the universal baseline, I3). The
    # migration seeds the 'en' language row before adding this column so the
    # NOT NULL DEFAULT 'en' backfill satisfies the FK.
    preferred_language = Column(
        String(10),
        ForeignKey("languages.code", ondelete="RESTRICT"),
        nullable=False,
        server_default=text("'en'"),
        default="en",
    )

    __table_args__ = (
        CheckConstraint(
            "admin_level IS NULL OR admin_level IN ('super_admin', 'country_admin')",
            name="ck_user_admin_level",
        ),
        CheckConstraint(
            "user_role IS NULL OR user_role IN ('farmer', 'extension_worker', 'nutritionist', 'researcher', 'feed_supplier', 'other')",
            name="ck_user_role",
        ),
        Index("idx_user_admin_level", admin_level, postgresql_where=text("admin_level IS NOT NULL")),
        Index("idx_user_admin_verification", id, is_admin, postgresql_where=text("is_admin = true")),
        Index("idx_user_country", country_id),
        Index("idx_user_country_id", country_id),  # duplicate of idx_user_country; dropped in PR-2
        Index("idx_user_created_at", created_at),
        Index("idx_user_email", email_id),  # duplicate of the email_id unique constraint; dropped in PR-2
        Index("idx_user_information_is_active", is_active),
        Index("idx_user_information_is_admin", is_admin),
        Index("idx_user_status_check", id, is_active, postgresql_where=text("is_active = true")),
    )


class FeedType(Base):
    __tablename__ = "feed_types"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    type_name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, server_default=text("0"), default=0)
    is_active = Column(Boolean, server_default=text("true"), default=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (
        Index("idx_feed_types_active", is_active),
        Index("idx_feed_types_active_new", is_active, sort_order, postgresql_where=text("is_active = true")),
        {"comment": "Master table for feed types (Forage, Concentrate)"},
    )


class FeedCategory(Base):
    __tablename__ = "feed_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    category_name = Column(String(100), nullable=False, unique=True)
    feed_type_id = Column(UUID(as_uuid=True), ForeignKey("feed_types.id"), nullable=False, comment="Foreign key to feed_types table")
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, server_default=text("0"), default=0)
    is_active = Column(Boolean, server_default=text("true"), default=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (
        Index("idx_feed_categories_active", is_active),
        Index(
            "idx_feed_categories_active_new", feed_type_id, is_active, sort_order,
            postgresql_where=text("is_active = true"),
        ),
        Index("idx_feed_categories_type_id", feed_type_id),
        {"comment": "Master table for feed categories, linked to feed types"},
    )


# Feed names are unique across the library on a normalized key: lowercase,
# trimmed, runs of whitespace (no-break space included) collapsed to one space
# (unique-names plan U1/U4, docs/dev_docs/climdes/unique_feed_names_IMPLEMENTATION_PLAN.md).
# One definition serves the unique index below and FeedRepository.get_by_name;
# migration e6f7a8b9c0d1 holds a literal copy (a test compares them). Postgres
# uses the index only when the lookup's expression matches it exactly, so the
# pattern is inlined as a constant, never a bind parameter.
FEED_NAME_INDEX = "uq_feeds_fd_name_norm"
_FEED_NAME_WHITESPACE = r"'[\s\u00a0]+'"  # Postgres regex; it decodes the \u escape


def feed_name_key(expr):
    """SQL comparison key for a feed-name expression (column or bound value)."""
    return func.lower(func.trim(func.regexp_replace(
        expr, literal_column(_FEED_NAME_WHITESPACE), literal_column("' '"), literal_column("'g'"),
    )))


class Feed(Base):
    __tablename__ = "feeds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # NOT NULL + uq_feeds_fd_code since migration c3d4e5f6a7b8. The comment text is the
    # DB's own (older than that migration) and is mirrored as-is.
    fd_code = Column(Text, nullable=False, comment="Feed code (format: country_code-number). Can be null for bulk uploaded feeds without specific codes.")
    fd_country_name = Column(Text, nullable=True)
    fd_country_cd = Column(Text, nullable=True)
    fd_name = Column(Text, nullable=False)
    fd_category = Column(Text, nullable=True)
    fd_type = Column(Text, nullable=True)
    fd_dm = Column(Numeric(10, 2), nullable=True, comment="Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ash = Column(Numeric(10, 2), nullable=True, comment="Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_cp = Column(Numeric(10, 2), nullable=True, comment="Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_npn_cp = Column(Numeric(10, 2), nullable=True)
    fd_ee = Column(Numeric(10, 2), nullable=True, comment="Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_cf = Column(Numeric(10, 2), nullable=True, comment="Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_nfe = Column(Numeric(10, 2), nullable=True, comment="Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_st = Column(Numeric(10, 2), nullable=True, comment="Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ndf = Column(Numeric(10, 2), nullable=True, comment="Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_hemicellulose = Column(Numeric(10, 2), nullable=True, comment="Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_adf = Column(Numeric(10, 2), nullable=True, comment="Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_cellulose = Column(Numeric(10, 2), nullable=True, comment="Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_lg = Column(Numeric(10, 2), nullable=True, comment="Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ndin = Column(Numeric(10, 2), nullable=True, comment="Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_adin = Column(Numeric(10, 2), nullable=True, comment="Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ca = Column(Numeric(10, 2), nullable=True, comment="Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_p = Column(Numeric(10, 2), nullable=True, comment="Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_season = Column(Text, nullable=True)
    fd_orginin = Column(Text, nullable=True)
    fd_ipb_local_lab = Column(Text, nullable=True)
    fd_country_id = Column(UUID(as_uuid=True), ForeignKey("country.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())
    fd_category_id = Column(UUID(as_uuid=True), ForeignKey("feed_categories.id"), nullable=True, comment="Foreign key reference to feed_categories.id for data integrity validation")
    fd_type_id = Column(UUID(as_uuid=True), ForeignKey("feed_types.id"), nullable=True)
    # The DB has two FK constraints for created_by: feeds_created_by_fkey (this column's)
    # and fk_feeds_created_by (a duplicate from a manual ALTER TABLE, declared in
    # __table_args__ so the model mirrors the DB; dropped in PR-2).
    created_by = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="SET NULL"), nullable=True)
    baseline_price = Column(Numeric(10, 2), nullable=True)
    baseline_currency = Column(String(3), nullable=True)

    __table_args__ = (
        UniqueConstraint("fd_code", name="uq_feeds_fd_code"),
        ForeignKeyConstraint(
            ["created_by"], ["user_information.id"], name="fk_feeds_created_by", ondelete="SET NULL",
        ),
        Index("idx_feeds_country_id", fd_country_id),
        Index("idx_feeds_country_type", fd_country_id, fd_type, fd_category),
        Index("idx_feeds_created_by", created_by),
        Index("idx_feeds_fd_category_id", fd_category_id),
        Index("idx_feeds_fd_country_id", fd_country_id),  # duplicate of idx_feeds_country_id; dropped in PR-2
        Index("idx_feeds_filter_composite", fd_type, fd_category, fd_country_id),
        {"comment": "Updated: Removed deprecated fd_country column - use fd_country_name instead"},
    )


Index(FEED_NAME_INDEX, feed_name_key(Feed.fd_name), unique=True)


class CustomFeed(Base):
    __tablename__ = "custom_feeds"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4, comment="Primary key, auto-generated UUID")
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="CASCADE"), nullable=False, comment="Foreign key to user_information table")
    fd_code = Column(Text, nullable=False, unique=True, comment="Unique feed code (e.g., IND-1234)")
    fd_country_id = Column(UUID(as_uuid=True), ForeignKey("country.id"), nullable=True)
    fd_country_name = Column(String(100), nullable=True)
    fd_country_cd = Column(String(10), nullable=True)
    fd_name = Column(String(100), nullable=False, comment="Feed name (required)")
    # T1 (taxonomy-ID contract): fd_category / fd_type are the denormalized English
    # text columns the optimizer keys on (concentrate/forage masks) and the vocabulary
    # translation join uses. NEVER drop them — the fd_*_id FKs below are ADDITIVE ONLY.
    fd_category = Column(String(50), nullable=True)
    fd_type = Column(String(50), nullable=True)
    fd_dm = Column(Numeric(10, 2), nullable=True, comment="Dry matter percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ash = Column(Numeric(10, 2), nullable=True, comment="Ash percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_cp = Column(Numeric(10, 2), nullable=True, comment="Crude protein percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ee = Column(Numeric(10, 2), nullable=True, comment="Ether extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_cf = Column(Numeric(10, 2), nullable=True, comment="Crude fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_nfe = Column(Numeric(10, 2), nullable=True, comment="Nitrogen free extract percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_st = Column(Numeric(10, 2), nullable=True, comment="Starch percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ndf = Column(Numeric(10, 2), nullable=True, comment="Neutral detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_hemicellulose = Column(Numeric(10, 2), nullable=True, comment="Hemicellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_adf = Column(Numeric(10, 2), nullable=True, comment="Acid detergent fiber percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_cellulose = Column(Numeric(10, 2), nullable=True, comment="Cellulose percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_lg = Column(Numeric(10, 2), nullable=True, comment="Lignin percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ndin = Column(Numeric(10, 2), nullable=True, comment="Neutral detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_adin = Column(Numeric(10, 2), nullable=True, comment="Acid detergent insoluble nitrogen percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_ca = Column(Numeric(10, 2), nullable=True, comment="Calcium percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_p = Column(Numeric(10, 2), nullable=True, comment="Phosphorus percentage stored as DECIMAL(10,2) - rounded to 2 decimal places")
    fd_orginin = Column(String(50), nullable=True)
    fd_ipb_local_lab = Column(String(50), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.current_timestamp())
    updated_at = Column(DateTime, nullable=False, server_default=func.current_timestamp())
    fd_npn_cp = Column(Numeric(10, 2), nullable=True)
    fd_country = Column(Text, nullable=True)
    fd_season = Column(Text, nullable=True)
    baseline_price = Column(Numeric(10, 2), nullable=True)
    baseline_currency = Column(String(3), nullable=True)
    # Additive taxonomy FKs (Ticket B) — mirror feeds.fd_type_id / fd_category_id.
    # Nullable; populated by the custom-feed create/update path. See T1 note above.
    fd_category_id = Column(UUID(as_uuid=True), ForeignKey("feed_categories.id"), nullable=True)
    fd_type_id = Column(UUID(as_uuid=True), ForeignKey("feed_types.id"), nullable=True)

    __table_args__ = (
        Index("idx_custom_feeds_country_id", fd_country_id),
        Index("idx_custom_feeds_feed_code", fd_code),  # duplicate of the fd_code unique constraint; dropped in PR-2
        Index("idx_custom_feeds_user_filter", user_id, fd_type, fd_category, fd_country_id),
        Index("idx_custom_feeds_user_id", user_id),
        {"comment": "Custom feeds created by users, replica of feeds table with user_id foreign key"},
    )


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4, comment="Primary key UUID")
    report_id = Column(String(50), nullable=False, unique=True, comment="Unique report identifier in format rec-xxxxxx or eval-xxxxxx")
    report_type = Column(String(10), nullable=False, comment="Type of report: rec (recommendation) or eval (evaluation)")
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_information.id"), nullable=False, comment="Foreign key to user_information table")
    bucket_url = Column(Text, nullable=True, comment="URL of PDF report stored in AWS S3 bucket")
    json_result = Column(JSONB, nullable=True, comment="Complete API response JSON data")
    saved_to_bucket = Column(Boolean, server_default=text("false"), default=False, comment="Boolean flag indicating if PDF was successfully saved to AWS bucket")
    report = Column(LargeBinary, nullable=True, comment="Binary PDF file data")
    created_at = Column(DateTime, server_default=func.current_timestamp(), comment="Timestamp when report was created")
    updated_at = Column(DateTime, server_default=func.current_timestamp(), comment="Timestamp when report was last updated")
    save_report = Column(Boolean, nullable=False, server_default=text("false"), default=False, comment="Flag to indicate if user has explicitly saved the report (set by /save-report-to-bucket/ API)")
    simulation_id = Column(String(100), nullable=True)
    animal_inputs = Column(JSONB, nullable=True)
    feed_selection = Column(JSONB, nullable=True)
    custom_constraints = Column(JSONB, nullable=True)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id"), nullable=True)
    report_name = Column(String(255), nullable=True)
    report_html = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("report_type IN ('rec', 'eval')", name="reports_report_type_check"),
        Index(
            "idx_reports_admin_view", save_report, created_at.desc(),
            postgresql_where=text("save_report = true"),
        ),
        Index("idx_reports_created_at", created_at),
        Index("idx_reports_report_id", report_id),  # duplicate of the report_id unique constraint; dropped in PR-2
        Index("idx_reports_report_type", report_type),
        Index("idx_reports_type_created", report_type, created_at.desc()),
        Index("idx_reports_user_id", user_id),
        Index(
            "idx_reports_user_saved", user_id, save_report, created_at.desc(),
            postgresql_where=text("save_report = true"),
        ),
        Index("idx_reports_user_type", user_id, report_type),
        {"comment": "Stores PDF reports and JSON results for diet recommendations and evaluations"},
    )


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4, comment="Unique identifier for the feedback entry")
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="CASCADE"), nullable=False, comment="Reference to the user who submitted the feedback")
    overall_rating = Column(Integer, nullable=True, comment="Star rating from 1 to 5 representing overall app experience")
    text_feedback = Column(Text, nullable=True, comment="Optional text feedback with maximum 1000 characters")
    feedback_type = Column(String(50), server_default=text("'General'"), default="General", comment="Type of feedback: General, Bug, or Feature Request")
    created_at = Column(DateTime, server_default=func.current_timestamp(), comment="Timestamp when feedback was submitted")
    updated_at = Column(DateTime, server_default=func.current_timestamp(), comment="Timestamp when feedback was last updated")

    __table_args__ = (
        CheckConstraint("overall_rating >= 1 AND overall_rating <= 5", name="user_feedback_overall_rating_check"),
        Index("idx_user_feedback_admin", created_at.desc()),  # same as idx_user_feedback_created_at; dropped in PR-2
        Index("idx_user_feedback_created_at", created_at),
        Index("idx_user_feedback_feedback_type", feedback_type),
        Index("idx_user_feedback_rating", overall_rating),
        Index("idx_user_feedback_user_created", user_id, created_at.desc()),
        Index("idx_user_feedback_user_id", user_id),
        {"comment": "Stores user feedback for the mobile application"},
    )


# ── i18n Phase 1: multi-language support (V2 plan §4.2) ───────────────────────
#
# Invariants (V2 §2):
#   I1 — English source columns (feeds.fd_name/fd_type/fd_category, taxonomy names)
#        are never translated in place; they stay English forever.
#   I3 — 'en' is the implicit baseline. There are NO 'en' rows in the translation
#        tables (feed_translations / vocabulary_translations); a missing translation
#        falls back to the English source via COALESCE at read time.
#   I4 — Languages are data, not code: the supported set lives in `languages`.

class Language(Base):
    """System-wide registry of supported languages. Admin-managed at runtime (I4)."""
    __tablename__ = "languages"

    code = Column(String(10), primary_key=True)            # BCP 47: 'en','hi','vi','sw','am','kn'
    name = Column(String(100), nullable=False)             # 'English', 'Hindi', ...
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CountryLanguage(Base):
    """Junction: which languages are offered to a country's users.

    Replaces V1's `country.supported_languages TEXT[]` with a real junction that
    carries FK integrity. 'en' is seeded for every country and is non-removable.
    """
    __tablename__ = "country_languages"

    country_id = Column(
        UUID(as_uuid=True), ForeignKey("country.id", ondelete="CASCADE"),
        primary_key=True, nullable=False,
    )
    language_code = Column(
        String(10), ForeignKey("languages.code", ondelete="RESTRICT"),
        primary_key=True, nullable=False,
    )


class FeedTranslation(Base):
    """Feed NAME translations (high cardinality). Country is implied by feed_id —
    a feed belongs to exactly one country (V2 §4.4)."""
    __tablename__ = "feed_translations"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    feed_id = Column(UUID(as_uuid=True), ForeignKey("feeds.id", ondelete="CASCADE"), nullable=False)
    language = Column(String(10), ForeignKey("languages.code", ondelete="RESTRICT"), nullable=False)
    name = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("feed_id", "language", name="uq_feed_translations_feed_lang"),
        # Duplicate of uq_feed_translations_feed_lang; dropped in PR-2.
        Index("idx_feed_translations_feed_lang", feed_id, language),
    )


class VocabularyTranslation(Base):
    """Feed TYPE + CATEGORY translations, unified into one low-cardinality table.

    Country-scoped key (I5): two countries sharing a language never clobber each
    other's vocabulary. Keys on the English `source_value` text (feeds store
    fd_type/fd_category as denormalized text), not a taxonomy id (V2 §4.4).
    """
    __tablename__ = "vocabulary_translations"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(20), nullable=False)              # 'feed_type' | 'feed_category'
    source_value = Column(Text, nullable=False)            # English text, e.g. 'Forage'
    language = Column(String(10), ForeignKey("languages.code", ondelete="RESTRICT"), nullable=False)
    name = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "country_id", "kind", "source_value", "language",
            name="uq_vocabulary_translations_scope",
        ),
        CheckConstraint(
            "kind IN ('feed_type', 'feed_category')",
            name="ck_vocabulary_translations_kind",
        ),
    )


# ── CLIMDES feed-library sync (climdes_IMPLEMENTATION_PLAN_v2 §9.3) ──────────
#
# Two tables only. The sync reads/writes the existing i18n tables through
# translation_service — no new i18n structures here.

class FeedSyncConfig(Base):
    """Singleton settings row for the CLIMDES feed-library sync.

    Exactly one row exists (seeded by the migration). `scheduler_enabled` gates
    scheduled runs ONLY — manual sync needs just a configured endpoint_url (D9/D19).
    `sync_day_of_week` uses Python's datetime.weekday() convention: Monday=0 …
    Sunday=6; default 2 = Wednesday (D22).
    """
    __tablename__ = "feed_sync_config"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    endpoint_url = Column(Text, nullable=True)
    auth_type = Column(String(20), nullable=False, server_default=text("'none'"), default="none")
    auth_header_name = Column(String(100), nullable=True)
    auth_token = Column(Text, nullable=True)                # masked on read (D10)
    sync_day_of_week = Column(SmallInteger, nullable=False, server_default=text("2"), default=2)
    scheduler_enabled = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    scheduler_toggled_by = Column(
        UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="SET NULL"), nullable=True,
    )
    scheduler_toggled_at = Column(DateTime(timezone=True), nullable=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    last_success_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint(
            "auth_type IN ('none', 'api_key', 'bearer')",
            name="ck_feed_sync_config_auth_type",
        ),
        CheckConstraint(
            "sync_day_of_week BETWEEN 0 AND 6",
            name="ck_feed_sync_config_day_of_week",
        ),
    )


class FeedSyncLog(Base):
    """One row per sync run (scheduled, manual, or file_upload — a manually
    uploaded Excel file run through the same engine, see
    docs/dev_docs/bulk_upload_changes/IMPLEMENTATION_PLAN.md), created at
    start and finalized at the end. `failed_rows` / `skipped_translations`
    hold the per-row detail lists described in plan §9.3."""
    __tablename__ = "feed_sync_log"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    finished_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), nullable=False, server_default=text("'running'"), default="running")
    trigger_type = Column(String(20), nullable=False)
    triggered_by = Column(
        UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="SET NULL"), nullable=True,
    )
    http_status = Column(Integer, nullable=True)
    total_rows = Column(Integer, nullable=False, server_default=text("0"), default=0)
    inserted = Column(Integer, nullable=False, server_default=text("0"), default=0)
    updated = Column(Integer, nullable=False, server_default=text("0"), default=0)
    skipped = Column(Integer, nullable=False, server_default=text("0"), default=0)
    translations_inserted = Column(Integer, nullable=False, server_default=text("0"), default=0)
    translations_updated = Column(Integer, nullable=False, server_default=text("0"), default=0)
    translations_skipped = Column(Integer, nullable=False, server_default=text("0"), default=0)
    failed_rows = Column(JSONB, nullable=True)
    skipped_translations = Column(JSONB, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'success', 'failed')",
            name="ck_feed_sync_log_status",
        ),
        CheckConstraint(
            "trigger_type IN ('scheduled', 'manual', 'file_upload')",
            name="ck_feed_sync_log_trigger_type",
        ),
        Index("idx_feed_sync_log_started_at", started_at),
        Index("idx_feed_sync_log_status", status),
    )


__all__ = [
    "Base",
    "CountryModel",
    "UserInformationModel",
    "FeedType",
    "FeedCategory",
    "Feed",
    "CustomFeed",
    "Report",
    "UserFeedback",
    "Language",
    "CountryLanguage",
    "FeedTranslation",
    "VocabularyTranslation",
    "FeedSyncConfig",
    "FeedSyncLog",
]
