"""Repository for the CLIMDES feed-library sync (plan v2 §9.4).

Owns the `feed_sync_config` singleton and `feed_sync_log` rows. All methods
flush only — the caller (router or Celery task session context) commits,
matching the repo-wide convention.
"""
import uuid
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FeedSyncConfig, FeedSyncLog

# Fields the Admin may set via PUT /feed-sync/config. scheduler_enabled is
# deliberately absent — the toggle endpoint owns it (D19).
_CONFIG_FIELDS = {
    "endpoint_url",
    "auth_type",
    "auth_header_name",
    "auth_token",
    "sync_day_of_week",
}


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
        """Return the in-progress run, if any (overlap guard)."""
        result = await self.db.execute(
            select(FeedSyncLog)
            .where(FeedSyncLog.status == "running")
            .order_by(FeedSyncLog.started_at.desc())
            .limit(1)
        )
        return result.scalars().first()

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
