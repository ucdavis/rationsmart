"""
Celery application for RationSmart v4.0.

Handles PDF generation and S3 upload asynchronously so the API response
returns immediately after optimization completes.

Worker start:
    celery -A app.celery_app worker --loglevel=info --concurrency=4
"""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "rationsmart",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_expires=3600,
    task_track_started=True,
)
