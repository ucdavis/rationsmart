import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.limiter import limiter

from app.dependencies import get_current_user, get_db
from app.db.models import FeedAnalytics, UserInformationModel
from app.schemas.animal import (
    DietEvaluationRequest,
    DietRecommendationRequest,
    FeedAnalyticsCreate,
    FeedAnalyticsResponse,
)
from app.schemas.report import (
    FetchAllSimulationsResponse,
    FetchSimulationDetailsResponse,
    GetUserReportsResponse,
    SaveReportRequest,
    SaveReportResponse,
)
from repositories.feed_repository import FeedRepository
from repositories.report_repository import ReportRepository
from services import diet_service, report_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Animal & Diet"])


# ── Feed lookup helpers ───────────────────────────────────────────────────────

@router.get("/unique-feed-type/{country_id}")
async def unique_feed_types(
    country_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    types = await diet_service.get_unique_feed_types(db, country_id, str(current_user.id))
    return {"feed_types": types}


@router.get("/unique-feed-category")
async def unique_feed_categories(
    country_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    categories = await diet_service.get_unique_feed_categories(db, country_id, str(current_user.id))
    return {"feed_categories": categories}


@router.get("/feed-name")
async def feed_names(
    country_id: str,
    feed_type: str = None,
    category: str = None,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    std_feeds, cust_feeds = await diet_service.get_feed_names(
        db, country_id, str(current_user.id), feed_type, category
    )
    return {"standard_feeds": std_feeds, "custom_feeds": cust_feeds}


@router.get("/feed-details/{feed_id}")
async def feed_details(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    data = await diet_service.get_feed_details(db, feed_id, str(current_user.id))
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")
    return data


@router.get("/feeds")
async def list_feeds(
    country_id: str = None,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    feeds, total = await FeedRepository(db).get_all(country_id=country_id)
    return {
        "feeds": [
            {"id": str(f.id), "fd_name": f.fd_name, "fd_type": f.fd_type, "fd_category": f.fd_category}
            for f in feeds
        ],
        "total": total,
    }


@router.get("/feeds/{feed_id}")
async def get_feed(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    feed = await FeedRepository(db).get_by_id(feed_id)
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")
    return {"id": str(feed.id), "fd_name": feed.fd_name, "fd_type": feed.fd_type, "fd_category": feed.fd_category}


# ── Diet recommendation & evaluation ─────────────────────────────────────────

@router.post("/diet-recommendation")
@limiter.limit("30/minute")
async def diet_recommendation(
    request: Request,
    request_body: DietRecommendationRequest,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pool = request.app.state.optimization_pool
    try:
        result = await diet_service.run_diet_recommendation(
            db, pool, request_body, str(current_user.id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return result


@router.post("/evaluate-diet")
async def evaluate_diet(
    body: DietEvaluationRequest,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        result = await diet_service.run_diet_evaluation(db, body, str(current_user.id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await db.commit()
    return result


# ── Feed analytics ────────────────────────────────────────────────────────────

@router.post("/feed-analytics", response_model=FeedAnalyticsResponse)
async def save_feed_analytics(
    body: FeedAnalyticsCreate,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await diet_service.save_feed_analytics(db, body.dict())
    await db.commit()
    await db.refresh(record)
    return FeedAnalyticsResponse.from_orm(record)


# ── Custom feed CRUD ──────────────────────────────────────────────────────────

@router.post("/custom-feeds/check")
async def check_insert_or_update(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    action, feed = await diet_service.check_insert_or_update(db, feed_id, str(current_user.id))
    return {"action": action, "feed_id": feed_id}


@router.post("/custom-feeds")
async def insert_custom_feed(
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    body["user_id"] = str(current_user.id)
    feed = await diet_service.insert_custom_feed(db, body)
    await db.commit()
    return {"success": True, "feed_id": str(feed.id), "fd_name": feed.fd_name}


@router.put("/custom-feeds")
async def update_custom_feed(
    feed_id: str,
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, feed = await diet_service.update_custom_feed(db, feed_id, str(current_user.id), body)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom feed not found")
    await db.commit()
    return {"success": True, "feed_id": str(feed.id), "fd_name": feed.fd_name}


# ── Feeds (non-admin writes) ──────────────────────────────────────────────────

@router.post("/feeds")
async def create_feed(
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from services.feed_service import create_feed as _create
    success, message, feed = await _create(db, body)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return {"success": True, "message": message, "feed_id": str(feed.id)}


@router.put("/feeds/{feed_id}")
async def update_feed(
    feed_id: str,
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from services.feed_service import update_feed as _update
    success, message, feed = await _update(db, feed_id, body)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.delete("/feeds/{feed_id}")
async def delete_feed(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from services.feed_service import delete_feed as _delete
    success, message = await _delete(db, feed_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return {"success": True, "message": message}


# ── Reports & simulations ─────────────────────────────────────────────────────

@router.post("/save-report", response_model=SaveReportResponse)
async def save_report(
    body: SaveReportRequest,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, bucket_url = await report_service.save_simulation(
        db, body.report_id, str(current_user.id)
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return SaveReportResponse(success=True, message=message, bucket_url=bucket_url)


@router.get("/user-reports", response_model=GetUserReportsResponse)
async def get_user_reports(
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, reports = await report_service.get_user_reports(db, str(current_user.id))
    return GetUserReportsResponse(success=success, message=message, reports=reports)


@router.get("/simulations", response_model=FetchAllSimulationsResponse)
async def fetch_all_simulations(
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, simulations = await report_service.fetch_all_simulations(db, str(current_user.id))
    return FetchAllSimulationsResponse(success=success, simulations=simulations)


@router.get("/simulations/{report_id}", response_model=FetchSimulationDetailsResponse)
async def fetch_simulation_details(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, details = await report_service.fetch_simulation_details(
        db, report_id, str(current_user.id)
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return FetchSimulationDetailsResponse(success=True, **details)


# ── PDF reports (diet_reports table) ─────────────────────────────────────────

@router.post("/reports/pdf")
async def generate_pdf_report(
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate and store a PDF report. PDF generation (Task 2.8/4.5) pending."""
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="PDF generation is implemented in Task 2.8",
    )


@router.get("/reports")
async def list_pdf_reports(
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, reports = await report_service.get_user_reports(db, str(current_user.id))
    return {"success": success, "message": message, "reports": reports}


@router.get("/reports/{report_id}")
async def get_pdf_report(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, message, details = await report_service.fetch_simulation_details(
        db, report_id, str(current_user.id)
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return {"success": True, **details}


@router.delete("/reports/{report_id}")
async def delete_report(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success, message = await report_service.delete_report(db, report_id, str(current_user.id))
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.get("/reports/{report_id}/metadata")
async def get_report_metadata(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    report = await ReportRepository(db).get_by_report_id(report_id, str(current_user.id))
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    return {
        "report_id": report.report_id,
        "report_type": report.report_type,
        "simulation_id": report.simulation_id,
        "save_report": report.save_report,
        "bucket_url": report.bucket_url,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }
