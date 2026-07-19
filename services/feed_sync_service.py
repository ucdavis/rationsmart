"""CLIMDES feed-library sync service (plan v2 §9 / UC-4).

fetch_feed_library()  — HTTP GET on the configured endpoint (auth header per
                        config) returning the .xlsx bytes, held in memory.
sync_feed_library()   — the full run: due-gate → fetch → parse → per-row
                        upsert into `feeds` (keyed on fd_code, D5) + local-name
                        translations via translation_service (D13/D15) → log.

Transaction note: unlike request-path services (flush-only), this service
COMMITS — it runs on a Celery worker session it owns, and the 'running' log
row must be visible to pollers before the run finishes.

i18n invariants honoured here: I1 (English fd_name overwritten in place, never
translated), I3 (no 'en' translation rows), I4/I5 (languages must be
registered + active + assigned to the feed's country — never auto-created).
"""
import io
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone  # noqa: F401 (date used in annotations)
from typing import Any, Dict, Optional, Tuple

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from repositories.feed_repository import FeedRepository
from repositories.feed_sync_repository import FeedSyncRepository
from repositories.language_repository import LanguageRepository
from repositories.translation_repository import TranslationRepository
from repositories.user_repository import UserRepository
from services import translation_service
from services.feed_service import _NUMERIC_COLUMNS, resolve_taxonomy, stable_feed_uuid

logger = logging.getLogger(__name__)

# File-level mandatory headers (D14): missing any one aborts the whole run.
MANDATORY_COLUMNS = {"fd_code", "fd_name", "fd_country_name", "fd_language_cd"}

# D17: ISO 639-1 two-letter codes only (post trim/lowercase).
_LANG_CODE_RE = re.compile(r"^[a-z]{2}$")

# D24: decimal-comma numerics ("88,8") are a locale artifact, not junk.
_DECIMAL_COMMA_RE = re.compile(r"^\d+,\d+$")

FETCH_TIMEOUT_SECONDS = 120.0


class FeedSyncFetchError(Exception):
    """Endpoint unreachable / non-200 / non-Excel payload."""

    def __init__(self, message: str, http_status: Optional[int] = None):
        super().__init__(message)
        self.http_status = http_status


# ── Fetch ─────────────────────────────────────────────────────────────────────

def _build_auth_headers(config) -> Dict[str, str]:
    if config.auth_type == "bearer" and config.auth_token:
        return {"Authorization": f"Bearer {config.auth_token}"}
    if config.auth_type == "api_key" and config.auth_token:
        return {(config.auth_header_name or "X-API-Key"): config.auth_token}
    return {}


async def fetch_feed_library(config) -> Tuple[bytes, int]:
    """GET the Feed Library .xlsx from CLIMDES. Returns (bytes, http_status).

    Raises FeedSyncFetchError on network failure, non-200, or a payload that
    is not an .xlsx (guards against HTML error pages served with 200).
    """
    try:
        async with httpx.AsyncClient(
            timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True
        ) as client:
            response = await client.get(
                config.endpoint_url, headers=_build_auth_headers(config)
            )
    except httpx.HTTPError as exc:
        raise FeedSyncFetchError(f"CLIMDES endpoint unreachable: {exc}") from exc

    if response.status_code != 200:
        raise FeedSyncFetchError(
            f"CLIMDES endpoint returned HTTP {response.status_code}",
            http_status=response.status_code,
        )

    content = response.content
    # .xlsx is a ZIP container — must start with the 'PK' magic bytes.
    if not content or not content.startswith(b"PK"):
        raise FeedSyncFetchError(
            "CLIMDES response is not a valid Excel (.xlsx) file",
            http_status=response.status_code,
        )
    return content, response.status_code


# ── Cell helpers ──────────────────────────────────────────────────────────────

def _cell_str(row, column: str) -> str:
    """Series.get + NaN-safe strip → '' for blank/missing cells."""
    import pandas as pd

    value = row.get(column)
    if value is None or pd.isna(value):
        return ""
    return str(value).strip()


def _coerce_numeric(value) -> Tuple[bool, Optional[float]]:
    """(ok, float|None). Blank → (True, None); '88,8' → (True, 88.8) per D24."""
    import pandas as pd

    if value is None or (not isinstance(value, str) and pd.isna(value)) or value == "":
        return True, None
    if isinstance(value, (int, float)):
        return True, float(value)
    text = str(value).strip()
    if not text:
        return True, None
    if _DECIMAL_COMMA_RE.match(text):
        text = text.replace(",", ".")
    try:
        return True, float(text)
    except ValueError:
        return False, None


def next_scheduled_run(sync_day_of_week: int, today) -> "date":
    """Date of the next 00:00 tick matching the sync day, strictly after today
    (today's own tick has already fired by the time anyone can ask)."""
    days_ahead = (sync_day_of_week - today.weekday()) % 7
    return today + timedelta(days=days_ahead or 7)


def _is_due(config, now: datetime) -> Tuple[bool, str]:
    """Scheduled-run due-gate (D3): enabled AND day matches AND not run today."""
    if not config.scheduler_enabled:
        return False, "scheduler disabled"
    if now.weekday() != config.sync_day_of_week:
        return False, (
            f"today (weekday {now.weekday()}) is not the sync day "
            f"(weekday {config.sync_day_of_week})"
        )
    if config.last_success_at is not None:
        last = config.last_success_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if last.astimezone(timezone.utc).date() == now.date():
            return False, "a successful run already completed today"
    return True, "due"


# ── Sync ──────────────────────────────────────────────────────────────────────

async def sync_feed_library(
    db: AsyncSession,
    force: bool = False,
    log_id=None,
    triggered_by=None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Run one sync. force=True (manual) bypasses the due-gate; log_id, when
    given, is a pre-created 'running' log row (manual flow, UC-3).

    Returns a summary dict: {"ran": bool, "reason"?, "log_id"?, counts...}.
    """
    import pandas as pd

    now = now or datetime.now(timezone.utc)
    if log_id is not None:
        try:
            log_id = uuid.UUID(str(log_id))  # Celery kwargs arrive as str
        except (TypeError, ValueError):
            return {"ran": False, "reason": f"invalid log_id {log_id!r}"}
    sync_repo = FeedSyncRepository(db)

    config = await sync_repo.get_config()
    if config is None:
        logger.error("feed_sync_config singleton row is missing")
        return {"ran": False, "reason": "sync config not found"}

    if not force:
        due, reason = _is_due(config, now)
        if not due:
            logger.info("Feed sync tick: not due (%s)", reason)
            return {"ran": False, "reason": reason}

    if not (config.endpoint_url or "").strip():
        logger.warning("Feed sync: endpoint URL not configured — skipping")
        return {"ran": False, "reason": "endpoint URL not configured"}

    # Overlap guard: refuse if another run is in progress (plan §8).
    running = await sync_repo.get_running_log()
    if running is not None and (log_id is None or running.id != log_id):
        logger.warning("Feed sync: another run is already in progress — skipping")
        return {"ran": False, "reason": "another run is already in progress"}

    if log_id is not None:
        log = await sync_repo.get_log(log_id)
        if log is None:
            return {"ran": False, "reason": f"log {log_id} not found"}
    else:
        log = await sync_repo.create_log(
            "manual" if force else "scheduled", triggered_by=triggered_by
        )
        await db.commit()  # make the 'running' row visible to pollers

    async def _fail(
        message: str, http_status: Optional[int] = None, retryable: bool = False
    ) -> Dict[str, Any]:
        await sync_repo.finalize_log(
            log, "failed", error_message=message, http_status=http_status
        )
        await sync_repo.touch_last_run(config, success=False)
        await db.commit()
        logger.error("Feed sync failed: %s", message)
        return {
            "ran": True, "log_id": str(log.id), "status": "failed",
            "error": message, "retryable": retryable,
        }

    # ── Fetch ────────────────────────────────────────────────────────────────
    # Fetch failures are the only retryable kind (D23) — the Celery task
    # retries them with backoff, reusing this run's log row.
    try:
        content, http_status = await fetch_feed_library(config)
    except FeedSyncFetchError as exc:
        return await _fail(str(exc), http_status=exc.http_status, retryable=True)

    # ── Parse + file-level pre-checks (D14) ──────────────────────────────────
    try:
        df = pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        return await _fail(f"Failed to parse Excel file: {exc}", http_status=http_status)

    missing = MANDATORY_COLUMNS - set(df.columns)
    if missing:
        return await _fail(
            f"Mandatory column(s) missing from the Feed Library file: "
            f"{', '.join(sorted(missing))} — nothing imported",
            http_status=http_status,
        )

    # ── Reference data, loaded once ──────────────────────────────────────────
    feed_repo = FeedRepository(db)
    user_repo = UserRepository(db)
    translation_repo = TranslationRepository(db)
    language_repo = LanguageRepository(db)

    type_by_name, cat_by_type_and_name = await feed_repo.get_active_taxonomy_maps()
    active_languages = {
        lang.code for lang in await language_repo.get_all() if lang.is_active
    }

    country_cache: Dict[str, Optional[Any]] = {}
    country_lang_cache: Dict[str, set] = {}

    async def _country_for(name: str):
        key = name.lower()
        if key not in country_cache:
            country_cache[key] = await user_repo.get_country_by_name(name)
        return country_cache[key]

    async def _assigned_codes(country_id: str) -> set:
        if country_id not in country_lang_cache:
            country_lang_cache[country_id] = set(
                await translation_repo.get_country_language_codes(country_id)
            )
        return country_lang_cache[country_id]

    # ── Per-row pipeline (UC-4) ──────────────────────────────────────────────
    inserted = updated = 0
    translations_inserted = translations_updated = 0
    failed_rows = []
    skipped_translations = []
    numeric_columns = [c for c in _NUMERIC_COLUMNS if c in df.columns]

    for idx, row in df.iterrows():
        row_num = int(idx) + 2  # Excel rows are 1-indexed; header is row 1
        fd_code = _cell_str(row, "fd_code")
        try:
            if not fd_code:
                failed_rows.append(
                    {"row": row_num, "fd_code": None, "reason": "fd_code is missing"}
                )
                continue

            fd_name = _cell_str(row, "fd_name")
            if not fd_name:
                failed_rows.append(
                    {"row": row_num, "fd_code": fd_code, "reason": "fd_name (English) is empty"}
                )
                continue

            country_name = _cell_str(row, "fd_country_name")
            country = await _country_for(country_name) if country_name else None
            if country is None:
                failed_rows.append({
                    "row": row_num, "fd_code": fd_code,
                    "reason": f"unknown country '{country_name}'" if country_name
                    else "fd_country_name is missing",
                })
                continue

            numeric_values: Dict[str, Optional[float]] = {}
            bad_numeric = []
            for col in numeric_columns:
                ok, value = _coerce_numeric(row.get(col))
                if ok:
                    numeric_values[col] = value
                else:
                    bad_numeric.append(col)
            if bad_numeric:
                failed_rows.append({
                    "row": row_num, "fd_code": fd_code,
                    "reason": f"non-numeric value in: {', '.join(bad_numeric)}",
                })
                continue

            # D18 — validate against the active taxonomy (canonical spellings + ids)
            ok, reason, canon_type, canon_cat, type_id, cat_id = resolve_taxonomy(
                type_by_name, cat_by_type_and_name,
                _cell_str(row, "fd_type"), _cell_str(row, "fd_category"),
            )
            if not ok:
                failed_rows.append({"row": row_num, "fd_code": fd_code, "reason": reason})
                continue

            data: Dict[str, Any] = {
                "fd_code": fd_code,
                "fd_name": fd_name,                       # English, as-is (I1)
                "fd_type": canon_type,
                "fd_category": canon_cat,
                "fd_type_id": type_id,
                "fd_category_id": cat_id,
                "fd_country_name": country_name,
                "fd_country_cd": _cell_str(row, "fd_country_cd") or None,
                **numeric_values,
            }

            # English feed upsert, keyed on fd_code (D5)
            feed = await feed_repo.get_by_code(fd_code)
            if feed is not None:
                await feed_repo.update(feed, data)
                feed.fd_country_id = country.id  # update() whitelist omits the FK
                updated += 1
            else:
                data["id"] = stable_feed_uuid(fd_code)
                feed = await feed_repo.create(data, country_id=str(country.id))
                inserted += 1

            # Local-name translation branch (D13/D14/D15/D17)
            local_name = _cell_str(row, "fd_name_local_language")
            if not local_name:
                continue  # English-only row — nothing to translate

            raw_code = _cell_str(row, "fd_language_cd")
            code = raw_code.lower()
            if not code or not _LANG_CODE_RE.match(code):
                skipped_translations.append({
                    "fd_code": fd_code, "language": raw_code or None,
                    "reason": "blank/invalid fd_language_cd",
                })
                continue
            if code == "en":
                skipped_translations.append({
                    "fd_code": fd_code, "language": "en",
                    "reason": "language is 'en' — English is the baseline (I3)",
                })
                continue
            if code not in active_languages:
                skipped_translations.append({
                    "fd_code": fd_code, "language": code,
                    "reason": f"'{code}' is not a registered active language",
                })
                continue
            if code not in await _assigned_codes(str(country.id)):
                skipped_translations.append({
                    "fd_code": fd_code, "language": code,
                    "reason": f"'{code}' not assigned to {country.name}",
                })
                continue

            result = await translation_service.upsert_feed_translation(
                db, str(feed.id), code, local_name
            )
            if result.get("action") == "updated":
                translations_updated += 1
            else:
                translations_inserted += 1

        except Exception as exc:  # never let one bad row kill the run (UC-7)
            failed_rows.append(
                {"row": row_num, "fd_code": fd_code or None, "reason": str(exc)}
            )

    # ── Finalize ─────────────────────────────────────────────────────────────
    counts = {
        "total_rows": len(df),
        "inserted": inserted,
        "updated": updated,
        "skipped": len(failed_rows),
        "translations_inserted": translations_inserted,
        "translations_updated": translations_updated,
        "translations_skipped": len(skipped_translations),
    }
    await sync_repo.finalize_log(
        log, "success",
        http_status=http_status,
        failed_rows=failed_rows,
        skipped_translations=skipped_translations,
        **counts,
    )
    await sync_repo.touch_last_run(config, success=True)
    await db.commit()

    logger.info(
        "Feed sync succeeded: %s rows — %s inserted, %s updated, %s skipped, "
        "%s/%s translations written, %s translation skips",
        counts["total_rows"], inserted, updated, counts["skipped"],
        translations_inserted, translations_updated, counts["translations_skipped"],
    )
    return {"ran": True, "log_id": str(log.id), "status": "success", **counts}
