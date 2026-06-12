"""
ORM models — ground truth from pg_dump taken 2026-06-12 (Task 2.1).

15 tables modelled; feeds_dup (backup, no PK) and alembic_version excluded.
Single Base from app.db.base — no second declarative_base() anywhere.
Foreign keys declared to match the live DB constraints.
"""

import uuid

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime,
    ForeignKey, Integer, LargeBinary, Numeric, String, Text, UniqueConstraint,
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
    currency = Column(String(10), nullable=True)
    is_active = Column(Boolean, nullable=False, server_default=text("false"), default=False)


class UserInformationModel(Base):
    __tablename__ = "user_information"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("uuid_generate_v4()"), default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    email_id = Column(String(255), nullable=False, unique=True)
    pin_hash = Column(String(255), nullable=False)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id", ondelete="RESTRICT"), nullable=False)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())
    is_admin = Column(Boolean, server_default=text("false"), default=False)
    is_active = Column(Boolean, nullable=False, server_default=text("true"), default=True)
    admin_level = Column(String(20), nullable=True)
    user_role = Column(String(30), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "admin_level IS NULL OR admin_level IN ('super_admin', 'country_admin')",
            name="ck_user_admin_level",
        ),
        CheckConstraint(
            "user_role IS NULL OR user_role IN ('farmer', 'extension_worker', 'nutritionist', 'researcher', 'feed_supplier', 'other')",
            name="ck_user_role",
        ),
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


class FeedCategory(Base):
    __tablename__ = "feed_categories"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    category_name = Column(String(100), nullable=False, unique=True)
    feed_type_id = Column(UUID(as_uuid=True), ForeignKey("feed_types.id"), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, server_default=text("0"), default=0)
    is_active = Column(Boolean, server_default=text("true"), default=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class Feed(Base):
    __tablename__ = "feeds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fd_code = Column(Text, nullable=True)
    fd_country_name = Column(Text, nullable=True)
    fd_country_cd = Column(Text, nullable=True)
    fd_name = Column(Text, nullable=False)
    fd_category = Column(Text, nullable=True)
    fd_type = Column(Text, nullable=True)
    fd_dm = Column(Numeric(10, 2), nullable=True)
    fd_ash = Column(Numeric(10, 2), nullable=True)
    fd_cp = Column(Numeric(10, 2), nullable=True)
    fd_npn_cp = Column(Numeric(10, 2), nullable=True)
    fd_ee = Column(Numeric(10, 2), nullable=True)
    fd_cf = Column(Numeric(10, 2), nullable=True)
    fd_nfe = Column(Numeric(10, 2), nullable=True)
    fd_st = Column(Numeric(10, 2), nullable=True)
    fd_ndf = Column(Numeric(10, 2), nullable=True)
    fd_hemicellulose = Column(Numeric(10, 2), nullable=True)
    fd_adf = Column(Numeric(10, 2), nullable=True)
    fd_cellulose = Column(Numeric(10, 2), nullable=True)
    fd_lg = Column(Numeric(10, 2), nullable=True)
    fd_ndin = Column(Numeric(10, 2), nullable=True)
    fd_adin = Column(Numeric(10, 2), nullable=True)
    fd_ca = Column(Numeric(10, 2), nullable=True)
    fd_p = Column(Numeric(10, 2), nullable=True)
    fd_season = Column(Text, nullable=True)
    fd_orginin = Column(Text, nullable=True)
    fd_ipb_local_lab = Column(Text, nullable=True)
    fd_country_id = Column(UUID(as_uuid=True), ForeignKey("country.id"), nullable=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())
    fd_category_id = Column(UUID(as_uuid=True), ForeignKey("feed_categories.id"), nullable=True)
    # Note: DB has two FK constraints for created_by (feeds_created_by_fkey + fk_feeds_created_by) — a duplication
    # artefact from manual ALTER TABLE. Only one is declared here; Alembic will detect the extra as noise.
    created_by = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="SET NULL"), nullable=True)
    baseline_price = Column(Numeric(10, 2), nullable=True)
    baseline_currency = Column(String(3), nullable=True)


class CustomFeed(Base):
    __tablename__ = "custom_feeds"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="CASCADE"), nullable=False)
    fd_code = Column(Text, nullable=False, unique=True)
    fd_country_id = Column(UUID(as_uuid=True), ForeignKey("country.id"), nullable=True)
    fd_country_name = Column(String(100), nullable=True)
    fd_country_cd = Column(String(10), nullable=True)
    fd_name = Column(String(100), nullable=False)
    fd_category = Column(String(50), nullable=True)
    fd_type = Column(String(50), nullable=True)
    fd_dm = Column(Numeric(10, 2), nullable=True)
    fd_ash = Column(Numeric(10, 2), nullable=True)
    fd_cp = Column(Numeric(10, 2), nullable=True)
    fd_ee = Column(Numeric(10, 2), nullable=True)
    fd_cf = Column(Numeric(10, 2), nullable=True)
    fd_nfe = Column(Numeric(10, 2), nullable=True)
    fd_st = Column(Numeric(10, 2), nullable=True)
    fd_ndf = Column(Numeric(10, 2), nullable=True)
    fd_hemicellulose = Column(Numeric(10, 2), nullable=True)
    fd_adf = Column(Numeric(10, 2), nullable=True)
    fd_cellulose = Column(Numeric(10, 2), nullable=True)
    fd_lg = Column(Numeric(10, 2), nullable=True)
    fd_ndin = Column(Numeric(10, 2), nullable=True)
    fd_adin = Column(Numeric(10, 2), nullable=True)
    fd_ca = Column(Numeric(10, 2), nullable=True)
    fd_p = Column(Numeric(10, 2), nullable=True)
    fd_orginin = Column(String(50), nullable=True)
    fd_ipb_local_lab = Column(String(50), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.current_timestamp())
    updated_at = Column(DateTime, nullable=False, server_default=func.current_timestamp())
    fd_npn_cp = Column(Numeric(10, 2), nullable=True)
    fd_country = Column(Text, nullable=True)
    fd_season = Column(Text, nullable=True)
    baseline_price = Column(Numeric(10, 2), nullable=True)
    baseline_currency = Column(String(3), nullable=True)


class FeedAnalytics(Base):
    __tablename__ = "feed_analytics"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    da_name = Column(String(100), nullable=False)
    da_phone_num = Column(String(100), nullable=False)
    country_cd = Column(String(3), nullable=False)
    country_name = Column(String(100), nullable=False)
    animal_info = Column(Text, nullable=False)
    sys_rcmd = Column(Text, nullable=False)
    cust_rcmd = Column(Text, nullable=False)
    farmer_name = Column(Text, nullable=False)
    farmer_phone_num = Column(String(100), nullable=False)
    rcmd_dt = Column(Date, nullable=False, server_default=func.current_date())
    farmer_adopted = Column(Boolean, nullable=True)
    created_on = Column(DateTime, nullable=False, server_default=func.current_timestamp())
    updated_on = Column(DateTime, nullable=False, server_default=func.current_timestamp())


class DietReport(Base):
    __tablename__ = "diet_reports"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="CASCADE"), nullable=False)
    simulation_id = Column(String(20), nullable=False)
    report_name = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    pdf_data = Column(LargeBinary, nullable=False)
    file_size = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())


class Report(Base):
    __tablename__ = "reports"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    report_id = Column(String(50), nullable=False, unique=True)
    report_type = Column(String(10), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_information.id"), nullable=False)
    bucket_url = Column(Text, nullable=True)
    json_result = Column(JSONB, nullable=True)
    saved_to_bucket = Column(Boolean, server_default=text("false"), default=False)
    report = Column(LargeBinary, nullable=True)
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())
    save_report = Column(Boolean, nullable=False, server_default=text("false"), default=False)
    simulation_id = Column(String(100), nullable=True)
    animal_inputs = Column(JSONB, nullable=True)
    feed_selection = Column(JSONB, nullable=True)
    custom_constraints = Column(JSONB, nullable=True)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id"), nullable=True)
    report_name = Column(String(255), nullable=True)

    __table_args__ = (
        CheckConstraint("report_type IN ('rec', 'eval')", name="reports_report_type_check"),
    )


class SystemMetadata(Base):
    __tablename__ = "system_metadata"

    key = Column(String(255), primary_key=True)
    value_timestamp = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"), default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="CASCADE"), nullable=False)
    overall_rating = Column(Integer, nullable=True)
    text_feedback = Column(Text, nullable=True)
    feedback_type = Column(String(50), server_default=text("'General'"), default="General")
    created_at = Column(DateTime, server_default=func.current_timestamp())
    updated_at = Column(DateTime, server_default=func.current_timestamp())

    __table_args__ = (
        CheckConstraint("overall_rating >= 1 AND overall_rating <= 5", name="user_feedback_overall_rating_check"),
    )


# ── Tables added directly to DB (not in original plan) ────────────────────────

class MasterFeed(Base):
    __tablename__ = "master_feeds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    fd_code = Column(Text, nullable=False, unique=True)
    fd_name = Column(Text, nullable=False)
    fd_type = Column(Text, nullable=False)
    fd_category = Column(Text, nullable=False)
    fd_dm = Column(Numeric(10, 2), nullable=True)
    fd_ash = Column(Numeric(10, 2), nullable=True)
    fd_cp = Column(Numeric(10, 2), nullable=True)
    fd_npn_cp = Column(Integer, nullable=True)  # integer in DB (not numeric)
    fd_ee = Column(Numeric(10, 2), nullable=True)
    fd_cf = Column(Numeric(10, 2), nullable=True)
    fd_nfe = Column(Numeric(10, 2), nullable=True)
    fd_st = Column(Numeric(10, 2), nullable=True)
    fd_ndf = Column(Numeric(10, 2), nullable=True)
    fd_hemicellulose = Column(Numeric(10, 2), nullable=True)
    fd_adf = Column(Numeric(10, 2), nullable=True)
    fd_cellulose = Column(Numeric(10, 2), nullable=True)
    fd_lg = Column(Numeric(10, 2), nullable=True)
    fd_ndin = Column(Numeric(10, 2), nullable=True)
    fd_adin = Column(Numeric(10, 2), nullable=True)
    fd_ca = Column(Numeric(10, 2), nullable=True)
    fd_p = Column(Numeric(10, 2), nullable=True)
    fd_season = Column(Text, nullable=True)
    fd_orginin = Column(Text, nullable=True)
    fd_ipb_local_lab = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())


class Breed(Base):
    __tablename__ = "breeds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id", ondelete="CASCADE"), nullable=False)
    description = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False)
    is_active = Column(Boolean, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("name", "country_id", name="uq_breeds_name_country"),
    )


class FeedCountryAvailability(Base):
    __tablename__ = "feed_country_availability"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    master_feed_id = Column(UUID(as_uuid=True), ForeignKey("master_feeds.id", ondelete="CASCADE"), nullable=False)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id", ondelete="CASCADE"), nullable=False)
    is_available = Column(Boolean, nullable=False)
    local_name = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("master_feed_id", "country_id", name="uq_feed_country_availability"),
    )


class FeedCountryPricing(Base):
    __tablename__ = "feed_country_pricing"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    master_feed_id = Column(UUID(as_uuid=True), ForeignKey("master_feeds.id", ondelete="CASCADE"), nullable=False)
    country_id = Column(UUID(as_uuid=True), ForeignKey("country.id", ondelete="CASCADE"), nullable=False)
    price_per_kg = Column(Numeric(10, 2), nullable=False)
    currency = Column(String(3), nullable=False)
    set_by = Column(UUID(as_uuid=True), ForeignKey("user_information.id", ondelete="SET NULL"), nullable=True)
    is_active = Column(Boolean, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("master_feed_id", "country_id", name="uq_feed_country_pricing"),
    )


__all__ = [
    "Base",
    "CountryModel",
    "UserInformationModel",
    "FeedType",
    "FeedCategory",
    "Feed",
    "CustomFeed",
    "FeedAnalytics",
    "DietReport",
    "Report",
    "SystemMetadata",
    "UserFeedback",
    "MasterFeed",
    "Breed",
    "FeedCountryAvailability",
    "FeedCountryPricing",
]
