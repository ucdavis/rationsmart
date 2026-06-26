from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from pydantic import BaseModel, ConfigDict, Field


# ── Feed types ───────────────────────────────────────────────────────────────

class FeedTypeBase(BaseModel):
    type_name: str = Field(..., max_length=100, description="Display name for feed type")
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class FeedTypeCreate(FeedTypeBase):
    pass


class FeedTypeUpdate(BaseModel):
    type_name: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = None


class FeedTypeResponse(FeedTypeBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ── Feed categories ──────────────────────────────────────────────────────────

class FeedCategoryBase(BaseModel):
    category_name: str = Field(..., max_length=100)
    feed_type_id: str = Field(..., description="Feed type UUID")
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class FeedCategoryCreate(FeedCategoryBase):
    pass


class FeedCategoryUpdate(BaseModel):
    category_name: Optional[str] = Field(None, max_length=100)
    feed_type_id: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class FeedCategoryResponse(FeedCategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    feed_type: Optional[FeedTypeResponse] = None


# ── Feed classification structure ────────────────────────────────────────────

class FeedClassificationStructure(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    types: List[FeedTypeResponse]


class FeedClassificationStructureResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    feed_classification: List[Dict[str, Any]]


# ── Individual feed details ──────────────────────────────────────────────────

class FeedDetailsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    feed_id: str
    fd_code: Optional[Union[float, str]] = None
    fd_name: str
    fd_type: Optional[str] = None
    fd_category: Optional[str] = None
    display_name: Optional[str] = None
    display_type: Optional[str] = None
    display_category: Optional[str] = None
    fd_country_id: Optional[str] = None
    fd_country_name: Optional[str] = None
    fd_country_cd: Optional[str] = None
    fd_dm: Optional[float] = None
    fd_ash: Optional[float] = None
    fd_cp: Optional[float] = None
    fd_ee: Optional[float] = None
    fd_st: Optional[float] = None
    fd_ndf: Optional[float] = None
    fd_adf: Optional[float] = None
    fd_lg: Optional[float] = None
    fd_ndin: Optional[float] = None
    fd_adin: Optional[float] = None
    fd_ca: Optional[float] = None
    fd_p: Optional[float] = None
    fd_cf: Optional[float] = None
    fd_nfe: Optional[float] = None
    fd_hemicellulose: Optional[float] = None
    fd_cellulose: Optional[float] = None
    fd_npn_cp: Optional[float] = None
    fd_season: Optional[str] = None
    fd_orginin: Optional[str] = None
    fd_ipb_local_lab: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class FeedDescriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    feed_cd: Optional[str] = None
    row_id: int
    feed_uuid: str
    feed_name: str
    feed_category: str
    feed_type: str


# ── Admin feed management ────────────────────────────────────────────────────

class AdminFeedTypeRequest(BaseModel):
    type_name: str = Field(..., max_length=100)
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class AdminFeedTypeResponse(BaseModel):
    success: bool
    message: str
    feed_type: Optional[FeedTypeResponse] = None


class AdminFeedCategoryRequest(BaseModel):
    category_name: str = Field(..., max_length=100)
    feed_type_id: str
    description: Optional[str] = None
    sort_order: Optional[int] = 0


class AdminFeedCategoryResponse(BaseModel):
    success: bool
    message: str
    feed_category: Optional[FeedCategoryResponse] = None


class AdminFeedRequest(BaseModel):
    fd_code: str
    fd_name: str
    fd_category: str
    fd_type: str
    fd_country_name: str
    fd_country_cd: Optional[str] = None
    fd_dm: Optional[float] = None
    fd_ash: Optional[float] = None
    fd_cp: Optional[float] = None
    fd_npn_cp: Optional[float] = None
    fd_ee: Optional[float] = None
    fd_cf: Optional[float] = None
    fd_nfe: Optional[float] = None
    fd_st: Optional[float] = None
    fd_ndf: Optional[float] = None
    fd_hemicellulose: Optional[float] = None
    fd_adf: Optional[float] = None
    fd_cellulose: Optional[float] = None
    fd_lg: Optional[float] = None
    fd_ndin: Optional[float] = None
    fd_adin: Optional[float] = None
    fd_ca: Optional[float] = None
    fd_p: Optional[float] = None
    fd_season: Optional[str] = None
    fd_orginin: Optional[str] = None
    fd_ipb_local_lab: Optional[str] = None


class AdminFeedResponse(BaseModel):
    success: bool
    message: str
    feed: Optional[FeedDetailsResponse] = None


class AdminFeedListResponse(BaseModel):
    success: bool
    message: str
    feeds: List[FeedDetailsResponse]
    total_count: int
    page: int
    page_size: int
    total_pages: int


class AdminBulkUploadResponse(BaseModel):
    success: bool
    message: str
    total_records: int
    successful_uploads: int
    failed_uploads: int
    existing_records: int
    updated_records: int
    failed_records: List[Dict[str, Any]]
    bulk_import_log: Optional[str] = None


class AdminExportResponse(BaseModel):
    success: bool
    message: str
    file_url: str
    file_name: str
    total_records: int


class AdminBulkLogResponse(BaseModel):
    success: bool
    message: str
    log_file_url: Optional[str] = None
    filename: Optional[str] = None
    file_size: Optional[str] = None
    created_at: Optional[str] = None
