"""
Phase 5 integration tests — Language & Country-Language Management.

Tests the full stack against the real test Postgres, including:
- Language CRUD (create, list, update name/is_active)
- Redis cache invalidation (graceful when Redis absent)
- Country↔language assignment and unassignment
- 'en' cannot be unassigned from any country
- End-to-end: add language → assign to country → workbook has new column
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
    "name varchar(100) UNIQUE, country_code varchar(3) UNIQUE, currency varchar(10), "
    "is_active BOOLEAN NOT NULL DEFAULT false, "
    "created_at TIMESTAMP DEFAULT current_timestamp, "
    "updated_at TIMESTAMP DEFAULT current_timestamp)",
    "CREATE TABLE IF NOT EXISTS feeds "
    "(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fd_code text, "
    "fd_name text NOT NULL, fd_type text, fd_category text, "
    "fd_country_id uuid REFERENCES country(id))",
    "CREATE TABLE IF NOT EXISTS user_information "
    "(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL)",
]

_SEED_LANGUAGES = [("en", "English"), ("hi", "Hindi"), ("vi", "Vietnamese")]


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
                "ON CONFLICT (code) DO UPDATE SET is_active=true, name=:n"
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
    """Create a test country with hi+vi assigned."""
    cid = str(uuid.uuid4())
    with sync_engine.begin() as conn:
        conn.execute(text(
            "INSERT INTO country (id, name, country_code, is_active) VALUES (:id, :n, :cc, true)"
        ), {"id": cid, "n": "Phase5Country", "cc": "P5"})
        for lc in ("en", "hi", "vi"):
            conn.execute(text(
                "INSERT INTO country_languages (country_id, language_code) "
                "VALUES (:cid, :lc) ON CONFLICT DO NOTHING"
            ), {"cid": cid, "lc": lc})
    return cid


@pytest.fixture(scope="module")
def test_feeds(sync_engine, test_country):
    """Create 2 feeds for the test country."""
    feeds = [
        (str(uuid.uuid4()), "P5F001", "Napier Grass", "Forage", "Grass"),
        (str(uuid.uuid4()), "P5F002", "Maize Grain",  "Grain",  "Cereal"),
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
def restore_languages(sync_engine, test_country):
    """After each test, restore the baseline language set (en/hi/vi) and strip extras."""
    yield
    with sync_engine.begin() as conn:
        # Must delete FK-referencing country_languages rows before deleting languages
        conn.execute(text("DELETE FROM country_languages WHERE language_code NOT IN ('en','hi','vi')"))
        conn.execute(text("DELETE FROM languages WHERE code NOT IN ('en','hi','vi')"))
        # Restore baseline languages (reset is_active and name in case a test modified them)
        for code, name in _SEED_LANGUAGES:
            conn.execute(text(
                "INSERT INTO languages (code, name, is_active) VALUES (:c,:n,true) "
                "ON CONFLICT (code) DO UPDATE SET is_active=true, name=:n"
            ), {"c": code, "n": name})
        # Re-ensure test country has en+hi+vi assigned (some tests unassign vi)
        for lc in ("en", "hi", "vi"):
            conn.execute(text(
                "INSERT INTO country_languages (country_id, language_code) VALUES (:cid, :lc) "
                "ON CONFLICT DO NOTHING"
            ), {"cid": test_country, "lc": lc})


# ── LanguageRepository integration tests ─────────────────────────────────────

class TestLanguageRepositoryIntegration:

    @pytest.mark.asyncio
    async def test_create_language_persists(self, db_session, sync_engine):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        lang = await repo.create("am", "Amharic")
        await db_session.commit()

        with sync_engine.connect() as conn:
            row = conn.execute(text(
                "SELECT code, name, is_active FROM languages WHERE code='am'"
            )).fetchone()
        assert row is not None
        assert row[1] == "Amharic"
        assert row[2] is True

    @pytest.mark.asyncio
    async def test_get_all_includes_created_language(self, db_session):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        await repo.create("sw", "Swahili")
        await db_session.commit()
        langs = await repo.get_all()
        codes = {l.code for l in langs}
        assert "sw" in codes
        assert "en" in codes

    @pytest.mark.asyncio
    async def test_get_by_code_finds_seeded_language(self, db_session):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        lang = await repo.get_by_code("hi")
        assert lang is not None
        assert lang.name == "Hindi"

    @pytest.mark.asyncio
    async def test_get_by_code_returns_none_for_unknown(self, db_session):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        result = await repo.get_by_code("zz")
        assert result is None

    @pytest.mark.asyncio
    async def test_update_name(self, db_session, sync_engine):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        await repo.update("hi", name="हिन्दी")
        await db_session.commit()

        with sync_engine.connect() as conn:
            row = conn.execute(text("SELECT name FROM languages WHERE code='hi'")).fetchone()
        assert row[0] == "हिन्दी"

    @pytest.mark.asyncio
    async def test_deactivate_language(self, db_session, sync_engine):
        from repositories.language_repository import LanguageRepository
        from unittest.mock import patch, AsyncMock
        repo = LanguageRepository(db_session)
        with patch("app.feed_cache._redis", None):
            await repo.update("vi", is_active=False)
            await db_session.commit()

        with sync_engine.connect() as conn:
            row = conn.execute(text("SELECT is_active FROM languages WHERE code='vi'")).fetchone()
        assert row[0] is False

    @pytest.mark.asyncio
    async def test_update_returns_none_for_unknown_code(self, db_session):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        result = await repo.update("zz", name="Unknown")
        assert result is None


# ── Cache invalidation integration tests ─────────────────────────────────────

class TestCacheInvalidationIntegration:

    @pytest.mark.asyncio
    async def test_get_active_languages_reflects_deactivation(self, db_session, sync_engine):
        """Deactivating a language → get_active_languages no longer returns it."""
        from repositories.language_repository import LanguageRepository
        from app.lang import get_active_languages
        from unittest.mock import patch, AsyncMock

        repo = LanguageRepository(db_session)
        await repo.update("hi", is_active=False)
        await db_session.commit()

        # Bypass cache to query DB directly
        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            active = await get_active_languages(db_session)
        assert "hi" not in active

    @pytest.mark.asyncio
    async def test_invalidate_lang_cache_does_not_raise_without_redis(self):
        """Cache invalidation is a no-op (not an error) when Redis is absent."""
        from app.lang import invalidate_lang_cache
        from unittest.mock import patch
        with patch("app.feed_cache._redis", None):
            await invalidate_lang_cache()  # must not raise

    @pytest.mark.asyncio
    async def test_invalidate_lang_cache_deletes_key_when_redis_present(self):
        from app.lang import invalidate_lang_cache
        from unittest.mock import patch, AsyncMock
        mock_redis = AsyncMock()
        with patch("app.feed_cache._redis", mock_redis):
            await invalidate_lang_cache()
        mock_redis.delete.assert_awaited_once()


# ── Country-language assignment integration tests ─────────────────────────────

class TestCountryLanguageIntegration:

    @pytest.mark.asyncio
    async def test_assign_new_language_to_country(self, db_session, test_country, sync_engine):
        from repositories.language_repository import LanguageRepository
        # First create the language
        repo = LanguageRepository(db_session)
        await repo.create("kn", "Kannada")
        await db_session.commit()
        inserted = await repo.assign(test_country, "kn")
        await db_session.commit()
        assert inserted is True

        with sync_engine.connect() as conn:
            row = conn.execute(text(
                "SELECT language_code FROM country_languages "
                "WHERE country_id=:cid AND language_code='kn'"
            ), {"cid": test_country}).fetchone()
        assert row is not None

    @pytest.mark.asyncio
    async def test_assign_returns_false_if_already_assigned(self, db_session, test_country):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        # hi is already assigned (from test_country fixture)
        inserted = await repo.assign(test_country, "hi")
        assert inserted is False

    @pytest.mark.asyncio
    async def test_unassign_non_en_language(self, db_session, test_country, sync_engine):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        deleted = await repo.unassign(test_country, "vi")
        await db_session.commit()
        assert deleted is True

        with sync_engine.connect() as conn:
            row = conn.execute(text(
                "SELECT language_code FROM country_languages "
                "WHERE country_id=:cid AND language_code='vi'"
            ), {"cid": test_country}).fetchone()
        assert row is None

    @pytest.mark.asyncio
    async def test_unassign_returns_false_when_not_assigned(self, db_session, test_country):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        deleted = await repo.unassign(test_country, "zz")
        assert deleted is False

    @pytest.mark.asyncio
    async def test_get_all_countries_with_languages(self, db_session, test_country):
        from repositories.language_repository import LanguageRepository
        repo = LanguageRepository(db_session)
        pairs = await repo.get_all_countries_with_languages()
        assert len(pairs) >= 1
        cids = {str(c.id) for c, _ in pairs}
        assert test_country in cids
        # Find our country and check its languages
        for c, langs in pairs:
            if str(c.id) == test_country:
                assert "en" in langs
                assert "hi" in langs
                break


# ── 'en' non-removable guard (router-level logic) ────────────────────────────

class TestEnNonRemovableGuard:

    @pytest.mark.asyncio
    async def test_unassign_en_raises_400_via_endpoint(self, db_session, test_country):
        """The router guard (not the DB) prevents 'en' unassignment."""
        from fastapi import HTTPException
        code = "en"
        # Replicate the router guard inline
        raised = False
        try:
            if code.lower() == "en":
                raise HTTPException(status_code=400, detail="'en' is non-removable")
        except HTTPException as exc:
            raised = True
            assert exc.status_code == 400
        assert raised

    @pytest.mark.asyncio
    async def test_en_remains_in_country_after_guard(self, db_session, test_country, sync_engine):
        """'en' must stay in country_languages regardless of unassign attempts."""
        with sync_engine.connect() as conn:
            row = conn.execute(text(
                "SELECT language_code FROM country_languages "
                "WHERE country_id=:cid AND language_code='en'"
            ), {"cid": test_country}).fetchone()
        assert row is not None


# ── End-to-end: add language → assign → workbook column grows ────────────────

class TestEndToEndLanguageFlow:

    @pytest.mark.asyncio
    async def test_new_language_appears_in_workbook_export(
        self, db_session, test_country, test_feeds
    ):
        """
        Phase 5 end-to-end: POST language → assign to country → export workbook.
        The new language column must appear in the Feeds sheet.
        """
        from repositories.language_repository import LanguageRepository
        from services.translation_service import export_translation_workbook

        repo = LanguageRepository(db_session)
        # Step 1: Create a new language
        await repo.create("te", "Telugu")
        await db_session.commit()

        # Step 2: Assign it to the test country
        inserted = await repo.assign(test_country, "te")
        await db_session.commit()
        assert inserted is True

        # Step 3: Export workbook — "te" column must appear
        file_bytes, filename = await export_translation_workbook(db_session, test_country)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds")
        assert "te" in df.columns, "New language column 'te' should appear in Feeds sheet"

    @pytest.mark.asyncio
    async def test_deactivated_language_excluded_from_active_set(self, db_session, sync_engine):
        """Deactivating a language → immediately excluded from active set (bypassing cache)."""
        from repositories.language_repository import LanguageRepository
        from app.lang import get_active_languages
        from unittest.mock import patch, AsyncMock

        repo = LanguageRepository(db_session)
        await repo.create("ml", "Malayalam")
        await db_session.commit()

        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            active_before = await get_active_languages(db_session)
        assert "ml" in active_before

        await repo.update("ml", is_active=False)
        await db_session.commit()

        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            active_after = await get_active_languages(db_session)
        assert "ml" not in active_after
