"""
Celery application for RationSmart v4.0.

Tasks:
    sync_feed_library (services/feed_sync_tasks.py) — CLIMDES feed-library
    sync; fired daily at 00:00 by Beat, gated by the Admin-controlled
    scheduler flag + sync day inside the task (plan v2 D20 — the weekday is
    deliberately NOT in the crontab, so changing it needs no Beat restart).

Worker start:
    celery -A app.celery_app worker --loglevel=info --concurrency=4
Beat start:
    celery -A app.celery_app beat --loglevel=info
"""
from celery import Celery
from celery.schedules import crontab

from app.config import settings

celery_app = Celery(
    "rationsmart",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["services.feed_sync_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_expires=3600,
    task_track_started=True,
)

celery_app.conf.beat_schedule = {
    "feed-library-daily-tick": {
        "task": "sync_feed_library",
        "schedule": crontab(hour=0, minute=0),  # daily; day-of-week gate is in the task
        "kwargs": {"force": False},
    },
}
