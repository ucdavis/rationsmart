"""Celery task for the CLIMDES feed-library sync (plan v2 §9.6, D23).

This is the first registered Celery task in the codebase (the legacy
`send_task("generate_pdf_report")` dispatch has no implementation). The worker
is synchronous, so the task bridges into the async service via `asyncio.run`,
opening its own `AsyncSessionLocal` session — `Depends(get_db)` does not exist
here.

Retry policy (D23): only FETCH failures (endpoint unreachable / non-200 /
non-Excel payload) are retried — max 3 attempts, exponential backoff
(60s, 120s, 240s), all within the same day. Retries reuse the original run's
log row via log_id, so one run keeps one log whose final status is the last
attempt's outcome. Content/row problems are never retried.
"""
import asyncio
import logging

from celery.exceptions import MaxRetriesExceededError

from app.celery_app import celery_app
from app.db.session import AsyncSessionLocal
from services import feed_sync_service

logger = logging.getLogger(__name__)

RETRY_MAX = 3
RETRY_BACKOFF_SECONDS = 60


async def _run_async(force, log_id, triggered_by):
    async with AsyncSessionLocal() as db:
        return await feed_sync_service.sync_feed_library(
            db, force=force, log_id=log_id, triggered_by=triggered_by
        )


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
