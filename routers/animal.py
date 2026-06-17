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

@router.get("/unique-feed-type/{country_id}", summary="List distinct feed types available for a country")
async def unique_feed_types(
    country_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the distinct feed types (e.g. Roughage, Concentrate) that have feeds available for the given country,
    including the authenticated user's own custom feeds.

    **Requires:** Bearer JWT.

    **Path parameter:** `country_id` — UUID of the country (from `GET /v1/auth/countries`).
    """
    types = await diet_service.get_unique_feed_types(db, country_id, str(current_user.id))
    return {"feed_types": types}


@router.get("/unique-feed-category", summary="List distinct feed categories available for a country")
async def unique_feed_categories(
    country_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the distinct feed categories available for the given country (standard + user's custom feeds).

    **Requires:** Bearer JWT.

    **Mandatory query parameter:** `country_id` — UUID of the target country.
    """
    categories = await diet_service.get_unique_feed_categories(db, country_id, str(current_user.id))
    return {"feed_categories": categories}


@router.get("/search-feeds", summary="Typeahead search across feeds by name")
async def search_feeds(
    query: str,
    country_id: str,
    limit: int = 20,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Search feeds by name (case-insensitive substring) for the given country.
    Returns standard feeds available in the country plus the authenticated user's custom feeds.

    **Requires:** Bearer JWT.

    **Mandatory query parameters:** `query` (min 2 chars), `country_id` (UUID).

    **Optional:** `limit` (default 20, max 100).

    Results are ranked: custom feeds first, then prefix matches before mid-string matches, then alphabetical.
    Queries shorter than 2 characters return `{feeds: [], total_count: 0}` with no DB hit.
    """
    clamped_limit = min(max(limit, 1), 100)
    feeds, total_count = await diet_service.search_feeds(
        db, query, country_id, str(current_user.id), clamped_limit
    )
    return {"feeds": feeds, "total_count": total_count}


@router.get("/feed-name", summary="List feed names filtered by country, type, and category")
async def feed_names(
    country_id: str,
    feed_type: str = None,
    category: str = None,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return standard and custom feed names available to the authenticated user for a given country.

    **Requires:** Bearer JWT.

    **Mandatory query parameter:** `country_id` — UUID of the target country.

    **Optional query parameters:**
    - `feed_type` — filter by feed type name (e.g. `Roughage`).
    - `category` — filter by feed category name (e.g. `Legume hay`).

    Response contains two lists: `standard_feeds` (global) and `custom_feeds` (user-created).
    """
    std_feeds, cust_feeds = await diet_service.get_feed_names(
        db, country_id, str(current_user.id), feed_type, category
    )
    return {"standard_feeds": std_feeds, "custom_feeds": cust_feeds}


@router.get("/feed-details/{feed_id}", summary="Get full nutritional details for a feed")
async def feed_details(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the complete nutritional composition of a feed item (DM, CP, NDF, ADF, EE, Ash, Ca, P, ME, etc.).

    **Requires:** Bearer JWT.

    **Path parameter:** `feed_id` — UUID of the feed (standard or user's own custom feed).

    Returns `404` if the feed does not exist or does not belong to the user.
    """
    data = await diet_service.get_feed_details(db, feed_id, str(current_user.id))
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")
    return data


@router.get("/feeds", summary="List all feeds (optionally filtered by country)")
async def list_feeds(
    country_id: str = None,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return a summary list of all standard feeds, with optional country filter.

    **Requires:** Bearer JWT.

    **Optional query parameter:** `country_id` — UUID to scope feeds to a specific country.

    Response fields per item: `id`, `fd_name`, `fd_type`, `fd_category`.
    For full nutritional data, call `GET /v1/animal/feed-details/{feed_id}`.
    """
    feeds, total = await FeedRepository(db).get_all(country_id=country_id)
    return {
        "feeds": [
            {"id": str(f.id), "fd_name": f.fd_name, "fd_type": f.fd_type, "fd_category": f.fd_category}
            for f in feeds
        ],
        "total": total,
    }


@router.get("/feeds/{feed_id}", summary="Get a feed by ID")
async def get_feed(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the basic summary (id, name, type, category) for a single standard feed.

    **Requires:** Bearer JWT.

    **Path parameter:** `feed_id` — UUID of the feed.

    Returns `404` if the feed does not exist.
    """
    feed = await FeedRepository(db).get_by_id(feed_id)
    if not feed:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Feed not found")
    return {"id": str(feed.id), "fd_name": feed.fd_name, "fd_type": feed.fd_type, "fd_category": feed.fd_category}


# ── Diet recommendation & evaluation ─────────────────────────────────────────

@router.post("/diet-recommendation", summary="Run NSGA-III optimization for a least-cost cattle diet")
@limiter.limit("30/minute")
async def diet_recommendation(
    request: Request,
    request_body: DietRecommendationRequest,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Run the multi-objective NSGA-III genetic algorithm to compute the least-cost, nutritionally adequate diet for a dairy cattle herd.

    **Requires:** Bearer JWT.

    **Rate limit:** 30 requests / minute per IP.

    **Mandatory body fields:**
    - `cattle_info` — animal details (breed, body weight, milk yield, lactation stage, parity).
    - `feeds` — list of candidate feeds with local price per kg and optional inclusion constraints.
    - `country_id` — UUID of the country (determines unit and feed availability).

    **Optional body fields:** `thresholds` — override default nutrient requirement thresholds.

    Returns ranked Pareto-front diet solutions with cost, nutrient balance, and feed breakdown.
    Returns `400` for invalid inputs (e.g. no feasible feed combination).
    """
    pool = request.app.state.optimization_pool
    try:
        result = await diet_service.run_diet_recommendation(
            db, pool, request_body, str(current_user.id)
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    return result


@router.post("/evaluate-diet", summary="Evaluate nutritional adequacy of a manually specified diet")
async def evaluate_diet(
    body: DietEvaluationRequest,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Assess a user-defined feed ration against dairy cattle nutrient requirements and return a detailed gap analysis.

    **Requires:** Bearer JWT.

    **Mandatory body fields:**
    - `cattle_info` — animal details (breed, body weight, milk yield, lactation stage, parity).
    - `selected_feeds` — list of feeds with their inclusion amounts (kg/day as-fed).
    - `country_id` — UUID of the country.

    Response includes: intake evaluation, milk production analysis, cost analysis, methane estimate, and per-nutrient balance (surplus/deficit).
    Returns `400` for invalid or missing feed data.
    """
    try:
        result = await diet_service.run_diet_evaluation(db, body, str(current_user.id))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    await db.commit()
    return result


# ── Feed analytics ────────────────────────────────────────────────────────────

@router.post("/feed-analytics", response_model=FeedAnalyticsResponse,
             summary="Record feed usage analytics")
async def save_feed_analytics(
    body: FeedAnalyticsCreate,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Save a feed analytics event (e.g. which feeds the user interacted with during a session).

    **Requires:** Bearer JWT.

    **Mandatory body fields:** `feed_id` (UUID), `event_type` (string describing the action).

    Used for usage tracking and improving feed recommendations.
    """
    record = await diet_service.save_feed_analytics(db, body.dict())
    await db.commit()
    await db.refresh(record)
    return FeedAnalyticsResponse.from_orm(record)


# ── Custom feed CRUD ──────────────────────────────────────────────────────────

@router.post("/custom-feeds/check", summary="Check whether a custom feed exists (insert or update)")
async def check_insert_or_update(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Determine whether a given feed ID represents a new custom feed (insert) or an existing one (update) for the authenticated user.

    **Requires:** Bearer JWT.

    **Mandatory query parameter:** `feed_id` — UUID to check.

    Returns `{ "action": "insert" | "update", "feed_id": "<uuid>" }`.
    Call this before `POST /v1/animal/custom-feeds` or `PUT /v1/animal/custom-feeds`.
    """
    action, feed = await diet_service.check_insert_or_update(db, feed_id, str(current_user.id))
    return {"action": action, "feed_id": feed_id}


@router.post("/custom-feeds", summary="Create a new user-defined custom feed")
async def insert_custom_feed(
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a custom feed item owned by the authenticated user. Custom feeds are only visible to the user who created them.

    **Requires:** Bearer JWT.

    **Mandatory body fields:** `fd_name` (string), `fd_type` (string), `fd_category` (string), `fd_country_name` (string), and at least the core nutritional values (`fd_dm`, `fd_cp`, `fd_ndf`, `fd_adf`).

    Returns the new feed's `feed_id` and `fd_name` on success.
    """
    body["user_id"] = str(current_user.id)
    feed = await diet_service.insert_custom_feed(db, body)
    await db.commit()
    return {"success": True, "feed_id": str(feed.id), "fd_name": feed.fd_name}


@router.put("/custom-feeds", summary="Update an existing custom feed")
async def update_custom_feed(
    feed_id: str,
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update the nutritional data or metadata of a custom feed owned by the authenticated user.

    **Requires:** Bearer JWT.

    **Mandatory query parameter:** `feed_id` — UUID of the custom feed to update.

    **Body:** Any subset of the feed fields to update (partial update supported).

    Returns `404` if the feed does not exist or belongs to another user.
    """
    success, feed = await diet_service.update_custom_feed(db, feed_id, str(current_user.id), body)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Custom feed not found")
    await db.commit()
    return {"success": True, "feed_id": str(feed.id), "fd_name": feed.fd_name}


# ── Feeds (non-admin writes) ──────────────────────────────────────────────────

@router.post("/feeds", summary="Create a standard feed entry")
async def create_feed(
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new standard (global) feed record. Unlike custom feeds, standard feeds are visible to all users.

    **Requires:** Bearer JWT.

    **Mandatory body fields:** `fd_name`, `fd_type`, `fd_category`, `fd_country_name`, `fd_country_cd`, and nutritional values (`fd_dm`, `fd_cp`, `fd_ndf`, `fd_adf`, `fd_ee`, `fd_ash`, `fd_ca`, `fd_p`).

    Returns `400` if required fields are missing or a duplicate is detected.
    """
    from services.feed_service import create_feed as _create
    success, message, feed = await _create(db, body)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return {"success": True, "message": message, "feed_id": str(feed.id)}


@router.put("/feeds/{feed_id}", summary="Update a standard feed by ID")
async def update_feed(
    feed_id: str,
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update the fields of an existing standard feed.

    **Requires:** Bearer JWT.

    **Path parameter:** `feed_id` — UUID of the feed to update.

    **Body:** Any subset of feed fields to update. Returns `400` if the update fails or `404` if not found.
    """
    from services.feed_service import update_feed as _update
    success, message, feed = await _update(db, feed_id, body)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.delete("/feeds/{feed_id}", summary="Delete a standard feed by ID")
async def delete_feed(
    feed_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a standard feed record.

    **Requires:** Bearer JWT.

    **Path parameter:** `feed_id` — UUID of the feed to delete.

    Returns `404` if the feed does not exist.
    """
    from services.feed_service import delete_feed as _delete
    success, message = await _delete(db, feed_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return {"success": True, "message": message}


# ── Reports & simulations ─────────────────────────────────────────────────────

@router.post("/save-report", response_model=SaveReportResponse,
             summary="Persist a simulation result as a saved report")
async def save_report(
    body: SaveReportRequest,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Mark an existing simulation (from `POST /v1/animal/diet-recommendation`) as saved and store it permanently for the user.

    **Requires:** Bearer JWT.

    **Mandatory body field:** `report_id` — the UUID of the simulation result to save.

    Returns the cloud storage URL (`bucket_url`) of the saved report, or `404` if the simulation is not found.
    """
    success, message, bucket_url = await report_service.save_simulation(
        db, body.report_id, str(current_user.id)
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return SaveReportResponse(success=True, message=message, bucket_url=bucket_url)


@router.get("/user-reports", response_model=GetUserReportsResponse,
            summary="List all saved reports for the authenticated user")
async def get_user_reports(
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all diet simulation reports that the authenticated user has explicitly saved.

    **Requires:** Bearer JWT.

    Only reports marked as saved (via `POST /v1/animal/save-report`) are returned.
    For all simulation history, use `GET /v1/animal/simulations`.
    """
    success, message, reports = await report_service.get_user_reports(db, str(current_user.id))
    return GetUserReportsResponse(success=success, message=message, reports=reports)


@router.get("/simulations", response_model=FetchAllSimulationsResponse,
            summary="List all simulation runs for the authenticated user")
async def fetch_all_simulations(
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the full simulation history for the authenticated user, including both saved and unsaved runs.

    **Requires:** Bearer JWT.

    Each item includes a `report_id` that can be passed to `GET /v1/animal/simulations/{report_id}` for full details.
    """
    success, message, simulations = await report_service.fetch_all_simulations(db, str(current_user.id))
    return FetchAllSimulationsResponse(success=success, simulations=simulations)


@router.get("/simulations/{report_id}", response_model=FetchSimulationDetailsResponse,
            summary="Get full details of a specific simulation")
async def fetch_simulation_details(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Fetch the complete result data for a single simulation run, including diet solutions, nutrient breakdown, and cost analysis.

    **Requires:** Bearer JWT.

    **Path parameter:** `report_id` — UUID of the simulation (from `GET /v1/animal/simulations`).

    Returns `404` if the simulation does not exist or belongs to another user.
    """
    success, message, details = await report_service.fetch_simulation_details(
        db, report_id, str(current_user.id)
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return FetchSimulationDetailsResponse(success=True, **details)


# ── PDF reports (diet_reports table) ─────────────────────────────────────────

@router.post("/reports/pdf", summary="Generate a PDF report (not yet implemented)")
async def generate_pdf_report(
    body: dict,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate and store a PDF version of a saved diet report.

    **Requires:** Bearer JWT.

    **Status:** Not yet implemented — returns `501`. Scheduled for a future release.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="PDF generation is implemented in Task 2.8",
    )


@router.get("/reports", summary="List saved reports for the authenticated user")
async def list_pdf_reports(
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return all saved reports for the authenticated user (same dataset as `GET /v1/animal/user-reports`).

    **Requires:** Bearer JWT.

    Use `GET /v1/animal/reports/{report_id}` to retrieve the full content of a specific report.
    """
    success, message, reports = await report_service.get_user_reports(db, str(current_user.id))
    return {"success": success, "message": message, "reports": reports}


@router.get("/reports/{report_id}", summary="Get a specific report by ID")
async def get_pdf_report(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve the full content of a saved report by its ID.

    **Requires:** Bearer JWT.

    **Path parameter:** `report_id` — UUID of the report.

    Returns `404` if the report does not exist or belongs to another user.
    """
    success, message, details = await report_service.fetch_simulation_details(
        db, report_id, str(current_user.id)
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    return {"success": True, **details}


@router.delete("/reports/{report_id}", summary="Delete a report by ID")
async def delete_report(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a saved report owned by the authenticated user.

    **Requires:** Bearer JWT.

    **Path parameter:** `report_id` — UUID of the report to delete.

    Returns `404` if the report does not exist or belongs to another user.
    """
    success, message = await report_service.delete_report(db, report_id, str(current_user.id))
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message)
    await db.commit()
    return {"success": True, "message": message}


@router.get("/reports/{report_id}/metadata", summary="Get metadata for a specific report")
async def get_report_metadata(
    report_id: str,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return lightweight metadata for a report without fetching the full payload: report type, simulation ID, save status, bucket URL, and creation timestamp.

    **Requires:** Bearer JWT.

    **Path parameter:** `report_id` — UUID of the report.

    Returns `404` if the report does not exist or belongs to another user.
    """
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
