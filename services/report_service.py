"""
Report / simulation service for RationSmart v4.0.

Covers: simulation list/detail retrieval, save-simulation, delete,
and PDF/S3 background-report orchestration (moved from core in Task 2.8).
"""
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Report
from repositories.feed_repository import FeedRepository
from repositories.report_repository import ReportRepository
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


# ── Simulation retrieval ──────────────────────────────────────────────────────

async def fetch_all_simulations(
    db: AsyncSession, user_id: str
) -> Tuple[bool, str, List[Dict[str, Any]]]:
    """
    Return all saved simulations for a user, most recent first.
    Each item contains user_id, simulation_id, report_id, created_at, country_name.
    """
    repo = ReportRepository(db)
    rows = await repo.get_simulation_list(user_id)

    simulations = []
    for row in rows:
        report, country_name = row
        simulations.append(
            {
                "user_id": str(report.user_id),
                "simulation_id": report.simulation_id or "",
                "report_id": report.report_id,
                "created_at": report.created_at.isoformat() if report.created_at else "",
                "country_name": country_name or "",
            }
        )
    return True, "Simulations fetched successfully", simulations


async def fetch_simulation_details(
    db: AsyncSession, report_id: str, user_id: str
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Return the cattle_info, feed_selection, and metadata for a saved simulation.
    """
    report_repo = ReportRepository(db)
    feed_repo = FeedRepository(db)
    user_repo = UserRepository(db)

    report = await report_repo.get_by_report_id(report_id, user_id)
    if not report:
        return False, "Report not found", None

    country_name = ""
    if report.country_id:
        country = await user_repo.get_country_by_id(str(report.country_id))
        country_name = country.name if country else ""

    feed_selection_raw: List[Dict] = report.feed_selection or []
    feed_ids = [f.get("feed_id") for f in feed_selection_raw if f.get("feed_id")]

    std_feeds = {str(f.id): f for f in await feed_repo.get_by_ids(feed_ids)}
    cust_feeds = {str(f.id): f for f in await feed_repo.get_custom_by_ids(feed_ids)}

    enriched_feeds = []
    for item in feed_selection_raw:
        fid = item.get("feed_id", "")
        feed = std_feeds.get(fid) or cust_feeds.get(fid)
        enriched_feeds.append(
            {
                "feed_id": fid,
                "feed_name": feed.fd_name if feed else "Unknown",
                "feed_category": feed.fd_category if feed else "",
                "feed_type": feed.fd_type if feed else "",
                "price_per_kg": item.get("price_per_kg", 0.0),
                "quantity_as_fed": item.get("quantity_as_fed"),
            }
        )

    # Reports store animal_inputs with the ENGINE key `An_StatePhys`, but the
    # simulations endpoint validates cattle_info against CattleInfo, whose field is
    # `physiological_state` (required since the animal-category feature). Map it back
    # so the model validates instead of raising "Field required" -> 500.
    cattle_info: Dict[str, Any] = dict(report.animal_inputs or {})
    if not cattle_info.get("physiological_state") and cattle_info.get("An_StatePhys"):
        cattle_info["physiological_state"] = cattle_info["An_StatePhys"]

    return True, "Simulation details fetched", {
        "cattle_info": cattle_info,
        "feed_selection": enriched_feeds,
        "user_id": str(report.user_id),
        "country_name": country_name,
        "simulation_id": report.simulation_id or "",
        "report_id": report.report_id,
        "custom_constraints": report.custom_constraints,
    }


# ── Save simulation ───────────────────────────────────────────────────────────

async def save_simulation(
    db: AsyncSession, report_id: str, user_id: str
) -> Tuple[bool, str, Optional[str]]:
    """
    Mark a report as saved by the user. Returns (success, message, bucket_url).
    Caller must commit.
    """
    repo = ReportRepository(db)
    report = await repo.get_by_report_id(report_id, user_id)
    if not report:
        return False, "Report not found or does not belong to this user.", None

    await repo.mark_saved(report)
    logger.info("Report saved: %s (user=%s)", report_id, user_id)
    return True, "Report saved successfully", report.bucket_url


# ── Admin: all saved reports ──────────────────────────────────────────────────

async def get_all_saved_reports(
    db: AsyncSession, skip: int = 0, limit: int = 20
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Admin view: paginated list of all saved reports with user name/email.
    Returns (reports, total_count).
    """
    repo = ReportRepository(db)
    rows, total = await repo.get_all_saved(skip=skip, limit=limit)

    reports = []
    for row in rows:
        report, user_name, user_email = row
        reports.append(
            {
                "report_id": str(report.id),
                "report_name": report.report_id,
                "simulation_id": report.simulation_id,
                "user_id": str(report.user_id),
                "user_name": user_name,
                "report_type": "Recommendation" if report.report_type == "rec" else "Evaluation",
                "bucket_url": report.bucket_url,
                "created_at": report.created_at.strftime("%Y-%m-%d %H:%M:%S") if report.created_at else "",
            }
        )
    return reports, total


# ── Delete ────────────────────────────────────────────────────────────────────

async def delete_report(
    db: AsyncSession, report_id: str, user_id: str
) -> Tuple[bool, str]:
    """
    Delete a report record. Caller must commit.
    Does NOT delete the S3 object (that's handled by storage_service in Task 2.8).
    """
    repo = ReportRepository(db)
    report = await repo.get_by_report_id(report_id, user_id)
    if not report:
        return False, "Report not found or does not belong to this user."
    await repo.delete(report)
    logger.info("Report deleted: %s (user=%s)", report_id, user_id)
    return True, "Report deleted successfully"


# ── User report list (saved to S3) ────────────────────────────────────────────

async def get_user_reports(
    db: AsyncSession, user_id: str
) -> Tuple[bool, str, List[Dict[str, Any]]]:
    """
    Return saved reports for a user that have a bucket_url (uploaded to S3).
    """
    repo = ReportRepository(db)
    user_repo = UserRepository(db)

    user = await user_repo.get_by_id(user_id)
    user_name = user.name if user else "Unknown"

    reports = await repo.get_saved_by_user(user_id)
    items = []
    for r in reports:
        if not r.bucket_url:
            continue
        items.append(
            {
                "bucket_url": r.bucket_url,
                "user_name": user_name,
                "report_id": r.report_id,
                "report_type": (
                    "Diet Recommendation" if r.report_type == "rec" else "Diet Evaluation"
                ),
                "report_created_date": r.created_at.strftime("%Y-%m-%d") if r.created_at else "",
                "simulation_id": r.simulation_id or "",
            }
        )
    return True, "Reports fetched successfully", items


# ── Celery async PDF task (Task 4.5) ─────────────────────────────────────────

def trigger_pdf_generation(
    optimization_result_dict: dict,
    animal_info: dict,
    report_id: str,
    user_id: str,
) -> None:
    """
    Dispatch PDF generation to a Celery worker. The payload is already JSON-safe
    (no DataFrames) — callers must call ensure_json_safe() before passing here.
    Silently skips when Celery is unavailable (e.g. in unit tests).
    """
    try:
        from app.celery_app import celery_app
        celery_app.send_task(
            "generate_pdf_report",
            kwargs={
                "report_payload": optimization_result_dict,
                "animal_info": animal_info,
                "report_id": report_id,
                "user_id": user_id,
            },
        )
        logger.info("PDF task queued for report %s", report_id)
    except Exception as exc:
        logger.warning("Celery unavailable, PDF will not be generated: %s", exc)


# ── Background PDF/S3 orchestration (moved from core in Task 2.8) ─────────────

def generate_background_reports(
    db: AsyncSession,
    optimization_results: Dict[str, Any],
    user_id: str,
    simulation_id: str,
    report_id: str,
    cattle_info: Any,
    user_name: str = "User",
    country_name: str = "Unknown",
    currency: str = "$",
    api_response_data: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Orchestrate recommendation PDF generation and S3 upload in a background task.
    Intentionally sync: runs in a FastAPI BackgroundTask (not on the async event loop).
    """
    try:
        from core.z_optimization.reporting import generate_background_reports as _core_gen
        _core_gen(
            optimization_results=optimization_results,
            user_id=user_id,
            simulation_id=simulation_id,
            report_id=report_id,
            cattle_info=cattle_info,
            user_name=user_name,
            country_name=country_name,
            currency=currency,
            db_session=db,
            api_response_data=api_response_data,
        )
    except Exception as exc:
        logger.error(
            "generate_background_reports failed (simulation=%s): %s",
            simulation_id, exc, exc_info=True,
        )


def generate_evaluation_background_reports(
    db: AsyncSession,
    evaluation_results: Dict[str, Any],
    user_id: str,
    simulation_id: str,
    report_id: str,
    cattle_info: Any,
    currency: str = "$",
    country_name: str = "Unknown",
    feed_evaluation: List[Dict[str, Any]] = [],
    feeds: List[Any] = [],
    user_name: str = "User",
) -> None:
    """
    Orchestrate evaluation PDF generation and S3 upload in a background task.
    Intentionally sync: runs in a FastAPI BackgroundTask (not on the async event loop).
    """
    try:
        from core.z_optimization.reporting import generate_evaluation_background_reports as _core_gen
        _core_gen(
            evaluation_results=evaluation_results,
            user_id=user_id,
            simulation_id=simulation_id,
            report_id=report_id,
            cattle_info=cattle_info,
            currency=currency,
            country_name=country_name,
            feed_evaluation=feed_evaluation,
            feeds=feeds,
            user_name=user_name,
            db_session=db,
        )
    except Exception as exc:
        logger.error(
            "generate_evaluation_background_reports failed (simulation=%s): %s",
            simulation_id, exc, exc_info=True,
        )
