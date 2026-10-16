"""Repository for the CLIMDES feed-library sync (plan v2 §9.4).

Owns the `feed_sync_config` singleton and `feed_sync_log` rows. All methods
flush only — the caller (router or Celery task session context) commits,
matching the repo-wide convention.
"""
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any, AsyncIterator, Dict, Optional, Tuple

from sqlalchemy import exists, func, literal_column, select, text, update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db.models import FeedSyncConfig, FeedSyncLog

logger = logging.getLogger(__name__)

# Fields the Admin may set via PUT /feed-sync/config. scheduler_enabled is
# deliberately absent — the toggle endpoint owns it (D19).
_CONFIG_FIELDS = {
    "endpoint_url",
    "auth_type",
    "auth_header_name",
    "auth_token",
    "sync_day_of_week",
}


# Every sync and file upload holds this Postgres advisory lock while it runs,
# so two runs can never write feeds at once. Postgres frees it when the holding
# connection closes, including when its process dies. Two-int form, so it
# shows in pg_locks as classid / objid with objsubid = 2.
SYNC_LOCK_KEY = (7213, 1)

# A row is closed as stale only when it is this old AND no run holds the lock.
# The age keeps a manual run that is still queued (row created by the API,
# task not started yet) from being closed; the lock keeps a live run, however
# slow, from being closed.
STALE_RUN_AFTER = timedelta(minutes=30)
STALE_RUN_MESSAGE = (
    f"Run did not finish within {int(STALE_RUN_AFTER.total_seconds() // 60)} minutes "
    "and no run holds the sync lock; closed as failed. See the worker log."
)


def _sync_lock_held():
    """SQL: true while any session in this database holds SYNC_LOCK_KEY."""
    return exists(
        select(literal_column("1"))
        .select_from(text("pg_locks"))
        .where(
            text(
                "locktype = 'advisory' AND granted AND classid = :lock_a AND objid = :lock_b "
                "AND objsubid = 2 AND database = "
                "(SELECT oid FROM pg_database WHERE datname = current_database())"
            ).bindparams(lock_a=SYNC_LOCK_KEY[0], lock_b=SYNC_LOCK_KEY[1])
        )
    )


@asynccontextmanager
async def hold_sync_lock(bind: AsyncEngine) -> AsyncIterator[bool]:
    """Try to take the sync lock for the duration of the block; yields whether
    it was taken (never waits). Uses its own autocommit connection, because a
    session-level advisory lock lives exactly as long as that connection, and
    the run's session commits (and may give its connection back) many times.
    """
    async with bind.connect() as conn:
        await conn.execution_options(isolation_level="AUTOCOMMIT")
        acquired = (await conn.execute(
            text("SELECT pg_try_advisory_lock(:a, :b)"),
            {"a": SYNC_LOCK_KEY[0], "b": SYNC_LOCK_KEY[1]},
        )).scalar_one()
        try:
            yield bool(acquired)
        finally:
            if acquired:
                try:
                    await conn.execute(
                        text("SELECT pg_advisory_unlock(:a, :b)"),
                        {"a": SYNC_LOCK_KEY[0], "b": SYNC_LOCK_KEY[1]},
                    )
                except Exception:
                    # Never hand a pooled connection back still holding the lock.
                    logger.exception("Could not release the feed sync lock; discarding the connection")
                    await conn.invalidate()


class FeedSyncRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Config (singleton) ────────────────────────────────────────────────────

    async def get_config(self) -> Optional[FeedSyncConfig]:
        """Return the singleton config row (seeded by the migration)."""
        result = await self.db.execute(
            select(FeedSyncConfig).order_by(FeedSyncConfig.created_at).limit(1)
        )
        return result.scalars().first()

    async def update_config(
        self, config: FeedSyncConfig, data: Dict[str, Any]
    ) -> FeedSyncConfig:
        """Apply whitelisted fields to the config. Caller must commit."""
        for field, value in data.items():
            if field in _CONFIG_FIELDS:
                setattr(config, field, value)
        config.updated_at = func.now()
        await self.db.flush()
        return config

    async def set_scheduler_enabled(
        self, config: FeedSyncConfig, enabled: bool, admin_id
    ) -> FeedSyncConfig:
        """Flip the Automatic-Scheduler flag + stamp the audit fields (D19/D21)."""
        config.scheduler_enabled = enabled
        config.scheduler_toggled_by = admin_id
        config.scheduler_toggled_at = func.now()
        config.updated_at = func.now()
        await self.db.flush()
        return config

    async def touch_last_run(
        self, config: FeedSyncConfig, success: bool
    ) -> FeedSyncConfig:
        """Record that a run happened now; also bump last_success_at on success."""
        config.last_run_at = func.now()
        if success:
            config.last_success_at = func.now()
        await self.db.flush()
        return config

    # ── Logs ──────────────────────────────────────────────────────────────────

    async def create_log(
        self, trigger_type: str, triggered_by=None
    ) -> FeedSyncLog:
        """Open a run: status='running'. Caller must commit."""
        log = FeedSyncLog(
            status="running",
            trigger_type=trigger_type,
            triggered_by=triggered_by,
        )
        self.db.add(log)
        await self.db.flush()
        return log

    async def finalize_log(
        self, log: FeedSyncLog, status: str, **fields
    ) -> FeedSyncLog:
        """Close a run: set final status, finished_at, and any count/detail fields."""
        log.status = status
        log.finished_at = func.now()
        for field, value in fields.items():
            setattr(log, field, value)
        await self.db.flush()
        return log

    async def get_log(self, log_id) -> Optional[FeedSyncLog]:
        try:
            log_uuid = uuid.UUID(str(log_id))  # callers pass str (task kwargs, URL path)
        except (TypeError, ValueError):
            return None
        result = await self.db.execute(
            select(FeedSyncLog).where(FeedSyncLog.id == log_uuid)
        )
        return result.scalars().first()

    async def get_running_log(self) -> Optional[FeedSyncLog]:
        """Return the in-progress run, if any (overlap guard).

        Dead runs are closed as failed first (`fail_stale_runs`), so a run
        whose process died cannot block syncs, uploads and the feed-library
        wipe forever. Caller commits, as usual.
        """
        await self.fail_stale_runs()
        result = await self.db.execute(
            select(FeedSyncLog)
            .where(FeedSyncLog.status == "running")
            .order_by(FeedSyncLog.started_at.desc())
            .limit(1)
        )
        return result.scalars().first()

    async def fail_stale_runs(self) -> int:
        """Close runs that are dead: still 'running' after STALE_RUN_AFTER while
        no run holds the sync lock. Returns how many were closed."""
        result = await self.db.execute(
            update(FeedSyncLog)
            .where(
                FeedSyncLog.status == "running",
                FeedSyncLog.started_at < func.now() - STALE_RUN_AFTER,
                ~_sync_lock_held(),
            )
            .values(status="failed", finished_at=func.now(), error_message=STALE_RUN_MESSAGE)
            .execution_options(synchronize_session=False)
        )
        return result.rowcount or 0

    async def fail_running_log(self, log_id, message: str) -> bool:
        """Close one run as failed if it is still 'running' (a crashed run).
        Uses an UPDATE, not the ORM object, so it works after a rollback."""
        try:
            log_uuid = uuid.UUID(str(log_id))  # Celery kwargs arrive as str
        except (TypeError, ValueError):
            return False
        result = await self.db.execute(
            update(FeedSyncLog)
            .where(FeedSyncLog.id == log_uuid, FeedSyncLog.status == "running")
            .values(status="failed", finished_at=func.now(), error_message=message)
            .execution_options(synchronize_session=False)
        )
        return bool(result.rowcount)

    async def list_logs(
        self, page: int = 1, page_size: int = 20
    ) -> Tuple[list, int]:
        """Return (logs newest-first for the page, total count)."""
        total = (
            await self.db.execute(select(func.count(FeedSyncLog.id)))
        ).scalar_one()
        result = await self.db.execute(
            select(FeedSyncLog)
            .order_by(FeedSyncLog.started_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result.scalars().all()), total
