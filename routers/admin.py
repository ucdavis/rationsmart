import logging
import math
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_admin_user
from app.db.models import FeedCategory, FeedType, UserInformationModel
from app.schemas.auth import (
    AdminUserListResponse,
    AdminUserToggleRequest,
    AdminUserToggleResponse,
    AdminUserListItem,
)
from app.schemas.feed import (
    AdminBulkLogResponse,
    AdminBulkUploadResponse,
    AdminFeedCategoryRequest,
    AdminFeedCategoryResponse,
    AdminFeedListResponse,
    AdminFeedRequest,
    AdminFeedResponse,
    AdminFeedTypeRequest,
    AdminFeedTypeResponse,
    FeedDetailsResponse,
)
from app.schemas.report import (
    AdminFeedbackListResponse,
    AdminGetAllReportsResponse,
    FeedbackStatsResponse,
    AdminReportItem,
    AdminFeedbackResponse as _AdminFBResponse,
)
from repositories.feed_repository import FeedRepository
from repositories.report_repository import ReportRepository
from repositories.user_repository import UserRepository
from services import feed_service, report_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Admin"])


def _feed_detail(f) -> FeedDetailsResponse:
    return FeedDetailsResponse(
        feed_id=str(f.id), fd_code=f.fd_code, fd_name=f.fd_name,
        fd_type=f.fd_type, fd_category=f.fd_category,
        fd_country_name=f.fd_country_name, fd_country_cd=f.fd_country_cd,
        fd_dm=float(f.fd_dm or 0), fd_cp=float(f.fd_cp or 0),
        fd_ash=float(f.fd_ash or 0), fd_ee=float(f.fd_ee or 0),
        fd_ndf=float(f.fd_ndf or 0), fd_adf=float(f.fd_adf or 0),
        fd_ca=float(f.fd_ca or 0), fd_p=float(f.fd_p or 0),
    )


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    country: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    skip = (page - 1) * page_size
    rows, total = await UserRepository(db).list_all(
        skip=skip, limit=page_size,
        country_filter=country, status_filter=status_filter, search=search,
    )
    users = []
    for user, country_name in rows:
        users.append(AdminUserListItem(
            id=str(user.id),
            name=user.name or "",
            email_id=user.email_id or "",
            country=country_name or "",
            is_active=user.is_active,
            is_admin=user.is_admin,
            created_at=user.created_at,
        ))
    total_pages = math.ceil(total / page_size) if total else 1
    return AdminUserListResponse(
        success=True, message="Users fetched",
        users=users, total_count=total, page=page, page_size=page_size, total_pages=total_pages,
    )


@router.put("/users/{user_id}/toggle-status", response_model=AdminUserToggleResponse)
async def toggle_user_status(
    user_id: str,
    body: AdminUserToggleRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if user_id == str(admin_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own status")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    active = body.action == "enable"
    await repo.toggle_status(user, active)
    await db.commit()
    return AdminUserToggleResponse(
        success=True,
        message=f"User {body.action}d successfully",
        user_id=user_id,
        new_status="active" if active else "inactive",
        user_name=user.name or "",
        user_email=user.email_id or "",
    )


# ── Feed CRUD ─────────────────────────────────────────────────────────────────

@router.get("/list-feeds", response_model=AdminFeedListResponse)
async def list_feeds(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    feed_type: Optional[str] = Query(None),
    feed_category: Optional[str] = Query(None),
    country_name: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    skip = (page - 1) * page_size
    feeds, total = await feed_service.list_feeds(
        db, skip=skip, limit=page_size,
        feed_type=feed_type, feed_category=feed_category,
        country_name=country_name, search=search,
    )
    total_pages = math.ceil(total / page_size) if total else 1
    feed_items = [_feed_detail(f) for f in feeds]
    return AdminFeedListResponse(
        success=True, message="Feeds fetched",
        feeds=feed_items, total_count=total,
        page=page, page_size=page_size, total_pages=total_pages,
    )


@router.post("/add-feed", response_model=AdminFeedResponse)
async def add_feed(
    body: AdminFeedRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, feed = await feed_service.create_feed(db, body.dict())
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    feed_resp = FeedDetailsResponse(
        feed_id=str(feed.id), fd_code=feed.fd_code, fd_name=feed.fd_name,
        fd_type=feed.fd_type, fd_category=feed.fd_category,
        fd_country_name=feed.fd_country_name,
    ) if feed else None
    return AdminFeedResponse(success=True, message=message, feed=feed_resp)


@router.put("/update-feed/{feed_id}", response_model=AdminFeedResponse)
async def update_feed(
    feed_id: str,
    body: AdminFeedRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, feed = await feed_service.update_feed(db, feed_id, body.dict(exclude_none=True))
    if not success:
        code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=message)
    await db.commit()
    feed_resp = FeedDetailsResponse(
        feed_id=str(feed.id), fd_code=feed.fd_code, fd_name=feed.fd_name,
        fd_type=feed.fd_type, fd_category=feed.fd_category,
    ) if feed else None
    return AdminFeedResponse(success=True, message=message, feed=feed_resp)


@router.delete("/delete-feed/{feed_id}")
async def delete_feed(
    feed_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    success, message = await feed_service.delete_feed(db, feed_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return {"success": True, "message": message}


# ── Bulk upload / export ──────────────────────────────────────────────────────

@router.post("/bulk-upload-feeds", response_model=AdminBulkUploadResponse)
async def bulk_upload_feeds(
    file: UploadFile = File(...),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be an Excel file (.xlsx or .xls)")
    content = await file.read()
    result = await feed_service.bulk_upload_feeds(db, content)
    if result["success"]:
        await db.commit()
    return AdminBulkUploadResponse(**result)


@router.get("/export-feeds")
async def export_feeds(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    file_bytes, filename = await feed_service.export_feeds(db)
    return StreamingResponse(
        iter([file_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export-custom-feeds")
async def export_custom_feeds(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    file_bytes, filename = await feed_service.export_custom_feeds(db)
    return StreamingResponse(
        iter([file_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/read-bulk-upload-logfile/", response_model=AdminBulkLogResponse)
async def read_bulk_upload_logfile(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns bulk upload log metadata. S3 URL resolution is in Task 2.8."""
    return AdminBulkLogResponse(success=True, message="Log retrieval pending Task 2.8 (S3 integration)")


# ── Feed types ────────────────────────────────────────────────────────────────

@router.post("/add-feed-type", response_model=AdminFeedTypeResponse)
async def add_feed_type(
    body: AdminFeedTypeRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, ft = await feed_service.create_feed_type(db, body.dict())
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    from app.schemas.feed import FeedTypeResponse
    ft_resp = FeedTypeResponse(
        id=str(ft.id), type_name=ft.type_name, description=ft.description,
        sort_order=ft.sort_order, is_active=ft.is_active,
    ) if ft else None
    return AdminFeedTypeResponse(success=True, message=message, feed_type=ft_resp)


@router.delete("/delete-feed-type/{type_id}")
async def delete_feed_type(
    type_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    success, message = await feed_service.delete_feed_type(db, type_id)
    if not success:
        code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.get("/list-feed-types")
async def list_feed_types(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FeedType).where(FeedType.is_active == True)  # noqa: E712
    )
    feed_types = result.scalars().all()
    return {"feed_types": [{"id": str(ft.id), "type_name": ft.type_name} for ft in feed_types]}


# ── Feed categories ───────────────────────────────────────────────────────────

@router.post("/add-feed-category", response_model=AdminFeedCategoryResponse)
async def add_feed_category(
    body: AdminFeedCategoryRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, cat = await feed_service.create_feed_category(db, body.dict())
    if not success:
        code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=message)
    await db.commit()
    from app.schemas.feed import FeedCategoryResponse
    cat_resp = FeedCategoryResponse(
        id=str(cat.id), category_name=cat.category_name,
        feed_type_id=str(cat.feed_type_id), sort_order=cat.sort_order, is_active=cat.is_active,
    ) if cat else None
    return AdminFeedCategoryResponse(success=True, message=message, feed_category=cat_resp)


@router.delete("/delete-feed-category/{category_id}")
async def delete_feed_category(
    category_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    success, message = await feed_service.delete_feed_category(db, category_id)
    if not success:
        code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.get("/list-feed-categories")
async def list_feed_categories(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FeedCategory).where(FeedCategory.is_active == True)  # noqa: E712
    )
    cats = result.scalars().all()
    return {"categories": [
        {"id": str(c.id), "category_name": c.category_name, "feed_type_id": str(c.feed_type_id)}
        for c in cats
    ]}


# ── User feedback (admin) ─────────────────────────────────────────────────────

@router.get("/user-feedback/all", response_model=AdminFeedbackListResponse)
async def all_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    skip = (page - 1) * page_size
    rows, total = await ReportRepository(db).get_all_feedback(skip=skip, limit=page_size)
    items = []
    user_repo = UserRepository(db)
    for fb in rows:
        user = await user_repo.get_by_id(str(fb.user_id))
        items.append(_AdminFBResponse(
            id=str(fb.id),
            user_name=user.name if user else "",
            user_email=user.email_id if user else "",
            overall_rating=fb.overall_rating,
            text_feedback=fb.text_feedback,
            feedback_type=fb.feedback_type or "",
            created_at=fb.created_at,
        ))
    return AdminFeedbackListResponse(feedbacks=items, total_count=total)


@router.get("/user-feedback/stats", response_model=FeedbackStatsResponse)
async def feedback_stats(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    stats = await ReportRepository(db).get_feedback_stats()
    return FeedbackStatsResponse(**stats)


# ── Reports (admin) ───────────────────────────────────────────────────────────

@router.get("/get-all-reports/", response_model=AdminGetAllReportsResponse)
async def get_all_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    skip = (page - 1) * page_size
    reports, total = await report_service.get_all_saved_reports(db, skip=skip, limit=page_size)
    total_pages = math.ceil(total / page_size) if total else 1
    return AdminGetAllReportsResponse(
        success=True, message="Reports fetched",
        reports=[AdminReportItem(**r) for r in reports],
        total_count=total, page=page, page_size=page_size, total_pages=total_pages,
    )
