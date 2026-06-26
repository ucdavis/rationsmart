"""
Phase 4 integration tests — Translation Workbook and CRUD against real Postgres.

Requires the rationsmart-test-pg container on localhost:5455 (same as Phases 1–3).
Drops and recreates the full i18n schema each module run, so it is safe to run
standalone or alongside the other integration test files.
"""
import io
import pathlib
import uuid

import pandas as pd
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from alembic import command
from alembic.config import Config

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_HEAD_BEFORE = "c3d4e5f6a7b8"

_BASELINE_DDL = [
    "CREATE TABLE IF NOT EXISTS country "
    "(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
    "name varchar(100) UNIQUE, country_code varchar(3) UNIQUE, currency varchar(10))",
    "CREATE TABLE IF NOT EXISTS feeds "
    "(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fd_code text, "
    "fd_name text NOT NULL, fd_type text, fd_category text, "
    "fd_country_id uuid REFERENCES country(id))",
    "CREATE TABLE IF NOT EXISTS user_information "
    "(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL)",
]

_SEED_LANGUAGES = [
    ("en", "English"), ("hi", "Hindi"), ("vi", "Vietnamese"),
]


def _drop_schema(engine):
    with engine.begin() as conn:
        conn.execute(text(
            "DROP TABLE IF EXISTS vocabulary_translations, feed_translations, "
            "country_languages, languages, feeds, user_information, country, "
            "alembic_version CASCADE"
        ))


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def sync_engine():
    from app.config import settings
    eng = create_engine(settings.database_url)
    with eng.connect() as conn:
        assert conn.execute(text("SELECT current_database()")).scalar() == "rationsmart_test", \
            "refusing to run against non-test DB"
    yield eng
    _drop_schema(eng)
    eng.dispose()


@pytest.fixture(scope="module", autouse=True)
def apply_migration(sync_engine):
    _drop_schema(sync_engine)
    with sync_engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        for ddl in _BASELINE_DDL:
            conn.execute(text(ddl))
    cfg = Config(str(_REPO_ROOT / "alembic.ini"))
    command.stamp(cfg, _HEAD_BEFORE)
    command.upgrade(cfg, "head")
    with sync_engine.begin() as conn:
        for code, name in _SEED_LANGUAGES:
            conn.execute(text(
                "INSERT INTO languages (code, name, is_active) VALUES (:c,:n,true) "
                "ON CONFLICT (code) DO UPDATE SET is_active=true"
            ), {"c": code, "n": name})


@pytest.fixture
async def db_session(apply_migration):
    from app.config import settings
    url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(url, pool_size=1, max_overflow=0)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture(scope="module")
def test_country(sync_engine):
    """Insert a test country and return its id (str)."""
    cid = str(uuid.uuid4())
    with sync_engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO country (id, name, country_code) VALUES (:id, :n, :cc)"
        ), {"id": cid, "n": "TestCountry", "cc": "TC"})
        # Assign hi + vi to this country
        for lc in ("hi", "vi"):
            conn.execute(text(
                "INSERT INTO country_languages (country_id, language_code) "
                "VALUES (:cid, :lc) ON CONFLICT DO NOTHING"
            ), {"cid": cid, "lc": lc})
    return cid


@pytest.fixture(scope="module")
def test_feeds(sync_engine, test_country):
    """Insert two test feeds and return list of (id, fd_code, fd_name) tuples."""
    feeds = [
        (str(uuid.uuid4()), "TF001", "Napier Grass", "Forage", "Grass"),
        (str(uuid.uuid4()), "TF002", "Maize Grain",  "Grain",  "Cereal"),
    ]
    with sync_engine.begin() as conn:
        for fid, code, name, ftype, fcat in feeds:
            conn.execute(text(
                "INSERT INTO feeds (id, fd_code, fd_name, fd_type, fd_category, fd_country_id) "
                "VALUES (:id, :code, :name, :ftype, :fcat, :cid)"
            ), {"id": fid, "code": code, "name": name, "ftype": ftype,
                "fcat": fcat, "cid": test_country})
    return feeds


@pytest.fixture(autouse=True)
def clean_translations(sync_engine, test_country):
    """Wipe translation tables before each test (avoid cross-test bleed)."""
    yield
    with sync_engine.begin() as conn:
        conn.execute(text("DELETE FROM feed_translations"))
        conn.execute(text("DELETE FROM vocabulary_translations"))


# ── TranslationRepository tests ───────────────────────────────────────────────

class TestTranslationRepositoryIntegration:

    @pytest.mark.asyncio
    async def test_get_country_language_codes_excludes_en(self, db_session, test_country):
        from repositories.translation_repository import TranslationRepository
        repo = TranslationRepository(db_session)
        codes = await repo.get_country_language_codes(test_country)
        assert "en" not in codes
        assert "hi" in codes
        assert "vi" in codes

    @pytest.mark.asyncio
    async def test_get_country_feeds_returns_expected_feeds(self, db_session, test_country, test_feeds):
        from repositories.translation_repository import TranslationRepository
        repo = TranslationRepository(db_session)
        feeds = await repo.get_country_feeds(test_country)
        assert len(feeds) == 2
        names = {f.fd_name for f in feeds}
        assert "Napier Grass" in names
        assert "Maize Grain" in names

    @pytest.mark.asyncio
    async def test_get_country_feed_ids_contains_inserted_feeds(
        self, db_session, test_country, test_feeds
    ):
        from repositories.translation_repository import TranslationRepository
        repo = TranslationRepository(db_session)
        ids = await repo.get_country_feed_ids(test_country)
        for fid, *_ in test_feeds:
            assert fid in ids

    @pytest.mark.asyncio
    async def test_upsert_insert_then_update(self, db_session, test_feeds, sync_engine):
        from repositories.translation_repository import TranslationRepository
        feed_id = test_feeds[0][0]
        repo = TranslationRepository(db_session)

        action = await repo.upsert_feed_translation(feed_id, "hi", "नेपियर घास")
        await db_session.commit()
        assert action == "inserted"

        action2 = await repo.upsert_feed_translation(feed_id, "hi", "नेपियर घास (updated)")
        await db_session.commit()
        assert action2 == "updated"

        # Verify DB value is the latest
        with sync_engine.connect() as conn:
            row = conn.execute(text(
                "SELECT name FROM feed_translations WHERE feed_id=:fid AND language='hi'"
            ), {"fid": feed_id}).fetchone()
        assert row is not None
        assert "updated" in row[0]

    @pytest.mark.asyncio
    async def test_get_feed_translations_returns_all_languages(self, db_session, test_feeds):
        from repositories.translation_repository import TranslationRepository
        feed_id = test_feeds[0][0]
        repo = TranslationRepository(db_session)

        await repo.upsert_feed_translation(feed_id, "hi", "नेपियर घास")
        await repo.upsert_feed_translation(feed_id, "vi", "Cỏ Voi")
        await db_session.commit()

        translations = await repo.get_feed_translations(feed_id)
        langs = {t.language for t in translations}
        assert langs == {"hi", "vi"}

    @pytest.mark.asyncio
    async def test_delete_feed_translation(self, db_session, test_feeds, sync_engine):
        from repositories.translation_repository import TranslationRepository
        feed_id = test_feeds[0][0]
        repo = TranslationRepository(db_session)

        await repo.upsert_feed_translation(feed_id, "hi", "नेपियर घास")
        await db_session.commit()

        deleted = await repo.delete_feed_translation(feed_id, "hi")
        await db_session.commit()
        assert deleted is True

        with sync_engine.connect() as conn:
            row = conn.execute(text(
                "SELECT id FROM feed_translations WHERE feed_id=:fid AND language='hi'"
            ), {"fid": feed_id}).fetchone()
        assert row is None

    @pytest.mark.asyncio
    async def test_delete_returns_false_when_missing(self, db_session, test_feeds):
        from repositories.translation_repository import TranslationRepository
        feed_id = test_feeds[0][0]
        repo = TranslationRepository(db_session)
        deleted = await repo.delete_feed_translation(feed_id, "zz")
        assert deleted is False

    @pytest.mark.asyncio
    async def test_coverage_counts(self, db_session, test_country, test_feeds):
        from repositories.translation_repository import TranslationRepository
        feed_id = test_feeds[0][0]
        repo = TranslationRepository(db_session)

        await repo.upsert_feed_translation(feed_id, "hi", "नेपियर घास")
        await repo.upsert_vocabulary_translation(test_country, "feed_type", "Forage", "hi", "चारा")
        await db_session.commit()

        counts = await repo.get_coverage(test_country, "hi")
        assert counts["total_feeds"] == 2
        assert counts["translated_feeds"] == 1
        assert counts["missing_feeds"] == 1
        assert counts["translated_types"] >= 1


# ── Workbook export / import integration tests ────────────────────────────────

class TestWorkbookIntegration:

    @pytest.mark.asyncio
    async def test_export_returns_valid_xlsx(self, db_session, test_country, test_feeds):
        from services.translation_service import export_translation_workbook
        file_bytes, filename = await export_translation_workbook(db_session, test_country)
        assert isinstance(file_bytes, bytes) and len(file_bytes) > 0
        assert filename.endswith(".xlsx")
        sheets = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None)
        assert {"Feeds", "Feed Types", "Feed Categories"} == set(sheets)

    @pytest.mark.asyncio
    async def test_export_feeds_sheet_has_language_columns(self, db_session, test_country, test_feeds):
        from services.translation_service import export_translation_workbook
        file_bytes, _ = await export_translation_workbook(db_session, test_country)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds")
        assert "hi" in df.columns
        assert "vi" in df.columns

    @pytest.mark.asyncio
    async def test_export_prefills_existing_translation(self, db_session, test_country, test_feeds):
        from repositories.translation_repository import TranslationRepository
        from services.translation_service import export_translation_workbook
        feed_id = test_feeds[0][0]
        repo = TranslationRepository(db_session)
        await repo.upsert_feed_translation(feed_id, "hi", "नेपियर घास")
        await db_session.commit()

        file_bytes, _ = await export_translation_workbook(db_session, test_country)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds", dtype=str)
        row = df[df["feed_id"] == feed_id]
        assert not row.empty
        assert row.iloc[0]["hi"] == "नेपियर घास"

    @pytest.mark.asyncio
    async def test_import_inserts_translations(self, db_session, test_country, test_feeds, sync_engine):
        from services.translation_service import import_translation_workbook
        feed_id, code, name, *_ = test_feeds[0]
        workbook = _build_workbook(
            feeds=[{"feed_id": feed_id, "fd_code": code, "english_name": name, "hi": "नेपियर घास", "vi": "Cỏ Voi"}],
        )
        result = await import_translation_workbook(db_session, test_country, workbook)
        await db_session.commit()

        assert result["success"] is True
        assert result["feeds_inserted"] == 2  # hi + vi

        with sync_engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT language, name FROM feed_translations WHERE feed_id=:fid ORDER BY language"
            ), {"fid": feed_id}).fetchall()
        assert len(rows) == 2
        langs = {r[0]: r[1] for r in rows}
        assert langs["hi"] == "नेपियर घास"
        assert langs["vi"] == "Cỏ Voi"

    @pytest.mark.asyncio
    async def test_import_skips_empty_cells(self, db_session, test_country, test_feeds, sync_engine):
        from services.translation_service import import_translation_workbook
        feed_id, code, name, *_ = test_feeds[0]
        workbook = _build_workbook(
            feeds=[{"feed_id": feed_id, "fd_code": code, "english_name": name, "hi": "", "vi": "Cỏ Voi"}],
        )
        result = await import_translation_workbook(db_session, test_country, workbook)
        await db_session.commit()

        assert result["feeds_skipped"] >= 1
        assert result["feeds_inserted"] == 1  # only vi

    @pytest.mark.asyncio
    async def test_import_updates_existing_translation(self, db_session, test_country, test_feeds):
        from repositories.translation_repository import TranslationRepository
        from services.translation_service import import_translation_workbook
        feed_id, code, name, *_ = test_feeds[0]

        repo = TranslationRepository(db_session)
        await repo.upsert_feed_translation(feed_id, "hi", "पुराना नाम")
        await db_session.commit()

        workbook = _build_workbook(
            feeds=[{"feed_id": feed_id, "fd_code": code, "english_name": name, "hi": "नया नाम"}],
        )
        result = await import_translation_workbook(db_session, test_country, workbook)
        await db_session.commit()

        assert result["feeds_updated"] == 1
        assert result["feeds_inserted"] == 0

    @pytest.mark.asyncio
    async def test_full_round_trip(self, db_session, test_country, test_feeds):
        """Export (empty) → fill in → import → export again (pre-filled) round-trip."""
        from services.translation_service import (
            export_translation_workbook,
            import_translation_workbook,
        )
        # Export empty workbook
        file_bytes, _ = await export_translation_workbook(db_session, test_country)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds", dtype=str)
        # All hi cells should be empty
        assert all(df["hi"].fillna("") == "")

        # Build an import workbook from the exported structure, filling in translations
        feed_id = test_feeds[0][0]
        import_wb = _build_workbook(
            feeds=[
                {"feed_id": r["feed_id"], "fd_code": r["fd_code"],
                 "english_name": r["english_name"],
                 "hi": "परीक्षण" if r["feed_id"] == feed_id else "",
                 "vi": "kiểm tra" if r["feed_id"] == feed_id else ""}
                for _, r in df.iterrows()
            ],
        )
        result = await import_translation_workbook(db_session, test_country, import_wb)
        await db_session.commit()
        assert result["success"] is True

        # Re-export and check pre-fills
        file_bytes2, _ = await export_translation_workbook(db_session, test_country)
        df2 = pd.read_excel(io.BytesIO(file_bytes2), sheet_name="Feeds", dtype=str)
        row = df2[df2["feed_id"] == feed_id]
        assert not row.empty
        assert row.iloc[0]["hi"] == "परीक्षण"
        assert row.iloc[0]["vi"] == "kiểm tra"

    @pytest.mark.asyncio
    async def test_import_vocab_types_and_categories(self, db_session, test_country, sync_engine):
        from services.translation_service import import_translation_workbook
        workbook = _build_workbook(
            types=[{"english_value": "Forage", "hi": "चारा", "vi": "Thức ăn thô"}],
            cats=[{"english_value": "Grass", "hi": "घास", "vi": "Cỏ"}],
        )
        result = await import_translation_workbook(db_session, test_country, workbook)
        await db_session.commit()

        assert result["types_inserted"] == 2   # hi + vi for Forage
        assert result["categories_inserted"] == 2

        with sync_engine.connect() as conn:
            type_rows = conn.execute(text(
                "SELECT language, name FROM vocabulary_translations "
                "WHERE country_id=:cid AND kind='feed_type' AND source_value='Forage' "
                "ORDER BY language"
            ), {"cid": test_country}).fetchall()
        assert {r[0]: r[1] for r in type_rows} == {"hi": "चारा", "vi": "Thức ăn thô"}


# ── coverage endpoint integration ─────────────────────────────────────────────

class TestCoverageIntegration:

    @pytest.mark.asyncio
    async def test_coverage_zero_when_no_translations(self, db_session, test_country, test_feeds):
        from services.translation_service import get_translation_coverage
        result = await get_translation_coverage(db_session, test_country, "hi")
        assert result["total_feeds"] == 2
        assert result["translated_feeds"] == 0
        assert result["missing_feeds"] == 2

    @pytest.mark.asyncio
    async def test_coverage_partial(self, db_session, test_country, test_feeds):
        from repositories.translation_repository import TranslationRepository
        from services.translation_service import get_translation_coverage
        feed_id = test_feeds[0][0]
        repo = TranslationRepository(db_session)
        await repo.upsert_feed_translation(feed_id, "hi", "नेपियर घास")
        await db_session.commit()

        result = await get_translation_coverage(db_session, test_country, "hi")
        assert result["total_feeds"] == 2
        assert result["translated_feeds"] == 1
        assert result["missing_feeds"] == 1

    @pytest.mark.asyncio
    async def test_coverage_full_translations(self, db_session, test_country, test_feeds):
        from repositories.translation_repository import TranslationRepository
        from services.translation_service import get_translation_coverage
        repo = TranslationRepository(db_session)
        for fid, *_ in test_feeds:
            await repo.upsert_feed_translation(fid, "hi", "अनुवाद")
        await db_session.commit()

        result = await get_translation_coverage(db_session, test_country, "hi")
        assert result["translated_feeds"] == 2
        assert result["missing_feeds"] == 0


# ── Helper ────────────────────────────────────────────────────────────────────

def _build_workbook(feeds=None, types=None, cats=None) -> bytes:
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        pd.DataFrame(feeds or []).to_excel(w, sheet_name="Feeds", index=False)
        pd.DataFrame(types or []).to_excel(w, sheet_name="Feed Types", index=False)
        pd.DataFrame(cats or []).to_excel(w, sheet_name="Feed Categories", index=False)
    return buf.getvalue()
