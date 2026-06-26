"""
Phase 1 integration tests — live migration against the isolated test Postgres.

Because the baseline migration (66ef0528df33) is a no-op stamp (the real schema
came from a pg_dump), a fresh DB has no tables. We therefore materialize the
minimal FK-parent tables the i18n migration targets (country, feeds,
user_information), stamp Alembic at the current head (c3d4e5f6a7b8), then run the
new migration's upgrade()/downgrade() for real and assert against the live DB.

Covers the V2 testing checklist item: "Migration applies + rolls back cleanly on
a fresh DB", plus the seed script (Step 1.3) and FK/constraint integrity.

Requires the test container (started out-of-band):
    docker run -d --name rationsmart-test-pg \
      -e POSTGRES_USER=rs_test -e POSTGRES_PASSWORD=rs_test \
      -e POSTGRES_DB=rationsmart_test -p 5455:5432 postgres:16-alpine
"""
import pathlib
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from alembic import command
from alembic.config import Config

from app.config import settings

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]

NEW_TABLES = ["languages", "country_languages", "feed_translations", "vocabulary_translations"]
HEAD_BEFORE = "c3d4e5f6a7b8"   # current head, just before the i18n migration

# Minimal stand-ins for the pg_dump-era baseline: only the FK targets the
# migration needs (country.id, feeds.id) and a user_information to ALTER.
BASELINE_DDL = [
    "CREATE TABLE country (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
    "name varchar(100) UNIQUE, country_code varchar(3) UNIQUE)",
    "CREATE TABLE feeds (id uuid PRIMARY KEY, fd_name text NOT NULL, "
    "fd_type text, fd_category text, fd_country_id uuid REFERENCES country(id))",
    "CREATE TABLE user_information (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
    "name varchar(100) NOT NULL)",
]


def _drop_everything(engine):
    with engine.begin() as conn:
        conn.execute(text(
            "DROP TABLE IF EXISTS vocabulary_translations, feed_translations, "
            "country_languages, languages, feeds, user_information, country, "
            "alembic_version CASCADE"
        ))


def _table_exists(conn, name) -> bool:
    return conn.execute(
        text("SELECT to_regclass(:n)"), {"n": f"public.{name}"}
    ).scalar() is not None


def _column_exists(conn, table, column) -> bool:
    return conn.execute(
        text("SELECT 1 FROM information_schema.columns "
             "WHERE table_name=:t AND column_name=:c"),
        {"t": table, "c": column},
    ).first() is not None


@pytest.fixture(scope="module")
def engine():
    eng = create_engine(settings.database_url)
    # Sanity: confirm we're really on the throwaway test DB, never real data.
    with eng.connect() as conn:
        db = conn.execute(text("SELECT current_database()")).scalar()
    assert db == "rationsmart_test", f"refusing to run against DB '{db}'"
    yield eng
    _drop_everything(eng)
    eng.dispose()


@pytest.fixture(scope="module")
def alembic_cfg():
    return Config(str(_REPO_ROOT / "alembic.ini"))


@pytest.fixture(scope="module")
def migrated(engine, alembic_cfg):
    """Clean slate -> minimal baseline -> stamp head-before -> upgrade i18n."""
    _drop_everything(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        for ddl in BASELINE_DDL:
            conn.execute(text(ddl))
    command.stamp(alembic_cfg, HEAD_BEFORE)
    command.upgrade(alembic_cfg, "head")
    return engine


# ── Upgrade: schema objects created ───────────────────────────────────────────

class TestUpgrade:
    def test_all_new_tables_created(self, migrated):
        with migrated.connect() as conn:
            for t in NEW_TABLES:
                assert _table_exists(conn, t), f"{t} not created"

    def test_en_baseline_row_seeded_by_migration(self, migrated):
        with migrated.connect() as conn:
            row = conn.execute(
                text("SELECT name, is_active FROM languages WHERE code='en'")
            ).first()
        assert row is not None and row.name == "English" and row.is_active is True

    def test_no_translation_rows_seeded(self, migrated):
        # I3: 'en' is the baseline; translation tables start empty.
        with migrated.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM feed_translations")).scalar() == 0
            assert conn.execute(text("SELECT count(*) FROM vocabulary_translations")).scalar() == 0

    def test_preferred_language_column_added(self, migrated):
        with migrated.connect() as conn:
            assert _column_exists(conn, "user_information", "preferred_language")

    def test_existing_user_defaults_to_en(self, migrated):
        with migrated.begin() as conn:
            conn.execute(text("INSERT INTO user_information (name) VALUES ('Alice')"))
        with migrated.connect() as conn:
            pref = conn.execute(
                text("SELECT preferred_language FROM user_information WHERE name='Alice'")
            ).scalar()
        assert pref == "en"

    def test_feed_translation_index_exists(self, migrated):
        with migrated.connect() as conn:
            idx = conn.execute(text(
                "SELECT 1 FROM pg_indexes WHERE indexname='idx_feed_translations_feed_lang'"
            )).first()
        assert idx is not None


# ── Constraint / FK integrity ─────────────────────────────────────────────────

class TestConstraints:
    def test_vocabulary_kind_check_rejects_bad_kind(self, migrated):
        cid = str(uuid.uuid4())
        with migrated.begin() as conn:
            conn.execute(
                text("INSERT INTO country (id, name, country_code) "
                     "VALUES (:id, 'CheckLand', 'CHK')"),
                {"id": cid},
            )
        with pytest.raises((IntegrityError, Exception)):
            with migrated.begin() as conn:
                conn.execute(
                    text("INSERT INTO vocabulary_translations "
                         "(country_id, kind, source_value, language, name) "
                         "VALUES (:c, 'not_a_kind', 'Forage', 'en', 'X')"),
                    {"c": cid},
                )

    def test_country_language_fk_rejects_unknown_language(self, migrated):
        cid = str(uuid.uuid4())
        with migrated.begin() as conn:
            conn.execute(
                text("INSERT INTO country (id, name, country_code) "
                     "VALUES (:id, 'FkLand', 'FKL')"),
                {"id": cid},
            )
        with pytest.raises((IntegrityError, Exception)):
            with migrated.begin() as conn:
                conn.execute(
                    text("INSERT INTO country_languages (country_id, language_code) "
                         "VALUES (:c, 'zz')"),  # 'zz' not in languages
                    {"c": cid},
                )

    def test_feed_translation_unique_feed_lang(self, migrated):
        fid = str(uuid.uuid4())
        with migrated.begin() as conn:
            conn.execute(
                text("INSERT INTO feeds (id, fd_name) VALUES (:id, 'Maize')"),
                {"id": fid},
            )
            conn.execute(
                text("INSERT INTO languages (code, name) VALUES ('hi','Hindi') "
                     "ON CONFLICT DO NOTHING"))
            conn.execute(
                text("INSERT INTO feed_translations (feed_id, language, name) "
                     "VALUES (:f, 'hi', 'मक्का')"),
                {"f": fid},
            )
        with pytest.raises((IntegrityError, Exception)):
            with migrated.begin() as conn:
                conn.execute(
                    text("INSERT INTO feed_translations (feed_id, language, name) "
                         "VALUES (:f, 'hi', 'दोबारा')"),
                    {"f": fid},
                )


# ── Seed script (Step 1.3) ─────────────────────────────────────────────────────

class TestSeedScript:
    def _seed_mod(self):
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "seed_languages_mod", _REPO_ROOT / "scripts" / "seed_languages.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def test_seed_languages_and_country_languages(self, migrated):
        seed = self._seed_mod()
        # Insert sample countries.
        with migrated.begin() as conn:
            for name, code in [("Vietnam", "VNM"), ("India", "IND"), ("Brazil", "BRA")]:
                conn.execute(
                    text("INSERT INTO country (name, country_code) VALUES (:n, :c) "
                         "ON CONFLICT (name) DO NOTHING"),
                    {"n": name, "c": code},
                )
        # Run the seed.
        with migrated.begin() as conn:
            seed.seed_languages(conn)
            seed.seed_country_languages(conn)

        with migrated.connect() as conn:
            codes = {r[0] for r in conn.execute(text("SELECT code FROM languages"))}
            assert {"en", "hi", "kn", "vi", "sw", "am"}.issubset(codes)

            def langs_for(country_name):
                return {r[0] for r in conn.execute(
                    text("SELECT cl.language_code FROM country_languages cl "
                         "JOIN country c ON c.id = cl.country_id WHERE c.name=:n"),
                    {"n": country_name})}

            assert langs_for("Vietnam") == {"en", "vi"}
            assert langs_for("India") == {"en", "hi", "kn"}
            assert langs_for("Brazil") == {"en"}   # unmapped -> English only

    def test_seed_is_idempotent(self, migrated):
        seed = self._seed_mod()
        with migrated.connect() as conn:
            before = conn.execute(text("SELECT count(*) FROM country_languages")).scalar()
        with migrated.begin() as conn:
            s1 = seed.seed_languages(conn)
            s2 = seed.seed_country_languages(conn)
        with migrated.connect() as conn:
            after = conn.execute(text("SELECT count(*) FROM country_languages")).scalar()
        assert s1["languages_inserted"] == 0
        assert s2["country_language_rows_inserted"] == 0
        assert before == after


# ── Downgrade: clean rollback ─────────────────────────────────────────────────

class TestDowngrade:
    def test_downgrade_removes_all_i18n_objects(self, migrated, alembic_cfg):
        command.downgrade(alembic_cfg, HEAD_BEFORE)
        with migrated.connect() as conn:
            for t in NEW_TABLES:
                assert not _table_exists(conn, t), f"{t} still present after downgrade"
            assert not _column_exists(conn, "user_information", "preferred_language")
            # Baseline FK-parent tables survive the rollback.
            assert _table_exists(conn, "country")
            assert _table_exists(conn, "feeds")
            assert _table_exists(conn, "user_information")
