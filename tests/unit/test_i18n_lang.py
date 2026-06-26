"""
Phase 2 unit tests — app/lang.py and the language cache helpers in feed_cache.py.

All tests are DB-free and Redis-free: async DB / Redis calls are replaced with
AsyncMock so the pure resolver logic and cache-path branching can be tested
quickly without infrastructure.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.lang import resolve_language, get_active_languages


# ── resolve_language (pure — no I/O) ─────────────────────────────────────────

ACTIVE = {"en", "hi", "vi", "kn", "sw", "am"}


class TestResolveLanguage:
    def test_query_param_wins_over_user_pref(self):
        assert resolve_language("vi", "hi", ACTIVE) == "vi"

    def test_user_pref_used_when_no_query_param(self):
        assert resolve_language(None, "hi", ACTIVE) == "hi"

    def test_fallback_to_en_when_nothing_set(self):
        assert resolve_language(None, None, ACTIVE) == "en"

    def test_fallback_to_en_when_query_param_unknown(self):
        # 'zz' is not in ACTIVE → falls through to 'en'
        assert resolve_language("zz", None, ACTIVE) == "en"

    def test_fallback_to_en_when_user_pref_inactive(self):
        # user has 'de' but it's not active in this deployment
        assert resolve_language(None, "de", ACTIVE) == "en"

    def test_query_param_takes_priority_even_if_user_pref_also_valid(self):
        assert resolve_language("kn", "hi", ACTIVE) == "kn"

    def test_en_always_valid_as_query_param(self):
        assert resolve_language("en", None, ACTIVE) == "en"

    def test_en_always_returned_even_if_not_in_active_set(self):
        # I3: 'en' is the hard fallback regardless of what's in `active`
        assert resolve_language(None, None, set()) == "en"

    def test_empty_string_query_param_treated_as_absent(self):
        assert resolve_language("", "vi", ACTIVE) == "vi"

    def test_none_user_pref_falls_through_to_en(self):
        assert resolve_language(None, None, {"hi", "vi"}) == "en"


# ── get_active_languages — cache miss path (DB called) ────────────────────────

class TestGetActiveLanguagesDBPath:
    @pytest.mark.asyncio
    async def test_queries_db_and_caches_when_cache_miss(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([("hi",), ("vi",), ("kn",)]))
        db.execute = AsyncMock(return_value=mock_result)

        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()) as mock_set:
            result = await get_active_languages(db)

        assert "en" in result          # I3: always present
        assert "hi" in result
        assert "vi" in result
        db.execute.assert_called_once()
        mock_set.assert_called_once()

    @pytest.mark.asyncio
    async def test_en_added_even_if_absent_from_db(self):
        db = AsyncMock()
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([("hi",)]))
        db.execute = AsyncMock(return_value=mock_result)

        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            result = await get_active_languages(db)

        assert "en" in result

    @pytest.mark.asyncio
    async def test_db_failure_falls_back_to_en_only(self):
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=Exception("DB unavailable"))

        with patch("app.lang.get_lang_codes_from_cache", AsyncMock(return_value=None)), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()):
            result = await get_active_languages(db)

        assert result == {"en"}


# ── get_active_languages — cache hit path (DB NOT called) ─────────────────────

class TestGetActiveLanguagesCachePath:
    @pytest.mark.asyncio
    async def test_returns_cached_codes_without_db(self):
        db = AsyncMock()

        with patch("app.lang.get_lang_codes_from_cache",
                   AsyncMock(return_value=["en", "hi", "vi"])):
            result = await get_active_languages(db)

        assert result == {"en", "hi", "vi"}
        db.execute.assert_not_called()   # DB never touched on cache hit

    @pytest.mark.asyncio
    async def test_cache_hit_does_not_re_cache(self):
        db = AsyncMock()

        with patch("app.lang.get_lang_codes_from_cache",
                   AsyncMock(return_value=["en", "vi"])), \
             patch("app.lang.set_lang_codes_in_cache", AsyncMock()) as mock_set:
            await get_active_languages(db)

        mock_set.assert_not_called()


# ── feed_cache language helpers (unit-level smoke) ────────────────────────────

class TestFeedCacheLangHelpers:
    @pytest.mark.asyncio
    async def test_get_returns_none_when_redis_absent(self):
        from app.feed_cache import get_lang_codes_from_cache
        # _redis is None at module init (no lifespan in unit tests)
        result = await get_lang_codes_from_cache()
        assert result is None

    @pytest.mark.asyncio
    async def test_set_is_noop_when_redis_absent(self):
        from app.feed_cache import set_lang_codes_in_cache
        # Should not raise even when _redis is None
        await set_lang_codes_in_cache(["en", "hi"])

    @pytest.mark.asyncio
    async def test_invalidate_is_noop_when_redis_absent(self):
        from app.feed_cache import invalidate_lang_cache
        await invalidate_lang_cache()
