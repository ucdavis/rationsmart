"""Shared definition of a RationSmart data pack: which tables it carries, which columns, how rows
are keyed, and how a pack is read and verified. Used by build_data_pack.py (writes a pack) and
load_data_pack.py (applies one).

A pack is a folder of JSONL files (UTF-8, no BOM, one object per line, explicit nulls) plus
manifest.json. Rows are addressed by natural keys (country_code, type_name, fd_code, ...), never by
the source database's UUIDs, so a pack loads into any database at a compatible schema revision.
A pack holds reference data only: no users, no secrets, no CLIMDES settings.
"""
import hashlib
import json
import uuid
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Namespace for deterministic ids of NEW rows created from a pack (feeds use their own
# STANDARD_FEED_NAMESPACE via services.feed_service.stable_feed_uuid). Never change this value.
PACK_NAMESPACE = uuid.UUID("5c0b7e0e-6c9d-4f3a-9d0e-3f6f6a9a2f11")

# FK order: parents before children.
TABLES: Tuple[str, ...] = (
    "country", "languages", "country_languages",
    "feed_types", "feed_categories", "vocabulary_translations",
    "feeds", "feed_translations",
)

# Tables deliberately NOT in a pack, and why (the builder refuses to run if the database has a public
# table that is in neither list, so a new table forces a decision here).
EXCLUDED = {
    "user_information": "personal data",
    "custom_feeds": "user-owned data",
    "reports": "user-owned data",
    "user_feedback": "user-owned data",
    "feed_sync_config": "holds the CLIMDES endpoint and token; configured per deployment",
    "feed_sync_log": "operational log",
    "alembic_version": "schema bookkeeping",
}

NUMERIC_FEED_COLUMNS: Tuple[str, ...] = (
    "fd_dm", "fd_ash", "fd_cp", "fd_npn_cp", "fd_ee", "fd_cf", "fd_nfe", "fd_st", "fd_ndf",
    "fd_hemicellulose", "fd_adf", "fd_cellulose", "fd_lg", "fd_ndin", "fd_adin", "fd_ca", "fd_p",
    "baseline_price",
)
TEXT_FEED_COLUMNS: Tuple[str, ...] = (
    "fd_country_name", "fd_country_cd", "fd_season", "fd_orginin", "fd_ipb_local_lab", "baseline_currency",
)

# Pack fields per file, in output order. Types: s=text, b=bool, i=int, n=numeric (kept as a string so
# no precision is lost).
FIELDS: Dict[str, Tuple[Tuple[str, str], ...]] = {
    "country": (("country_code", "s"), ("name", "s"), ("currency", "s"), ("is_active", "b")),
    "languages": (("code", "s"), ("name", "s"), ("is_active", "b")),
    "country_languages": (("country_code", "s"), ("language_code", "s")),
    "feed_types": (("type_name", "s"), ("description", "s"), ("sort_order", "i"), ("is_active", "b")),
    "feed_categories": (
        ("category_name", "s"), ("feed_type_name", "s"), ("description", "s"),
        ("sort_order", "i"), ("is_active", "b"),
    ),
    "vocabulary_translations": (
        ("country_code", "s"), ("kind", "s"), ("source_value", "s"), ("language", "s"), ("name", "s"),
    ),
    "feeds": (
        ("fd_code", "s"), ("fd_name", "s"), ("country_code", "s"), ("fd_type", "s"), ("fd_category", "s"),
        *((c, "s") for c in TEXT_FEED_COLUMNS),
        *((c, "n") for c in NUMERIC_FEED_COLUMNS),
    ),
    "feed_translations": (("fd_code", "s"), ("language", "s"), ("name", "s")),
}

# Natural key of each file (used for sorting, duplicate detection and matching existing rows).
KEYS: Dict[str, Tuple[str, ...]] = {
    "country": ("country_code",),
    "languages": ("code",),
    "country_languages": ("country_code", "language_code"),
    "feed_types": ("type_name",),
    "feed_categories": ("category_name",),
    "vocabulary_translations": ("country_code", "kind", "source_value", "language"),
    "feeds": ("fd_code",),
    "feed_translations": ("fd_code", "language"),
}

# Columns `--mode update` may overwrite on rows that already exist. Everything else (is_active toggles,
# anything a client edits through the admin UI) is never touched on an existing row.
UPDATABLE: Dict[str, Tuple[str, ...]] = {
    "country": ("name", "currency"),
    "languages": ("name",),
    "feed_types": ("description", "sort_order"),
    "feed_categories": ("description", "sort_order"),
    "vocabulary_translations": ("name",),
    "feeds": (
        "fd_name", "fd_country_name", "fd_country_cd", "fd_season", "fd_orginin", "fd_ipb_local_lab",
        "baseline_currency", *NUMERIC_FEED_COLUMNS,
    ),
    "feed_translations": ("name",),
}


class PackError(Exception):
    """The pack is unreadable, inconsistent or fails verification."""


def pack_uuid(kind: str, *parts: str) -> uuid.UUID:
    """Deterministic id for a row created from a pack, derived from its natural key."""
    return uuid.uuid5(PACK_NAMESPACE, "|".join((kind, *parts)))


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def dumps_row(row: dict) -> str:
    return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class Pack:
    """A verified, in-memory data pack."""

    def __init__(self, path: Path, manifest: dict, rows: Dict[str, List[dict]]):
        self.path = path
        self.manifest = manifest
        self.rows = rows

    @property
    def version(self) -> str:
        return self.manifest["pack_version"]


def read_pack(path: Path) -> Pack:
    """Read a pack folder and verify it: manifest, checksums, row counts, field sets, duplicate keys."""
    path = Path(path)
    mpath = path / "manifest.json"
    if not mpath.is_file():
        raise PackError(f"{path}: manifest.json not found")
    manifest = json.loads(mpath.read_text(encoding="utf-8"))
    for key in ("pack_version", "schema_revisions", "files"):
        if key not in manifest:
            raise PackError(f"{mpath}: missing '{key}'")

    rows: Dict[str, List[dict]] = {}
    for table in TABLES:
        fname = f"{table}.jsonl"
        meta = manifest["files"].get(fname)
        fpath = path / fname
        if meta is None or not fpath.is_file():
            raise PackError(f"{path}: {fname} is not in the manifest or not on disk")
        if sha256_file(fpath) != meta["sha256"]:
            raise PackError(f"{fname}: checksum mismatch (the file was changed after the pack was built)")
        raw = fpath.read_bytes()
        if raw.startswith(b"\xef\xbb\xbf"):
            raise PackError(f"{fname}: UTF-8 BOM found")
        items = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line.strip()]
        if len(items) != meta["rows"]:
            raise PackError(f"{fname}: {len(items)} rows, manifest says {meta['rows']}")
        names = {name for name, _ in FIELDS[table]}
        seen = set()
        for i, item in enumerate(items, 1):
            if set(item) != names:
                raise PackError(f"{fname} line {i}: fields {sorted(set(item) ^ names)} do not match the spec")
            key = tuple(item[k] for k in KEYS[table])
            if any(k is None for k in key):
                raise PackError(f"{fname} line {i}: null in natural key {KEYS[table]}")
            if key in seen:
                raise PackError(f"{fname} line {i}: duplicate natural key {key}")
            seen.add(key)
        rows[table] = items
    extra = set(manifest["files"]) - {f"{t}.jsonl" for t in TABLES}
    if extra:
        raise PackError(f"manifest lists files this tool does not know: {sorted(extra)}")
    return Pack(path, manifest, rows)


def latest_pack_dir(roots: List[Path]) -> Optional[Path]:
    """Newest pack folder (by name) under the first existing root."""
    for root in roots:
        if root.is_dir():
            versions = sorted(p for p in root.iterdir() if (p / "manifest.json").is_file())
            if versions:
                return versions[-1]
    return None
