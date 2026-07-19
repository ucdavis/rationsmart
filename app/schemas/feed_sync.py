"""Pydantic schemas for the CLIMDES feed-sync admin API (plan v2 §9.5).

D22: the DB stores sync_day_of_week as smallint 0-6 (Monday=0, matching
Python's datetime.weekday()); the API speaks lowercase English day names.
"""
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

DAY_NAMES = [
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]

AUTH_TYPES = ("none", "api_key", "bearer")


def day_name_to_int(name: str) -> int:
    return DAY_NAMES.index(name.lower())


def int_to_day_name(day: int) -> str:
    return DAY_NAMES[day]


def mask_token(token: Optional[str]) -> Optional[str]:
    """Never return the credential in full (D10)."""
    if not token:
        return None
    return f"****{token[-4:]}" if len(token) > 4 else "****"


# ── Config ────────────────────────────────────────────────────────────────────

class FeedSyncConfigUpdateRequest(BaseModel):
    """PUT /feed-sync/config — partial update; only provided fields change.
    scheduler_enabled is deliberately NOT here: the toggle endpoint owns it (D19)."""

    endpoint_url: Optional[str] = None
    auth_type: Optional[str] = Field(None, description="'none' | 'api_key' | 'bearer'")
    auth_header_name: Optional[str] = None
    auth_token: Optional[str] = None
    sync_day_of_week: Optional[str] = Field(
        None, description="Lowercase day name, e.g. 'wednesday'"
    )

    @field_validator("endpoint_url", mode="before")
    @classmethod
    def validate_endpoint_url(cls, v):
        if v is None:
            return v
        v = str(v).strip()
        if not v.startswith(("http://", "https://")):
            raise ValueError("endpoint_url must start with http:// or https://")
        return v

    @field_validator("auth_type", mode="before")
    @classmethod
    def validate_auth_type(cls, v):
        if v is None:
            return v
        if str(v).lower() not in AUTH_TYPES:
            raise ValueError("auth_type must be 'none', 'api_key' or 'bearer'")
        return str(v).lower()

    @field_validator("sync_day_of_week", mode="before")
    @classmethod
    def validate_sync_day(cls, v):
        if v is None:
            return v
        if str(v).strip().lower() not in DAY_NAMES:
            raise ValueError(
                f"sync_day_of_week must be one of: {', '.join(DAY_NAMES)}"
            )
        return str(v).strip().lower()


class FeedSyncConfigResponse(BaseModel):
    success: bool
    endpoint_url: Optional[str]
    auth_type: str
    auth_header_name: Optional[str]
    auth_token_masked: Optional[str]
    sync_day_of_week: str
    scheduler_enabled: bool
    scheduler_toggled_by: Optional[str]
    scheduler_toggled_at: Optional[datetime]
    last_run_at: Optional[datetime]
    last_success_at: Optional[datetime]


# ── Scheduler toggle + status (UC-8) ─────────────────────────────────────────

class SchedulerToggleRequest(BaseModel):
    action: str = Field(..., description="'enable' or 'disable'")

    @field_validator("action", mode="before")
    @classmethod
    def validate_action(cls, v):
        if not isinstance(v, str) or v.lower() not in ("enable", "disable"):
            raise ValueError('action must be "enable" or "disable"')
        return v.lower()


class SchedulerToggleResponse(BaseModel):
    success: bool
    message: str
    scheduler_enabled: bool
    new_status: str  # 'enabled' | 'disabled'


class SchedulerStatusResponse(BaseModel):
    success: bool
    scheduler_enabled: bool
    sync_day_of_week: str
    next_scheduled_run: Optional[date]  # null when the scheduler is disabled
    last_run_at: Optional[datetime]
    last_success_at: Optional[datetime]
    running: bool


# ── Manual run + logs (UC-3 / UC-5) ──────────────────────────────────────────

class FeedSyncRunResponse(BaseModel):
    success: bool
    message: str
    log_id: str


class FeedSyncLogItem(BaseModel):
    id: str
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    status: str
    trigger_type: str
    triggered_by: Optional[str]
    http_status: Optional[int]
    total_rows: int
    inserted: int
    updated: int
    skipped: int
    translations_inserted: int
    translations_updated: int
    translations_skipped: int


class FeedSyncLogListResponse(BaseModel):
    success: bool
    total_count: int
    page: int
    page_size: int
    total_pages: int
    logs: List[FeedSyncLogItem]


class FeedSyncLogDetailResponse(FeedSyncLogItem):
    success: bool
    error_message: Optional[str]
    failed_rows: Optional[List[Dict[str, Any]]]
    skipped_translations: Optional[List[Dict[str, Any]]]
