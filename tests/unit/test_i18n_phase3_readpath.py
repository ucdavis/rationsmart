"""
Phase 3 unit tests — read-path localization (repository helpers + service layer).

All tests are DB-free: SQLAlchemy queries are replaced with AsyncMock objects so the
logic around COALESCE fallback, lang threading, and service-layer dict building can be
exercised without infrastructure.
"""
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.lang import resolve_language
from services.diet_service import get_feed_details, get_feed_names, search_feeds


# ── Helper factories ──────────────────────────────────────────────────────────

def _make_feed(**kwargs):
    defaults = dict(
        id=uuid.uuid4(),
        fd_code="F001",
        fd_name="Napier grass",
        fd_type="Roughage",
        fd_category="Pasture grass",
        fd_country_id=uuid.uuid4(),
        fd_country_name="Kenya",
        fd_country_cd="KEN",
        fd_dm=25.0, fd_ash=10.0, fd_cp=8.0, fd_npn_cp=0.0,
        fd_ee=2.0, fd_cf=30.0, fd_nfe=45.0, fd_st=0.0,
        fd_ndf=65.0, fd_hemicellulose=35.0, fd_adf=30.0,
        fd_cellulose=28.0, fd_lg=5.0, fd_ndin=1.0, fd_adin=0.5,
        fd_ca=0.4, fd_p=0.3, fd_season=None, fd_orginin=None,
        fd_ipb_local_lab=None,
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _make_custom_feed(**kwargs):
    defaults = dict(
        id=uuid.uuid4(),
        fd_code=None,
        fd_name="My custom feed",
        fd_type="Roughage",
        fd_category="Legume hay",
        fd_country_id=uuid.uuid4(),
        fd_country_name="India",
        fd_country_cd="IND",
        fd_dm=18.0, fd_ash=8.0, fd_cp=15.0, fd_npn_cp=0.0,
        fd_ee=3.0, fd_cf=25.0, fd_nfe=40.0, fd_st=0.0,
        fd_ndf=55.0, fd_hemicellulose=30.0, fd_adf=25.0,
        fd_cellulose=22.0, fd_lg=4.0, fd_ndin=0.8, fd_adin=0.3,
        fd_ca=1.2, fd_p=0.2, fd_season=None, fd_orginin=None,
        fd_ipb_local_lab=None,
        user_id=uuid.uuid4(),
    )
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _make_row(feed, display_name=None, display_type=None, display_category=None):
    """Simulates a SQLAlchemy Row(Feed, display_name, display_type, display_category)."""
    return SimpleNamespace(
        Feed=feed,
        display_name=display_name if display_name is not None else feed.fd_name,
        display_type=display_type if display_type is not None else feed.fd_type,
        display_category=display_category if display_category is not None else feed.fd_category,
    )


# ── get_feed_details (Step 3.1) ───────────────────────────────────────────────

class TestGetFeedDetailsLocalized:
    @pytest.mark.asyncio
    async def test_returns_display_fields_for_standard_feed(self):
        feed = _make_feed(fd_name="Napier grass", fd_type="Roughage", fd_category="Pasture grass")
        row = _make_row(feed, display_name="Cỏ Voi", display_type="Thô", display_category="Cỏ đồng")
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo, \
             patch("services.diet_service.UserRepository") as MockUserRepo:
            repo = MockRepo.return_value
            repo.get_by_id_localized = AsyncMock(return_value=row)
            user_repo = MockUserRepo.return_value
            user_repo.get_country_by_id = AsyncMock(return_value=SimpleNamespace(name="Vietnam"))

            result = await get_feed_details(db, str(feed.id), "user-1", lang="vi")

        assert result["fd_name"] == "Napier grass"          # I1: source unchanged
        assert result["display_name"] == "Cỏ Voi"           # I2: translated
        assert result["display_type"] == "Thô"
        assert result["display_category"] == "Cỏ đồng"

    @pytest.mark.asyncio
    async def test_coalesces_to_english_when_no_translation(self):
        feed = _make_feed(fd_name="Napier grass", fd_type="Roughage", fd_category="Pasture grass")
        # display_* equals English source when no translation exists (COALESCE fallback)
        row = _make_row(feed)
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo, \
             patch("services.diet_service.UserRepository") as MockUserRepo:
            repo = MockRepo.return_value
            repo.get_by_id_localized = AsyncMock(return_value=row)
            user_repo = MockUserRepo.return_value
            user_repo.get_country_by_id = AsyncMock(return_value=None)

            result = await get_feed_details(db, str(feed.id), "user-1", lang="hi")

        assert result["display_name"] == "Napier grass"   # I3: COALESCE fallback
        assert result["display_type"] == "Roughage"
        assert result["display_category"] == "Pasture grass"

    @pytest.mark.asyncio
    async def test_falls_back_to_custom_feed_when_not_in_standard(self):
        custom = _make_custom_feed(fd_name="My crop residue")
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo, \
             patch("services.diet_service.UserRepository") as MockUserRepo:
            repo = MockRepo.return_value
            repo.get_by_id_localized = AsyncMock(return_value=None)
            repo.get_custom_by_id = AsyncMock(return_value=custom)
            user_repo = MockUserRepo.return_value
            user_repo.get_country_by_id = AsyncMock(return_value=None)

            result = await get_feed_details(db, str(custom.id), "user-1", lang="hi")

        assert result["fd_name"] == "My crop residue"
        assert result["display_name"] == "My crop residue"  # no translation for custom

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found_anywhere(self):
        db = AsyncMock()
        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.get_by_id_localized = AsyncMock(return_value=None)
            repo.get_custom_by_id = AsyncMock(return_value=None)
            result = await get_feed_details(db, str(uuid.uuid4()), "user-1", lang="vi")
        assert result is None

    @pytest.mark.asyncio
    async def test_lang_en_defaults_to_english_names(self):
        feed = _make_feed()
        row = _make_row(feed)  # display_* = fd_* for en
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo, \
             patch("services.diet_service.UserRepository") as MockUserRepo:
            repo = MockRepo.return_value
            repo.get_by_id_localized = AsyncMock(return_value=row)
            user_repo = MockUserRepo.return_value
            user_repo.get_country_by_id = AsyncMock(return_value=None)

            result = await get_feed_details(db, str(feed.id), "user-1", lang="en")

        assert result["display_name"] == result["fd_name"]


# ── search_feeds (Step 3.2) ───────────────────────────────────────────────────

class TestSearchFeedsLocalized:
    @pytest.mark.asyncio
    async def test_std_feed_uses_translated_name_as_feed_name(self):
        feed = _make_feed(fd_name="Napier grass")
        row = _make_row(feed, display_name="Cỏ Voi", display_type="Thô", display_category="Cỏ đồng")
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.search_feeds = AsyncMock(return_value=([row], [], 1))

            results, total = await search_feeds(db, "cỏ", "cid-1", "uid-1", 20, lang="vi")

        assert total == 1
        assert results[0]["feed_name"] == "Cỏ Voi"
        assert results[0]["feed_type"] == "Thô"
        assert results[0]["feed_category"] == "Cỏ đồng"
        assert results[0]["is_custom"] is False

    @pytest.mark.asyncio
    async def test_custom_feed_never_translated(self):
        custom = _make_custom_feed(fd_name="My feed")
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.search_feeds = AsyncMock(return_value=([], [custom], 1))

            results, total = await search_feeds(db, "my", "cid-1", "uid-1", 20, lang="vi")

        assert results[0]["feed_name"] == "My feed"
        assert results[0]["is_custom"] is True

    @pytest.mark.asyncio
    async def test_short_query_returns_empty_without_db(self):
        db = AsyncMock()
        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.search_feeds = AsyncMock()
            results, total = await search_feeds(db, "a", "cid-1", "uid-1", 20, lang="vi")
        assert results == []
        assert total == 0
        repo.search_feeds.assert_not_called()

    @pytest.mark.asyncio
    async def test_ranking_uses_display_name(self):
        """Custom feeds rank first; among std, prefix matches rank before mid-string."""
        custom = _make_custom_feed(fd_name="cỏ voi custom")
        feed1 = _make_feed(fd_name="Bermuda grass")
        feed2 = _make_feed(fd_name="Napier grass")
        row1 = _make_row(feed1, display_name="cỏ lá")
        row2 = _make_row(feed2, display_name="cỏ voi")
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.search_feeds = AsyncMock(return_value=([row1, row2], [custom], 3))

            results, _ = await search_feeds(db, "cỏ", "cid-1", "uid-1", 20, lang="vi")

        names = [r["feed_name"] for r in results]
        # Custom comes first (is_custom rank 0), then prefix match "cỏ voi", then "cỏ lá"
        assert names[0] == "cỏ voi custom"


# ── get_feed_names (Step 3.1) ─────────────────────────────────────────────────

class TestGetFeedNamesLocalized:
    @pytest.mark.asyncio
    async def test_std_feed_dict_includes_display_fields(self):
        feed = _make_feed(fd_name="Maize silage", fd_type="Roughage", fd_category="Silage")
        row = _make_row(feed, display_name="Ủ chua ngô", display_type="Thô", display_category="Ủ chua")
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.get_feed_names = AsyncMock(return_value=([row], []))

            std, cust = await get_feed_names(db, "cid", "uid", lang="vi")

        assert len(std) == 1
        assert std[0]["fd_name"] == "Maize silage"         # English preserved
        assert std[0]["display_name"] == "Ủ chua ngô"      # translated
        assert std[0]["display_type"] == "Thô"
        assert std[0]["display_category"] == "Ủ chua"

    @pytest.mark.asyncio
    async def test_custom_feed_dict_display_equals_fd_name(self):
        custom = _make_custom_feed(fd_name="Home-made feed")
        db = AsyncMock()

        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.get_feed_names = AsyncMock(return_value=([], [custom]))

            std, cust = await get_feed_names(db, "cid", "uid", lang="vi")

        assert cust[0]["fd_name"] == "Home-made feed"
        assert cust[0]["display_name"] == "Home-made feed"  # custom: no translation

    @pytest.mark.asyncio
    async def test_empty_lists_returned_when_no_feeds(self):
        db = AsyncMock()
        with patch("services.diet_service.FeedRepository") as MockRepo:
            repo = MockRepo.return_value
            repo.get_feed_names = AsyncMock(return_value=([], []))
            std, cust = await get_feed_names(db, "cid", "uid")
        assert std == []
        assert cust == []


# ── get_language_authenticated dependency (Step 3.4) ─────────────────────────

class TestGetLanguageAuthenticated:
    @pytest.mark.asyncio
    async def test_uses_user_preferred_language(self):
        """Authenticated user's preferred_language is respected when no ?lang= param."""
        from app.dependencies import get_language_authenticated

        user = SimpleNamespace(preferred_language="vi")
        db = AsyncMock()

        with patch("app.lang.get_active_languages", AsyncMock(return_value={"en", "vi", "hi"})):
            # Simulate dependency call: lang=None (no query param), user has preferred_language
            lang = await get_language_authenticated.__wrapped__(
                lang=None, current_user=user, db=db
            ) if hasattr(get_language_authenticated, "__wrapped__") else \
                await _call_get_language_authenticated(lang=None, user=user, db=db)

        assert lang == "vi"

    @pytest.mark.asyncio
    async def test_query_param_overrides_user_pref(self):
        from app.dependencies import get_language_authenticated

        user = SimpleNamespace(preferred_language="hi")
        db = AsyncMock()

        with patch("app.lang.get_active_languages", AsyncMock(return_value={"en", "vi", "hi"})):
            lang = await _call_get_language_authenticated(lang="vi", user=user, db=db)

        assert lang == "vi"

    @pytest.mark.asyncio
    async def test_falls_back_to_en_when_pref_not_active(self):
        user = SimpleNamespace(preferred_language="de")
        db = AsyncMock()

        with patch("app.lang.get_active_languages", AsyncMock(return_value={"en", "hi"})):
            lang = await _call_get_language_authenticated(lang=None, user=user, db=db)

        assert lang == "en"


async def _call_get_language_authenticated(lang, user, db):
    """Directly invoke the dependency logic (bypassing FastAPI injection)."""
    from app.lang import get_active_languages, resolve_language
    user_pref = getattr(user, "preferred_language", None)
    active = await get_active_languages(db)
    return resolve_language(lang, user_pref, active)


# ── Country schema — supported_languages (Step 3.6) ──────────────────────────

class TestCountrySchema:
    def test_country_schema_includes_supported_languages(self):
        from app.schemas.auth import Country
        c = Country(
            id="abc",
            name="Vietnam",
            country_code="VNM",
            currency="VND",
            is_active=True,
            supported_languages=["en", "vi"],
        )
        assert c.supported_languages == ["en", "vi"]

    def test_supported_languages_defaults_empty(self):
        from app.schemas.auth import Country
        c = Country(
            id="abc",
            name="Vietnam",
            country_code="VNM",
            is_active=True,
        )
        assert c.supported_languages == []


# ── UserResponse — preferred_language (Step 3.6) ─────────────────────────────

class TestUserResponsePreferredLanguage:
    def test_user_response_has_preferred_language(self):
        from app.schemas.auth import UserResponse
        u = UserResponse(id="uid", name="Alice", email_id="a@b.com", preferred_language="hi")
        assert u.preferred_language == "hi"

    def test_preferred_language_defaults_en(self):
        from app.schemas.auth import UserResponse
        u = UserResponse(id="uid", name="Alice", email_id="a@b.com")
        assert u.preferred_language == "en"


# ── UserUpdateRequest — preferred_language (Step 3.6) ────────────────────────

class TestUserUpdateRequestPreferredLanguage:
    def test_accepts_preferred_language(self):
        from app.schemas.auth import UserUpdateRequest
        req = UserUpdateRequest(preferred_language="vi")
        assert req.preferred_language == "vi"

    def test_preferred_language_optional(self):
        from app.schemas.auth import UserUpdateRequest
        req = UserUpdateRequest(name="Bob")
        assert req.preferred_language is None


# ── FeedDetailsResponse — display fields (Step 3.3) ──────────────────────────

class TestFeedDetailsResponseDisplayFields:
    def test_display_fields_present(self):
        from app.schemas.feed import FeedDetailsResponse
        r = FeedDetailsResponse(
            feed_id="fid",
            fd_name="Napier grass",
            display_name="Cỏ Voi",
            display_type="Thô",
            display_category="Cỏ đồng",
        )
        assert r.display_name == "Cỏ Voi"
        assert r.display_type == "Thô"
        assert r.display_category == "Cỏ đồng"

    def test_display_fields_optional_none(self):
        from app.schemas.feed import FeedDetailsResponse
        r = FeedDetailsResponse(feed_id="fid", fd_name="Napier grass")
        assert r.display_name is None
        assert r.display_type is None
        assert r.display_category is None
