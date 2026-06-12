from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator

from app.schemas.animal import CattleInfo


# ── PDF report (diet_reports table) ──────────────────────────────────────────

class PDFReportMetadata(BaseModel):
    id: str
    user_id: str
    simulation_id: str
    report_name: str
    file_name: str
    file_size: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    class Config:
        orm_mode = True


class PDFReportList(BaseModel):
    reports: List[PDFReportMetadata]
    total_count: int

    class Config:
        orm_mode = True


class PDFReportResponse(BaseModel):
    success: bool
    message: str
    report_id: Optional[str] = None
    report_metadata: Optional[PDFReportMetadata] = None

    class Config:
        orm_mode = True


# ── Reports table (reports) ──────────────────────────────────────────────────

class ReportBase(BaseModel):
    report_id: str
    report_type: str = Field(..., description="'rec' or 'eval'")
    user_id: str
    bucket_url: Optional[str] = None
    saved_to_bucket: bool = False
    save_report: bool = False


class ReportCreate(ReportBase):
    json_result: Optional[str] = None
    report: Optional[bytes] = None


class ReportResponse(ReportBase):
    id: str
    json_result: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        orm_mode = True


# ── Save report ──────────────────────────────────────────────────────────────

class SaveReportRequest(BaseModel):
    report_id: str = Field(..., description="Report ID to save", example="rec-abc123")
    user_id: str = Field(..., description="User UUID who owns the report")


class SaveReportResponse(BaseModel):
    success: bool
    message: str
    bucket_url: Optional[str] = None
    error_message: Optional[str] = None


# ── User reports list ────────────────────────────────────────────────────────

class UserReportItem(BaseModel):
    bucket_url: str
    user_name: str
    report_id: str
    report_type: str = Field(..., description="'Diet Recommendation' or 'Diet Evaluation'")
    report_created_date: str
    simulation_id: str


class GetUserReportsResponse(BaseModel):
    success: bool
    message: str
    reports: List[UserReportItem]


# ── Simulation retrieval ─────────────────────────────────────────────────────

class FetchAllSimulationsRequest(BaseModel):
    user_id: str


class SimulationListItem(BaseModel):
    user_id: str
    simulation_id: str
    report_id: str
    created_at: str
    country_name: str


class FetchAllSimulationsResponse(BaseModel):
    success: bool
    simulations: List[SimulationListItem]


class FetchSimulationDetailsRequest(BaseModel):
    report_id: str
    user_id: str


class SimulationFeedDetail(BaseModel):
    feed_id: str
    feed_name: str
    feed_category: str
    feed_type: str
    price_per_kg: float
    quantity_as_fed: Optional[float] = None


class FetchSimulationDetailsResponse(BaseModel):
    success: bool
    cattle_info: CattleInfo
    feed_selection: List[SimulationFeedDetail]
    user_id: str
    country_name: str
    simulation_id: str
    report_id: str
    custom_constraints: Optional[Dict[str, Any]] = None


# ── Admin reports ────────────────────────────────────────────────────────────

class AdminGetAllReportsRequest(BaseModel):
    user_id: str
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class AdminReportItem(BaseModel):
    report_id: str
    report_name: str
    simulation_id: Optional[str] = None
    user_id: str
    user_name: str
    report_type: str
    bucket_url: Optional[str] = None
    created_at: str


class AdminGetAllReportsResponse(BaseModel):
    success: bool
    message: str
    reports: List[AdminReportItem]
    total_count: int
    page: int
    page_size: int
    total_pages: int


# ── User feedback ─────────────────────────────────────────────────────────────

class FeedbackSubmitRequest(BaseModel):
    feedback_type: str = Field(..., description="General, Defect, or Feature Request")
    overall_rating: Optional[int] = Field(None, ge=1, le=5)
    text_feedback: Optional[str] = Field(None, max_length=1000)

    @validator('feedback_type')
    def validate_feedback_type(cls, v):
        allowed = ('General', 'Defect', 'Feature Request')
        if v not in allowed:
            raise ValueError(f'feedback_type must be one of: {", ".join(allowed)}')
        return v


class UserFeedbackResponse(BaseModel):
    id: str
    overall_rating: Optional[int] = None
    text_feedback: Optional[str] = None
    feedback_type: str
    created_at: datetime

    class Config:
        orm_mode = True


class AdminFeedbackResponse(BaseModel):
    id: str
    user_name: str
    user_email: str
    overall_rating: Optional[int] = None
    text_feedback: Optional[str] = None
    feedback_type: str
    created_at: datetime

    class Config:
        orm_mode = True


class FeedbackListResponse(BaseModel):
    feedbacks: List[UserFeedbackResponse]
    total_count: int


class AdminFeedbackListResponse(BaseModel):
    feedbacks: List[AdminFeedbackResponse]
    total_count: int


class FeedbackStatsResponse(BaseModel):
    total_feedbacks: int
    average_rating: float
    rating_distribution: Dict[str, str]
    feedback_type_distribution: Dict[str, int]
    recent_feedbacks: int
