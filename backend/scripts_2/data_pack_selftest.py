"""End-to-end self-test of the data pack tools against a SCRATCH database.

    python -m scripts_2.data_pack_selftest --url postgresql://user:pass@host:5432/scratch_db [--pack DIR] [--dump FILE.sql]

The database at --url must be EMPTY and must not be the configured (.env) database: it is built with
`alembic upgrade head`, loaded, edited and reloaded. Nothing else is touched. Exit code 0 = all checks passed.

Checks: dry run changes nothing; first load; the loaded database rebuilds into a byte-identical pack
(pack -> database -> pack) and, with --dump, equals the original SQL export value for value (read by a
separate parser, counts only in the output); reload is a no-op (no row churn); a client's edits survive a
default reload and only the pack-owned ones are refreshed by --mode update (all eight tables); a client's
language deactivation and country language set are respected; a feed-name clash is reported, not fatal;
the revision guard, the checksum guard and the CLIMDES sync lock refuse; create_admin rules.
"""
import argparse
import shutil
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from sqlalchemy import create_engine

from scripts_2.build_data_pack import convert, read_database, write_pack
from scripts_2.create_admin import AdminError, create_admin
from scripts_2.data_pack_spec import NUMERIC_FEED_COLUMNS, TABLES, TEXT_FEED_COLUMNS, PackError, latest_pack_dir, read_pack
from scripts_2.load_data_pack import Refused, apply_pack
from scripts_2.schema_drift_check import build_fresh

RESULTS = []


def parse_dump_independently(path: Path) -> dict:
    """Minimal COPY-text reader, written separately from build_data_pack.read_dump so the comparison below does
    not share its parsing. The export has no escape sequences; if one ever appears this refuses instead of guessing."""
    tables, cols, current = {}, [], None
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            line = raw.rstrip("\n")
            if current is None:
                if line.startswith("COPY public."):
                    head, rest = line[len("COPY public."):].split(" (", 1)
                    cols, current = rest.split(") FROM stdin;")[0].split(", "), head
                    tables[current] = []
                continue
            if line == "\\.":
                current = None
                continue
            fields = line.split("\t")
            if len(fields) != len(cols) or any("\\" in f and f != "\\N" for f in fields):
                raise ValueError(f"{current}: unexpected row shape or escape sequence; extend this parser")
            tables[current].append(dict(zip(cols, (None if f == "\\N" else f for f in fields))))
    return tables


def _n(v):
    """Canonical text for comparing a database value with a dump field."""
    if v is None:
        return None
    if isinstance(v, bool):
        return "t" if v else "f"
    return str(v)


def compare_to_dump(conn, dump: dict) -> list:
    """Compare what the database holds for the 8 pack tables with the dump file, value for value.
    Returns [(label, ok, detail)]. Only counts and the first differing key are reported (no row data)."""
    feed_cols = ["fd_name", "fd_type", "fd_category", *TEXT_FEED_COLUMNS, *NUMERIC_FEED_COLUMNS]
    country_code = {r["id"]: r["country_code"] for r in dump["country"]}
    type_name = {r["id"]: r["type_name"] for r in dump["feed_types"]}
    feed_code = {r["id"]: r["fd_code"] for r in dump["feeds"]}

    def rows(query):
        return {tuple(_n(v) for v in r) for r in q(conn, query)}

    pairs = {
        "country": (
            {(r["country_code"], r["name"], r["currency"], r["is_active"]) for r in dump["country"]},
            rows("SELECT country_code, name, currency, is_active FROM country")),
        "languages": (
            {(r["code"], r["name"], r["is_active"]) for r in dump["languages"]},
            rows("SELECT code, name, is_active FROM languages")),
        "country_languages": (
            {(country_code[r["country_id"]], r["language_code"]) for r in dump["country_languages"]},
            rows("SELECT c.country_code, cl.language_code FROM country_languages cl JOIN country c ON c.id = cl.country_id")),
        "feed_types": (
            {(r["type_name"], r["description"], r["sort_order"], r["is_active"]) for r in dump["feed_types"]},
            rows("SELECT type_name, description, sort_order, is_active FROM feed_types")),
        "feed_categories": (
            {(r["category_name"], type_name[r["feed_type_id"]], r["description"], r["sort_order"], r["is_active"]) for r in dump["feed_categories"]},
            rows("SELECT c.category_name, t.type_name, c.description, c.sort_order, c.is_active "
                 "FROM feed_categories c JOIN feed_types t ON t.id = c.feed_type_id")),
        "vocabulary_translations": (
            {(country_code[r["country_id"]], r["kind"], r["source_value"], r["language"], r["name"]) for r in dump["vocabulary_translations"]},
            rows("SELECT c.country_code, v.kind, v.source_value, v.language, v.name "
                 "FROM vocabulary_translations v JOIN country c ON c.id = v.country_id")),
        "feeds": (
            {(r["fd_code"], country_code.get(r["fd_country_id"]), *[r[c] for c in feed_cols]) for r in dump["feeds"]},
            rows("SELECT f.fd_code, c.country_code, " + ", ".join("f." + c for c in feed_cols)
                 + " FROM feeds f LEFT JOIN country c ON c.id = f.fd_country_id")),
        "feed_translations": (
            {(feed_code[r["feed_id"]], r["language"], r["name"]) for r in dump["feed_translations"]},
            rows("SELECT f.fd_code, t.language, t.name FROM feed_translations t JOIN feeds f ON f.id = t.feed_id")),
    }
    out = []
    for table, (expected, actual) in pairs.items():
        only_dump, only_db = expected - actual, actual - expected
        ok = not only_dump and not only_db
        out.append((f"{table}: {len(expected)} dump rows equal the database", ok,
                    f"{len(only_dump)} only in dump, {len(only_db)} only in database; first key {sorted(only_dump or only_db, key=str)[0][0]!r}" if not ok else ""))
    inconsistent = one(conn, "SELECT count(*) FROM feeds f LEFT JOIN feed_types t ON t.id = f.fd_type_id "
                             "LEFT JOIN feed_categories c ON c.id = f.fd_category_id "
                             "WHERE t.type_name IS DISTINCT FROM f.fd_type OR c.category_name IS DISTINCT FROM f.fd_category "
                             "OR c.feed_type_id IS DISTINCT FROM f.fd_type_id OR f.fd_country_id IS NULL")
    out.append(("feeds: type/category/country ids agree with their names", inconsistent == 0, f"{inconsistent} inconsistent"))
    return out


def check(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append(ok)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail and not ok else ""))


def q(conn, query: str, params=None):
    cur = conn.cursor()
    cur.execute(query, params)
    return cur.fetchall()


def one(conn, query: str, params=None):
    return q(conn, query, params)[0][0]


def load(conn, pack, mode="insert-missing", dry=False):
    try:
        report = apply_pack(conn, pack, mode, dry)
    except Exception:
        conn.rollback()
        raise
    conn.rollback() if dry else conn.commit()
    return report


def totals(report, key):
    return sum(t[key] for t in report["tables"].values())


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Self-test the data pack tools on a scratch database")
    ap.add_argument("--url", required=True, help="postgresql:// URL of an EMPTY scratch database")
    ap.add_argument("--pack", type=Path)
    ap.add_argument("--dump", type=Path, help="the SQL export the pack was built from: also compare the loaded database with it value for value")
    args = ap.parse_args(argv)

    from app.config import settings

    target, configured = urlparse(args.url), urlparse(settings.database_url)
    if (target.hostname, target.port or 5432, target.path) == (configured.hostname, configured.port or 5432, configured.path):
        print("REFUSED: --url is the configured database; use a scratch database", file=sys.stderr)
        return 2

    here = Path(__file__).resolve()
    pack_dir = args.pack or latest_pack_dir([Path("/packs/master"), here.parents[2] / "data" / "packs" / "master"])
    pack = read_pack(pack_dir)
    print(f"pack {pack.version}: " + ", ".join(f"{t}={len(r)}" for t, r in pack.rows.items()))

    engine = create_engine(args.url)
    build_fresh(engine)
    engine.dispose()
    conn = psycopg2.connect(args.url)
    n_countries, n_feeds = len(pack.rows["country"]), len(pack.rows["feeds"])
    active_langs = sum(1 for r in pack.rows["languages"] if r["is_active"])
    feed = pack.rows["feeds"][0]
    code = feed["fd_code"]

    print("1. dry run on a fresh database")
    before = {t: one(conn, "SELECT count(*) FROM " + t) for t in ("country", "feeds", "languages", "feed_translations")}
    rep = load(conn, pack, dry=True)
    after = {t: one(conn, "SELECT count(*) FROM " + t) for t in before}
    check("dry run reports the rows it would insert", rep["tables"]["country"]["inserted"] == n_countries and rep["tables"]["feeds"]["inserted"] == n_feeds)
    check("dry run changes nothing", before == after, f"{before} vs {after}")

    print("2. first load")
    rep = load(conn, pack)
    check("all countries and feeds inserted", one(conn, "SELECT count(*) FROM country") == n_countries and one(conn, "SELECT count(*) FROM feeds") == n_feeds)
    check("nothing skipped", all(not t["skipped"] for t in rep["tables"].values()),
          str({k: v["skipped"][:2] for k, v in rep["tables"].items() if v["skipped"]}))
    check("languages the pack ships active are active", one(conn, "SELECT count(*) FROM languages WHERE is_active") == active_langs)
    check("translations and vocabulary loaded", one(conn, "SELECT count(*) FROM feed_translations") == len(pack.rows["feed_translations"])
          and one(conn, "SELECT count(*) FROM vocabulary_translations") == len(pack.rows["vocabulary_translations"]))
    from services.feed_service import stable_feed_uuid
    check("feed ids are the stable uuid5 of fd_code (same on every deployment)",
          str(one(conn, "SELECT id FROM feeds WHERE fd_code = %s", (code,))) == str(stable_feed_uuid(code)))
    check("feed_sync_config untouched (one row, auth none, scheduler off)",
          q(conn, "SELECT count(*), min(auth_type), bool_or(scheduler_enabled) FROM feed_sync_config")[0] == (1, "none", False))
    check("no users were created", one(conn, "SELECT count(*) FROM user_information") == 0)

    print("2b. nothing lost on the way into the database")
    src_rows, revision = read_database(args.url)
    rebuilt_rows, warnings = convert(src_rows)
    tmp_rt = Path(tempfile.mkdtemp())
    try:
        rebuilt = write_pack(tmp_rt, pack.version, rebuilt_rows, revision, "selftest", "database")
        differing = [t for t in TABLES if (rebuilt / f"{t}.jsonl").read_bytes() != (pack.path / f"{t}.jsonl").read_bytes()]
        check("pack -> database -> pack (--from-db) is byte-identical for all 8 files", not differing and not warnings, f"differs: {differing} warnings: {warnings[:2]}")
        check("the rebuilt pack targets the same schema revision", revision in pack.manifest["schema_revisions"])
    finally:
        shutil.rmtree(tmp_rt, ignore_errors=True)
    if args.dump:
        for label, ok, detail in compare_to_dump(conn, parse_dump_independently(args.dump)):
            check(label, ok, detail)
    else:
        print("  (skipped: pass --dump to compare the database with the original SQL export)")

    print("3. reload is a no-op")
    stamp = q(conn, "SELECT (SELECT max(updated_at) FROM feeds), (SELECT max(updated_at) FROM country)")[0]
    rep = load(conn, pack)
    check("insert-missing inserts and updates nothing", totals(rep, "inserted") == 0 and totals(rep, "updated") == 0)
    rep = load(conn, pack, "update")
    check("update mode on identical data changes nothing", totals(rep, "inserted") == 0 and totals(rep, "updated") == 0)
    check("no updated_at churn", stamp == q(conn, "SELECT (SELECT max(updated_at) FROM feeds), (SELECT max(updated_at) FROM country)")[0])

    print("4. client edits")
    original = one(conn, "SELECT fd_dm FROM feeds WHERE fd_code = %s", (code,))
    q(conn, "UPDATE feeds SET fd_dm = coalesce(fd_dm, 0) + 7 WHERE fd_code = %s RETURNING 1", (code,)); conn.commit()
    edited = one(conn, "SELECT fd_dm FROM feeds WHERE fd_code = %s", (code,))
    if args.dump:
        # Negative control: the value-for-value comparison must notice a changed nutrient value, or its passes mean nothing.
        verdicts = compare_to_dump(conn, parse_dump_independently(args.dump))
        check("negative control: the dump comparison detects a changed value",
              any(not ok for label, ok, _ in verdicts if label.startswith("feeds: ")))
    load(conn, pack)
    check("default reload keeps the client's edit", one(conn, "SELECT fd_dm FROM feeds WHERE fd_code = %s", (code,)) == edited)
    rep = load(conn, pack, "update")
    check("--mode update restores the pack-owned column", one(conn, "SELECT fd_dm FROM feeds WHERE fd_code = %s", (code,)) == original
          and rep["tables"]["feeds"]["updated"] == 1)
    q(conn, "UPDATE languages SET is_active = false WHERE code = 'am' RETURNING 1"); conn.commit()
    load(conn, pack)
    check("default reload does not re-activate a language the client turned off", not one(conn, "SELECT is_active FROM languages WHERE code = 'am'"))
    load(conn, pack, "update")
    check("--mode update activates it (never deactivates)", one(conn, "SELECT is_active FROM languages WHERE code = 'am'"))
    cl = q(conn, "SELECT country_id, language_code FROM country_languages WHERE language_code <> 'en' LIMIT 1")[0]
    q(conn, "DELETE FROM country_languages WHERE country_id = %s AND language_code = %s RETURNING 1", cl); conn.commit()
    load(conn, pack)
    check("an existing country's language set is left to the client", one(conn, "SELECT count(*) FROM country_languages WHERE country_id = %s AND language_code = %s", cl) == 0)
    load(conn, pack, "update")
    check("--mode update restores the link", one(conn, "SELECT count(*) FROM country_languages WHERE country_id = %s AND language_code = %s", cl) == 1)

    print("4b. update mode on the other tables")
    vt = pack.rows["vocabulary_translations"][0]
    ft = pack.rows["feed_translations"][0]
    cases = (
        ("feed_types", "SELECT description, sort_order FROM feed_types WHERE type_name = %s", (pack.rows["feed_types"][0]["type_name"],),
         "UPDATE feed_types SET description = 'edited by client', sort_order = 99 WHERE type_name = %s RETURNING 1"),
        ("feed_categories", "SELECT description, sort_order FROM feed_categories WHERE category_name = %s", (pack.rows["feed_categories"][0]["category_name"],),
         "UPDATE feed_categories SET description = 'edited by client', sort_order = 99 WHERE category_name = %s RETURNING 1"),
        ("vocabulary_translations",
         "SELECT v.name FROM vocabulary_translations v JOIN country c ON c.id = v.country_id "
         "WHERE c.country_code = %s AND v.kind = %s AND v.source_value = %s AND v.language = %s",
         (vt["country_code"], vt["kind"], vt["source_value"], vt["language"]),
         "UPDATE vocabulary_translations v SET name = 'edited by client' FROM country c WHERE c.id = v.country_id "
         "AND c.country_code = %s AND v.kind = %s AND v.source_value = %s AND v.language = %s RETURNING 1"),
        ("feed_translations",
         "SELECT t.name FROM feed_translations t JOIN feeds f ON f.id = t.feed_id WHERE f.fd_code = %s AND t.language = %s",
         (ft["fd_code"], ft["language"]),
         "UPDATE feed_translations t SET name = 'edited by client' FROM feeds f WHERE f.id = t.feed_id "
         "AND f.fd_code = %s AND t.language = %s RETURNING 1"),
    )
    for table, read_sql, params, edit_sql in cases:
        original = q(conn, read_sql, params)
        q(conn, edit_sql, params)
        conn.commit()
        edited = q(conn, read_sql, params)
        load(conn, pack)
        check(f"{table}: default reload keeps the client's edit", q(conn, read_sql, params) == edited and edited != original)
        rep = load(conn, pack, "update")
        check(f"{table}: --mode update restores exactly that one row", q(conn, read_sql, params) == original and rep["tables"][table]["updated"] == 1,
              f"updated={rep['tables'][table]['updated']}")

    print("5. feed-name clash is reported, not fatal")
    name = one(conn, "SELECT fd_name FROM feeds WHERE fd_code = %s", (code,))
    q(conn, "DELETE FROM feeds WHERE fd_code = %s RETURNING 1", (code,))
    q(conn, "INSERT INTO feeds (id, fd_code, fd_name) VALUES (gen_random_uuid(), 'CLIENT-1', %s) RETURNING 1", ("  " + name.upper() + "  ",)); conn.commit()
    rep = load(conn, pack)
    check("clash reported for the pack feed", any(code in s and "name already used" in s for s in rep["tables"]["feeds"]["skipped"]), str(rep["tables"]["feeds"]["skipped"][:2]))
    check("the client's feed was not disturbed and the pack feed not forced in",
          one(conn, "SELECT count(*) FROM feeds WHERE fd_code = 'CLIENT-1'") == 1 and one(conn, "SELECT count(*) FROM feeds WHERE fd_code = %s", (code,)) == 0)
    q(conn, "DELETE FROM feeds WHERE fd_code = 'CLIENT-1' RETURNING 1"); conn.commit()
    load(conn, pack)
    check("once the clash is gone the feed loads", one(conn, "SELECT count(*) FROM feeds WHERE fd_code = %s", (code,)) == 1)

    print("6. guards")
    q(conn, "UPDATE alembic_version SET version_num = 'deadbeef0000' RETURNING 1")
    try:
        apply_pack(conn, pack)
        check("wrong schema revision is refused", False)
    except Refused:
        check("wrong schema revision is refused", True)
    conn.rollback()
    tmp = Path(tempfile.mkdtemp())
    try:
        copy = tmp / "pack"
        shutil.copytree(pack.path, copy)
        with open(copy / "feeds.jsonl", "ab") as fh:
            fh.write(b"\n")
        try:
            read_pack(copy)
            check("a modified pack file is refused (checksum)", False)
        except PackError:
            check("a modified pack file is refused (checksum)", True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    from repositories.feed_sync_repository import SYNC_LOCK_KEY
    other = psycopg2.connect(args.url)
    other.cursor().execute("SELECT pg_advisory_lock(%s, %s)", SYNC_LOCK_KEY)
    try:
        apply_pack(conn, pack)
        check("a running CLIMDES sync (lock held) blocks the load", False)
    except Refused:
        check("a running CLIMDES sync (lock held) blocks the load", True)
    conn.rollback()
    other.close()

    print("7. create_admin")
    country = pack.rows["country"][0]["country_code"]
    for label, kwargs, expect in (
        ("rejects a PIN that is not 6 digits", dict(pin="12345"), AdminError),
        ("rejects an unknown country", dict(pin="123456", country_code="ZZZ"), AdminError),
    ):
        try:
            create_admin(conn, **{"email": "a@example.org", "name": "A", "country_code": country, **kwargs})
            check(label, False)
        except expect:
            check(label, True)
        conn.rollback()
    msg = create_admin(conn, "Admin@Example.org", "First Admin", country, "123456"); conn.commit()
    row = q(conn, "SELECT email_id, is_admin, admin_level, is_email_verified, pin_hash FROM user_information")[0]
    check("creates a verified super admin with a normalized email", row[:4] == ("admin@example.org", True, "super_admin", True), msg)
    from services.auth_service import is_legacy_hash, verify_pin
    check("the PIN verifies against the stored bcrypt hash and is not stored in clear",
          verify_pin("123456", row[4]) and "123456" not in row[4] and not is_legacy_hash(row[4]))
    try:
        create_admin(conn, "second@example.org", "Second", country, "654321")
        check("refuses a second super admin without --force", False)
    except AdminError:
        check("refuses a second super admin without --force", True)
    conn.rollback()
    try:
        create_admin(conn, "admin@example.org", "Again", country, "654321", force=True)
        check("refuses an already registered email without --promote", False)
    except AdminError:
        check("refuses an already registered email without --promote", True)
    conn.rollback()
    q(conn, "UPDATE user_information SET is_admin = false, admin_level = NULL RETURNING 1")
    create_admin(conn, "admin@example.org", "Again", country, None, promote=True); conn.commit()
    check("--promote upgrades the existing account and keeps its PIN",
          q(conn, "SELECT admin_level, pin_hash FROM user_information")[0][0] == "super_admin" and verify_pin("123456", q(conn, "SELECT pin_hash FROM user_information")[0][0]))
    conn.close()

    failed = RESULTS.count(False)
    print(f"\n{len(RESULTS) - failed}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
