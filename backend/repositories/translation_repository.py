import uuid
from typing import Optional

from sqlalchemy import Text, delete, func, literal, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.db.models import (
    CountryLanguage,
    Feed,
    FeedCategory,
    FeedTranslation,
    FeedType,
    VocabularyTranslation,
    feed_name_key,
)


class TranslationRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Language helpers ──────────────────────────────────────────────────────

    async def get_country_language_codes(self, country_id: str) -> list[str]:
        """Return non-'en' language codes assigned to a country, sorted."""
        result = await self.db.execute(
            select(CountryLanguage.language_code)
            .where(
                CountryLanguage.country_id == country_id,
                CountryLanguage.language_code != "en",
            )
            .order_by(CountryLanguage.language_code)
        )
        return [row[0] for row in result.all()]

    # ── Feed helpers ──────────────────────────────────────────────────────────

    async def get_country_feeds(self, country_id: str):
        """Return rows with (id, fd_code, fd_name, fd_type, fd_category) for a country."""
        result = await self.db.execute(
            select(Feed.id, Feed.fd_code, Feed.fd_name, Feed.fd_type, Feed.fd_category)
            .where(Feed.fd_country_id == country_id)
            .order_by(Feed.fd_name)
        )
        return list(result.all())

    async def get_country_feed_ids(self, country_id: str) -> set[str]:
        """Return set of feed UUIDs (as strings) belonging to a country."""
        result = await self.db.execute(
            select(Feed.id).where(Feed.fd_country_id == country_id)
        )
        return {str(row[0]) for row in result.all()}

    async def get_export_types(self, country_id: str) -> list[str]:
        """English feed-type names for the workbook's Feed Types sheet."""
        return await self._export_vocabulary(
            country_id, "feed_type", FeedType.type_name, FeedType, Feed.fd_type
        )

    async def get_export_categories(self, country_id: str) -> list[str]:
        """English feed-category names for the workbook's Feed Categories sheet."""
        return await self._export_vocabulary(
            country_id, "feed_category", FeedCategory.category_name, FeedCategory, Feed.fd_category
        )

    async def _export_vocabulary(
        self,
        country_id: str,
        kind: str,
        name_col: InstrumentedAttribute,
        master: type[FeedType] | type[FeedCategory],
        feed_col: InstrumentedAttribute,
    ) -> list[str]:
        """Every value an admin may need to translate, alphabetical: the active
        master list, plus any value the country's feeds or existing translations
        carry that is not in it. Feeds alone were not enough: translations for
        values no feed uses were missing from the export, and those values
        could not be translated ahead of time."""
        master_rows = await self.db.execute(
            select(name_col).where(master.is_active == True)  # noqa: E712
        )
        feed_rows = await self.db.execute(
            select(feed_col)
            .where(Feed.fd_country_id == country_id, feed_col.isnot(None))
            .distinct()
        )
        vocab_rows = await self.db.execute(
            select(VocabularyTranslation.source_value)
            .where(
                VocabularyTranslation.country_id == country_id,
                VocabularyTranslation.kind == kind,
            )
            .distinct()
        )
        rows = master_rows.all() + feed_rows.all() + vocab_rows.all()
        return sorted({row[0] for row in rows if row[0]}, key=str.casefold)

    # ── Translation maps (for workbook export) ────────────────────────────────

    async def get_feed_translations_map(
        self, country_id: str
    ) -> dict[str, dict[str, str]]:
        """Return {feed_id_str → {lang → name}} for all feeds in the country."""
        result = await self.db.execute(
            select(FeedTranslation.feed_id, FeedTranslation.language, FeedTranslation.name)
            .join(Feed, FeedTranslation.feed_id == Feed.id)
            .where(Feed.fd_country_id == country_id)
        )
        out: dict[str, dict[str, str]] = {}
        for feed_id, lang, name in result.all():
            fid = str(feed_id)
            out.setdefault(fid, {})[lang] = name
        return out

    async def get_all_feed_translations_map(self) -> dict[str, dict[str, str]]:
        """Return {feed_id_str → {lang → name}} across ALL feeds, no country
        scoping — used by the unified CLIMDES-template export
        (bulk_upload_changes plan, D8), which is a global admin export."""
        result = await self.db.execute(
            select(FeedTranslation.feed_id, FeedTranslation.language, FeedTranslation.name)
        )
        out: dict[str, dict[str, str]] = {}
        for feed_id, lang, name in result.all():
            fid = str(feed_id)
            out.setdefault(fid, {})[lang] = name
        return out

    async def get_vocabulary_translations_map(
        self, country_id: str, kind: str
    ) -> dict[str, dict[str, str]]:
        """Return {source_value → {lang → name}} for a vocab kind in a country."""
        result = await self.db.execute(
            select(
                VocabularyTranslation.source_value,
                VocabularyTranslation.language,
                VocabularyTranslation.name,
            )
            .where(
                VocabularyTranslation.country_id == country_id,
                VocabularyTranslation.kind == kind,
            )
        )
        out: dict[str, dict[str, str]] = {}
        for source, lang, name in result.all():
            out.setdefault(source, {})[lang] = name
        return out

    # ── Feed translation CRUD ─────────────────────────────────────────────────

    async def upsert_feed_translation(
        self, feed_id: str, language: str, name: str
    ) -> str:
        """UPSERT a feed translation. Returns 'inserted' or 'updated'."""
        existing = (
            await self.db.execute(
                select(FeedTranslation.id).where(
                    FeedTranslation.feed_id == feed_id,
                    FeedTranslation.language == language,
                )
            )
        ).scalar_one_or_none()
        was_existing = existing is not None

        stmt = (
            pg_insert(FeedTranslation)
            .values(feed_id=feed_id, language=language, name=name)
            .on_conflict_do_update(
                constraint="uq_feed_translations_feed_lang",
                set_={"name": name, "updated_at": func.now()},
            )
        )
        await self.db.execute(stmt)
        return "updated" if was_existing else "inserted"

    async def get_feed_translation_name(self, feed_id, language: str) -> Optional[str]:
        """The feed's stored name in `language`, or None."""
        result = await self.db.execute(
            select(FeedTranslation.name).where(
                FeedTranslation.feed_id == feed_id,
                FeedTranslation.language == language,
            )
        )
        return result.scalar_one_or_none()

    async def find_local_name_owner(
        self, country_id, language: str, name: str, exclude_feed_id
    ) -> Optional[Feed]:
        """Another feed of `country_id` whose `language` name equals `name`, or None.

        Same comparison key as English names (feed_name_key on both sides:
        case, outer spaces and space runs ignored), applied to the NFC form of
        each side so a row stored before names were NFC still matches. No index
        backs it — local names are unique by code only
        (docs/dev_docs/local_name_uniqueness, D1).
        """
        def key(expr):
            return feed_name_key(func.normalize(expr, text("NFC")))

        result = await self.db.execute(
            select(Feed)
            .join(FeedTranslation, FeedTranslation.feed_id == Feed.id)
            .where(
                Feed.fd_country_id == country_id,
                Feed.id != exclude_feed_id,
                FeedTranslation.language == language,
                key(FeedTranslation.name) == key(literal(name, Text)),
            )
            .limit(1)
        )
        return result.scalars().first()

    async def get_feed_translations(self, feed_id: str) -> list[FeedTranslation]:
        result = await self.db.execute(
            select(FeedTranslation)
            .where(FeedTranslation.feed_id == feed_id)
            .order_by(FeedTranslation.language)
        )
        return list(result.scalars().all())

    async def delete_feed_translation(self, feed_id: str, language: str) -> bool:
        result = await self.db.execute(
            delete(FeedTranslation).where(
                FeedTranslation.feed_id == feed_id,
                FeedTranslation.language == language,
            )
        )
        return result.rowcount > 0

    # ── Vocabulary translation CRUD ───────────────────────────────────────────

    async def upsert_vocabulary_translation(
        self,
        country_id: str,
        kind: str,
        source_value: str,
        language: str,
        name: str,
    ) -> str:
        """UPSERT a vocabulary translation. Returns 'inserted' or 'updated'."""
        existing = (
            await self.db.execute(
                select(VocabularyTranslation.id).where(
                    VocabularyTranslation.country_id == country_id,
                    VocabularyTranslation.kind == kind,
                    VocabularyTranslation.source_value == source_value,
                    VocabularyTranslation.language == language,
                )
            )
        ).scalar_one_or_none()
        was_existing = existing is not None

        stmt = (
            pg_insert(VocabularyTranslation)
            .values(
                country_id=country_id,
                kind=kind,
                source_value=source_value,
                language=language,
                name=name,
            )
            .on_conflict_do_update(
                constraint="uq_vocabulary_translations_scope",
                set_={"name": name, "updated_at": func.now()},
            )
        )
        await self.db.execute(stmt)
        return "updated" if was_existing else "inserted"

    # ── Coverage ──────────────────────────────────────────────────────────────

    async def get_coverage(self, country_id: str, lang: str) -> dict:
        """Return feed/type/category coverage counts for a country+language.

        Each "translated" count is a share of its "total": feeds are the country's
        feeds; types/categories are the distinct values the country's feeds use, and
        only translations OF those values count (K9). Users see a type/category
        translation only for a value their feeds carry (exact text, see
        FeedRepository.get_vocabulary_translation_map), so this is what they see.
        The Translation Workbook lists more values (PR #69: translate ahead of time);
        such a translation counts once a feed of the country uses the value.
        """
        total_feeds = (
            await self.db.execute(
                select(func.count(Feed.id)).where(Feed.fd_country_id == country_id)
            )
        ).scalar_one()

        translated_feeds = (
            await self.db.execute(
                select(func.count(FeedTranslation.id))
                .join(Feed, FeedTranslation.feed_id == Feed.id)
                .where(
                    Feed.fd_country_id == country_id,
                    FeedTranslation.language == lang,
                )
            )
        ).scalar_one()

        total_types, translated_types = await self._vocabulary_coverage(
            country_id, lang, "feed_type", Feed.fd_type
        )
        total_categories, translated_categories = await self._vocabulary_coverage(
            country_id, lang, "feed_category", Feed.fd_category
        )

        return {
            "total_feeds": total_feeds,
            "translated_feeds": translated_feeds,
            "missing_feeds": total_feeds - translated_feeds,
            "total_types": total_types,
            "translated_types": translated_types,
            "total_categories": total_categories,
            "translated_categories": translated_categories,
        }

    async def _vocabulary_coverage(
        self,
        country_id: str,
        lang: str,
        kind: str,
        feed_col: InstrumentedAttribute,
    ) -> tuple[int, int]:
        """(values the country's feeds use, how many of them have a translation)."""
        used_values = (
            select(feed_col)
            .where(Feed.fd_country_id == country_id, feed_col.isnot(None))
            .distinct()
        )
        total = (
            await self.db.execute(
                select(func.count()).select_from(used_values.subquery())
            )
        ).scalar_one()
        translated = (
            await self.db.execute(
                select(func.count(VocabularyTranslation.id)).where(
                    VocabularyTranslation.country_id == country_id,
                    VocabularyTranslation.kind == kind,
                    VocabularyTranslation.language == lang,
                    VocabularyTranslation.source_value.in_(used_values),
                )
            )
        ).scalar_one()
        return total, translated
