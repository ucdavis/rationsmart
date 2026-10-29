"""Export the data a new RationSmart database needs (master data, feeds, users)
as one SQL file plus a manifest, for loading into an empty database built with
`alembic upgrade head` (the Azure move).

Run inside the API container, from the folder holding docker-compose.yml:

    docker compose exec -T api python -m scripts_2.export_master_data \\
        --commit "$(git -C ~/rationsmart rev-parse HEAD)"

Read-only on the source database. Writes <out-dir>/master_data_<stamp>/ with
rationsmart_master_data_<stamp>.sql and manifest.txt (folder 0700, files 0600,
owned like <out-dir>), and appends one line to db_reset.log there.

Flow: database revision must equal the code's Alembic head → every public table
must be in INCLUDE or EXCLUDE → one REPEATABLE READ snapshot for the row counts
and `pg_dump --data-only --snapshot` → the dump is wrapped in a guarded
transaction (see preamble()) → self-check → SHA-256 → manifest.

The file holds personal data (users) and the CLIMDES token: encrypt it before
it leaves the operator's machine. Plan and hand-over steps:
docs/dev_docs/azure_migration/v1_Master_Data_Export_Plan.md.
"""
import argparse
import hashlib
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.exc import DBAPIError

from app.config import settings
from services.db_backup import LOCK_WAIT_TIMEOUT, _pg_conn_args, _pg_env, append_log

_BACKEND = Path(__file__).resolve().parents[1]

# Copied, in FK order (pg_dump orders the data itself; this order is for people).
INCLUDE: Tuple[str, ...] = (
    "country", "languages", "country_languages",
    "feed_types", "feed_categories", "vocabulary_translations",
    "user_information", "feeds", "feed_translations", "custom_feeds",
    "feed_sync_config",
)

# Not copied. alembic_version is written by `upgrade head` on the target.
EXCLUDE = frozenset({"reports", "user_feedback", "feed_sync_log", "alembic_version"})

# Rows the migrations insert themselves; the load deletes them before inserting
# the source's rows. Order matters: nothing references feed_sync_config, and
# every table referencing languages is still empty at that point.
SEEDED: Tuple[str, ...] = ("feed_sync_config", "languages")

FILE_PREFIX = "rationsmart_master_data_"
DUMP_TIMEOUT_SECONDS = 10 * 60


class ExportAbort(Exception):
    """Stops the run before anything is written; the message is shown as-is."""


# ── Pure helpers ──────────────────────────────────────────────────────────────

def check_tables(existing: Set[str]) -> None:
    """Every public table must be classified, and every listed one must exist."""
    unknown = sorted(existing - set(INCLUDE) - EXCLUDE)
    if unknown:
        raise ExportAbort(
            "Unclassified table(s): " + ", ".join(unknown)
            + ". Add each to INCLUDE or EXCLUDE in scripts_2/export_master_data.py first."
        )
    missing = sorted((set(INCLUDE) | EXCLUDE) - existing)
    if missing:
        raise ExportAbort("Table(s) not found in the database: " + ", ".join(missing))


def guarded_tables() -> List[str]:
    """Tables that must be empty on the target (all but the seeded ones)."""
    return sorted((set(INCLUDE) | EXCLUDE) - set(SEEDED) - {"alembic_version"})


def preamble(revision: str, commit: str, stamp: str) -> str:
    exists = "\n     OR ".join(f"EXISTS (SELECT 1 FROM public.{t})" for t in guarded_tables())
    deletes = "\n".join(f"DELETE FROM public.{t};" for t in SEEDED)
    return f"""-- RationSmart data export {stamp} · commit {commit} · revision {revision}
-- Load into an EMPTY database built with `alembic upgrade head` at revision {revision}:
--   psql "<connection>" -v ON_ERROR_STOP=1 < this_file.sql
-- Contains personal data (users) and the CLIMDES token.
\\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.alembic_version WHERE version_num = '{revision}') THEN
    RAISE EXCEPTION 'load refused: schema revision is not {revision}';
  END IF;
  IF {exists} THEN
    RAISE EXCEPTION 'load refused: database already has users or data';
  END IF;
END $$;
-- Rows the migrations seeded; the source's rows follow.
{deletes}

-- ── pg_dump --data-only ──
"""


def postamble() -> str:
    return """
-- ── after the data ──
UPDATE public.feed_sync_config SET scheduler_enabled = false;
COMMIT;
"""


def check_dump(sql: str) -> List[str]:
    """Problems in the finished file: one COPY per included table, none for
    excluded ones, and the guarded transaction around it."""
    problems = []
    copied = re.findall(r"^COPY public\.(\w+) ", sql, flags=re.MULTILINE)
    for table in INCLUDE:
        n = copied.count(table)
        if n != 1:
            problems.append(f"{table}: {n} COPY block(s), expected 1")
    for table in sorted(set(copied) - set(INCLUDE)):
        problems.append(f"{table}: copied but not in INCLUDE")
    if "load refused: database already has users or data" not in sql:
        problems.append("guard missing")
    if not sql.rstrip().endswith("COMMIT;"):
        problems.append("file does not end with COMMIT;")
    return problems


def manifest_text(
    stamp: str, commit: str, revision: str, pg_dump_version: str,
    sql_name: str, sha256: str, counts: Dict[str, int],
) -> str:
    width = max(len(t) for t in counts)
    rows = "\n".join(f"  {t:<{width}}  {n:>7}" for t, n in counts.items())
    return (
        f"export_utc:        {stamp}\n"
        f"source:            {settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}\n"
        f"git_commit:        {commit}\n"
        f"alembic_revision:  {revision}\n"
        f"pg_dump:           {pg_dump_version}\n"
        f"file:              {sql_name}\n"
        f"sha256:            {sha256}\n"
        f"rows:\n{rows}\n"
        f"total_rows:        {sum(counts.values())}\n"
        f"excluded:          {', '.join(sorted(EXCLUDE))}\n"
        "load_with:         psql 15.14 or newer (the file uses \\restrict), -v ON_ERROR_STOP=1\n"
        "contains:          personal data (users) + CLIMDES token; encrypt before it leaves this machine\n"
    )


def code_head() -> str:
    return ScriptDirectory.from_config(Config(str(_BACKEND / "alembic.ini"))).get_current_head()


# ── Database + pg_dump ────────────────────────────────────────────────────────

def read_snapshot(conn: Connection) -> Tuple[str, str]:
    """(snapshot id, revision) inside the caller's REPEATABLE READ transaction;
    the snapshot is exported first so pg_dump sees the same data."""
    snapshot = conn.execute(text("SELECT pg_export_snapshot()")).scalar_one()
    revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    return snapshot, revision


def read_counts(conn: Connection) -> Dict[str, int]:
    """Classify every table, then count the included ones (same transaction).
    Runs after the revision check: a database behind the code may lack a new
    table, and "deploy first" is the useful message then."""
    tables = {r[0] for r in conn.execute(text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'"))}
    check_tables(tables)
    return {t: conn.execute(text(f'SELECT count(*) FROM public."{t}"')).scalar_one() for t in INCLUDE}


def run_pg_dump(snapshot: str) -> bytes:
    cmd = ["pg_dump", "--data-only", f"--snapshot={snapshot}",
           f"--lock-wait-timeout={LOCK_WAIT_TIMEOUT}", *_pg_conn_args()]
    for table in INCLUDE:
        cmd += ["-t", f"public.{table}"]
    try:
        dump = subprocess.run(cmd, env=_pg_env(), capture_output=True, timeout=DUMP_TIMEOUT_SECONDS)
    except FileNotFoundError:
        raise ExportAbort("pg_dump is not installed here; run inside the api container.")
    except subprocess.TimeoutExpired:
        raise ExportAbort(f"pg_dump timed out after {DUMP_TIMEOUT_SECONDS // 60} minutes.")
    if dump.returncode != 0:
        raise ExportAbort("pg_dump failed:\n" + dump.stderr.decode(errors="replace").strip())
    return dump.stdout


def pg_dump_version() -> str:
    # "pg_dump (PostgreSQL) 15.19 (Debian 15.19-1.pgdg13+2)" → "15.19"
    out = subprocess.run(["pg_dump", "--version"], capture_output=True, text=True).stdout
    match = re.search(r"\d+(?:\.\d+)+", out)
    return match.group(0) if match else "unknown"


# ── Files ─────────────────────────────────────────────────────────────────────

def _write_private(path: Path, data: bytes, owner: Tuple[int, int]) -> None:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as fh:
        fh.write(data)
    os.chmod(path, 0o600)
    os.chown(path, *owner)


def check_out_dir(out_dir: Path) -> None:
    if not out_dir.is_dir():
        raise ExportAbort(
            f"Output folder {out_dir} does not exist. On the server it is "
            "~/rationsmart/backups, mounted into the api container as /backups."
        )


def write_export(out_dir: Path, stamp_tag: str, sql: bytes, manifest_for) -> Tuple[Path, Path, str]:
    """Write the folder; `manifest_for(sql_name, sha256)` returns the manifest text.
    Owner = owner of out_dir (the host user behind the /backups mount)."""
    check_out_dir(out_dir)
    st = out_dir.stat()
    owner = (st.st_uid, st.st_gid)
    folder = out_dir / f"master_data_{stamp_tag}"
    folder.mkdir(mode=0o700)
    os.chmod(folder, 0o700)
    os.chown(folder, *owner)

    sql_path = folder / f"{FILE_PREFIX}{stamp_tag}.sql"
    partial = sql_path.with_name(sql_path.name + ".partial")
    _write_private(partial, sql, owner)
    sha256 = hashlib.sha256(sql).hexdigest()
    partial.rename(sql_path)
    _write_private(folder / "manifest.txt", manifest_for(sql_path.name, sha256).encode(), owner)
    return folder, sql_path, sha256


# ── Orchestration ─────────────────────────────────────────────────────────────

def run(args, engine: Engine, dump=run_pg_dump, now=None) -> int:
    started = now or datetime.now(timezone.utc)
    stamp = started.isoformat(timespec="seconds").replace("+00:00", "Z")
    stamp_tag = started.strftime("%Y%m%d_%H%M%S")
    check_out_dir(Path(args.out_dir))  # before touching the database
    head = code_head()
    print(f"Database: {settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}")

    # One read-only transaction (autobegun, rolled back on close); the exported
    # snapshot lives as long as it does, so pg_dump runs inside the block.
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as conn:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        snapshot, revision = read_snapshot(conn)
        if revision != head:
            raise ExportAbort(
                f"Database is at revision {revision}, the code at {head}. "
                "Deploy so both match, then export."
            )
        counts = read_counts(conn)
        body = dump(snapshot)

    sql = preamble(revision, args.commit, stamp).encode() + body + postamble().encode()
    problems = check_dump(sql.decode("utf-8"))
    if problems:
        raise ExportAbort("The dump failed its self-check:\n  " + "\n  ".join(problems))

    version = pg_dump_version()
    folder, sql_path, sha256 = write_export(
        Path(args.out_dir), stamp_tag, sql,
        lambda name, digest: manifest_text(stamp, args.commit, revision, version, name, digest, counts),
    )

    total = sum(counts.values())
    width = max(len(t) for t in counts)
    print("\nRows exported:")
    for table, n in counts.items():
        print(f"  {table:<{width}}  {n:>7}")
    print(f"  {'total':<{width}}  {total:>7}")
    append_log(Path(args.out_dir),
               f"{stamp}\texport_master_data\t{folder.name}\trows={total}\tsha256={sha256}")
    print(f"\nWritten: {sql_path}\n         {folder / 'manifest.txt'}")
    print(f"SHA-256: {sha256}")
    print("\nPersonal data inside. Next (from the Mac), then delete the server copy:")
    print(f"  scp -r <user>@<server>:~/rationsmart/backups/{folder.name} ~/azure_handover/")
    return 0


def parse_args(argv: Optional[Sequence[str]] = None):
    parser = argparse.ArgumentParser(
        prog="python -m scripts_2.export_master_data",
        description="Export master data, feeds, users and sync config as one SQL file + manifest (read-only).",
    )
    parser.add_argument("--commit", required=True,
                        help='git commit the server runs: "$(git -C ~/rationsmart rev-parse HEAD)"')
    parser.add_argument("--out-dir", default="/backups", help="where the export folder goes (default: /backups)")
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[0-9a-f]{7,40}", args.commit):
        parser.error("argument --commit: expected a git commit hash (7-40 hex characters)")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    engine = create_engine(settings.database_url, pool_size=1, max_overflow=0)
    try:
        return run(args, engine)
    except ExportAbort as exc:
        print(f"\nStopped: {exc}", file=sys.stderr)
        return 1
    except DBAPIError as exc:
        print(f"\nStopped by a database error; nothing was written:\n{exc.orig}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 2
    finally:
        engine.dispose()


if __name__ == "__main__":
    sys.exit(main())
