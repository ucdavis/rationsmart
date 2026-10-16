"""Celery task for the CLIMDES feed-library sync (plan v2 §9.6, D23).

This is the first registered Celery task in the codebase (the legacy
`send_task("generate_pdf_report")` dispatch has no implementation). The worker
is synchronous, so the task bridges into the async service via `asyncio.run`,
opening its own session — `Depends(get_db)` does not exist here.

Each run gets its own engine (`create_task_engine`, no pool) and disposes of it
before its event loop closes. The app's shared pooled engine must not be used
here: a pooled asyncpg connection belongs to the loop that opened it, so the
second run in the same worker process failed with "Event loop is closed" and
left its log row 'running' (Test, 2026-10-16).

Retry policy (D23): only FETCH failures (endpoint unreachable / non-200 /
non-Excel payload) are retried — max 3 attempts, exponential backoff
(60s, 120s, 240s), all within the same day. Retries reuse the original run's
log row via log_id, so one run keeps one log whose final status is the last
attempt's outcome. Content/row problems are never retried.
"""
import asyncio
import logging

from celery.exceptions import MaxRetriesExceededError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.celery_app import celery_app
from app.db.session import create_task_engine
from services import feed_sync_service

logger = logging.getLogger(__name__)

RETRY_MAX = 3
RETRY_BACKOFF_SECONDS = 60


async def _run_async(force, log_id, triggered_by):
    engine = create_task_engine()
    sessions = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    try:
        try:
            async with sessions() as db:
                return await feed_sync_service.sync_feed_library(
                    db, force=force, log_id=log_id, triggered_by=triggered_by
                )
        except Exception as exc:
            if log_id is not None:
                # A manual run's row is created by the API before dispatch; if the
                # run failed before the service could close it, close it here
                # (a no-op when the service already did).
                async with sessions() as db:
                    await feed_sync_service.close_crashed_run(db, log_id, exc)
            raise
    finally:
        await engine.dispose()


def _execute(force, log_id, triggered_by):
    """Fresh event loop per run — safe and simple for a weekly job."""
    return asyncio.run(_run_async(force, log_id, triggered_by))


def _task_body(task, force, log_id, triggered_by):
    result = _execute(force, log_id, triggered_by)

    if result.get("status") == "failed" and result.get("retryable"):
        countdown = RETRY_BACKOFF_SECONDS * (2 ** task.request.retries)
        try:
            raise task.retry(
                countdown=countdown,
                kwargs={
                    "force": force,
                    "log_id": result.get("log_id"),  # reuse the same log row
                    "triggered_by": triggered_by,
                },
            )
        except MaxRetriesExceededError:
            logger.error(
                "Feed sync fetch failed after %s retries — giving up until "
                "the next scheduled day (log %s)", RETRY_MAX, result.get("log_id"),
            )
            return result
    return result


@celery_app.task(name="sync_feed_library", bind=True, max_retries=RETRY_MAX)
def sync_feed_library_task(self, force=False, log_id=None, triggered_by=None):
    return _task_body(self, force, log_id, triggered_by)
