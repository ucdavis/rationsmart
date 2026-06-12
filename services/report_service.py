"""
Report / simulation service for RationSmart v4.0.

Covers: simulation list/detail retrieval, save-simulation, delete.
PDF generation and S3 upload orchestration are Task 2.8.
"""
import logging
import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.db.models import Report
from repositories.feed_repository import FeedRepository
from repositories.report_repository import ReportRepository
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


# ── Simulation retrieval ──────────────────────────────────────────────────────

def fetch_all_simulations(
    db: Session, user_id: str
) -> Tuple[bool, str, List[Dict[str, Any]]]:
    """
    Return all saved simulations for a user, most recent first.
    Each item contains user_id, simulation_id, report_id, created_at, country_name.
    """
    repo = ReportRepository(db)
    rows = repo.get_simulation_list(user_id)

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


def fetch_simulation_details(
    db: Session, report_id: str, user_id: str
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Return the cattle_info, feed_selection, and metadata for a saved simulation.
    """
    report_repo = ReportRepository(db)
    feed_repo = FeedRepository(db)
    user_repo = UserRepository(db)

    report = report_repo.get_by_report_id(report_id, user_id)
    if not report:
        return False, "Report not found", None

    country_name = ""
    if report.country_id:
        country = user_repo.get_country_by_id(str(report.country_id))
        country_name = country.name if country else ""

    # Resolve feed details from the stored JSON
    feed_selection_raw: List[Dict] = report.feed_selection or []
    feed_ids = [f.get("feed_id") for f in feed_selection_raw if f.get("feed_id")]

    std_feeds = {str(f.id): f for f in feed_repo.get_by_ids(feed_ids)}
    cust_feeds = {str(f.id): f for f in feed_repo.get_custom_by_ids(feed_ids)}

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

    return True, "Simulation details fetched", {
        "cattle_info": report.animal_inputs or {},
        "feed_selection": enriched_feeds,
        "user_id": str(report.user_id),
        "country_name": country_name,
        "simulation_id": report.simulation_id or "",
        "report_id": report.report_id,
        "custom_constraints": report.custom_constraints,
    }


# ── Save simulation ───────────────────────────────────────────────────────────

def save_simulation(
    db: Session, report_id: str, user_id: str
) -> Tuple[bool, str, Optional[str]]:
    """
    Mark a report as saved by the user. Returns (success, message, bucket_url).
    Caller must commit.
    """
    repo = ReportRepository(db)
    report = repo.get_by_report_id(report_id, user_id)
    if not report:
        return False, "Report not found or does not belong to this user.", None

    repo.mark_saved(report)
    logger.info("Report saved: %s (user=%s)", report_id, user_id)
    return True, "Report saved successfully", report.bucket_url


# ── Admin: all saved reports ──────────────────────────────────────────────────

def get_all_saved_reports(
    db: Session, skip: int = 0, limit: int = 20
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Admin view: paginated list of all saved reports with user name/email.
    Returns (reports, total_count).
    """
    repo = ReportRepository(db)
    rows, total = repo.get_all_saved(skip=skip, limit=limit)

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

def delete_report(
    db: Session, report_id: str, user_id: str
) -> Tuple[bool, str]:
    """
    Delete a report record. Caller must commit.
    Does NOT delete the S3 object (that's handled by storage_service in Task 2.8).
    """
    repo = ReportRepository(db)
    report = repo.get_by_report_id(report_id, user_id)
    if not report:
        return False, "Report not found or does not belong to this user."
    repo.delete(report)
    logger.info("Report deleted: %s (user=%s)", report_id, user_id)
    return True, "Report deleted successfully"


# ── User report list (saved to S3) ────────────────────────────────────────────

def get_user_reports(
    db: Session, user_id: str
) -> Tuple[bool, str, List[Dict[str, Any]]]:
    """
    Return saved reports for a user that have a bucket_url (uploaded to S3).
    """
    repo = ReportRepository(db)
    user_repo = UserRepository(db)

    user = user_repo.get_by_id(user_id)
    user_name = user.name if user else "Unknown"

    reports = repo.get_saved_by_user(user_id)
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
