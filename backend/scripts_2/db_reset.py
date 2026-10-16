"""Reset the RationSmart database for a fresh QA round (admin only).

Deletes users, reports, feedback, custom feeds, the feed library and the
legacy feed tables; keeps master data (taxonomy, countries, languages,
translations of types/categories, CLIMDES sync settings, migration head).
The admin who runs it is the only account left.

Run inside the API container, from the folder holding docker-compose.yml:

    docker compose exec api python -m scripts_2.db_reset              # dry run
    docker compose exec api python -m scripts_2.db_reset --execute    # delete
    docker compose exec api python -m scripts_2.db_reset --feeds-only --execute

--feeds-only deletes only the feed library (feeds and feed_translations);
users, custom feeds, reports and master data stay. Admins get the same wipe
as DELETE /v1/admin/feeds (services/feed_library_wipe.py).

Flow: email + 6-digit PIN of an active admin → row counts → (with --execute) typed
confirmation of the database → pg_dump to --backup-dir, verified with
pg_restore --list → all deletes in one transaction (rolled back if any kept
table changes) → feeds:* keys cleared in Redis → one line appended to
db_reset.log in the backup folder.

The PIN check stops accidental runs; it is not a security boundary (anyone
with server access can reach the database directly). Design notes:
docs/dev_docs/database_info/database_info.md, section 3.5.
"""
import argparse
import asyncio
import getpass
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Set, Tuple

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.config import settings
from services import db_backup, feed_library_wipe
from services.auth_service import is_legacy_hash, verify_bcrypt_pin
from services.db_backup import LOG_NAME, append_log, restore_command

# Master data, never touched. system_metadata is v3's feed-cache flag: kept
# while v3 code still reads it (unused-tables decision, section 3.4).
KEEP_TABLES = frozenset({
    "alembic_version", "breeds", "country", "country_languages",
    "feed_categories", "feed_sync_config", "feed_types", "languages",
    "system_metadata", "vocabulary_translations",
})

# Emptied in this order. reports goes before user_information because
# reports.user_id is NO ACTION; never TRUNCATE ... CASCADE, which would follow
# feeds.created_by / feed_sync_config.scheduler_toggled_by and empty those too.
WIPE_ORDER: Tuple[str, ...] = (
    "user_feedback", "reports", "diet_reports", "feed_analytics",
    "custom_feeds", "feed_sync_log",
    "feed_translations", "feeds",
    "feed_country_pricing", "feed_country_availability", "master_feeds",
    "feeds_dup",
    "user_information",
)

FEED_TABLES = frozenset(feed_library_wipe.FEED_LIBRARY_TABLES)

BACKUP_PREFIX = "pre_db_reset_"


class ResetAbort(Exception):
    """Stops the run before anything is deleted; the message is shown as-is."""


# ── Pure helpers ──────────────────────────────────────────────────────────────

def plan_tables(existing: Set[str], keep_feeds: bool) -> Tuple[List[str], List[str]]:
    """(tables to empty, in order; listed tables that no longer exist).

    A table in neither list stops the run, so a new table gets a deliberate
    keep-or-wipe decision. A listed table that is gone (dropped by the
    unused-tables task) is reported and skipped.
    """
    unknown = sorted(existing - KEEP_TABLES - set(WIPE_ORDER))
    if unknown:
        raise ResetAbort(
            "Unclassified table(s): " + ", ".join(unknown)
            + ". Add each to KEEP_TABLES or WIPE_ORDER in scripts_2/db_reset.py first."
        )
    wanted = [t for t in WIPE_ORDER if not (keep_feeds and t in FEED_TABLES)]
    return (
        [t for t in wanted if t in existing],
        [t for t in wanted if t not in existing],
    )


def plan_feed_library(existing: Set[str]) -> List[str]:
    """Tables --feeds-only empties, in order. No unclassified-table check here:
    the wipe itself refuses to change any other table."""
    missing = [t for t in feed_library_wipe.FEED_LIBRARY_TABLES if t not in existing]
    if missing:
        raise ResetAbort("Feed library table(s) not found: " + ", ".join(missing))
    return list(feed_library_wipe.FEED_LIBRARY_TABLES)


def user_filter(keep_admins: bool) -> str:
    """WHERE clause for the users to delete; :operator_id is always kept."""
    clause = "id <> :operator_id"
    if keep_admins:
        clause += " AND is_admin IS NOT TRUE"
    return clause


def database_label() -> str:
    return f"{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"


# ── Database steps ────────────────────────────────────────────────────────────

async def existing_tables(conn: AsyncConnection) -> Set[str]:
    result = await conn.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    )
    return {row[0] for row in result}


async def authenticate(conn: AsyncConnection, email: str, pin: str):
    """Return (id, email_id) of an active admin, or raise ResetAbort.

    One message for an unknown email or wrong PIN, as the login endpoint does.
    Only bcrypt (6-digit) PINs are accepted: an old 4-digit SHA-256 PIN is too
    weak to gate a wipe, so that account must migrate its PIN in the app first.
    """
    result = await conn.execute(
        text(
            "SELECT id, email_id, pin_hash, is_admin, is_active "
            "FROM user_information WHERE lower(email_id) = lower(:email)"
        ),
        {"email": email.strip()},
    )
    row = result.first()
    if row is not None and row.pin_hash and is_legacy_hash(row.pin_hash):
        raise ResetAbort(
            "This account still has an old 4-digit PIN. Sign in to the app once "
            "to set a 6-digit PIN, then run this script again."
        )
    if row is None or not row.pin_hash or not verify_bcrypt_pin(pin, row.pin_hash):
        raise ResetAbort("Email or PIN is not correct.")
    if not row.is_admin or not row.is_active:
        raise ResetAbort("Only an active RationSmart admin can run this script.")
    return row.id, row.email_id


async def count_rows(
    conn: AsyncConnection, tables: Sequence[str], operator_id, keep_admins: bool,
) -> Dict[str, int]:
    """Rows each table would lose (user_information: only the deleted users)."""
    counts = {}
    for table in tables:
        if table == "user_information":
            sql = f"SELECT count(*) FROM user_information WHERE {user_filter(keep_admins)}"
            params = {"operator_id": operator_id}
        else:
            sql, params = f'SELECT count(*) FROM "{table}"', {}
        counts[table] = (await conn.execute(text(sql), params)).scalar_one()
    return counts


async def table_counts(conn: AsyncConnection, tables: Sequence[str]) -> Dict[str, int]:
    return {
        t: (await conn.execute(text(f'SELECT count(*) FROM "{t}"'))).scalar_one()
        for t in sorted(tables)
    }


async def delete_rows(
    conn: AsyncConnection, tables: Sequence[str], operator_id, keep_admins: bool,
) -> Dict[str, int]:
    deleted = {}
    for table in tables:
        if table == "user_information":
            result = await conn.execute(
                text(f"DELETE FROM user_information WHERE {user_filter(keep_admins)}"),
                {"operator_id": operator_id},
            )
        else:
            result = await conn.execute(text(f'DELETE FROM "{table}"'))
        deleted[table] = result.rowcount
    return deleted


# ── Backup, cache, log ────────────────────────────────────────────────────────

def backup_database(backup_dir: Path, prefix: str = BACKUP_PREFIX) -> Path:
    """pg_dump into backup_dir and prove it reads back (services/db_backup.py). Raises ResetAbort."""
    try:
        return db_backup.backup_database(backup_dir, prefix)
    except db_backup.BackupError as exc:
        raise ResetAbort(str(exc))


async def clear_feed_cache() -> int:
    """Delete only the feeds:* keys (Redis may be shared; never flush)."""
    import redis.asyncio as aioredis

    client = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        keys = [k async for k in client.scan_iter(match="feeds:*")]
        if keys:
            await client.delete(*keys)
        return len(keys)
    finally:
        await client.aclose()


# ── Orchestration ─────────────────────────────────────────────────────────────

def _print_counts(title: str, counts: Dict[str, int]) -> None:
    print(f"\n{title}")
    width = max((len(t) for t in counts), default=10)
    for table, n in counts.items():
        print(f"  {table:<{width}}  {n:>7}")


async def _reset_rows(conn: AsyncConnection, tables: Sequence[str], operator_id, keep_admins: bool) -> Dict[str, int]:
    # Guards against rows vanishing from master tables (e.g. an unexpected
    # CASCADE). Values in kept rows may change by design: ON DELETE SET NULL
    # clears feed_sync_config.scheduler_toggled_by (and, with --keep-feeds,
    # feeds.created_by) when they point at a deleted user.
    kept = sorted(KEEP_TABLES & await existing_tables(conn))
    before = await table_counts(conn, kept)
    deleted = await delete_rows(conn, tables, operator_id, keep_admins)
    after = await table_counts(conn, kept)
    if before != after:
        changed = [t for t in before if before[t] != after[t]]
        raise ResetAbort(
            f"Row count of kept table(s) changed ({', '.join(changed)}); rolled back, nothing deleted."
        )
    return deleted


async def _wipe_feed_library(conn: AsyncConnection) -> Dict[str, int]:
    # Every table but the two feed-library ones must keep its row count.
    try:
        return await feed_library_wipe.wipe_feed_library(conn)
    except feed_library_wipe.FeedWipeAbort as exc:
        raise ResetAbort(str(exc))


async def run(
    args, engine: AsyncEngine, ask=input, ask_secret=getpass.getpass,
    outcome: Optional[Dict[str, Path]] = None,
) -> int:
    """`outcome["backup"]` is set the moment the deletes commit, so main() can
    report an interruption after that point truthfully."""
    label = database_label()
    print(f"Database: {label}")
    email = args.email or ask("Admin email: ")
    pin = ask_secret("PIN: ")

    async with engine.connect() as conn:  # read-only; rolled back on close
        operator_id, operator_email = await authenticate(conn, email, pin)
        print(f"Authenticated as {operator_email}; this account is kept.")
        if args.feeds_only:
            tables = plan_feed_library(await existing_tables(conn))
            print("--feeds-only: only the feed library and its translations go;"
                  " users, custom feeds, reports and master data stay.")
        else:
            tables, missing = plan_tables(await existing_tables(conn), args.keep_feeds)
            if missing:
                print("Already gone, skipped: " + ", ".join(missing))
        if args.keep_feeds:
            print("--keep-feeds: the feed library and its translations stay.")
        if args.keep_admins:
            print("--keep-admins: every admin account stays.")
        _print_counts("Rows to delete:", await count_rows(conn, tables, operator_id, args.keep_admins))

    if not args.execute:
        print("\nDry run: nothing deleted. Add --execute to reset.")
        return 0

    typed = ask(f"\nThis permanently deletes the rows above from {label}.\nType '{label}' to continue: ")
    if typed.strip() != label:
        print("Not confirmed; nothing deleted.")
        return 2

    backup_dir = Path(args.backup_dir)
    print("Backing up ...")
    backup = backup_database(
        backup_dir, feed_library_wipe.BACKUP_PREFIX if args.feeds_only else BACKUP_PREFIX,
    )
    print(f"Backup written and verified: {backup}")

    async with engine.begin() as conn:  # one transaction: commits on exit, rolls back on any error
        if args.feeds_only:
            deleted = await _wipe_feed_library(conn)
        else:
            deleted = await _reset_rows(conn, tables, operator_id, args.keep_admins)
    if outcome is not None:
        outcome["backup"] = backup
    _print_counts("Deleted:", deleted)

    try:
        cleared = await clear_feed_cache()
        print(f"\nRedis: cleared {cleared} feeds:* key(s).")
    except Exception as exc:  # the reset itself is committed; the cache expires in 5 min
        print(f"\nRedis: could not clear feeds:* keys ({exc}); they expire within 5 minutes.")

    stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
    summary = ", ".join(f"{t}={n}" for t, n in deleted.items())
    append_log(backup_dir, f"{stamp}\t{operator_email}\t{label}\t{backup.name}\t{summary}")
    print(f"\nDone. To undo, from the folder holding docker-compose.yml:\n  {restore_command(backup)}")
    return 0


def parse_args(argv: Optional[Sequence[str]] = None):
    parser = argparse.ArgumentParser(
        prog="python -m scripts_2.db_reset",
        description="Reset the RationSmart database for a QA round (admin only). Dry run unless --execute.",
    )
    parser.add_argument("--execute", action="store_true", help="back up, then delete (default: dry run)")
    parser.add_argument("--feeds-only", action="store_true",
                        help="delete only the feed library (feeds, feed_translations); everything else stays")
    parser.add_argument("--keep-feeds", action="store_true", help="keep the feed library and its translations")
    parser.add_argument("--keep-admins", action="store_true", help="keep every admin account, not just yours")
    parser.add_argument("--email", help="admin email (prompted if omitted)")
    parser.add_argument("--backup-dir", default="/backups", help="where the pg_dump goes (default: /backups)")
    args = parser.parse_args(argv)
    # --feeds-only deletes no users and keeps nothing else to choose from, so
    # neither --keep-* flag means anything beside it. (Not an argparse
    # mutually exclusive group: that would also refuse --keep-feeds --keep-admins.)
    for flag in ("keep_feeds", "keep_admins"):
        if args.feeds_only and getattr(args, flag):
            parser.error(f"argument --{flag.replace('_', '-')}: not allowed with argument --feeds-only")
    return args


async def _main(args, outcome: Dict[str, Path]) -> int:
    url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(url, pool_size=1, max_overflow=0)
    try:
        return await run(args, engine, outcome=outcome)
    finally:
        await engine.dispose()


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    outcome: Dict[str, Path] = {}
    try:
        return asyncio.run(_main(args, outcome))
    except ResetAbort as exc:
        print(f"\nStopped: {exc}", file=sys.stderr)
        return 1
    except DBAPIError as exc:
        # Before the transaction nothing was written; inside it, it rolled back.
        print(f"\nStopped by a database error; nothing was deleted:\n{exc.orig}", file=sys.stderr)
        return 1
    except (KeyboardInterrupt, EOFError):
        backup = outcome.get("backup")
        if backup is None:
            print("\nCancelled; nothing deleted.", file=sys.stderr)
        else:
            print("\nCancelled after the reset was committed: the rows ARE deleted.", file=sys.stderr)
            print(f"Backup: {backup}", file=sys.stderr)
            print(f"To undo: {restore_command(backup)}", file=sys.stderr)
            print(f"The line in {LOG_NAME} and the Redis clean-up may be missing.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
