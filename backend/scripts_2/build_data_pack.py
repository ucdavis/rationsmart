"""Build a data pack (see data_pack_spec.py) from either a RationSmart SQL data export or a live database.

    # from a data-only export made by scripts_2.export_master_data (the file is only read):
    python -m scripts_2.build_data_pack --from-dump /path/rationsmart_master_data_X.sql \\
        --version 2026.11.01 --out /packs/master

    # from a database (read-only; the revision must be the one the pack targets):
    python -m scripts_2.build_data_pack --from-db --version 2026.12.01 --out /packs/master

Users, custom feeds, reports, feedback, the CLIMDES settings and the sync log are never read into a pack.
UUIDs are translated to natural keys; rows whose references cannot be resolved are reported and left out.
"""
import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from scripts_2.data_pack_spec import (
    EXCLUDED, FIELDS, KEYS, NUMERIC_FEED_COLUMNS, TABLES, TEXT_FEED_COLUMNS, PackError, dumps_row, sha256_file,
)

# Source columns read per table (source DB names; ids are translated to natural keys below).
SOURCE_COLUMNS: Dict[str, Tuple[str, ...]] = {
    "country": ("id", "country_code", "name", "currency", "is_active"),
    "languages": ("code", "name", "is_active"),
    "country_languages": ("country_id", "language_code"),
    "feed_types": ("id", "type_name", "description", "sort_order", "is_active"),
    "feed_categories": ("id", "category_name", "feed_type_id", "description", "sort_order", "is_active"),
    "vocabulary_translations": ("country_id", "kind", "source_value", "language", "name"),
    "feeds": (
        "id", "fd_code", "fd_name", "fd_country_id", "fd_type", "fd_category", "fd_type_id", "fd_category_id",
        *TEXT_FEED_COLUMNS, *NUMERIC_FEED_COLUMNS,
    ),
    "feed_translations": ("feed_id", "language", "name"),
}

_UNESCAPE = {"n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f", "v": "\v", "\\": "\\"}


def _unescape(field: str) -> str:
    return re.sub(r"\\(.)", lambda m: _UNESCAPE.get(m.group(1), m.group(1)), field)


def read_dump(path: Path) -> Dict[str, List[dict]]:
    """Parse the COPY ... FROM stdin blocks of a pg_dump --data-only file into {table: [row dicts]}."""
    tables: Dict[str, List[dict]] = {}
    cols: List[str] = []
    current = None
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if current is None:
                m = re.match(r"COPY public\.(\w+) \((.*?)\) FROM stdin;$", line)
                if m:
                    current = m.group(1)
                    cols = [c.strip() for c in m.group(2).split(",")]
                    tables[current] = []
                continue
            if line == "\\.":
                current = None
                continue
            parts = line.split("\t")
            if len(parts) != len(cols):
                raise PackError(f"{current}: a row has {len(parts)} fields, expected {len(cols)}")
            tables[current].append({c: (None if p == "\\N" else _unescape(p)) for c, p in zip(cols, parts)})
    return tables


def read_database(url: Optional[str] = None) -> Tuple[Dict[str, List[dict]], str]:
    """Read the pack source tables from a database (read-only): `url`, or the configured one."""
    import psycopg2
    from psycopg2 import sql
    from psycopg2.extras import RealDictCursor

    if url is None:
        from app.config import settings
        url = settings.database_url
    conn = psycopg2.connect(url)
    try:
        conn.set_session(readonly=True)
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("SELECT version_num FROM alembic_version")
        revision = cur.fetchone()["version_num"]
        cur.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
        unknown = {r["table_name"] for r in cur.fetchall()} - set(TABLES) - set(EXCLUDED)
        if unknown:
            raise PackError(f"public tables not classified in data_pack_spec (TABLES or EXCLUDED): {sorted(unknown)}")
        out = {}
        for table in TABLES:
            query = sql.SQL("SELECT {cols} FROM {tbl}").format(
                cols=sql.SQL(", ").join(sql.Identifier(c) for c in SOURCE_COLUMNS[table]),
                tbl=sql.Identifier("public", table),
            )
            cur.execute(query)
            out[table] = [dict(r) for r in cur.fetchall()]
        return out, revision
    finally:
        conn.close()


def _typed(kind: str, v):
    if v is None:
        return None
    if kind == "b":
        return v if isinstance(v, bool) else v == "t"
    if kind == "i":
        return int(v)
    return str(v)


def convert(src: Dict[str, List[dict]]) -> Tuple[Dict[str, List[dict]], List[str]]:
    """Translate source rows (UUID-keyed) to pack rows (natural-key-addressed). Returns (rows, warnings)."""
    warnings: List[str] = []
    missing = [t for t in TABLES if t not in src]
    if missing:
        raise PackError(f"the source has no data for: {missing}")

    country_code = {str(r["id"]): r["country_code"] for r in src["country"]}
    type_name = {str(r["id"]): r["type_name"] for r in src["feed_types"]}
    feed_code = {str(r["id"]): r["fd_code"] for r in src["feeds"]}
    cat_name = {str(r["id"]): r["category_name"] for r in src["feed_categories"]}

    out: Dict[str, List[dict]] = {t: [] for t in TABLES}

    def add(table: str, raw: dict):
        out[table].append({name: _typed(kind, raw.get(name)) for name, kind in FIELDS[table]})

    for r in src["country"]:
        add("country", r)
    for r in src["languages"]:
        add("languages", r)
    for r in src["country_languages"]:
        code = country_code.get(str(r["country_id"]))
        if code is None:
            warnings.append(f"country_languages: unknown country id {r['country_id']} skipped")
            continue
        add("country_languages", {"country_code": code, "language_code": r["language_code"]})
    for r in src["feed_types"]:
        add("feed_types", r)
    for r in src["feed_categories"]:
        tname = type_name.get(str(r["feed_type_id"]))
        if tname is None:
            warnings.append(f"feed_categories: '{r['category_name']}' has an unknown feed type, skipped")
            continue
        add("feed_categories", {**r, "feed_type_name": tname})
    for r in src["vocabulary_translations"]:
        code = country_code.get(str(r["country_id"]))
        if code is None:
            warnings.append("vocabulary_translations: row with unknown country skipped")
            continue
        add("vocabulary_translations", {**r, "country_code": code})
    for r in src["feeds"]:
        cid = r["fd_country_id"]
        code = country_code.get(str(cid)) if cid else None
        if cid and code is None:
            warnings.append(f"feeds: {r['fd_code']} has an unknown country, skipped")
            continue
        ftype, fcat = r["fd_type"], r["fd_category"]
        tid, catid = r["fd_type_id"], r["fd_category_id"]
        if tid and type_name.get(str(tid)) not in (None, ftype):
            warnings.append(f"feeds: {r['fd_code']} fd_type text '{ftype}' differs from its type id; the id's name is used")
            ftype = type_name[str(tid)]
        if catid and cat_name.get(str(catid)) not in (None, fcat):
            warnings.append(f"feeds: {r['fd_code']} fd_category text '{fcat}' differs from its category id; the id's name is used")
            fcat = cat_name[str(catid)]
        add("feeds", {**r, "country_code": code, "fd_type": ftype, "fd_category": fcat})
    for r in src["feed_translations"]:
        code = feed_code.get(str(r["feed_id"]))
        if code is None:
            warnings.append("feed_translations: row with unknown feed skipped")
            continue
        add("feed_translations", {**r, "fd_code": code})

    for t in TABLES:
        out[t].sort(key=lambda row, t=t: tuple(str(row[k]) for k in KEYS[t]))
    return out, warnings


def write_pack(out_dir: Path, version: str, rows: Dict[str, List[dict]], revision: str, commit: str, source: str) -> Path:
    pack = out_dir / version
    if pack.exists():
        raise PackError(f"{pack} already exists; choose a new --version (packs are immutable once published)")
    pack.mkdir(parents=True)
    files = {}
    for table in TABLES:
        fpath = pack / f"{table}.jsonl"
        fpath.write_bytes("".join(dumps_row(r) + "\n" for r in rows[table]).encode("utf-8"))
        files[fpath.name] = {"rows": len(rows[table]), "sha256": sha256_file(fpath)}
    manifest = {
        "pack_version": version,
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": source,
        "source_commit": commit,
        "schema_revisions": [revision],
        "files": files,
    }
    (pack / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return pack


def _header_value(head: str, word: str) -> Optional[str]:
    m = re.search(rf"{word} (\w+)", head)
    return m.group(1) if m else None


def main(argv: Optional[Iterable[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Build a RationSmart data pack")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--from-dump", type=Path, help="a pg_dump --data-only SQL export (scripts_2.export_master_data)")
    src.add_argument("--from-db", action="store_true", help="read the configured database (read-only)")
    ap.add_argument("--version", required=True, help="pack version, also the folder name (e.g. 2026.11.01)")
    ap.add_argument("--out", type=Path, required=True, help="folder that will contain <version>/")
    ap.add_argument("--revision", help="Alembic revision the pack targets (default: from the dump header or the database)")
    ap.add_argument("--commit", help="git commit the data came from (default: from the dump header)")
    args = ap.parse_args(argv)

    try:
        if args.from_dump:
            with open(args.from_dump, encoding="utf-8") as fh:
                head = fh.readline()
            rev = args.revision or _header_value(head, "revision")
            if not rev:
                raise PackError("cannot find the schema revision in the dump header; pass --revision")
            commit = args.commit or _header_value(head, "commit") or "unknown"
            source_rows, label = read_dump(args.from_dump), f"dump:{args.from_dump.name}"
        else:
            source_rows, rev = read_database()
            if args.revision and args.revision != rev:
                raise PackError(f"database revision {rev} != --revision {args.revision}")
            commit, label = args.commit or "unknown", "database"
        rows, warnings = convert(source_rows)
        pack = write_pack(args.out, args.version, rows, rev, commit, label)
    except PackError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    for w in warnings:
        print(f"WARN: {w}")
    print(f"pack written: {pack}  (schema revision {rev}, source {label})")
    for t in TABLES:
        print(f"  {t:<26} {len(rows[t]):>6} rows")
    print("excluded on purpose: " + ", ".join(sorted(EXCLUDED)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
