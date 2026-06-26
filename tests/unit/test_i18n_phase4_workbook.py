"""
Unit tests for Phase 4 — Translation Workbook and CRUD.

All DB I/O is mocked. Integration with a real DB is covered by
tests/integration/test_i18n_phase4_integration.py.
"""
import io
import uuid
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd
import pytest

# ── Helpers ───────────────────────────────────────────────────────────────────

COUNTRY_ID = str(uuid.uuid4())
FEED_ID_1 = str(uuid.uuid4())
FEED_ID_2 = str(uuid.uuid4())


def _mock_feed(feed_id, code, name, fd_type="Forage", fd_category="Grass"):
    f = SimpleNamespace(
        id=uuid.UUID(feed_id),
        fd_code=code,
        fd_name=name,
        fd_type=fd_type,
        fd_category=fd_category,
    )
    return f


def _make_workbook(
    feeds_df: pd.DataFrame,
    types_df: pd.DataFrame,
    cats_df: pd.DataFrame,
) -> bytes:
    """Helper: build a valid 3-sheet .xlsx in memory."""
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as w:
        feeds_df.to_excel(w, sheet_name="Feeds", index=False)
        types_df.to_excel(w, sheet_name="Feed Types", index=False)
        cats_df.to_excel(w, sheet_name="Feed Categories", index=False)
    return buf.getvalue()


# ── TranslationRepository unit tests ─────────────────────────────────────────

class TestTranslationRepositoryUnit:
    """Test repository methods with a mocked AsyncSession."""

    def _make_repo(self):
        from repositories.translation_repository import TranslationRepository
        db = AsyncMock()
        return TranslationRepository(db), db

    def _sync_result(self, rows):
        """Return a MagicMock whose .all() returns `rows` synchronously."""
        m = MagicMock()
        m.all.return_value = rows
        return m

    @pytest.mark.asyncio
    async def test_get_country_language_codes_excludes_en(self):
        repo, db = self._make_repo()
        db.execute.return_value = self._sync_result([("hi",), ("vi",)])
        result = await repo.get_country_language_codes(COUNTRY_ID)
        assert db.execute.called
        assert isinstance(result, list)

    @pytest.mark.asyncio
    async def test_get_country_feed_ids_returns_string_set(self):
        repo, db = self._make_repo()
        uid = uuid.uuid4()
        db.execute.return_value = self._sync_result([(uid,)])
        result = await repo.get_country_feed_ids(COUNTRY_ID)
        assert str(uid) in result
        assert isinstance(result, set)

    @pytest.mark.asyncio
    async def test_get_feed_translations_map_structure(self):
        repo, db = self._make_repo()
        db.execute.return_value = self._sync_result([
            (uuid.UUID(FEED_ID_1), "hi", "घास"),
            (uuid.UUID(FEED_ID_1), "vi", "Cỏ"),
        ])
        result = await repo.get_feed_translations_map(COUNTRY_ID)
        assert FEED_ID_1 in result
        assert result[FEED_ID_1]["hi"] == "घास"
        assert result[FEED_ID_1]["vi"] == "Cỏ"

    @pytest.mark.asyncio
    async def test_get_vocabulary_translations_map_structure(self):
        repo, db = self._make_repo()
        db.execute.return_value = self._sync_result([
            ("Forage", "hi", "चारा"),
            ("Forage", "vi", "Thức ăn"),
        ])
        result = await repo.get_vocabulary_translations_map(COUNTRY_ID, "feed_type")
        assert "Forage" in result
        assert result["Forage"]["hi"] == "चारा"

    @pytest.mark.asyncio
    async def test_upsert_feed_translation_returns_inserted_when_new(self):
        repo, db = self._make_repo()
        # Simulate no existing row (first execute returns None scalar)
        first_result = MagicMock()
        first_result.scalar_one_or_none.return_value = None
        db.execute.side_effect = [first_result, AsyncMock()]
        action = await repo.upsert_feed_translation(FEED_ID_1, "hi", "घास")
        assert action == "inserted"

    @pytest.mark.asyncio
    async def test_upsert_feed_translation_returns_updated_when_existing(self):
        repo, db = self._make_repo()
        first_result = MagicMock()
        first_result.scalar_one_or_none.return_value = uuid.uuid4()
        db.execute.side_effect = [first_result, AsyncMock()]
        action = await repo.upsert_feed_translation(FEED_ID_1, "hi", "घास updated")
        assert action == "updated"

    @pytest.mark.asyncio
    async def test_delete_feed_translation_returns_true_when_found(self):
        repo, db = self._make_repo()
        result_mock = MagicMock()
        result_mock.rowcount = 1
        db.execute.return_value = result_mock
        deleted = await repo.delete_feed_translation(FEED_ID_1, "hi")
        assert deleted is True

    @pytest.mark.asyncio
    async def test_delete_feed_translation_returns_false_when_not_found(self):
        repo, db = self._make_repo()
        result_mock = MagicMock()
        result_mock.rowcount = 0
        db.execute.return_value = result_mock
        deleted = await repo.delete_feed_translation(FEED_ID_1, "hi")
        assert deleted is False


# ── translation_service.export_translation_workbook ──────────────────────────

class TestExportTranslationWorkbook:
    """Test the export service with a mocked repository."""

    def _patch_repo(self, lang_codes, feeds, feed_trans, types, cats, type_trans, cat_trans):
        mock_repo = AsyncMock()
        mock_repo.get_country_language_codes.return_value = lang_codes
        mock_repo.get_country_feeds.return_value = feeds
        mock_repo.get_feed_translations_map.return_value = feed_trans
        mock_repo.get_distinct_types.return_value = types
        mock_repo.get_distinct_categories.return_value = cats
        mock_repo.get_vocabulary_translations_map.side_effect = [type_trans, cat_trans]
        return mock_repo

    @pytest.mark.asyncio
    async def test_returns_bytes_and_filename(self):
        from services.translation_service import export_translation_workbook
        feeds = [_mock_feed(FEED_ID_1, "F001", "Grass")]
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._patch_repo(
                ["hi"], feeds, {}, ["Forage"], ["Grass"], {}, {}
            ),
        ):
            result = await export_translation_workbook(AsyncMock(), COUNTRY_ID)
        file_bytes, filename = result
        assert isinstance(file_bytes, bytes)
        assert len(file_bytes) > 0
        assert filename.startswith("translations_")
        assert filename.endswith(".xlsx")

    @pytest.mark.asyncio
    async def test_workbook_has_three_sheets(self):
        from services.translation_service import export_translation_workbook
        feeds = [_mock_feed(FEED_ID_1, "F001", "Grass")]
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._patch_repo(
                ["hi"], feeds, {}, ["Forage"], ["Grass"], {}, {}
            ),
        ):
            file_bytes, _ = await export_translation_workbook(AsyncMock(), COUNTRY_ID)
        sheets = pd.read_excel(io.BytesIO(file_bytes), sheet_name=None)
        assert "Feeds" in sheets
        assert "Feed Types" in sheets
        assert "Feed Categories" in sheets

    @pytest.mark.asyncio
    async def test_language_columns_present_in_feeds_sheet(self):
        from services.translation_service import export_translation_workbook
        feeds = [_mock_feed(FEED_ID_1, "F001", "Grass")]
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._patch_repo(
                ["hi", "vi"], feeds, {}, [], [], {}, {}
            ),
        ):
            file_bytes, _ = await export_translation_workbook(AsyncMock(), COUNTRY_ID)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds")
        assert "hi" in df.columns
        assert "vi" in df.columns

    @pytest.mark.asyncio
    async def test_existing_translations_pre_filled(self):
        from services.translation_service import export_translation_workbook
        feeds = [_mock_feed(FEED_ID_1, "F001", "Grass")]
        feed_trans = {FEED_ID_1: {"hi": "घास"}}
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._patch_repo(
                ["hi"], feeds, feed_trans, [], [], {}, {}
            ),
        ):
            file_bytes, _ = await export_translation_workbook(AsyncMock(), COUNTRY_ID)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds")
        assert df.iloc[0]["hi"] == "घास"

    @pytest.mark.asyncio
    async def test_missing_translation_cell_is_empty(self):
        from services.translation_service import export_translation_workbook
        feeds = [_mock_feed(FEED_ID_1, "F001", "Grass")]
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._patch_repo(
                ["hi"], feeds, {}, [], [], {}, {}
            ),
        ):
            file_bytes, _ = await export_translation_workbook(AsyncMock(), COUNTRY_ID)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds")
        # Empty string or NaN is acceptable for "no translation"
        val = df.iloc[0]["hi"]
        assert val == "" or (isinstance(val, float) and pd.isna(val))

    @pytest.mark.asyncio
    async def test_no_languages_produces_metadata_only_columns(self):
        from services.translation_service import export_translation_workbook
        feeds = [_mock_feed(FEED_ID_1, "F001", "Grass")]
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._patch_repo(
                [], feeds, {}, [], [], {}, {}
            ),
        ):
            file_bytes, _ = await export_translation_workbook(AsyncMock(), COUNTRY_ID)
        df = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feeds")
        assert "feed_id" in df.columns
        assert "english_name" in df.columns
        # No language code columns
        assert len([c for c in df.columns if len(c) <= 5 and c.islower() and c not in {"hi", "vi"}]) == 0

    @pytest.mark.asyncio
    async def test_vocab_sheets_source_column_present(self):
        from services.translation_service import export_translation_workbook
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._patch_repo(
                ["vi"], [], {}, ["Forage", "Grain"], ["Grass"], {}, {}
            ),
        ):
            file_bytes, _ = await export_translation_workbook(AsyncMock(), COUNTRY_ID)
        df_types = pd.read_excel(io.BytesIO(file_bytes), sheet_name="Feed Types")
        assert "english_value" in df_types.columns
        assert len(df_types) == 2  # Forage + Grain


# ── translation_service.import_translation_workbook ──────────────────────────

class TestImportTranslationWorkbook:
    """Test the import service with a mocked repository."""

    def _make_mock_repo(self, lang_codes, valid_feed_ids=None):
        mock_repo = AsyncMock()
        mock_repo.get_country_language_codes.return_value = lang_codes
        mock_repo.get_country_feed_ids.return_value = valid_feed_ids or {FEED_ID_1}
        mock_repo.upsert_feed_translation.return_value = "inserted"
        mock_repo.upsert_vocabulary_translation.return_value = "inserted"
        return mock_repo

    def _make_workbook_bytes(self, feeds_data=None, types_data=None, cats_data=None):
        feeds_df = pd.DataFrame(feeds_data or [])
        types_df = pd.DataFrame(types_data or [])
        cats_df = pd.DataFrame(cats_data or [])
        return _make_workbook(feeds_df, types_df, cats_df)

    @pytest.mark.asyncio
    async def test_returns_success_true_for_valid_file(self):
        from services.translation_service import import_translation_workbook
        wb = self._make_workbook_bytes(
            feeds_data=[{"feed_id": FEED_ID_1, "fd_code": "F01", "english_name": "Grass", "hi": "घास"}]
        )
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._make_mock_repo(["hi"]),
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_inserted_count_increments(self):
        from services.translation_service import import_translation_workbook
        wb = self._make_workbook_bytes(
            feeds_data=[{"feed_id": FEED_ID_1, "fd_code": "F01", "english_name": "Grass", "hi": "घास"}]
        )
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._make_mock_repo(["hi"]),
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        assert result["feeds_inserted"] == 1
        assert result["feeds_updated"] == 0

    @pytest.mark.asyncio
    async def test_updated_count_when_existing(self):
        from services.translation_service import import_translation_workbook
        mock_repo = self._make_mock_repo(["hi"])
        mock_repo.upsert_feed_translation.return_value = "updated"
        wb = self._make_workbook_bytes(
            feeds_data=[{"feed_id": FEED_ID_1, "fd_code": "F01", "english_name": "Grass", "hi": "घास updated"}]
        )
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=mock_repo,
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        assert result["feeds_updated"] == 1
        assert result["feeds_inserted"] == 0

    @pytest.mark.asyncio
    async def test_empty_cells_are_skipped(self):
        from services.translation_service import import_translation_workbook
        wb = self._make_workbook_bytes(
            feeds_data=[{"feed_id": FEED_ID_1, "fd_code": "F01", "english_name": "Grass", "hi": ""}]
        )
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._make_mock_repo(["hi"]),
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        assert result["feeds_inserted"] == 0
        assert result["feeds_skipped"] == 1

    @pytest.mark.asyncio
    async def test_unknown_lang_column_adds_error(self):
        from services.translation_service import import_translation_workbook
        wb = self._make_workbook_bytes(
            feeds_data=[{"feed_id": FEED_ID_1, "fd_code": "F01", "english_name": "Grass", "zz": "zzz"}]
        )
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._make_mock_repo(["hi"]),  # "zz" not in active_lang_codes
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        # "zz" should be flagged as an unknown column
        assert any("zz" in e for e in result["errors"])

    @pytest.mark.asyncio
    async def test_invalid_file_returns_success_false(self):
        from services.translation_service import import_translation_workbook
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=self._make_mock_repo(["hi"]),
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, b"not an excel file")
        assert result["success"] is False
        assert "Cannot read Excel file" in result["message"]

    @pytest.mark.asyncio
    async def test_feed_not_in_country_is_skipped(self):
        from services.translation_service import import_translation_workbook
        other_feed_id = str(uuid.uuid4())
        wb = self._make_workbook_bytes(
            feeds_data=[{"feed_id": other_feed_id, "fd_code": "F99", "english_name": "Other", "hi": "अन्य"}]
        )
        mock_repo = self._make_mock_repo(["hi"], valid_feed_ids={FEED_ID_1})  # other_feed_id not in valid set
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=mock_repo,
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        mock_repo.upsert_feed_translation.assert_not_called()
        assert any(other_feed_id in e for e in result["errors"])

    @pytest.mark.asyncio
    async def test_vocab_types_imported(self):
        from services.translation_service import import_translation_workbook
        wb = self._make_workbook_bytes(
            types_data=[{"english_value": "Forage", "hi": "चारा"}]
        )
        mock_repo = self._make_mock_repo(["hi"])
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=mock_repo,
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        mock_repo.upsert_vocabulary_translation.assert_awaited_once_with(
            COUNTRY_ID, "feed_type", "Forage", "hi", "चारा"
        )
        assert result["types_inserted"] == 1

    @pytest.mark.asyncio
    async def test_vocab_categories_imported(self):
        from services.translation_service import import_translation_workbook
        wb = self._make_workbook_bytes(
            cats_data=[{"english_value": "Grass", "vi": "Cỏ"}]
        )
        mock_repo = self._make_mock_repo(["vi"])
        with patch(
            "services.translation_service.TranslationRepository",
            return_value=mock_repo,
        ):
            result = await import_translation_workbook(AsyncMock(), COUNTRY_ID, wb)
        mock_repo.upsert_vocabulary_translation.assert_awaited_once_with(
            COUNTRY_ID, "feed_category", "Grass", "vi", "Cỏ"
        )
        assert result["categories_inserted"] == 1


# ── translation_service CRUD functions ───────────────────────────────────────

class TestFeedTranslationCRUD:

    @pytest.mark.asyncio
    async def test_upsert_returns_dict_with_required_fields(self):
        from services.translation_service import upsert_feed_translation
        now = datetime.utcnow()
        mock_repo = AsyncMock()
        mock_repo.upsert_feed_translation.return_value = "inserted"
        ft = SimpleNamespace(feed_id=uuid.UUID(FEED_ID_1), language="hi", name="घास",
                             created_at=now, updated_at=now)
        mock_repo.get_feed_translations.return_value = [ft]
        with patch("services.translation_service.TranslationRepository", return_value=mock_repo):
            result = await upsert_feed_translation(AsyncMock(), FEED_ID_1, "hi", "घास")
        assert result["feed_id"] == FEED_ID_1
        assert result["language"] == "hi"
        assert result["name"] == "घास"
        assert result["action"] == "inserted"

    @pytest.mark.asyncio
    async def test_get_feed_translations_returns_list(self):
        from services.translation_service import get_feed_translations
        now = datetime.utcnow()
        ft1 = SimpleNamespace(feed_id=uuid.UUID(FEED_ID_1), language="hi", name="घास",
                              created_at=now, updated_at=now)
        ft2 = SimpleNamespace(feed_id=uuid.UUID(FEED_ID_1), language="vi", name="Cỏ",
                              created_at=now, updated_at=now)
        mock_repo = AsyncMock()
        mock_repo.get_feed_translations.return_value = [ft1, ft2]
        with patch("services.translation_service.TranslationRepository", return_value=mock_repo):
            result = await get_feed_translations(AsyncMock(), FEED_ID_1)
        assert len(result) == 2
        assert result[0]["language"] == "hi"
        assert result[1]["language"] == "vi"

    @pytest.mark.asyncio
    async def test_get_feed_translations_returns_empty_list(self):
        from services.translation_service import get_feed_translations
        mock_repo = AsyncMock()
        mock_repo.get_feed_translations.return_value = []
        with patch("services.translation_service.TranslationRepository", return_value=mock_repo):
            result = await get_feed_translations(AsyncMock(), FEED_ID_1)
        assert result == []

    @pytest.mark.asyncio
    async def test_delete_returns_true_when_found(self):
        from services.translation_service import delete_feed_translation
        mock_repo = AsyncMock()
        mock_repo.delete_feed_translation.return_value = True
        with patch("services.translation_service.TranslationRepository", return_value=mock_repo):
            result = await delete_feed_translation(AsyncMock(), FEED_ID_1, "hi")
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_returns_false_when_not_found(self):
        from services.translation_service import delete_feed_translation
        mock_repo = AsyncMock()
        mock_repo.delete_feed_translation.return_value = False
        with patch("services.translation_service.TranslationRepository", return_value=mock_repo):
            result = await delete_feed_translation(AsyncMock(), FEED_ID_1, "zz")
        assert result is False

    @pytest.mark.asyncio
    async def test_coverage_returns_dict_with_counts(self):
        from services.translation_service import get_translation_coverage
        mock_repo = AsyncMock()
        mock_repo.get_coverage.return_value = {
            "total_feeds": 10, "translated_feeds": 7, "missing_feeds": 3,
            "total_types": 5, "translated_types": 5,
            "total_categories": 8, "translated_categories": 6,
        }
        with patch("services.translation_service.TranslationRepository", return_value=mock_repo):
            result = await get_translation_coverage(AsyncMock(), COUNTRY_ID, "hi")
        assert result["total_feeds"] == 10
        assert result["missing_feeds"] == 3


# ── Pydantic schema tests ─────────────────────────────────────────────────────

class TestTranslationSchemas:

    def test_upsert_request_valid(self):
        from app.schemas.translation import FeedTranslationUpsertRequest
        req = FeedTranslationUpsertRequest(feed_id=FEED_ID_1, language="hi", name="घास")
        assert req.feed_id == FEED_ID_1
        assert req.language == "hi"
        assert req.name == "घास"

    def test_upsert_request_name_cannot_be_empty(self):
        from app.schemas.translation import FeedTranslationUpsertRequest
        with pytest.raises(Exception):  # ValidationError
            FeedTranslationUpsertRequest(feed_id=FEED_ID_1, language="hi", name="")

    def test_workbook_import_summary_defaults(self):
        from app.schemas.translation import WorkbookImportSummary
        s = WorkbookImportSummary(success=True, message="ok")
        assert s.feeds_inserted == 0
        assert s.feeds_updated == 0
        assert s.errors == []

    def test_coverage_response_fields(self):
        from app.schemas.translation import TranslationCoverageResponse
        r = TranslationCoverageResponse(
            success=True, country_id=COUNTRY_ID, language="hi",
            total_feeds=10, translated_feeds=7, missing_feeds=3,
            total_types=5, translated_types=5,
            total_categories=8, translated_categories=6,
        )
        assert r.missing_feeds == 3
        assert r.language == "hi"

    def test_feed_translation_record_action_optional(self):
        from app.schemas.translation import FeedTranslationRecord
        rec = FeedTranslationRecord(feed_id=FEED_ID_1, language="hi", name="घास")
        assert rec.action is None

    def test_feed_translation_list_response(self):
        from app.schemas.translation import FeedTranslationListResponse, FeedTranslationRecord
        rec = FeedTranslationRecord(feed_id=FEED_ID_1, language="hi", name="घास", action="inserted")
        resp = FeedTranslationListResponse(success=True, feed_id=FEED_ID_1, translations=[rec])
        assert len(resp.translations) == 1
        assert resp.translations[0].action == "inserted"
