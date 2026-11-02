"""Apply a data pack (see data_pack_spec.py) to the configured database. Idempotent and additive.

    python -m scripts_2.load_data_pack --dry-run          # report what would change, then roll back
    python -m scripts_2.load_data_pack                    # insert what is missing
    python -m scripts_2.load_data_pack --mode update      # also refresh pack-owned columns of existing rows
    python -m scripts_2.load_data_pack --pack /packs/master/2026.11.01

Rules:
  * One transaction: any error rolls everything back. --dry-run always rolls back.
  * Refuses unless the database is at a schema revision the pack lists, and refuses while the CLIMDES
    feed sync holds its lock (the same advisory lock the sync uses).
  * Default mode only INSERTS missing rows and never changes an existing one. The single exception is
    language activation on a fresh database (no countries yet), because migrations seed every language
    inactive. `--mode update` may also overwrite the pack-owned columns in data_pack_spec.UPDATABLE
    (never is_active toggles) and activate languages; it never deactivates anything and never deletes.
  * Rows that cannot be loaded (unknown reference, a feed name already used by another feed code, ...) are
    reported and skipped; they do not abort the load.
  * country_languages links are added only for countries created by this run (or in update mode):
    the language set of an existing country is the client's choice.
  * feed_sync_config (CLIMDES endpoint/token/schedule) is never touched.
  * After a real load the Redis feed and language caches are cleared.

All SQL below is static text: table and column names are constants (checked by _name), values travel as
parameters or through execute_values.
"""
import argparse
import re
import sys
from pathlib import Path
from typing import Iterable, List, Optional

import psycopg2
from psycopg2.extras import execute_values

from scripts_2.data_pack_spec import (
    FIELDS, NUMERIC_FEED_COLUMNS, TEXT_FEED_COLUMNS, UPDATABLE, Pack, PackError, latest_pack_dir, pack_uuid, read_pack,
)

_SQL_TYPE = {"s": "text", "b": "boolean", "i": "integer", "n": "numeric"}

# Same expression as app.db.models.feed_name_key / the unique index uq_feeds_fd_name_norm.
_KEY_F = r"lower(trim(regexp_replace(f.fd_name, '[\s ]+', ' ', 'g')))"
_KEY_S = r"lower(trim(regexp_replace(s.fd_name, '[\s ]+', ' ', 'g')))"

# Tables that carry an updated_at column that no trigger maintains.
_TOUCH = {"feed_types", "feed_categories", "vocabulary_translations", "feed_translations"}

MODES = ("insert-missing", "update")


class Refused(Exception):
    """The load must not run (wrong schema revision, sync running, ...)."""


def _name(identifier: str) -> str:
    """Identifiers come from constants in data_pack_spec; refuse anything else."""
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", identifier):
        raise ValueError(f"unexpected identifier {identifier!r}")
    return identifier


def _stage(cur, table: str, rows: List[dict], idfn=None) -> str:
    """Load pack rows into the temp table stg_<table>; returns its name. idfn(row) gives the id for new rows."""
    name = _name("stg_" + table)
    cols = [(_name(c), _SQL_TYPE[k]) for c, k in FIELDS[table]]
    if idfn:
        cols.insert(0, ("id", "uuid"))
    cur.execute("CREATE TEMP TABLE " + name + " (" + ", ".join(c + " " + t for c, t in cols) + ") ON COMMIT DROP")
    if rows:
        # ids go in as text (the staging column is uuid): psycopg2 cannot adapt a uuid.UUID unless an
        # adapter happens to be registered, which importing SQLAlchemy does only by side effect.
        data = [((str(idfn(r)),) if idfn else ()) + tuple(r[c] for c, _ in FIELDS[table]) for r in rows]
        execute_values(cur, "INSERT INTO " + name + " (" + ", ".join(c for c, _ in cols) + ") VALUES %s", data, page_size=500)
    return name


def _update_existing(cur, table: str, stg: str, join_sql: str, cols: Iterable[str]) -> int:
    """UPDATE <table> t SET <cols> FROM <stg> s WHERE <join_sql> AND the values differ. Returns rows changed.

    join_sql is a constant written in this file. Only rows whose values actually differ are written, so
    unchanged rows are not touched (no updated_at churn, no row locks)."""
    cols = [_name(c) for c in cols]
    sets = [c + " = s." + c for c in cols]
    if table in _TOUCH:
        sets.append("updated_at = now()")
    cur.execute(
        "UPDATE " + _name(table) + " t SET " + ", ".join(sets) + " FROM " + _name(stg) + " s WHERE " + join_sql
        + " AND (" + ", ".join("t." + c for c in cols) + ") IS DISTINCT FROM (" + ", ".join("s." + c for c in cols) + ")"
    )
    return cur.rowcount


def _rep(report: dict, table: str) -> dict:
    return report["tables"].setdefault(table, {"in_pack": 0, "inserted": 0, "updated": 0, "skipped": []})


def _count(cur, query: str) -> int:
    cur.execute(query)
    return cur.fetchone()[0]


def apply_pack(conn, pack: Pack, mode: str = "insert-missing", dry_run: bool = False) -> dict:
    """Apply `pack` inside the caller's open transaction and return a report. The caller commits or rolls back."""
    from repositories.feed_sync_repository import SYNC_LOCK_KEY
    from services.feed_service import stable_feed_uuid

    if mode not in MODES:
        raise ValueError(f"mode must be one of {MODES}")
    update = mode == "update"
    cur = conn.cursor()
    report: dict = {"tables": {}, "notes": [], "mode": mode, "dry_run": dry_run, "pack": pack.version}

    cur.execute("SET LOCAL lock_timeout = '15s'")
    cur.execute("SELECT pg_try_advisory_xact_lock(%s, %s)", SYNC_LOCK_KEY)
    if not cur.fetchone()[0]:
        raise Refused("the CLIMDES feed sync is running (it holds the sync lock); try again when it has finished")
    cur.execute("SELECT version_num FROM alembic_version")
    row = cur.fetchone()
    revision = row[0] if row else None
    if revision not in pack.manifest["schema_revisions"]:
        raise Refused(
            f"database schema revision is {revision}, but pack {pack.version} supports "
            f"{pack.manifest['schema_revisions']}; run `alembic upgrade head` or use a matching pack"
        )

    fresh = _count(cur, "SELECT count(*) FROM country") == 0
    rows = pack.rows

    # ── country ─────────────────────────────────────────────────────────────────
    stg = _stage(cur, "country", rows["country"], lambda r: pack_uuid("country", r["country_code"]))
    rep = _rep(report, "country")
    rep["in_pack"] = len(rows["country"])
    cur.execute(
        "SELECT s.country_code, s.name FROM stg_country s "
        "JOIN country c ON c.name = s.name AND c.country_code <> s.country_code"
    )
    rep["skipped"] += [f"{c} '{n}': that country name is already used by another country code" for c, n in cur.fetchall()]
    cur.execute(
        "INSERT INTO country (id, name, country_code, currency, is_active) "
        "SELECT s.id, s.name, s.country_code, s.currency, s.is_active FROM stg_country s "
        "WHERE NOT EXISTS (SELECT 1 FROM country c WHERE c.country_code = s.country_code OR c.name = s.name) "
        "RETURNING country_code"
    )
    new_countries = [r[0] for r in cur.fetchall()]
    rep["inserted"] = len(new_countries)
    if update:
        rep["updated"] = _update_existing(
            cur, "country", stg,
            "t.country_code = s.country_code AND NOT EXISTS (SELECT 1 FROM country o WHERE o.name = s.name AND o.id <> t.id)",
            UPDATABLE["country"],
        )
    report["countries_not_in_pack"] = _count(
        cur, "SELECT count(*) FROM country c WHERE NOT EXISTS (SELECT 1 FROM stg_country s WHERE s.country_code = c.country_code)")

    # ── languages ───────────────────────────────────────────────────────────────
    stg = _stage(cur, "languages", rows["languages"])
    rep = _rep(report, "languages")
    rep["in_pack"] = len(rows["languages"])
    cur.execute(
        "INSERT INTO languages (code, name, is_active) SELECT s.code, s.name, s.is_active FROM stg_languages s "
        "ON CONFLICT (code) DO NOTHING"
    )
    rep["inserted"] = cur.rowcount
    if fresh or update:
        # Migrations seed every language inactive; activate the ones the pack ships active. Never deactivate.
        cur.execute(
            "UPDATE languages l SET is_active = true FROM stg_languages s "
            "WHERE l.code = s.code AND s.is_active AND NOT l.is_active"
        )
        rep["updated"] += cur.rowcount
        if cur.rowcount:
            report["notes"].append(f"{cur.rowcount} language(s) activated")
    else:
        report["notes"].append("languages: existing rows left as they are (not a fresh database; --mode update activates)")
    if update:
        rep["updated"] += _update_existing(cur, "languages", stg, "t.code = s.code", UPDATABLE["languages"])

    # ── country_languages ───────────────────────────────────────────────────────
    stg = _stage(cur, "country_languages", rows["country_languages"])
    rep = _rep(report, "country_languages")
    rep["in_pack"] = len(rows["country_languages"])
    cur.execute(
        "SELECT s.country_code, s.language_code FROM stg_country_languages s "
        "LEFT JOIN country c ON c.country_code = s.country_code LEFT JOIN languages l ON l.code = s.language_code "
        "WHERE c.id IS NULL OR l.code IS NULL"
    )
    rep["skipped"] += [f"{c}/{lang}: country or language not found" for c, lang in cur.fetchall()]
    cur.execute(
        "INSERT INTO country_languages (country_id, language_code) SELECT c.id, s.language_code FROM stg_country_languages s "
        "JOIN country c ON c.country_code = s.country_code JOIN languages l ON l.code = s.language_code "
        "WHERE %s OR s.country_code = ANY(%s) ON CONFLICT DO NOTHING",
        (update, new_countries),
    )
    rep["inserted"] = cur.rowcount
    if not update:
        report["notes"].append("country_languages: links added only for countries created by this run")

    # ── feed_types ──────────────────────────────────────────────────────────────
    stg = _stage(cur, "feed_types", rows["feed_types"], lambda r: pack_uuid("feed_type", r["type_name"]))
    rep = _rep(report, "feed_types")
    rep["in_pack"] = len(rows["feed_types"])
    cur.execute(
        "INSERT INTO feed_types (id, type_name, description, sort_order, is_active) "
        "SELECT s.id, s.type_name, s.description, s.sort_order, s.is_active FROM stg_feed_types s "
        "ON CONFLICT (type_name) DO NOTHING"
    )
    rep["inserted"] = cur.rowcount
    if update:
        rep["updated"] = _update_existing(cur, "feed_types", stg, "t.type_name = s.type_name", UPDATABLE["feed_types"])

    # ── feed_categories ─────────────────────────────────────────────────────────
    stg = _stage(cur, "feed_categories", rows["feed_categories"], lambda r: pack_uuid("feed_category", r["category_name"]))
    rep = _rep(report, "feed_categories")
    rep["in_pack"] = len(rows["feed_categories"])
    cur.execute(
        "SELECT s.category_name, s.feed_type_name, (c.id IS NOT NULL AND t.id IS NOT NULL AND c.feed_type_id <> t.id) "
        "FROM stg_feed_categories s LEFT JOIN feed_types t ON t.type_name = s.feed_type_name "
        "LEFT JOIN feed_categories c ON c.category_name = s.category_name "
        "WHERE t.id IS NULL OR (c.id IS NOT NULL AND c.feed_type_id <> t.id)"
    )
    rep["skipped"] += [
        f"{n}: exists under a different feed type" if other else f"{n}: feed type '{t}' not found"
        for n, t, other in cur.fetchall()
    ]
    cur.execute(
        "INSERT INTO feed_categories (id, category_name, feed_type_id, description, sort_order, is_active) "
        "SELECT s.id, s.category_name, t.id, s.description, s.sort_order, s.is_active FROM stg_feed_categories s "
        "JOIN feed_types t ON t.type_name = s.feed_type_name ON CONFLICT (category_name) DO NOTHING"
    )
    rep["inserted"] = cur.rowcount
    if update:
        rep["updated"] = _update_existing(
            cur, "feed_categories", stg, "t.category_name = s.category_name", UPDATABLE["feed_categories"])

    # ── vocabulary_translations ─────────────────────────────────────────────────
    stg = _stage(
        cur, "vocabulary_translations", rows["vocabulary_translations"],
        lambda r: pack_uuid("vocabulary", r["country_code"], r["kind"], r["source_value"], r["language"]),
    )
    rep = _rep(report, "vocabulary_translations")
    rep["in_pack"] = len(rows["vocabulary_translations"])
    cur.execute(
        "SELECT s.country_code, s.language FROM stg_vocabulary_translations s "
        "LEFT JOIN country c ON c.country_code = s.country_code LEFT JOIN languages l ON l.code = s.language "
        "WHERE c.id IS NULL OR l.code IS NULL"
    )
    rep["skipped"] += [f"{c}/{lang}: country or language not found" for c, lang in cur.fetchall()]
    cur.execute(
        "INSERT INTO vocabulary_translations (id, country_id, kind, source_value, language, name) "
        "SELECT s.id, c.id, s.kind, s.source_value, s.language, s.name FROM stg_vocabulary_translations s "
        "JOIN country c ON c.country_code = s.country_code JOIN languages l ON l.code = s.language "
        "ON CONFLICT ON CONSTRAINT uq_vocabulary_translations_scope DO NOTHING"
    )
    rep["inserted"] = cur.rowcount
    if update:
        rep["updated"] = _update_existing(
            cur, "vocabulary_translations", stg,
            "t.country_id = (SELECT c.id FROM country c WHERE c.country_code = s.country_code) "
            "AND t.kind = s.kind AND t.source_value = s.source_value AND t.language = s.language",
            UPDATABLE["vocabulary_translations"],
        )

    # ── feeds ───────────────────────────────────────────────────────────────────
    stg = _stage(cur, "feeds", rows["feeds"], lambda r: stable_feed_uuid(r["fd_code"]))
    rep = _rep(report, "feeds")
    rep["in_pack"] = len(rows["feeds"])
    # Resolve references and find rows that would break a rule, instead of letting one of them abort the load.
    cur.execute(
        "CREATE TEMP TABLE stg_feeds_res ON COMMIT DROP AS "
        "SELECT s.*, c.id AS country_id, t.id AS type_id, cat.id AS category_id, "
        "  CASE WHEN s.country_code IS NOT NULL AND c.id IS NULL THEN 'unknown country ' || s.country_code "
        "       WHEN s.fd_type IS NOT NULL AND t.id IS NULL THEN 'unknown feed type ' || s.fd_type "
        "       WHEN s.fd_category IS NOT NULL AND cat.id IS NULL THEN 'unknown feed category ' || s.fd_category "
        "            || ' under type ' || coalesce(s.fd_type, '-') "
        "       WHEN s.name_rn > 1 THEN 'name duplicates another feed in the pack' "
        "       WHEN clash.fd_code IS NOT NULL THEN 'name already used by feed ' || clash.fd_code "
        "  END AS skip_reason "
        "FROM (SELECT s.*, row_number() OVER (PARTITION BY " + _KEY_S + " ORDER BY s.fd_code) AS name_rn "
        "      FROM stg_feeds s) s "
        "LEFT JOIN country c ON c.country_code = s.country_code "
        "LEFT JOIN feed_types t ON t.type_name = s.fd_type "
        "LEFT JOIN feed_categories cat ON cat.category_name = s.fd_category AND cat.feed_type_id = t.id "
        "LEFT JOIN LATERAL (SELECT f.fd_code FROM feeds f WHERE f.fd_code <> s.fd_code AND "
        + _KEY_F + " = " + _KEY_S + " LIMIT 1) clash ON true"
    )
    cur.execute("SELECT fd_code, skip_reason FROM stg_feeds_res WHERE skip_reason IS NOT NULL ORDER BY fd_code")
    rep["skipped"] += [f"{code}: {why}" for code, why in cur.fetchall()]
    insert_cols = ["id", "fd_code", "fd_name", "fd_country_id", "fd_type", "fd_category", "fd_type_id", "fd_category_id",
                   *TEXT_FEED_COLUMNS, *NUMERIC_FEED_COLUMNS]
    from_res = {"id": "r.id", "fd_country_id": "r.country_id", "fd_type_id": "r.type_id", "fd_category_id": "r.category_id"}
    cur.execute(
        "INSERT INTO feeds (" + ", ".join(_name(c) for c in insert_cols) + ") "
        "SELECT " + ", ".join(from_res.get(c, "r." + _name(c)) for c in insert_cols) + " "
        "FROM stg_feeds_res r WHERE r.skip_reason IS NULL ON CONFLICT (fd_code) DO NOTHING"
    )
    rep["inserted"] = cur.rowcount
    if update:
        rep["updated"] = _update_existing(
            cur, "feeds", "stg_feeds_res", "t.fd_code = s.fd_code AND s.skip_reason IS NULL", UPDATABLE["feeds"])
    report["feeds_not_in_pack"] = _count(
        cur, "SELECT count(*) FROM feeds f WHERE NOT EXISTS (SELECT 1 FROM stg_feeds s WHERE s.fd_code = f.fd_code)")

    # ── feed_translations ───────────────────────────────────────────────────────
    stg = _stage(
        cur, "feed_translations", rows["feed_translations"],
        lambda r: pack_uuid("feed_translation", r["fd_code"], r["language"]),
    )
    rep = _rep(report, "feed_translations")
    rep["in_pack"] = len(rows["feed_translations"])
    cur.execute(
        "SELECT s.fd_code, s.language FROM stg_feed_translations s LEFT JOIN feeds f ON f.fd_code = s.fd_code "
        "LEFT JOIN languages l ON l.code = s.language WHERE f.id IS NULL OR l.code IS NULL"
    )
    rep["skipped"] += [f"{c}/{lang}: feed or language not found" for c, lang in cur.fetchall()]
    cur.execute(
        "INSERT INTO feed_translations (id, feed_id, language, name) SELECT s.id, f.id, s.language, s.name "
        "FROM stg_feed_translations s JOIN feeds f ON f.fd_code = s.fd_code JOIN languages l ON l.code = s.language "
        "ON CONFLICT ON CONSTRAINT uq_feed_translations_feed_lang DO NOTHING"
    )
    rep["inserted"] = cur.rowcount
    if update:
        rep["updated"] = _update_existing(
            cur, "feed_translations", stg,
            "t.feed_id = (SELECT f.id FROM feeds f WHERE f.fd_code = s.fd_code) AND t.language = s.language",
            UPDATABLE["feed_translations"],
        )
    return report


def clear_caches() -> Optional[str]:
    """Drop the Redis feed and language caches so the API reads the new data. Returns an error text, or None."""
    try:
        import redis
        from app.config import settings

        client = redis.Redis.from_url(settings.redis_url, socket_connect_timeout=5)
        keys = list(client.scan_iter("feeds:*")) + [b"lang:active_codes"]
        client.delete(*keys)
        return None
    except Exception as exc:  # the data is committed already; a stale cache expires on its own TTL
        return f"{type(exc).__name__}: {exc}"


def print_report(report: dict) -> None:
    head = "DRY RUN (rolled back)" if report["dry_run"] else "APPLIED"
    print(f"{head}: pack {report['pack']}, mode {report['mode']}")
    print(f"{'table':<26}{'in pack':>8}{'inserted':>10}{'updated':>9}{'skipped':>9}")
    for table, r in report["tables"].items():
        print(f"{table:<26}{r['in_pack']:>8}{r['inserted']:>10}{r['updated']:>9}{len(r['skipped']):>9}")
    for table, r in report["tables"].items():
        for line in r["skipped"][:20]:
            print(f"  skipped [{table}] {line}")
        if len(r["skipped"]) > 20:
            print(f"  skipped [{table}] ... and {len(r['skipped']) - 20} more")
    for note in report["notes"]:
        print(f"note: {note}")
    print(f"in the database but not in the pack (left untouched): {report['countries_not_in_pack']} countries, "
          f"{report['feeds_not_in_pack']} feeds")


def main(argv: Optional[Iterable[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Apply a RationSmart data pack to the configured database")
    ap.add_argument("--pack", type=Path, help="pack folder (default: newest under /packs/master or <repo>/data/packs/master)")
    ap.add_argument("--mode", choices=MODES, default="insert-missing")
    ap.add_argument("--dry-run", action="store_true", help="do everything, report, then roll back")
    args = ap.parse_args(argv)

    here = Path(__file__).resolve()
    path = args.pack or latest_pack_dir([Path("/packs/master"), here.parents[2] / "data" / "packs" / "master"])
    if path is None:
        print("ERROR: no pack found; pass --pack", file=sys.stderr)
        return 2
    try:
        pack = read_pack(path)
    except (PackError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    from app.config import settings

    conn = psycopg2.connect(settings.database_url)
    try:
        report = apply_pack(conn, pack, args.mode, args.dry_run)
        if args.dry_run:
            conn.rollback()
        else:
            conn.commit()
    except Refused as exc:
        conn.rollback()
        print(f"REFUSED: {exc}", file=sys.stderr)
        return 2
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    print_report(report)
    if not args.dry_run:
        err = clear_caches()
        print("caches cleared (feeds:*, lang:active_codes)" if err is None
              else f"WARN: could not clear Redis caches ({err}); they expire on their own")
    return 0


if __name__ == "__main__":
    sys.exit(main())
