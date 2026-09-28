"""
Structured JSON logging for RationSmart v4.0.

Every log line is a single JSON object ingested by CloudWatch / Azure Monitor
without any extra parsing rules.

Usage:
    from middleware.logging_config import setup_logging
    setup_logging()               # call once at startup (done in main.py lifespan)
"""
import json
import logging
import logging.handlers
import uuid
from datetime import datetime, timezone


class JSONFormatter(logging.Formatter):
    """Emit one JSON object per log record."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
            "user_id": getattr(record, "user_id", None),
            "simulation_id": getattr(record, "simulation_id", None),
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data, default=str)


def setup_logging(level: int = logging.INFO) -> None:
    """
    Replace the root-logger configuration with a single JSON stream handler.
    Safe to call multiple times (idempotent — clears existing handlers first).
    """
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    handler = logging.StreamHandler()
    handler.setFormatter(JSONFormatter())
    root.addHandler(handler)

    # Keep SQLAlchemy and uvicorn access noise at WARNING unless DEBUG requested
    if level > logging.DEBUG:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
