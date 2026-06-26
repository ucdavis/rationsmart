"""
Translation workbook export/import (Phase 4) and single-feed CRUD.

Sheet names and column names are STABLE — changing them breaks the round-trip.
"""
import io

import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession

from repositories.translation_repository import TranslationRepository

# Sheet names — must stay stable for round-trip import
_SHEET_FEEDS = "Feeds"
_SHEET_TYPES = "Feed Types"
_SHEET_CATS = "Feed Categories"

# Metadata column names (not imported, just informational / lookup keys)
_COL_FEED_ID = "feed_id"
_COL_FD_CODE = "fd_code"
_COL_EN_NAME = "english_name"
_COL_TYPE_SRC = "english_value"
_COL_CAT_SRC = "english_value"

_FEEDS_META = {_COL_FEED_ID, _COL_FD_CODE, _COL_EN_NAME}
_VOCAB_META = {_COL_TYPE_SRC}


# ── Export ────────────────────────────────────────────────────────────────────

async def export_translation_workbook(
    db: AsyncSession, country_id: str
) -> tuple[bytes, str]:
    """Build a 3-sheet translation workbook for a country and return (bytes, filename)."""
    repo = TranslationRepository(db)

    lang_codes = await repo.get_country_language_codes(country_id)
    feeds = await repo.get_country_feeds(country_id)
    feed_trans_map = await repo.get_feed_translations_map(country_id)
    types = await repo.get_distinct_types(country_id)
    cats = await repo.get_distinct_categories(country_id)
    type_trans_map = await repo.get_vocabulary_translations_map(country_id, "feed_type")
    cat_trans_map = await repo.get_vocabulary_translations_map(country_id, "feed_category")

    # Feeds sheet
    feeds_rows = []
    for f in feeds:
        fid = str(f.id)
        row: dict = {
            _COL_FEED_ID: fid,
            _COL_FD_CODE: f.fd_code or "",
            _COL_EN_NAME: f.fd_name or "",
        }
        for lc in lang_codes:
            row[lc] = feed_trans_map.get(fid, {}).get(lc, "")
        feeds_rows.append(row)

    # Feed Types sheet
    types_rows = []
    for src in types:
        row = {_COL_TYPE_SRC: src}
        for lc in lang_codes:
            row[lc] = type_trans_map.get(src, {}).get(lc, "")
        types_rows.append(row)

    # Feed Categories sheet
    cats_rows = []
    for src in cats:
        row = {_COL_CAT_SRC: src}
        for lc in lang_codes:
            row[lc] = cat_trans_map.get(src, {}).get(lc, "")
        cats_rows.append(row)

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        pd.DataFrame(feeds_rows).to_excel(writer, sheet_name=_SHEET_FEEDS, index=False)
        pd.DataFrame(types_rows).to_excel(writer, sheet_name=_SHEET_TYPES, index=False)
        pd.DataFrame(cats_rows).to_excel(writer, sheet_name=_SHEET_CATS, index=False)

    cid_short = str(country_id)[:8]
    return buf.getvalue(), f"translations_{cid_short}.xlsx"


# ── Import ────────────────────────────────────────────────────────────────────

def _empty_summary() -> dict:
    return {
        "success": True,
        "message": "Import complete",
        "feeds_inserted": 0,
        "feeds_updated": 0,
        "feeds_skipped": 0,
        "types_inserted": 0,
        "types_updated": 0,
        "types_skipped": 0,
        "categories_inserted": 0,
        "categories_updated": 0,
        "categories_skipped": 0,
        "errors": [],
    }


async def import_translation_workbook(
    db: AsyncSession, country_id: str, file_bytes: bytes
) -> dict:
    """Parse an uploaded workbook and UPSERT translations for `country_id`."""
    repo = TranslationRepository(db)
    active_lang_codes = set(await repo.get_country_language_codes(country_id))
    valid_feed_ids = await repo.get_country_feed_ids(country_id)

    summary = _empty_summary()

    try:
        sheets: dict[str, pd.DataFrame] = pd.read_excel(
            io.BytesIO(file_bytes), sheet_name=None, dtype=str
        )
    except Exception as exc:
        return {**summary, "success": False, "message": f"Cannot read Excel file: {exc}"}

    # ── Feeds sheet ────────────────────────────────────────────────────────────
    if _SHEET_FEEDS in sheets:
        df = sheets[_SHEET_FEEDS].fillna("")
        lang_cols = [c for c in df.columns if c in active_lang_codes]
        unknown = [c for c in df.columns if c not in _FEEDS_META and c not in active_lang_codes]
        for c in unknown:
            summary["errors"].append(f"Feeds sheet: unknown column '{c}' — skipped")

        for _, row in df.iterrows():
            feed_id = str(row.get(_COL_FEED_ID, "")).strip()
            if not feed_id or feed_id not in valid_feed_ids:
                if feed_id:
                    summary["errors"].append(
                        f"Feeds sheet: feed_id '{feed_id}' not found in country — skipped"
                    )
                continue
            for lc in lang_cols:
                val = str(row.get(lc, "")).strip()
                if not val:
                    summary["feeds_skipped"] += 1
                    continue
                action = await repo.upsert_feed_translation(feed_id, lc, val)
                summary[f"feeds_{action}"] += 1

    # ── Feed Types sheet ──────────────────────────────────────────────────────
    if _SHEET_TYPES in sheets:
        df = sheets[_SHEET_TYPES].fillna("")
        lang_cols = [c for c in df.columns if c in active_lang_codes]
        if _COL_TYPE_SRC in df.columns:
            for _, row in df.iterrows():
                src = str(row.get(_COL_TYPE_SRC, "")).strip()
                if not src:
                    continue
                for lc in lang_cols:
                    val = str(row.get(lc, "")).strip()
                    if not val:
                        summary["types_skipped"] += 1
                        continue
                    action = await repo.upsert_vocabulary_translation(
                        country_id, "feed_type", src, lc, val
                    )
                    summary[f"types_{action}"] += 1

    # ── Feed Categories sheet ─────────────────────────────────────────────────
    if _SHEET_CATS in sheets:
        df = sheets[_SHEET_CATS].fillna("")
        lang_cols = [c for c in df.columns if c in active_lang_codes]
        if _COL_CAT_SRC in df.columns:
            for _, row in df.iterrows():
                src = str(row.get(_COL_CAT_SRC, "")).strip()
                if not src:
                    continue
                for lc in lang_cols:
                    val = str(row.get(lc, "")).strip()
                    if not val:
                        summary["categories_skipped"] += 1
                        continue
                    action = await repo.upsert_vocabulary_translation(
                        country_id, "feed_category", src, lc, val
                    )
                    summary[f"categories_{action}"] += 1

    total_changes = (
        summary["feeds_inserted"] + summary["feeds_updated"]
        + summary["types_inserted"] + summary["types_updated"]
        + summary["categories_inserted"] + summary["categories_updated"]
    )
    summary["message"] = (
        f"Import complete — {total_changes} translation(s) written"
        + (f"; {len(summary['errors'])} warning(s)" if summary["errors"] else "")
    )
    return summary


# ── Single-feed CRUD ──────────────────────────────────────────────────────────

async def upsert_feed_translation(
    db: AsyncSession, feed_id: str, language: str, name: str
) -> dict:
    """UPSERT a single feed translation and return the persisted record."""
    repo = TranslationRepository(db)
    action = await repo.upsert_feed_translation(feed_id, language, name)
    translations = await repo.get_feed_translations(feed_id)
    for t in translations:
        if t.language == language:
            return {
                "feed_id": str(t.feed_id),
                "language": t.language,
                "name": t.name,
                "action": action,
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
    return {"feed_id": feed_id, "language": language, "name": name, "action": action}


async def get_feed_translations(db: AsyncSession, feed_id: str) -> list[dict]:
    """Return all translations for a feed as a list of dicts."""
    repo = TranslationRepository(db)
    return [
        {
            "feed_id": str(t.feed_id),
            "language": t.language,
            "name": t.name,
            "created_at": t.created_at,
            "updated_at": t.updated_at,
        }
        for t in await repo.get_feed_translations(feed_id)
    ]


async def delete_feed_translation(
    db: AsyncSession, feed_id: str, language: str
) -> bool:
    """Delete a single feed translation. Returns True if deleted, False if not found."""
    repo = TranslationRepository(db)
    return await repo.delete_feed_translation(feed_id, language)


async def get_translation_coverage(
    db: AsyncSession, country_id: str, lang: str
) -> dict:
    """Return coverage counts for a country+language combination."""
    repo = TranslationRepository(db)
    return await repo.get_coverage(country_id, lang)
