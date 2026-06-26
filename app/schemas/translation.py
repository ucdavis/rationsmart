from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class FeedTranslationUpsertRequest(BaseModel):
    feed_id: str = Field(..., description="UUID of the standard feed")
    language: str = Field(..., max_length=10, description="BCP 47 language code, e.g. 'hi'")
    name: str = Field(..., min_length=1, max_length=500, description="Translated name")


class FeedTranslationRecord(BaseModel):
    feed_id: str
    language: str
    name: str
    action: Optional[str] = Field(None, description="'inserted' or 'updated' — only present on upsert")
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FeedTranslationListResponse(BaseModel):
    success: bool
    feed_id: str
    translations: List[FeedTranslationRecord]


class WorkbookImportSummary(BaseModel):
    success: bool
    message: str
    feeds_inserted: int = 0
    feeds_updated: int = 0
    feeds_skipped: int = 0
    types_inserted: int = 0
    types_updated: int = 0
    types_skipped: int = 0
    categories_inserted: int = 0
    categories_updated: int = 0
    categories_skipped: int = 0
    errors: List[str] = Field(default_factory=list)


class TranslationCoverageResponse(BaseModel):
    success: bool
    country_id: str
    language: str
    total_feeds: int
    translated_feeds: int
    missing_feeds: int
    total_types: int
    translated_types: int
    total_categories: int
    translated_categories: int
