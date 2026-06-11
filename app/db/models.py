# ORM models — populated in Task 2.1.
#
# All 11 models:
#   CountryModel, UserInformationModel, Feed, CustomFeed, FeedAnalytics,
#   FeedType, FeedCategory, DietReport, Report, SystemMetadata, UserFeedback
#
# Rules for this file (enforced in Task 2.1):
#   - ORM table definitions only; no Pydantic schemas.
#   - Single Base imported from app.db.base (no second declarative_base()).

from app.db.base import Base

__all__ = ["Base"]
