"""
Feed service for RationSmart v4.0.

Handles admin feed management: CRUD orchestration, bulk upload, export.
All DB access through FeedRepository. No FastAPI imports.
"""
import io
import logging
import re
import secrets
import string
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession

from repositories.feed_repository import FeedRepository
from repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

# Fixed namespace for standard feeds sourced from the 3rd party feed library.
# Never change this value — doing so would alter all derived UUIDs and break stored references.
STANDARD_FEED_NAMESPACE = uuid.UUID("ae24b4d9-a4e1-4a7f-a083-ed6e9ae6006d")


def stable_feed_uuid(fd_code: str) -> uuid.UUID:
    """Derives a deterministic UUID from a 3rd party fd_code.
    Same fd_code always produces the same UUID across DB refreshes."""
    return uuid.uuid5(STANDARD_FEED_NAMESPACE, fd_code)


# Alphabet for the random suffix of RationSmart-generated feed codes (uppercase + digits).
_CODE_SUFFIX_ALPHABET = string.ascii_uppercase + string.digits


def generate_feed_code(fd_name: str) -> str:
    """Generate a RationSmart-origin feed code: 'RS' + up to 6 name letters + 4 random chars.

    Example: 'Alfalfa Hay' -> 'RSALFALF7K2Q'. The 'RS' prefix distinguishes feeds created
    inside RationSmart (via add-feed) from the 3rd-party bulk-imported library. Not guaranteed
    unique on its own — use make_unique_feed_code to check against the DB.
    """
    letters = re.sub(r"[^A-Za-z]", "", fd_name or "").upper()[:6]
    suffix = "".join(secrets.choice(_CODE_SUFFIX_ALPHABET) for _ in range(4))
    return f"RS{letters}{suffix}"


async def make_unique_feed_code(repo, fd_name: str, max_attempts: int = 25) -> str:
    """Generate an fd_code not already present in `feeds`. Retries the random suffix on collision."""
    for _ in range(max_attempts):
        code = generate_feed_code(fd_name)
        if not await repo.get_by_code(code):
            return code
    raise RuntimeError("Could not generate a unique fd_code after multiple attempts")


# Columns required for bulk upload Excel files
_REQUIRED_COLUMNS = {"fd_name", "fd_category", "fd_type", "fd_country_name"}
_NUMERIC_COLUMNS = {
    "fd_dm", "fd_ash", "fd_cp", "fd_npn_cp", "fd_ee", "fd_cf", "fd_nfe",
    "fd_st", "fd_ndf", "fd_hemicellulose", "fd_adf", "fd_cellulose", "fd_lg",
    "fd_ndin", "fd_adin", "fd_ca", "fd_p",
}


def resolve_taxonomy(type_by_name, cat_by_type_and_name, type_cell, cat_cell):
    """Validate + canonicalize a (fd_type, fd_category) pair against the active taxonomy.

    Shared by bulk upload and single-feed add/update. `type_cell`/`cat_cell` must already be
    trimmed strings ("" if blank — callers handle source-specific blank/NaN normalization).
    Rules: case-insensitive match; the category must exist AND belong to the matched type
    (stronger check); reject blanks.

    Returns (ok, reason, canonical_type, canonical_cat, fd_type_id, fd_category_id).
    On failure `ok` is False, `reason` is set, and the remaining fields are None.
    """
    if not type_cell:
        return False, "fd_type is empty", None, None, None, None
    if not cat_cell:
        return False, "fd_category is empty", None, None, None, None

    matched_type = type_by_name.get(type_cell.lower())
    if matched_type is None:
        return False, f"fd_type '{type_cell}' does not match any active feed type", None, None, None, None

    matched_category = cat_by_type_and_name.get((matched_type.id, cat_cell.lower()))
    if matched_category is None:
        return (
            False,
            f"fd_category '{cat_cell}' is not a valid active category under feed type '{matched_type.type_name}'",
            None, None, None, None,
        )

    return (
        True, None,
        matched_type.type_name, matched_category.category_name,
        matched_type.id, matched_category.id,
    )


# ── Feed type / category CRUD ─────────────────────────────────────────────────

async def create_feed_type(
    db: AsyncSession, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Create a new feed type. Caller must commit."""
    repo = FeedRepository(db)
    ft = await repo.create_feed_type(data)
    return True, "Feed type created successfully", ft


async def delete_feed_type(
    db: AsyncSession, type_id: str
) -> Tuple[bool, str]:
    """Delete a feed type if it has no feeds or categories. Caller must commit."""
    repo = FeedRepository(db)
    ft = await repo.get_feed_type_by_id(type_id)
    if not ft:
        return False, "Feed type not found"

    if await repo.count_categories_by_type(type_id) > 0:
        return False, "Cannot delete: feed type has associated categories"
    if await repo.count_feeds_by_type_name(ft.type_name) > 0:
        return False, "Cannot delete: feeds are assigned to this type"

    await repo.delete_feed_type(ft)
    return True, f"Feed type '{ft.type_name}' deleted"


async def create_feed_category(
    db: AsyncSession, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Create a new feed category. Caller must commit."""
    repo = FeedRepository(db)
    ft = await repo.get_feed_type_by_id(data["feed_type_id"])
    if not ft:
        return False, "Feed type not found", None
    cat = await repo.create_feed_category(data)
    return True, "Feed category created successfully", cat


async def delete_feed_category(
    db: AsyncSession, category_id: str
) -> Tuple[bool, str]:
    """Delete a feed category if no feeds are assigned. Caller must commit."""
    repo = FeedRepository(db)
    cat = await repo.get_category_by_id(category_id)
    if not cat:
        return False, "Feed category not found"

    if await repo.count_feeds_by_category_name(cat.category_name) > 0:
        return False, "Cannot delete: feeds are assigned to this category"

    await repo.delete_feed_category(cat)
    return True, f"Feed category '{cat.category_name}' deleted"


# ── Feed CRUD ─────────────────────────────────────────────────────────────────

async def create_feed(
    db: AsyncSession, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Create a new standard feed. Caller must commit.

    Validates fd_type/fd_category against the active taxonomy (canonicalizing text and
    populating both FKs), and generates a RationSmart-origin fd_code + stable id.
    """
    repo = FeedRepository(db)
    user_repo = UserRepository(db)

    if await repo.get_by_name(data["fd_name"]):
        return False, f"Feed '{data['fd_name']}' already exists", None

    # Taxonomy validation + canonicalization (same rules as bulk upload).
    type_by_name, cat_by_type_and_name = await repo.get_active_taxonomy_maps()
    type_cell = (data.get("fd_type") or "").strip()
    cat_cell = (data.get("fd_category") or "").strip()
    ok, reason, canon_type, canon_cat, type_id, cat_id = resolve_taxonomy(
        type_by_name, cat_by_type_and_name, type_cell, cat_cell
    )
    if not ok:
        return False, reason, None
    data["fd_type"] = canon_type
    data["fd_category"] = canon_cat
    data["fd_type_id"] = type_id
    data["fd_category_id"] = cat_id

    country_id = None
    if data.get("fd_country_name"):
        country = await user_repo.get_country_by_name(data["fd_country_name"])
        if not country:
            return False, f"Country '{data['fd_country_name']}' not found", None
        country_id = str(country.id)

    # fd_code is generated inside RationSmart (admin never supplies it); id derives from it.
    fd_code = await make_unique_feed_code(repo, data["fd_name"])
    data["fd_code"] = fd_code
    data["id"] = stable_feed_uuid(fd_code)

    feed = await repo.create(data, country_id=country_id)
    return True, "Feed created successfully", feed


async def update_feed(
    db: AsyncSession, feed_id: str, data: Dict[str, Any]
) -> Tuple[bool, str, Optional[Any]]:
    """Update an existing feed. Caller must commit.

    If fd_type and/or fd_category are supplied, the *effective* pair (supplied value else the
    feed's current value) is validated against the active taxonomy — so the category-belongs-to-
    type rule always holds — then canonicalized and both FKs refreshed. fd_code/id never change.
    """
    repo = FeedRepository(db)
    feed = await repo.get_by_id(feed_id)
    if not feed:
        return False, "Feed not found", None

    if "fd_name" in data:
        dup = await repo.get_by_name(data["fd_name"])
        if dup and str(dup.id) != feed_id:
            return False, f"Another feed named '{data['fd_name']}' already exists", None

    # Re-validate taxonomy only when type or category is being changed. Fill the missing side
    # from the existing row so the (type, category) membership check is always evaluated.
    if "fd_type" in data or "fd_category" in data:
        type_by_name, cat_by_type_and_name = await repo.get_active_taxonomy_maps()
        type_cell = (data.get("fd_type", feed.fd_type) or "").strip()
        cat_cell = (data.get("fd_category", feed.fd_category) or "").strip()
        ok, reason, canon_type, canon_cat, type_id, cat_id = resolve_taxonomy(
            type_by_name, cat_by_type_and_name, type_cell, cat_cell
        )
        if not ok:
            return False, reason, None
        data["fd_type"] = canon_type
        data["fd_category"] = canon_cat
        data["fd_type_id"] = type_id
        data["fd_category_id"] = cat_id

    updated = await repo.update(feed, data)
    return True, "Feed updated successfully", updated


async def delete_feed(db: AsyncSession, feed_id: str) -> Tuple[bool, str]:
    """Delete a feed. Caller must commit."""
    repo = FeedRepository(db)
    feed = await repo.get_by_id(feed_id)
    if not feed:
        return False, "Feed not found"
    await repo.delete(feed)
    return True, f"Feed '{feed.fd_name}' deleted"


async def list_feeds(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 20,
    feed_type: Optional[str] = None,
    feed_category: Optional[str] = None,
    country_name: Optional[str] = None,
    search: Optional[str] = None,
) -> Tuple[List[Any], int]:
    repo = FeedRepository(db)
    return await repo.get_all(
        skip=skip,
        limit=limit,
        feed_type=feed_type,
        feed_category=feed_category,
        country_name=country_name,
        search=search,
    )


# ── Bulk upload ───────────────────────────────────────────────────────────────

async def bulk_upload_feeds(
    db: AsyncSession, file_bytes: bytes
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

    # Load the active taxonomy once — fd_type/fd_category are validated against these
    # (case-insensitive, trimmed) and rows are canonicalized to the master spelling.
    type_by_name, cat_by_type_and_name = await repo.get_active_taxonomy_maps()

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # Excel is 1-indexed; header is row 1
        try:
            raw_name = row.get("fd_name")
            fd_name = "" if pd.isna(raw_name) else str(raw_name).strip()
            if not fd_name:
                failed.append({"row": row_num, "reason": "fd_name is empty"})
                continue

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
                c = await user_repo.get_country_by_name(country_name)
                country_id = str(c.id) if c else None

            fd_code = str(row.get("fd_code", "") or "").strip()
            if not fd_code:
                failed.append({"row": row_num, "reason": "fd_code is missing — cannot generate stable feed ID"})
                continue

            # ── Taxonomy validation (fd_type + fd_category) ─────────────────────
            # Empty Excel cells arrive as NaN (float); pd.isna guards against
            # str(NaN) -> "nan" slipping past the blank check in resolve_taxonomy.
            raw_type = row.get("fd_type")
            raw_cat = row.get("fd_category")
            type_cell = "" if pd.isna(raw_type) else str(raw_type).strip()
            cat_cell = "" if pd.isna(raw_cat) else str(raw_cat).strip()

            ok, reason, canon_type, canon_cat, type_id, cat_id = resolve_taxonomy(
                type_by_name, cat_by_type_and_name, type_cell, cat_cell
            )
            if not ok:
                failed.append({"row": row_num, "reason": reason})
                continue

            data: Dict[str, Any] = {
                "fd_name": fd_name,
                "fd_category": canon_cat,  # canonical master spelling
                "fd_type": canon_type,     # canonical master spelling
                "fd_category_id": cat_id,
                "fd_type_id": type_id,
                "fd_country_name": country_name or None,
                "fd_country_cd": str(row.get("fd_country_cd", "") or "").strip() or None,
                "fd_code": fd_code,
            }
            for col in _NUMERIC_COLUMNS:
                val = row.get(col)
                data[col] = float(val) if val is not None and val != "" else None

            existing_feed = await repo.get_by_name(fd_name)
            if existing_feed:
                await repo.update(existing_feed, data)
                updated += 1
                existing += 1
            else:
                data["id"] = stable_feed_uuid(fd_code)
                await repo.create(data, country_id=country_id)
                success_count += 1

        except Exception as exc:
            failed.append({"row": row_num, "reason": str(exc)})

    await db.flush()
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

async def export_feeds(db: AsyncSession) -> Tuple[bytes, str]:
    """
    Export all standard feeds as Excel bytes.
    Returns (file_bytes, filename).
    """
    import pandas as pd

    repo = FeedRepository(db)
    feeds = await repo.get_all_for_export()

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


async def export_custom_feeds(db: AsyncSession) -> Tuple[bytes, str]:
    """Export all custom feeds as Excel bytes."""
    import pandas as pd

    repo = FeedRepository(db)
    feeds = await repo.get_all_custom_for_export()

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
