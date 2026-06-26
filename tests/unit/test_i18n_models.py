"""
Phase 1 unit tests (no DB required).

Validates the i18n ORM model definitions (Step 1.2) by introspecting
Base.metadata, the migration's revision chain (Step 1.1), and the pure helper
logic in the seed script (Step 1.3).
"""
import importlib.util
import pathlib

from app.db.base import Base
from app.db import models

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _load_from_path(name: str, relpath: str):
    """Load a module by file path (the local `alembic/` dir is shadowed by the
    installed alembic library, and `scripts/` is not a package)."""
    spec = importlib.util.spec_from_file_location(name, _REPO_ROOT / relpath)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# ── ORM metadata: new tables exist with the right shape ───────────────────────

class TestI18nTablesRegistered:
    def test_all_four_tables_present(self):
        for t in ("languages", "country_languages",
                  "feed_translations", "vocabulary_translations"):
            assert t in Base.metadata.tables, f"missing table {t}"

    def test_languages_columns(self):
        cols = Base.metadata.tables["languages"].columns
        assert cols["code"].primary_key
        assert cols["name"].nullable is False
        assert cols["is_active"].nullable is False

    def test_country_languages_composite_pk_and_fks(self):
        tbl = Base.metadata.tables["country_languages"]
        pk = {c.name for c in tbl.primary_key.columns}
        assert pk == {"country_id", "language_code"}
        fk_targets = {list(fk.column.table.name for fk in c.foreign_keys)[0]
                      for c in tbl.columns if c.foreign_keys}
        assert fk_targets == {"country", "languages"}

    def test_feed_translations_unique_and_fk_cascade(self):
        tbl = Base.metadata.tables["feed_translations"]
        # unique (feed_id, language)
        uniques = [
            {c.name for c in con.columns}
            for con in tbl.constraints
            if con.__class__.__name__ == "UniqueConstraint"
        ]
        assert {"feed_id", "language"} in uniques
        # feed_id FK -> feeds, ON DELETE CASCADE
        feed_fk = next(iter(tbl.c.feed_id.foreign_keys))
        assert feed_fk.column.table.name == "feeds"
        assert feed_fk.ondelete == "CASCADE"
        # language FK -> languages, ON DELETE RESTRICT
        lang_fk = next(iter(tbl.c.language.foreign_keys))
        assert lang_fk.column.table.name == "languages"
        assert lang_fk.ondelete == "RESTRICT"

    def test_vocabulary_translations_country_scoped_unique(self):
        tbl = Base.metadata.tables["vocabulary_translations"]
        uniques = [
            {c.name for c in con.columns}
            for con in tbl.constraints
            if con.__class__.__name__ == "UniqueConstraint"
        ]
        # Country is IN the key (I5): two countries sharing a language never clash.
        assert {"country_id", "kind", "source_value", "language"} in uniques

    def test_vocabulary_kind_check_constraint(self):
        tbl = Base.metadata.tables["vocabulary_translations"]
        checks = [c for c in tbl.constraints
                  if c.__class__.__name__ == "CheckConstraint"]
        assert any("kind" in str(c.sqltext).lower() for c in checks)


class TestPreferredLanguageColumn:
    def test_column_exists_with_default_en(self):
        col = Base.metadata.tables["user_information"].columns["preferred_language"]
        assert col.nullable is False
        # default 'en' (I3 baseline)
        assert "en" in str(col.server_default.arg)

    def test_fk_to_languages_restrict(self):
        col = Base.metadata.tables["user_information"].columns["preferred_language"]
        fk = next(iter(col.foreign_keys))
        assert fk.column.table.name == "languages"
        assert fk.ondelete == "RESTRICT"


# ── Migration revision chain (Step 1.1) ───────────────────────────────────────

class TestMigrationChain:
    def _load(self):
        return _load_from_path(
            "mig_d4e5f6a7b8c9",
            "alembic/versions/d4e5f6a7b8c9_i18n_foundation.py",
        )

    def test_revision_ids_and_chain(self):
        mig = self._load()
        assert mig.revision == "d4e5f6a7b8c9"
        # Chains onto the current head (fd_code uniqueness migration).
        assert mig.down_revision == "c3d4e5f6a7b8"

    def test_upgrade_and_downgrade_callable(self):
        mig = self._load()
        assert callable(mig.upgrade)
        assert callable(mig.downgrade)


# ── Seed script pure logic (Step 1.3) ─────────────────────────────────────────

class TestResolveCountryLanguages:
    def _fn(self):
        return _load_from_path(
            "seed_languages_mod", "scripts/seed_languages.py"
        ).resolve_country_languages

    def test_en_always_first(self):
        assert self._fn()("Brazil", "BRA")[0] == "en"

    def test_unmapped_country_gets_english_only(self):
        assert self._fn()("Atlantis", "ATL") == ["en"]

    def test_vietnam_by_name(self):
        assert self._fn()("Vietnam", "VNM") == ["en", "vi"]

    def test_india_multi_language(self):
        assert self._fn()("India", "IND") == ["en", "hi", "kn"]

    def test_match_is_case_insensitive(self):
        assert self._fn()("VIETNAM", "") == ["en", "vi"]

    def test_match_by_country_code_when_name_unknown(self):
        assert self._fn()("Republic of Kenya", "KE") == ["en", "sw"]

    def test_no_duplicate_languages(self):
        result = self._fn()("Vietnam", "VN")  # both tokens map to 'vi'
        assert result == ["en", "vi"]
