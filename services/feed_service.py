"""
Feed service for RationSmart v4.0.

Handles admin feed management: CRUD orchestration, bulk upload, export.
All DB access through FeedRepository. No FastAPI imports.
"""
import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from repositories.feed_repository import FeedRepository
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

# Columns required for bulk upload Excel files
_REQUIRED_COLUMNS = {"fd_name", "fd_category", "fd_type", "fd_country_name"}
_NUMERIC_COLUMNS = {
    "fd_dm", "fd_ash", "fd_cp", "fd_npn_cp", "fd_ee", "fd_cf", "fd_nfe",
    "fd_st", "fd_ndf", "fd_hemicellulose", "fd_adf", "fd_cellulose", "fd_lg",
    "fd_ndin", "fd_adin", "fd_ca", "fd_p",
}


# ── Feed type / category CRUD ─────────────────────────────────────────────────

def create_feed_type(
    db: Session, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Create a new feed type. Caller must commit."""
    repo = FeedRepository(db)
    ft = repo.create_feed_type(data)
    return True, "Feed type created successfully", ft


def delete_feed_type(
    db: Session, type_id: str
) -> Tuple[bool, str]:
    """Delete a feed type if it has no feeds or categories. Caller must commit."""
    repo = FeedRepository(db)
    ft = repo.get_feed_type_by_id(type_id)
    if not ft:
        return False, "Feed type not found"

    if repo.count_categories_by_type(type_id) > 0:
        return False, "Cannot delete: feed type has associated categories"
    if repo.count_feeds_by_type_name(ft.type_name) > 0:
        return False, "Cannot delete: feeds are assigned to this type"

    repo.delete_feed_type(ft)
    return True, f"Feed type '{ft.type_name}' deleted"


def create_feed_category(
    db: Session, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Create a new feed category. Caller must commit."""
    repo = FeedRepository(db)
    ft = repo.get_feed_type_by_id(data["feed_type_id"])
    if not ft:
        return False, "Feed type not found", None
    cat = repo.create_feed_category(data)
    return True, "Feed category created successfully", cat


def delete_feed_category(
    db: Session, category_id: str
) -> Tuple[bool, str]:
    """Delete a feed category if no feeds are assigned. Caller must commit."""
    repo = FeedRepository(db)
    cat = repo.get_category_by_id(category_id)
    if not cat:
        return False, "Feed category not found"

    if repo.count_feeds_by_category_name(cat.category_name) > 0:
        return False, "Cannot delete: feeds are assigned to this category"

    repo.delete_feed_category(cat)
    return True, f"Feed category '{cat.category_name}' deleted"


# ── Feed CRUD ─────────────────────────────────────────────────────────────────

def create_feed(
    db: Session, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Create a new standard feed. Caller must commit."""
    repo = FeedRepository(db)
    user_repo = UserRepository(db)

    existing = repo.get_by_name(data["fd_name"])
    if existing:
        return False, f"Feed '{data['fd_name']}' already exists", None

    country_id = None
    if data.get("fd_country_name"):
        country = user_repo.get_country_by_name(data["fd_country_name"])
        if not country:
            return False, f"Country '{data['fd_country_name']}' not found", None
        country_id = str(country.id)

    feed = repo.create(data, country_id=country_id)
    return True, "Feed created successfully", feed


def update_feed(
    db: Session, feed_id: str, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Update an existing feed. Caller must commit."""
    repo = FeedRepository(db)
    feed = repo.get_by_id(feed_id)
    if not feed:
        return False, "Feed not found", None

    if "fd_name" in data:
        dup = repo.get_by_name(data["fd_name"])
        if dup and str(dup.id) != feed_id:
            return False, f"Another feed named '{data['fd_name']}' already exists", None

    updated = repo.update(feed, data)
    return True, "Feed updated successfully", updated


def delete_feed(db: Session, feed_id: str) -> Tuple[bool, str]:
    """Delete a feed. Caller must commit."""
    repo = FeedRepository(db)
    feed = repo.get_by_id(feed_id)
    if not feed:
        return False, "Feed not found"
    repo.delete(feed)
    return True, f"Feed '{feed.fd_name}' deleted"


def list_feeds(
    db: Session,
    skip: int = 0,
    limit: int = 20,
    feed_type: Optional[str] = None,
    feed_category: Optional[str] = None,
    country_name: Optional[str] = None,
    search: Optional[str] = None,
) -> Tuple[List[Any], int]:
    repo = FeedRepository(db)
    return repo.get_all(
        skip=skip,
        limit=limit,
        feed_type=feed_type,
        feed_category=feed_category,
        country_name=country_name,
        search=search,
    )


# ── Bulk upload ───────────────────────────────────────────────────────────────

def bulk_upload_feeds(
    db: Session, file_bytes: bytes
) -> Dict[str, Any]:
    """
    Parse an Excel file and upsert feeds.
    Returns a summary dict with counts and a list of failed rows.
    """
    import pandas as pd

    repo = FeedRepository(db)
    user_repo = UserRepository(db)

    try:
        df = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as exc:
        return {
            "success": False,
            "message": f"Failed to parse Excel file: {exc}",
            "total_records": 0,
            "successful_uploads": 0,
            "failed_uploads": 0,
            "existing_records": 0,
            "updated_records": 0,
            "failed_records": [],
            "bulk_import_log": None,
        }

    missing_cols = _REQUIRED_COLUMNS - set(df.columns)
    if missing_cols:
        return {
            "success": False,
            "message": f"Missing required columns: {', '.join(missing_cols)}",
            "total_records": len(df),
            "successful_uploads": 0,
            "failed_uploads": len(df),
            "existing_records": 0,
            "updated_records": 0,
            "failed_records": [],
            "bulk_import_log": None,
        }

    total = len(df)
    success_count = updated = existing = 0
    failed: List[Dict] = []

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # Excel is 1-indexed; header is row 1
        try:
            fd_name = str(row.get("fd_name", "")).strip()
            if not fd_name:
                failed.append({"row": row_num, "reason": "fd_name is empty"})
                continue

            # Validate numeric columns
            invalid_numeric = []
            for col in _NUMERIC_COLUMNS:
                val = row.get(col)
                if val is not None and val != "" and not isinstance(val, (int, float)):
                    try:
                        float(val)
                    except (ValueError, TypeError):
                        invalid_numeric.append(col)
            if invalid_numeric:
                failed.append({"row": row_num, "reason": f"Non-numeric in: {', '.join(invalid_numeric)}"})
                continue

            country_name = str(row.get("fd_country_name", "")).strip()
            country_id = None
            if country_name:
                c = user_repo.get_country_by_name(country_name)
                country_id = str(c.id) if c else None

            data: Dict[str, Any] = {
                "fd_name": fd_name,
                "fd_category": str(row.get("fd_category", "") or "").strip() or None,
                "fd_type": str(row.get("fd_type", "") or "").strip() or None,
                "fd_country_name": country_name or None,
                "fd_country_cd": str(row.get("fd_country_cd", "") or "").strip() or None,
                "fd_code": str(row.get("fd_code", "") or "").strip() or None,
            }
            for col in _NUMERIC_COLUMNS:
                val = row.get(col)
                data[col] = float(val) if val is not None and val != "" else None

            existing_feed = repo.get_by_name(fd_name)
            if existing_feed:
                repo.update(existing_feed, data)
                updated += 1
                existing += 1
            else:
                repo.create(data, country_id=country_id)
                success_count += 1

        except Exception as exc:
            failed.append({"row": row_num, "reason": str(exc)})

    db.flush()
    return {
        "success": True,
        "message": f"Processed {total} records: {success_count} new, {updated} updated, {len(failed)} failed",
        "total_records": total,
        "successful_uploads": success_count,
        "failed_uploads": len(failed),
        "existing_records": existing,
        "updated_records": updated,
        "failed_records": failed,
        "bulk_import_log": None,
    }


# ── Export ────────────────────────────────────────────────────────────────────

def export_feeds(db: Session) -> Tuple[bytes, str]:
    """
    Export all standard feeds as Excel bytes.
    Returns (file_bytes, filename).
    """
    import pandas as pd

    repo = FeedRepository(db)
    feeds = repo.get_all_for_export()

    rows = []
    for f in feeds:
        rows.append(
            {
                "feed_id": str(f.id),
                "fd_code": f.fd_code,
                "fd_name": f.fd_name,
                "fd_type": f.fd_type,
                "fd_category": f.fd_category,
                "fd_country_name": f.fd_country_name,
                "fd_country_cd": f.fd_country_cd,
                "fd_dm": float(f.fd_dm or 0),
                "fd_ash": float(f.fd_ash or 0),
                "fd_cp": float(f.fd_cp or 0),
                "fd_npn_cp": float(f.fd_npn_cp or 0),
                "fd_ee": float(f.fd_ee or 0),
                "fd_cf": float(f.fd_cf or 0),
                "fd_nfe": float(f.fd_nfe or 0),
                "fd_st": float(f.fd_st or 0),
                "fd_ndf": float(f.fd_ndf or 0),
                "fd_hemicellulose": float(f.fd_hemicellulose or 0),
                "fd_adf": float(f.fd_adf or 0),
                "fd_cellulose": float(f.fd_cellulose or 0),
                "fd_lg": float(f.fd_lg or 0),
                "fd_ndin": float(f.fd_ndin or 0),
                "fd_adin": float(f.fd_adin or 0),
                "fd_ca": float(f.fd_ca or 0),
                "fd_p": float(f.fd_p or 0),
            }
        )

    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"feeds_export_{timestamp}.xlsx"
    return buf.getvalue(), filename


def export_custom_feeds(db: Session) -> Tuple[bytes, str]:
    """Export all custom feeds as Excel bytes."""
    import pandas as pd

    repo = FeedRepository(db)
    feeds = repo.get_all_custom_for_export()

    rows = [
        {
            "feed_id": str(f.id),
            "user_id": str(f.user_id),
            "fd_code": f.fd_code,
            "fd_name": f.fd_name,
            "fd_type": f.fd_type,
            "fd_category": f.fd_category,
            "fd_country_name": f.fd_country_name,
            "fd_dm": float(f.fd_dm or 0),
            "fd_cp": float(f.fd_cp or 0),
        }
        for f in feeds
    ]

    df = pd.DataFrame(rows)
    buf = io.BytesIO()
    df.to_excel(buf, index=False)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return buf.getvalue(), f"custom_feeds_export_{timestamp}.xlsx"
