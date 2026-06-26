"""
Phase 2 integration tests — DB-backed language resolution against the test Postgres.

Covers:
  - get_active_languages queries the real languages table and includes 'en' (I3)
  - resolve_language priority chain: ?lang= > user pref > 'en'
  - Cache invalidate + re-query reflects DB changes
  - ?lang= override wins over user preferred_language
  - Inactive language codes are excluded from the active set

Requires the integration conftest.py to have re-pointed POSTGRES_* to the
throwaway test container (localhost:5455, rationsmart_test).
"""
import pathlib
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from unittest.mock import patch, AsyncMock

from alembic import command
from alembic.config import Config

from app.lang import get_active_languages, resolve_language

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_HEAD_BEFORE = "c3d4e5f6a7b8"

# Minimal FK-parent tables the migration needs (same as Phase 1 helper).
_BASELINE_DDL = [
    "CREATE TABLE IF NOT EXISTS country "
    "(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "
    "name varchar(100) UNIQUE, country_code varchar(3) UNIQUE)",
    "CREATE TABLE IF NOT EXISTS feeds "
    "(id uuid PRIMARY KEY, fd_name text NOT NULL, "
    "fd_type text, fd_category text, fd_country_id uuid REFERENCES country(id))",
    "CREATE TABLE IF NOT EXISTS user_information "
    "(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(100) NOT NULL)",
]


def _drop_schema(engine):
    with engine.begin() as conn:
        conn.execute(text(
            "DROP TABLE IF EXISTS vocabulary_translations, feed_translations, "
            "country_languages, languages, feeds, user_information, country, "
            "alembic_version CASCADE"
        ))


# ── fixtures ──────────────────────────────────────────────────────────────────

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


_SEED_LANGUAGES = [
    ("en", "English"), ("hi", "Hindi"), ("kn", "Kannada"),
    ("vi", "Vietnamese"), ("sw", "Swahili"), ("am", "Amharic"),
]


def _seed(conn):
    for code, name in _SEED_LANGUAGES:
        conn.execute(text(
            "INSERT INTO languages (code, name, is_active) VALUES (:c,:n,true) "
            "ON CONFLICT (code) DO UPDATE SET is_active=true"
        ), {"c": code, "n": name})


@pytest.fixture(scope="module", autouse=True)
def apply_migration(sync_engine):
    """Build the i18n schema + seed languages on the test container (module scope)."""
    _drop_schema(sync_engine)
    with sync_engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        for ddl in _BASELINE_DDL:
            conn.execute(text(ddl))
    cfg = Config(str(_REPO_ROOT / "alembic.ini"))
    command.stamp(cfg, _HEAD_BEFORE)
    command.upgrade(cfg, "head")
    # Seed all 6 languages once (migration only inserts 'en').
    with sync_engine.begin() as conn:
        _seed(conn)


@pytest.fixture
async def db_session(apply_migration):
    """Function-scoped: fresh engine + connection per test avoids stale snapshots."""
    from app.config import settings
    url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://")
    engine = create_async_engine(url, pool_size=1, max_overflow=0)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
def restore_languages(sync_engine):
    """Per-test fixture for tests that mutate languages — restores afterwards."""
    yield
    with sync_engine.begin() as conn:
        conn.execute(text("DELETE FROM languages WHERE code NOT IN ('en','hi','kn','vi','sw','am')"))
        _seed(conn)


# ── get_active_languages DB query tests ───────────────────────────────────────

class TestGetActiveLanguagesIntegration:
    @pytest.mark.asyncio
    async def test_returns_all_seeded_active_languages(self, db_session):
        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            result = await get_active_languages(db_session)
        assert {"en", "hi", "kn", "vi", "sw", "am"}.issubset(result)

    @pytest.mark.asyncio
    async def test_en_always_present(self, db_session):
        # Even if (hypothetically) 'en' were not in DB, it's always added (I3)
        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            result = await get_active_languages(db_session)
        assert "en" in result

    @pytest.mark.asyncio
    async def test_inactive_language_excluded(self, db_session, sync_engine, restore_languages):
        with sync_engine.begin() as conn:
            conn.execute(text("UPDATE languages SET is_active=false WHERE code='hi'"))

        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            result = await get_active_languages(db_session)

        assert "hi" not in result
        assert "vi" in result  # others unaffected

    @pytest.mark.asyncio
    async def test_newly_inserted_language_appears_after_cache_invalidation(
        self, db_session, sync_engine, restore_languages
    ):
        with sync_engine.begin() as conn:
            conn.execute(text(
                "INSERT INTO languages (code, name, is_active) VALUES ('te','Telugu',true) "
                "ON CONFLICT DO NOTHING"
            ))

        # cache miss forces DB re-query
        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            result = await get_active_languages(db_session)

        assert "te" in result


# ── resolve_language priority chain (uses live active set) ────────────────────

class TestResolveLanguagePriorityIntegration:
    @pytest.mark.asyncio
    async def test_lang_param_overrides_user_pref(self, db_session):
        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            active = await get_active_languages(db_session)
        # user prefers 'hi', but ?lang=vi is passed
        assert resolve_language("vi", "hi", active) == "vi"

    @pytest.mark.asyncio
    async def test_user_pref_used_when_no_param(self, db_session):
        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            active = await get_active_languages(db_session)
        assert resolve_language(None, "kn", active) == "kn"

    @pytest.mark.asyncio
    async def test_fallback_to_en_when_param_not_active(self, db_session, sync_engine, restore_languages):
        with sync_engine.begin() as conn:
            conn.execute(text("UPDATE languages SET is_active=false WHERE code='sw'"))

        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            active = await get_active_languages(db_session)

        # 'sw' is inactive → fall back to 'en'
        assert resolve_language("sw", None, active) == "en"

    @pytest.mark.asyncio
    async def test_en_param_always_valid(self, db_session):
        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            active = await get_active_languages(db_session)
        assert resolve_language("en", "hi", active) == "en"
