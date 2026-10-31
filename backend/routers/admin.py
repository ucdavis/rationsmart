import logging
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Body, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.dependencies import get_db, require_admin_user
from app.feed_cache import invalidate_feeds_cache
from app.db.models import FeedCategory, FeedType, UserInformationModel
from app.schemas.auth import (
    AdminUserListResponse,
    AdminUserToggleRequest,
    AdminUserToggleResponse,
    AdminUserRoleToggleRequest,
    AdminUserRoleToggleResponse,
    AdminUserListItem,
    AdminCountryToggleRequest,
    AdminCountryToggleResponse,
    AdminCountryListItem,
    AdminCountryListAllResponse,
)
from app.schemas.feed import (
    AdminFeedCategoryRequest,
    AdminFeedCategoryResponse,
    AdminFeedListResponse,
    AdminFeedRequest,
    AdminFeedResponse,
    AdminFeedTypeRequest,
    AdminFeedTypeResponse,
    FeedDetailsResponse,
    FeedLibraryWipeRequest,
    FeedLibraryWipeResponse,
)
from app.schemas.report import (
    AdminFeedbackListResponse,
    AdminGetAllReportsResponse,
    FeedbackStatsResponse,
    AdminReportItem,
    AdminFeedbackResponse as _AdminFBResponse,
)
from app.schemas.language import (
    CountryLanguageListResponse,
    CountryWithLanguagesResponse,
    LanguageCreateRequest,
    LanguageListResponse,
    LanguageResponse,
    LanguageUpdateRequest,
)
from app.schemas.translation import (
    FeedTranslationListResponse,
    FeedTranslationRecord,
    FeedTranslationUpsertRequest,
    TranslationCoverageResponse,
    WorkbookImportSummary,
)
from app.schemas.feed_sync import (
    FeedSyncConfigResponse,
    FeedSyncConfigUpdateRequest,
    FeedSyncLogDetailResponse,
    FeedSyncLogItem,
    FeedSyncLogListResponse,
    FeedSyncRunResponse,
    SchedulerStatusResponse,
    SchedulerToggleRequest,
    SchedulerToggleResponse,
    day_name_to_int,
    int_to_day_name,
    mask_token,
)
from app.celery_app import celery_app
from repositories.feed_repository import FeedRepository
from repositories.feed_sync_repository import FeedSyncRepository
from repositories.language_repository import LanguageRepository
from repositories.report_repository import ReportRepository
from repositories.user_repository import UserRepository
from services import (
    db_backup, email_service, feed_library_wipe, feed_service, feed_sync_service,
    report_service, translation_service,
)

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

@router.get("/users", response_model=AdminUserListResponse, summary="List all registered users (admin)")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    country: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a paginated list of all registered users. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Optional query parameters:**
    - `page` (default 1), `page_size` (default 20, max 100) — pagination.
    - `country` — filter by country name.
    - `status` — filter by account status (`active` or `inactive`).
    - `search` — substring search across name and email.
    """
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


@router.put("/users/{user_id}/toggle-status", response_model=AdminUserToggleResponse,
            summary="Enable or disable a user account (admin)")
async def toggle_user_status(
    user_id: str,
    body: AdminUserToggleRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Activate or deactivate a user account. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `user_id` — UUID of the target user.

    **Mandatory body field:** `action` — `"enable"` to activate, `"disable"` to deactivate.

    An admin cannot toggle their own account. Returns `400` if attempting self-modification, `404` if the user is not found.
    """
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


async def _notify_admin_granted(
    promoted_email: str, promoted_name: str, granted_by: str, admin_emails: List[Tuple[str, str]],
) -> None:
    """Fire-and-forget notification for an admin grant. Runs in a BackgroundTasks worker
    after the DB commit, so SMTP failures never affect the promotion itself — just logged."""
    sent, err = await email_service.send_admin_granted_email(
        to_email=promoted_email, user_name=promoted_name, granted_by=granted_by,
    )
    if not sent:
        logger.warning("Admin-grant email to promoted user %s failed: %s", promoted_email, err)

    for admin_email, admin_name in admin_emails:
        sent, err = await email_service.send_admin_notification_email(
            to_email=admin_email, admin_name=admin_name or "",
            promoted_name=promoted_name, promoted_email=promoted_email, granted_by=granted_by,
        )
        if not sent:
            logger.warning("Admin-grant notification to %s failed: %s", admin_email, err)


@router.put("/users/{user_id}/toggle-admin", response_model=AdminUserRoleToggleResponse,
            summary="Grant or revoke Admin privileges for a user (admin)")
async def toggle_user_admin(
    user_id: str,
    body: AdminUserRoleToggleRequest,
    background_tasks: BackgroundTasks,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Grant or revoke Admin privileges for a user. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `user_id` — UUID of the target user.

    **Mandatory body field:** `action` — `"grant"` to promote to Admin, `"revoke"` to demote.

    An admin cannot change their own admin status. Returns `400` if attempting self-modification,
    `404` if the user is not found.

    If the user is already in the requested state (e.g. `grant` on an existing admin), this is a
    no-op — no DB write and no email is sent, so retries/double-clicks can't re-trigger the
    notification fan-out below.

    On `grant`, the promoted user and every existing admin (including the one performing the
    action) receive an email notification. This is sent in the background after the change is
    committed, so a failure to send email never blocks or fails the grant itself.
    """
    if user_id == str(admin_user.id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change your own admin status")
    repo = UserRepository(db)
    user = await repo.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    grant = body.action == "grant"

    if user.is_admin == grant:
        return AdminUserRoleToggleResponse(
            success=True,
            message=f"User is already {'an admin' if grant else 'not an admin'}",
            user_id=user_id,
            new_admin_status="admin" if grant else "user",
            user_name=user.name or "",
            user_email=user.email_id or "",
        )

    await repo.toggle_admin(user, grant)
    await db.commit()

    if grant:
        admins = await repo.list_admins()
        admin_emails = [(a.email_id, a.name) for a in admins if a.id != user.id]
        background_tasks.add_task(
            _notify_admin_granted,
            promoted_email=user.email_id or "",
            promoted_name=user.name or "",
            granted_by=admin_user.name or admin_user.email_id or "an admin",
            admin_emails=admin_emails,
        )

    return AdminUserRoleToggleResponse(
        success=True,
        message=f"Admin privileges {'granted' if grant else 'revoked'} successfully",
        user_id=user_id,
        new_admin_status="admin" if grant else "user",
        user_name=user.name or "",
        user_email=user.email_id or "",
    )


# ── Feed CRUD ─────────────────────────────────────────────────────────────────

@router.get("/list-feeds", response_model=AdminFeedListResponse,
            summary="List all standard feeds with filters (admin)")
async def list_feeds(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    feed_type: Optional[str] = Query(None),
    feed_category: Optional[str] = Query(None),
    country_name: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    feed_type_id: Optional[str] = Query(None),
    feed_category_id: Optional[str] = Query(None),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a paginated, filterable list of all standard feeds in the database. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Optional query parameters:**
    - `page` (default 1), `page_size` (default 20, max 100).
    - `feed_type` — filter by feed type name.
    - `feed_category` — filter by category name.
    - `feed_type_id` — filter by feed type UUID (preferred; wins over `feed_type`).
    - `feed_category_id` — filter by feed category UUID (preferred; wins over `feed_category`).
    - `country_name` — filter by country name.
    - `search` — substring search on feed name.
    """
    skip = (page - 1) * page_size
    feeds, total = await feed_service.list_feeds(
        db, skip=skip, limit=page_size,
        feed_type=feed_type, feed_category=feed_category,
        country_name=country_name, search=search,
        feed_type_id=feed_type_id, feed_category_id=feed_category_id,
    )
    total_pages = math.ceil(total / page_size) if total else 1
    feed_items = [_feed_detail(f) for f in feeds]
    return AdminFeedListResponse(
        success=True, message="Feeds fetched",
        feeds=feed_items, total_count=total,
        page=page, page_size=page_size, total_pages=total_pages,
    )


@router.post("/add-feed", response_model=AdminFeedResponse, summary="Add a new standard feed (admin)")
async def add_feed(
    body: AdminFeedRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new standard (global) feed entry visible to all users. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Mandatory body fields:** `fd_name`, `fd_type`, `fd_category`, `fd_country_name`, `fd_country_cd`, and nutritional values (`fd_dm`, `fd_cp`, `fd_ndf`, `fd_adf`, `fd_ee`, `fd_ash`, `fd_ca`, `fd_p`).

    Returns `400` if required fields are missing or a duplicate feed is detected.
    """
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


@router.put("/update-feed/{feed_id}", response_model=AdminFeedResponse,
            summary="Update an existing standard feed (admin)")
async def update_feed(
    feed_id: str,
    body: AdminFeedRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update the details or nutritional composition of an existing standard feed. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `feed_id` — UUID of the feed to update.

    **Body:** Any subset of feed fields (partial update supported; `null` fields are ignored).

    Returns `404` if not found, `400` for validation errors.
    """
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


@router.delete("/delete-feed/{feed_id}", summary="Delete a standard feed (admin)")
async def delete_feed(
    feed_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently remove a standard feed from the database. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `feed_id` — UUID of the feed to delete.

    Returns `404` if the feed does not exist.
    """
    success, message = await feed_service.delete_feed(db, feed_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.delete(
    "/feeds",
    response_model=FeedLibraryWipeResponse,
    summary="Delete the whole standard feed library (admin, Test only)",
)
async def wipe_feed_library(
    dry_run: bool = Query(False, description="Only count what would be deleted."),
    body: Optional[FeedLibraryWipeRequest] = Body(None),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Empty `feeds` and `feed_translations`. Feed types, categories and their
    translations, custom feeds, users, reports and the CLIMDES sync settings and
    history stay. Same wipe as `scripts_2/db_reset.py --feeds-only`.

    **Requires:** Bearer JWT with admin privileges, and `ALLOW_FEED_LIBRARY_WIPE=true`
    in the server's `.env` (off by default, so production refuses).

    **`?dry_run=true`:** returns the row counts only; no body needed.

    **Real run:** body `{"confirm": "DELETE ALL FEEDS"}`. A `pg_dump` of the whole
    database is written to `BACKUP_DIR` first; then both tables are emptied in one
    transaction, rolled back if any other table changes; then the Redis feed cache
    is cleared and a line is added to `db_reset.log` beside the backup.

    An already empty library returns at once, without a backup.

    Errors: `403` disabled on this server · `400` missing or wrong confirmation ·
    `409` a feed sync is running, or another table changed during the wipe (rolled
    back) · `500` the backup failed. Nothing is deleted in any error case; the
    details are in the API log.
    """
    if not settings.allow_feed_library_wipe:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Feed library wipe is disabled on this server",
        )
    if await FeedSyncRepository(db).get_running_log() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A feed sync is running; try again when it has finished",
        )

    counts = await feed_library_wipe.count_feed_library(db)
    if dry_run:
        return FeedLibraryWipeResponse(
            success=True, dry_run=True, message="Dry run: nothing deleted", **counts,
        )
    if body is None or body.confirm != feed_library_wipe.CONFIRM_PHRASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f'Send {{"confirm": "{feed_library_wipe.CONFIRM_PHRASE}"}} to delete the feed library',
        )
    if not any(counts.values()):
        return FeedLibraryWipeResponse(
            success=True, dry_run=False, message="Feed library is already empty", **counts,
        )

    backup_dir = Path(settings.backup_dir)
    try:
        backup = await run_in_threadpool(
            db_backup.backup_database, backup_dir, feed_library_wipe.BACKUP_PREFIX,
        )
    except db_backup.BackupError as exc:
        # pg_dump's stderr names hosts, users and paths: log it, don't return it.
        logger.error("Feed library wipe stopped, backup failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Backup failed; nothing deleted. See the API log for details.",
        )

    try:
        deleted = await feed_library_wipe.wipe_feed_library(db)
    except feed_library_wipe.FeedWipeAbort as exc:
        await db.rollback()
        logger.error("Feed library wipe rolled back (backup %s): %s", backup.name, exc)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Another table changed during the wipe; rolled back, nothing deleted. Try again.",
        )
    await db.commit()

    summary = ", ".join(f"{t}={n}" for t, n in deleted.items())
    logger.warning(
        "Feed library wiped by %s (backup %s): %s", admin_user.email_id, backup.name, summary,
    )
    try:
        await invalidate_feeds_cache()
    except Exception as exc:  # committed already; the cache expires within 5 minutes
        logger.warning("Feed library wipe: could not clear the Redis feed cache: %s", exc)
    try:
        stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        label = f"{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
        db_backup.append_log(
            backup_dir, f"{stamp}\t{admin_user.email_id}\t{label} (API)\t{backup.name}\t{summary}",
        )
    except OSError as exc:
        logger.warning("Feed library wipe: could not write %s: %s", db_backup.LOG_NAME, exc)

    return FeedLibraryWipeResponse(
        success=True,
        dry_run=False,
        message="Feed library deleted",
        feeds=deleted["feeds"],
        feed_translations=deleted["feed_translations"],
        backup_file=backup.name,
    )


# ── Export (bulk-upload template) ─────────────────────────────────────────────
# The legacy `/bulk-upload-feeds` (fd_name-keyed) and `/read-bulk-upload-logfile/`
# (S3-stub) endpoints were retired in favor of `POST /feed-sync/run-from-file`,
# which imports this same template through the CLIMDES sync engine — see
# docs/dev_docs/bulk_upload_changes/IMPLEMENTATION_PLAN.md (D1/D4).

@router.get("/export-feeds", summary="Download all standard feeds as an Excel file (admin)")
async def export_feeds(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export the full standard feed catalogue to an `.xlsx` file, in the same
    column contract as the CLIMDES Feed Library — for download, or as a
    ready-to-edit template for `POST /v1/admin/feed-sync/run-from-file`
    (the bulk-upload fallback when CLIMDES is unreachable). Admin only.

    **Requires:** Bearer JWT with admin privileges.

    Returns a streaming Excel file with `Content-Disposition: attachment`.
    """
    file_bytes, filename = await feed_service.export_feeds(db)
    return StreamingResponse(
        iter([file_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export-custom-feeds", summary="Download all custom feeds as an Excel file (admin)")
async def export_custom_feeds(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export all user-created custom feeds across all users to an `.xlsx` file. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    Returns a streaming Excel file with `Content-Disposition: attachment`.
    """
    file_bytes, filename = await feed_service.export_custom_feeds(db)
    return StreamingResponse(
        iter([file_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Empty bulk-upload workbook: the export's 21 columns, header row only. Kept as a
# static file (not generated) so its formatting survives — bold headers, frozen
# top row, column widths. A unit test pins its headers to the export contract.
FEED_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "app" / "assets" / "rs_template_feed_upload.xlsx"


@router.get("/feed-template", summary="Download the empty feed bulk-upload template (admin)")
async def download_feed_template(
    admin_user: UserInformationModel = Depends(require_admin_user),
):
    """
    Download the empty `.xlsx` template for `POST /v1/admin/feed-sync/run-from-file`:
    the same 21 columns as `GET /v1/admin/export-feeds`, header row only. Admin only.

    Replaces the old Android-era template on S3, whose columns the import rejects.

    **Requires:** Bearer JWT with admin privileges.
    """
    if not FEED_TEMPLATE_PATH.is_file():
        logger.error("Feed upload template missing at %s", FEED_TEMPLATE_PATH)
        raise HTTPException(status_code=500, detail="Feed upload template is not available")
    return FileResponse(
        FEED_TEMPLATE_PATH,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=FEED_TEMPLATE_PATH.name,
    )


# ── Feed types ────────────────────────────────────────────────────────────────

@router.post("/add-feed-type", response_model=AdminFeedTypeResponse,
             summary="Create a new feed type (admin)")
async def add_feed_type(
    body: AdminFeedTypeRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add a new top-level feed type (e.g. Roughage, Concentrate, Mineral supplement). Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Mandatory body fields:** `type_name` (unique string).

    **Optional body fields:** `description`, `sort_order` (integer for display ordering).

    Returns `400` if a feed type with the same name already exists.
    """
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


@router.delete("/delete-feed-type/{type_id}", summary="Delete a feed type (admin)")
async def delete_feed_type(
    type_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a feed type from the classification hierarchy. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `type_id` — UUID of the feed type.

    Returns `404` if not found; `409` if the type is still referenced by existing feeds or categories.
    """
    success, message = await feed_service.delete_feed_type(db, type_id)
    if not success:
        code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.get("/list-feed-types", summary="List all active feed types (admin)")
async def list_feed_types(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the ID and name of every active feed type. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    Use the returned `id` values when creating or filtering feed categories.
    """
    result = await db.execute(
        select(FeedType).where(FeedType.is_active == True)  # noqa: E712
    )
    feed_types = result.scalars().all()
    return {"feed_types": [{"id": str(ft.id), "type_name": ft.type_name} for ft in feed_types]}


# ── Feed categories ───────────────────────────────────────────────────────────

@router.post("/add-feed-category", response_model=AdminFeedCategoryResponse,
             summary="Create a new feed category under a feed type (admin)")
async def add_feed_category(
    body: AdminFeedCategoryRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Add a new feed category nested under an existing feed type. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Mandatory body fields:** `category_name` (unique within the type), `feed_type_id` (UUID of the parent feed type from `GET /v1/admin/list-feed-types`).

    **Optional body fields:** `description`, `sort_order`.

    Returns `404` if the parent feed type is not found; `400` if the category name already exists under that type.
    """
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


@router.delete("/delete-feed-category/{category_id}", summary="Delete a feed category (admin)")
async def delete_feed_category(
    category_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a feed category from the classification hierarchy. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `category_id` — UUID of the feed category.

    Returns `404` if not found; `409` if the category is still referenced by existing feeds.
    """
    success, message = await feed_service.delete_feed_category(db, category_id)
    if not success:
        code = status.HTTP_404_NOT_FOUND if "not found" in message.lower() else status.HTTP_409_CONFLICT
        raise HTTPException(status_code=code, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.get("/list-feed-categories", summary="List all active feed categories (admin)")
async def list_feed_categories(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all active feed categories with their ID, name, and parent feed type ID. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    Use the returned `id` values when assigning feeds to categories.
    """
    result = await db.execute(
        select(FeedCategory).where(FeedCategory.is_active == True)  # noqa: E712
    )
    cats = result.scalars().all()
    return {"categories": [
        {"id": str(c.id), "category_name": c.category_name, "feed_type_id": str(c.feed_type_id)}
        for c in cats
    ]}


# ── User feedback (admin) ─────────────────────────────────────────────────────

@router.get("/user-feedback/all", response_model=AdminFeedbackListResponse,
            summary="List all user feedback entries (admin)")
async def all_feedback(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a paginated list of all feedback submitted by users across the platform. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Optional query parameters:** `page` (default 1), `page_size` (default 20, max 100).

    Each entry includes the user's name, email, rating, feedback text, and submission timestamp.
    """
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


@router.get("/user-feedback/stats", response_model=FeedbackStatsResponse,
            summary="Get aggregate feedback statistics (admin)")
async def feedback_stats(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return platform-wide feedback statistics: total count, average rating, rating distribution. Admin only.

    **Requires:** Bearer JWT with admin privileges.
    """
    stats = await ReportRepository(db).get_feedback_stats()
    return FeedbackStatsResponse(**stats)


# ── Reports (admin) ───────────────────────────────────────────────────────────

@router.get("/get-all-reports/", response_model=AdminGetAllReportsResponse,
            summary="List all saved reports across all users (admin)")
async def get_all_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a paginated list of every saved diet report across all users on the platform. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Optional query parameters:** `page` (default 1), `page_size` (default 20, max 100).

    Each item includes the report ID, owning user, report type, and creation timestamp.
    """
    skip = (page - 1) * page_size
    reports, total = await report_service.get_all_saved_reports(db, skip=skip, limit=page_size)
    total_pages = math.ceil(total / page_size) if total else 1
    return AdminGetAllReportsResponse(
        success=True, message="Reports fetched",
        reports=[AdminReportItem(**r) for r in reports],
        total_count=total, page=page, page_size=page_size, total_pages=total_pages,
    )


# ── Translation workbook (i18n Phase 4) ──────────────────────────────────────

@router.get("/translations/workbook", summary="Download translation workbook for a country (admin)")
async def export_translation_workbook(
    country_id: str = Query(..., description="Country UUID"),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Export a 3-sheet Excel workbook pre-filled with existing translations for the given country.

    **Requires:** Bearer JWT with admin privileges.

    **Query parameter:** `country_id` — UUID of the country.

    Sheets: **Feeds** (one row per feed, columns = language codes for this country),
    **Feed Types**, **Feed Categories**. The two vocabulary sheets list every active
    type/category (plus any other value the country's feeds or translations use),
    not only those the country's feeds use. Cells are pre-filled with any translations
    already in the DB. Empty cells = not yet translated. Use the returned file as
    the import template for `POST /v1/admin/translations/workbook`.
    """
    file_bytes, filename = await translation_service.export_translation_workbook(db, country_id)
    return StreamingResponse(
        iter([file_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post(
    "/translations/workbook",
    response_model=WorkbookImportSummary,
    summary="Import translation workbook for a country (admin)",
)
async def import_translation_workbook(
    country_id: str = Query(..., description="Country UUID — overrides any country info in the file"),
    file: UploadFile = File(...),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload a filled-in translation workbook and UPSERT translations for the given country.

    **Requires:** Bearer JWT with admin privileges.

    **Query parameter:** `country_id` — UUID of the country (always from the URL, never from the file).

    **Mandatory form field:** `file` — the `.xlsx` workbook (use the export endpoint to get the template).

    Empty cells are skipped. Returns a summary of inserted/updated/skipped counts and any warnings.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an Excel file (.xlsx or .xls)",
        )
    content = await file.read()
    result = await translation_service.import_translation_workbook(db, country_id, content)
    if result["success"]:
        await db.commit()
    return WorkbookImportSummary(**result)


# ── Single-feed translation CRUD ──────────────────────────────────────────────

@router.post(
    "/translations",
    response_model=FeedTranslationRecord,
    summary="Upsert a single feed translation (admin)",
)
async def upsert_feed_translation(
    body: FeedTranslationUpsertRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create or update a translation for one feed name in one language.

    **Requires:** Bearer JWT with admin privileges.

    **Body:** `feed_id` (UUID), `language` (BCP 47 code), `name` (translated string).
    Invisible characters are removed from `name` and it is stored in Unicode NFC form.

    Returns the persisted translation record with `action` set to `'inserted'` or `'updated'`.

    **404** if the language or the feed doesn't exist. **400** if the name is empty once
    cleaned, or another feed of the same country already uses it in this language.
    """
    language = await LanguageRepository(db).get_by_code(body.language)
    if language is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Language '{body.language}' not found — register it first via POST /v1/admin/languages",
        )
    try:
        result = await translation_service.save_feed_translation(
            db, body.feed_id, language.code, body.name
        )
    except translation_service.FeedNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except translation_service.LocalNameError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await db.commit()
    return FeedTranslationRecord(**result)


@router.get(
    "/translations/coverage",
    response_model=TranslationCoverageResponse,
    summary="Translation coverage summary for a country+language (admin)",
)
async def translation_coverage(
    country_id: str = Query(..., description="Country UUID"),
    lang: str = Query(..., description="BCP 47 language code, e.g. 'hi'"),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return coverage counts (total vs translated vs missing) for feeds, feed types,
    and feed categories for the given country and language.

    **Requires:** Bearer JWT with admin privileges.
    """
    lang = await _stored_language_code(db, lang)
    counts = await translation_service.get_translation_coverage(db, country_id, lang)
    return TranslationCoverageResponse(
        success=True,
        country_id=country_id,
        language=lang,
        **counts,
    )


@router.get(
    "/translations/{feed_id}",
    response_model=FeedTranslationListResponse,
    summary="Get all translations for a feed (admin)",
)
async def get_feed_translations(
    feed_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all language translations stored for a standard feed.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `feed_id` — UUID of the feed.
    """
    translations = await translation_service.get_feed_translations(db, feed_id)
    return FeedTranslationListResponse(
        success=True,
        feed_id=feed_id,
        translations=[FeedTranslationRecord(**t) for t in translations],
    )


@router.delete(
    "/translations/{feed_id}/{language}",
    summary="Delete a single feed translation (admin)",
)
async def delete_feed_translation(
    feed_id: str,
    language: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove the translation for a feed in a specific language.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameters:** `feed_id` (UUID), `language` (BCP 47 code, e.g. `'hi'`).

    Returns `404` if no translation exists for this feed+language pair.
    """
    language = await _stored_language_code(db, language)
    deleted = await translation_service.delete_feed_translation(db, feed_id, language)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No translation found for feed '{feed_id}' in language '{language}'",
        )
    await db.commit()
    return {"success": True, "message": f"Translation for language '{language}' deleted"}


# ── Language management (i18n Phase 5) ───────────────────────────────────────

async def _stored_language_code(db: AsyncSession, raw: str) -> str:
    """The stored languages.code that `raw` names ('BN' -> 'bn', 'ben' -> 'bn',
    an old 'tl' row -> 'tl'); the trimmed input when no language matches, so the
    caller's usual 404 applies."""
    language = await LanguageRepository(db).get_by_code(raw)
    return language.code if language is not None else (raw or "").strip()


@router.post(
    "/languages",
    response_model=LanguageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a new language (admin)",
)
async def create_language(
    body: LanguageCreateRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Register a new language in the system (I4: languages are data, not code).

    **Requires:** Bearer JWT with admin privileges.

    **Body:** `code` (BCP 47, e.g. `'hi'`), `name` (display name, e.g. `'Hindi'`).

    After creation, assign the language to countries via
    `POST /v1/admin/countries/{country_id}/languages/{code}`, then run a translation
    workbook export to start translating feeds. No deploy needed.

    Returns `409` if the code is already registered.
    """
    repo = LanguageRepository(db)
    if await repo.get_by_code(body.code):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Language '{body.code}' is already registered",
        )
    lang = await repo.create(body.code, body.name)
    await db.commit()
    from app.lang import invalidate_lang_cache
    await invalidate_lang_cache()
    return LanguageResponse(code=lang.code, name=lang.name, is_active=lang.is_active,
                            created_at=lang.created_at)


@router.get(
    "/languages",
    response_model=LanguageListResponse,
    summary="List all languages (active and inactive) (admin)",
)
async def list_languages(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all languages registered in the system, both active and inactive.

    **Requires:** Bearer JWT with admin privileges.

    Use `is_active` to distinguish languages available to users from archived ones.
    """
    repo = LanguageRepository(db)
    langs = await repo.get_all()
    return LanguageListResponse(
        success=True,
        languages=[
            LanguageResponse(code=l.code, name=l.name, is_active=l.is_active,
                             created_at=l.created_at)
            for l in langs
        ],
    )


@router.patch(
    "/languages/{code}",
    response_model=LanguageResponse,
    summary="Rename or toggle a language's active status (admin)",
)
async def update_language(
    code: str,
    body: LanguageUpdateRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update the display name and/or `is_active` flag of a language.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `code` — BCP 47 language code (e.g. `'hi'`).

    **Optional body fields:** `name` (new display name), `is_active` (`false` to deactivate).
    Deactivating a language prevents it from being resolved for users; existing translations
    are retained. Reactivate by setting `is_active: true`.

    Returns `404` if the language code does not exist.
    Invalidates the language cache so the change takes effect immediately.
    """
    if body.name is None and body.is_active is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one of 'name' or 'is_active' must be provided",
        )
    repo = LanguageRepository(db)
    lang = await repo.update(code, name=body.name, is_active=body.is_active)
    if lang is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Language '{code}' not found",
        )
    await db.commit()
    from app.lang import invalidate_lang_cache
    await invalidate_lang_cache()
    return LanguageResponse(code=lang.code, name=lang.name, is_active=lang.is_active,
                            created_at=lang.created_at)


# ── Country management ────────────────────────────────────────────────────────

@router.get(
    "/list-all-countries",
    response_model=AdminCountryListAllResponse,
    summary="List all countries regardless of active status (admin)",
)
async def list_all_countries(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return every country — active and inactive — sorted by name.

    **Requires:** Bearer JWT with admin privileges.

    Companion to `PUT /v1/admin/countries/{country_id}/toggle-status`: use this
    list to see current activation state and pick countries to enable/disable.
    Unlike `GET /v1/admin/countries`, inactive countries are included.
    """
    repo = UserRepository(db)
    countries = await repo.get_all_countries_unfiltered()
    return AdminCountryListAllResponse(
        success=True,
        total_count=len(countries),
        countries=[
            AdminCountryListItem(
                id=str(c.id),
                name=c.name or "",
                country_code=c.country_code or "",
                is_active=c.is_active,
            )
            for c in countries
        ],
    )


# ── Country↔language assignment (i18n Phase 5) ───────────────────────────────

@router.get(
    "/countries",
    response_model=CountryLanguageListResponse,
    summary="List all countries with their assigned languages (admin)",
)
async def list_countries_with_languages(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all active countries together with their assigned language codes.

    **Requires:** Bearer JWT with admin privileges.

    Use `POST /v1/admin/countries/{country_id}/languages/{code}` to add a language to a
    country, and `DELETE` to remove one.
    """
    repo = LanguageRepository(db)
    pairs = await repo.get_all_countries_with_languages()
    return CountryLanguageListResponse(
        success=True,
        countries=[
            CountryWithLanguagesResponse(
                id=str(c.id),
                name=c.name or "",
                country_code=c.country_code or "",
                currency=c.currency,
                is_active=c.is_active,
                languages=langs,
            )
            for c, langs in pairs
        ],
    )


@router.put(
    "/countries/{country_id}/toggle-status",
    response_model=AdminCountryToggleResponse,
    summary="Activate or deactivate a country (admin)",
)
async def toggle_country_status(
    country_id: str,
    body: AdminCountryToggleRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Activate or deactivate a country. Admin only.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameter:** `country_id` — UUID of the target country.

    **Mandatory body field:** `action` — `"enable"` to activate, `"disable"` to deactivate.

    A deactivated country is hidden from `GET /v1/auth/countries` (registration and
    profile screens) and from the admin country list. Existing users, feeds, and
    reports referencing the country are unaffected. Returns `404` if the country
    is not found.
    """
    repo = UserRepository(db)
    country = await repo.get_country_by_id(country_id)
    if not country:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Country not found")
    active = body.action == "enable"
    await repo.toggle_country_status(country, active)
    await db.commit()
    return AdminCountryToggleResponse(
        success=True,
        message=f"Country {body.action}d successfully",
        country_id=str(country.id),
        country_name=country.name or "",
        new_status="active" if active else "inactive",
    )


@router.post(
    "/countries/{country_id}/languages/{code}",
    status_code=status.HTTP_201_CREATED,
    summary="Assign a language to a country (admin)",
)
async def assign_language_to_country(
    country_id: str,
    code: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Make a language available to users in a country.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameters:** `country_id` (UUID), `code` (BCP 47, must already exist in `languages`).

    Returns `409` if already assigned. Returns `404` if the language or country is not found
    (FK errors surface as `400` from the DB).
    """
    repo = LanguageRepository(db)
    language = await repo.get_by_code(code)
    if language is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Language '{code}' not found — register it first via POST /v1/admin/languages",
        )
    code = language.code
    inserted = await repo.assign(country_id, code)
    if not inserted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Language '{code}' is already assigned to country '{country_id}'",
        )
    await db.commit()
    return {"success": True, "message": f"Language '{code}' assigned to country '{country_id}'"}


@router.delete(
    "/countries/{country_id}/languages/{code}",
    summary="Remove a language from a country (admin)",
)
async def unassign_language_from_country(
    country_id: str,
    code: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Remove a language assignment from a country.

    **Requires:** Bearer JWT with admin privileges.

    **Path parameters:** `country_id` (UUID), `code` (BCP 47).

    `'en'` cannot be unassigned from any country (it is the universal baseline per I3).
    Returns `400` if `code == 'en'`, `404` if the assignment does not exist.
    """
    code = await _stored_language_code(db, code)
    if code.lower() == "en":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'en' (English) is the universal baseline and cannot be removed from any country",
        )
    repo = LanguageRepository(db)
    deleted = await repo.unassign(country_id, code)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Language '{code}' is not assigned to country '{country_id}'",
        )
    await db.commit()
    return {"success": True, "message": f"Language '{code}' removed from country '{country_id}'"}


# ── CLIMDES feed-library sync (plan v2 §9.5) ─────────────────────────────────

async def _get_sync_config_or_404(repo: FeedSyncRepository):
    config = await repo.get_config()
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Feed-sync configuration not found (run the DB migration)",
        )
    return config


def _sync_config_response(config) -> FeedSyncConfigResponse:
    return FeedSyncConfigResponse(
        success=True,
        endpoint_url=config.endpoint_url,
        auth_type=config.auth_type,
        auth_header_name=config.auth_header_name,
        auth_token_masked=mask_token(config.auth_token),
        sync_day_of_week=int_to_day_name(config.sync_day_of_week),
        scheduler_enabled=config.scheduler_enabled,
        scheduler_toggled_by=(
            str(config.scheduler_toggled_by) if config.scheduler_toggled_by else None
        ),
        scheduler_toggled_at=config.scheduler_toggled_at,
        last_run_at=config.last_run_at,
        last_success_at=config.last_success_at,
    )


def _sync_log_item(log) -> FeedSyncLogItem:
    return FeedSyncLogItem(
        id=str(log.id),
        started_at=log.started_at,
        finished_at=log.finished_at,
        status=log.status,
        trigger_type=log.trigger_type,
        triggered_by=str(log.triggered_by) if log.triggered_by else None,
        http_status=log.http_status,
        total_rows=log.total_rows or 0,
        inserted=log.inserted or 0,
        updated=log.updated or 0,
        skipped=log.skipped or 0,
        translations_inserted=log.translations_inserted or 0,
        translations_updated=log.translations_updated or 0,
        translations_skipped=log.translations_skipped or 0,
    )


@router.get(
    "/feed-sync/config",
    response_model=FeedSyncConfigResponse,
    summary="Read the CLIMDES feed-sync configuration (admin)",
)
async def get_feed_sync_config(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Current sync settings. The stored credential is **never returned in full**
    (`auth_token_masked`, D10). `scheduler_enabled` is read-only here — flip it
    via `PUT /feed-sync/scheduler/toggle`.
    """
    config = await _get_sync_config_or_404(FeedSyncRepository(db))
    return _sync_config_response(config)


@router.put(
    "/feed-sync/config",
    response_model=FeedSyncConfigResponse,
    summary="Update the CLIMDES feed-sync configuration (admin)",
)
async def update_feed_sync_config(
    body: FeedSyncConfigUpdateRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Partial update: only the provided fields change (endpoint URL, auth,
    **sync day of week** as a lowercase day name). Does **not** carry
    `scheduler_enabled` — the toggle endpoint owns it (D19).
    """
    repo = FeedSyncRepository(db)
    config = await _get_sync_config_or_404(repo)

    data = body.model_dump(exclude_unset=True, exclude_none=True)
    if "sync_day_of_week" in data:
        data["sync_day_of_week"] = day_name_to_int(data["sync_day_of_week"])
    await repo.update_config(config, data)
    await db.commit()
    return _sync_config_response(config)


@router.put(
    "/feed-sync/scheduler/toggle",
    response_model=SchedulerToggleResponse,
    summary="Enable/disable the automatic feed-sync scheduler (admin)",
)
async def toggle_feed_sync_scheduler(
    body: SchedulerToggleRequest,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    The UI toggle button (UC-8). Gates **scheduled runs only** — manual
    "Sync now" works regardless (D19). Takes effect at the next daily tick;
    a run already in progress is not cancelled. Enabling requires a
    configured endpoint URL (`400` otherwise); disabling is always allowed.
    """
    repo = FeedSyncRepository(db)
    config = await _get_sync_config_or_404(repo)

    enable = body.action == "enable"
    if enable and not (config.endpoint_url or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot enable the automatic scheduler: CLIMDES endpoint is not configured",
        )

    await repo.set_scheduler_enabled(config, enable, admin_user.id)
    await db.commit()
    return SchedulerToggleResponse(
        success=True,
        message=f"Automatic scheduler {body.action}d successfully",
        scheduler_enabled=enable,
        new_status="enabled" if enable else "disabled",
    )


@router.get(
    "/feed-sync/scheduler/status",
    response_model=SchedulerStatusResponse,
    summary="Automatic-scheduler status for the UI toggle (admin)",
)
async def get_feed_sync_scheduler_status(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Lightweight status for rendering the toggle + day picker:
    `next_scheduled_run` is the date of the next 00:00 tick on the chosen day
    (`null` while the scheduler is disabled); `running` reports an in-progress run.
    """
    repo = FeedSyncRepository(db)
    config = await _get_sync_config_or_404(repo)
    running = await repo.get_running_log() is not None

    next_run = None
    if config.scheduler_enabled:
        next_run = feed_sync_service.next_scheduled_run(
            config.sync_day_of_week, datetime.now(timezone.utc).date()
        )
    return SchedulerStatusResponse(
        success=True,
        scheduler_enabled=config.scheduler_enabled,
        sync_day_of_week=int_to_day_name(config.sync_day_of_week),
        next_scheduled_run=next_run,
        last_run_at=config.last_run_at,
        last_success_at=config.last_success_at,
        running=running,
    )


@router.post(
    "/feed-sync/run",
    response_model=FeedSyncRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a manual feed sync now (admin, non-blocking)",
)
async def run_feed_sync(
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    "Sync now" (UC-3): creates a `running` log row, dispatches the worker task
    with `force=true` (bypasses the due-gate — works even when the scheduler
    toggle is off, D9/D19), and returns `202` immediately with the `log_id`
    to poll via `GET /feed-sync/logs/{log_id}`.

    Errors: `400` endpoint not configured · `409` a run is already in progress.
    """
    repo = FeedSyncRepository(db)
    config = await _get_sync_config_or_404(repo)

    if not (config.endpoint_url or "").strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CLIMDES endpoint is not configured",
        )
    if await repo.get_running_log() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A sync run is already in progress",
        )

    log = await repo.create_log("manual", triggered_by=admin_user.id)
    await db.commit()  # make the 'running' row visible before dispatch

    try:
        celery_app.send_task(
            "sync_feed_library",
            kwargs={
                "force": True,
                "log_id": str(log.id),
                "triggered_by": str(admin_user.id),
            },
        )
    except Exception as exc:
        logger.error("Failed to dispatch sync_feed_library: %s", exc)
        await repo.finalize_log(
            log, "failed",
            error_message="Failed to dispatch the sync task (Celery/Redis unavailable)",
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Failed to dispatch the sync task — worker/broker unavailable",
        )

    return FeedSyncRunResponse(
        success=True,
        message="Feed sync dispatched — poll the log for progress",
        log_id=str(log.id),
    )


@router.post(
    "/feed-sync/run-from-file",
    response_model=FeedSyncLogDetailResponse,
    summary="Import a Feed Library Excel file directly (admin fallback when CLIMDES is unreachable)",
)
async def run_feed_sync_from_file(
    file: UploadFile = File(...),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Bulk-upload/CLIMDES-fallback path (docs/dev_docs/bulk_upload_changes/
    IMPLEMENTATION_PLAN.md): runs the uploaded workbook through the exact
    same validate -> upsert -> translate -> log pipeline as a CLIMDES sync
    (D2), logged in the same feed_sync_log table with
    trigger_type='file_upload' (D3) — for use when the CLIMDES server is
    unreachable. Synchronous, not `202`/poll (D7): there is no external HTTP
    fetch to decouple from, so the finished result is returned directly,
    same shape as `GET /feed-sync/logs/{log_id}`.

    Errors: `400` bad file extension · `409` a sync run is already in progress.
    """
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an Excel file (.xlsx or .xls)",
        )
    content = await file.read()

    result = await feed_sync_service.run_file_upload_import(
        db, content, triggered_by=admin_user.id
    )

    if not result.get("ran"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=result.get("reason", "A sync run is already in progress"),
        )

    log = await FeedSyncRepository(db).get_log(result["log_id"])
    return FeedSyncLogDetailResponse(
        success=True,
        **_sync_log_item(log).model_dump(),
        error_message=log.error_message,
        failed_rows=log.failed_rows,
        skipped_translations=log.skipped_translations,
    )


@router.get(
    "/feed-sync/logs",
    response_model=FeedSyncLogListResponse,
    summary="Paginated feed-sync run history (admin)",
)
async def list_feed_sync_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """Run history, newest first (UC-5). Row-level detail lives on the single-log endpoint."""
    logs, total = await FeedSyncRepository(db).list_logs(page=page, page_size=page_size)
    return FeedSyncLogListResponse(
        success=True,
        total_count=total,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total / page_size) if total else 0,
        logs=[_sync_log_item(log) for log in logs],
    )


@router.get(
    "/feed-sync/logs/{log_id}",
    response_model=FeedSyncLogDetailResponse,
    summary="Single feed-sync run with row-level detail (admin)",
)
async def get_feed_sync_log(
    log_id: str,
    admin_user: UserInformationModel = Depends(require_admin_user),
    db: AsyncSession = Depends(get_db),
):
    """One run incl. `failed_rows` and `skipped_translations` (each `{fd_code, language, reason}`, UC-5/UC-6)."""
    log = await FeedSyncRepository(db).get_log(log_id)
    if log is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sync log '{log_id}' not found",
        )
    return FeedSyncLogDetailResponse(
        success=True,
        **_sync_log_item(log).model_dump(),
        error_message=log.error_message,
        failed_rows=log.failed_rows,
        skipped_translations=log.skipped_translations,
    )
