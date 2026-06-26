import uuid
from typing import Optional

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CountryLanguage, Feed, FeedTranslation, VocabularyTranslation


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

    async def get_distinct_types(self, country_id: str) -> list[str]:
        result = await self.db.execute(
            select(Feed.fd_type)
            .where(Feed.fd_country_id == country_id, Feed.fd_type.isnot(None))
            .distinct()
            .order_by(Feed.fd_type)
        )
        return [row[0] for row in result.all()]

    async def get_distinct_categories(self, country_id: str) -> list[str]:
        result = await self.db.execute(
            select(Feed.fd_category)
            .where(Feed.fd_country_id == country_id, Feed.fd_category.isnot(None))
            .distinct()
            .order_by(Feed.fd_category)
        )
        return [row[0] for row in result.all()]

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
        """Return feed/type/category coverage counts for a country+language."""
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

        total_types = (
            await self.db.execute(
                select(func.count())
                .select_from(
                    select(Feed.fd_type)
                    .where(Feed.fd_country_id == country_id, Feed.fd_type.isnot(None))
                    .distinct()
                    .subquery()
                )
            )
        ).scalar_one()

        translated_types = (
            await self.db.execute(
                select(func.count(VocabularyTranslation.id)).where(
                    VocabularyTranslation.country_id == country_id,
                    VocabularyTranslation.kind == "feed_type",
                    VocabularyTranslation.language == lang,
                )
            )
        ).scalar_one()

        total_categories = (
            await self.db.execute(
                select(func.count())
                .select_from(
                    select(Feed.fd_category)
                    .where(Feed.fd_country_id == country_id, Feed.fd_category.isnot(None))
                    .distinct()
                    .subquery()
                )
            )
        ).scalar_one()

        translated_categories = (
            await self.db.execute(
                select(func.count(VocabularyTranslation.id)).where(
                    VocabularyTranslation.country_id == country_id,
                    VocabularyTranslation.kind == "feed_category",
                    VocabularyTranslation.language == lang,
                )
            )
        ).scalar_one()

        return {
            "total_feeds": total_feeds,
            "translated_feeds": translated_feeds,
            "missing_feeds": total_feeds - translated_feeds,
            "total_types": total_types,
            "translated_types": translated_types,
            "total_categories": total_categories,
            "translated_categories": translated_categories,
        }
