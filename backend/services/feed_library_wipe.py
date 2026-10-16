"""Empty the standard feed library: `feeds` and its `feed_translations`.

Shared by the admin endpoint `DELETE /v1/admin/feeds` and
`scripts_2/db_reset.py --feeds-only`. Master data (feed types, categories,
their vocabulary translations), custom feeds, users, reports and the CLIMDES
sync settings/history are not touched.

Works on an AsyncSession or an AsyncConnection; the caller owns the
transaction and must roll back if `wipe_feed_library` raises.
"""
from typing import Dict, Sequence, Set

from sqlalchemy import text

# Children first. feed_translations would also go through its ON DELETE
# CASCADE, but deleting it explicitly reports its row count. Never
# TRUNCATE ... CASCADE: it would follow feeds' references to other tables.
FEED_LIBRARY_TABLES = ("feed_translations", "feeds")

BACKUP_PREFIX = "pre_feed_wipe_"
CONFIRM_PHRASE = "DELETE ALL FEEDS"


class FeedWipeAbort(Exception):
    """Another table changed during the wipe; the caller must roll back."""


async def public_tables(conn) -> Set[str]:
    result = await conn.execute(
        text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    )
    return {row[0] for row in result}


async def _counts(conn, tables: Sequence[str]) -> Dict[str, int]:
    return {
        t: (await conn.execute(text(f'SELECT count(*) FROM "{t}"'))).scalar_one()
        for t in tables
    }


async def count_feed_library(conn) -> Dict[str, int]:
    """Rows a wipe would delete, per table."""
    return await _counts(conn, FEED_LIBRARY_TABLES)


async def wipe_feed_library(conn) -> Dict[str, int]:
    """Delete every feed and feed translation; return rows deleted per table.

    Every other table must keep its row count. If one changes (an unexpected
    cascade, or a writer racing the wipe) FeedWipeAbort is raised and the
    caller's rollback undoes the whole wipe.
    """
    others = sorted(await public_tables(conn) - set(FEED_LIBRARY_TABLES))
    before = await _counts(conn, others)
    deleted = {}
    for table in FEED_LIBRARY_TABLES:
        result = await conn.execute(text(f'DELETE FROM "{table}"'))
        deleted[table] = result.rowcount
    after = await _counts(conn, others)
    changed = [t for t in others if before[t] != after[t]]
    if changed:
        raise FeedWipeAbort(
            f"Row count of other table(s) changed ({', '.join(changed)}); rolled back, nothing deleted."
        )
    return deleted
