"""pg_dump backups taken before a destructive clean-up, plus the audit log.

Shared by scripts_2/db_reset.py and the admin feed-library wipe endpoint, so
both back up, verify and log the same way. Needs pg_dump/pg_restore 15 on the
PATH (the api image carries postgresql-client-15) and a backup folder; on the
server that is ~/rationsmart/backups, mounted into the api container as /backups.
"""
import os
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

from app.config import settings

LOG_NAME = "db_reset.log"

# Backup limits: a hung connection or a lock held by another session must stop
# the run with a message, not leave it waiting forever. Test's dump takes seconds.
CONNECT_TIMEOUT_SECONDS = 30
LOCK_WAIT_TIMEOUT = "60s"
DUMP_TIMEOUT_SECONDS = 30 * 60
VERIFY_TIMEOUT_SECONDS = 5 * 60


class BackupError(Exception):
    """The backup could not be taken or read back; the message is shown as-is."""


def _pg_env() -> Dict[str, str]:
    return {
        **os.environ,
        "PGPASSWORD": settings.postgres_password,
        "PGCONNECT_TIMEOUT": str(CONNECT_TIMEOUT_SECONDS),
    }


def _pg_conn_args() -> List[str]:
    return [
        "-h", settings.postgres_host, "-p", str(settings.postgres_port),
        "-U", settings.postgres_user, "-d", settings.postgres_db,
    ]


def backup_database(backup_dir: Path, prefix: str) -> Path:
    """pg_dump -Fc into backup_dir, then prove it reads back. Raises BackupError."""
    if not backup_dir.is_dir():
        raise BackupError(
            f"Backup folder {backup_dir} does not exist. On the server it is "
            "~/rationsmart/backups, mounted into the api container by docker-compose.yml."
        )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = backup_dir / f"{prefix}{stamp}.dump"
    try:
        dump = subprocess.run(
            ["pg_dump", "-Fc", f"--lock-wait-timeout={LOCK_WAIT_TIMEOUT}",
             *_pg_conn_args(), "-f", str(path)],
            env=_pg_env(), capture_output=True, text=True, timeout=DUMP_TIMEOUT_SECONDS,
        )
    except FileNotFoundError:
        raise BackupError("pg_dump is not installed in this container; rebuild the image.")
    except subprocess.TimeoutExpired:
        raise BackupError(f"Backup timed out after {DUMP_TIMEOUT_SECONDS // 60} minutes, nothing deleted.")
    if dump.returncode != 0:
        raise BackupError(f"Backup failed, nothing deleted:\n{dump.stderr.strip()}")
    if not path.is_file() or path.stat().st_size == 0:
        raise BackupError(f"Backup {path} is missing or empty, nothing deleted.")
    try:
        check = subprocess.run(
            ["pg_restore", "--list", str(path)],
            capture_output=True, text=True, timeout=VERIFY_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        raise BackupError(f"Checking backup {path} timed out, nothing deleted.")
    if check.returncode != 0:
        raise BackupError(f"Backup {path} cannot be read back, nothing deleted:\n{check.stderr.strip()}")
    return path


def append_log(backup_dir: Path, line: str) -> None:
    with open(backup_dir / LOG_NAME, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def restore_command(backup: Path) -> str:
    return (
        "docker compose exec -T api sh -c 'PGPASSWORD=\"$POSTGRES_PASSWORD\" pg_restore "
        "--clean --if-exists --no-owner -h \"$POSTGRES_HOST\" -p \"$POSTGRES_PORT\" "
        f"-U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" {backup}'"
    )
