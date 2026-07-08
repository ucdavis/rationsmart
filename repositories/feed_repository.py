import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, false, func, or_, select, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.db.models import (
    CountryModel,
    CustomFeed,
    FeedCategory,
    Feed,
    FeedType,
    FeedTranslation,
    VocabularyTranslation,
)


def _uuid_or_none(value: Any) -> Optional[uuid.UUID]:
    """Coerce a value to UUID, returning None for empty/invalid input."""
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


class FeedRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Standard feeds ────────────────────────────────────────────────────────

    async def get_by_id(self, feed_id: str) -> Optional[Feed]:
        try:
            fid = uuid.UUID(str(feed_id))
        except ValueError:
            return None
        result = await self.db.execute(select(Feed).where(Feed.id == fid))
        return result.scalars().first()

    async def get_by_name(self, name: str) -> Optional[Feed]:
        result = await self.db.execute(
            select(Feed).where(func.lower(Feed.fd_name) == func.lower(name))
        )
        return result.scalars().first()

    async def get_by_code(self, fd_code: str) -> Optional[Feed]:
        result = await self.db.execute(select(Feed).where(Feed.fd_code == fd_code))
        return result.scalars().first()

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        feed_type: Optional[str] = None,
        feed_category: Optional[str] = None,
        country_name: Optional[str] = None,
        search: Optional[str] = None,
        country_id: Optional[str] = None,
        feed_type_id: Optional[str] = None,
        feed_category_id: Optional[str] = None,
    ) -> Tuple[List[Feed], int]:
        q = select(Feed).order_by(Feed.fd_name.asc())
        # Taxonomy filter: FK id wins over the legacy string param (T4).
        if feed_type_id:
            tid = _uuid_or_none(feed_type_id)
            q = q.where(Feed.fd_type_id == tid) if tid else q.where(false())
        elif feed_type:
            q = q.where(Feed.fd_type == feed_type)
        if feed_category_id:
            cid = _uuid_or_none(feed_category_id)
            q = q.where(Feed.fd_category_id == cid) if cid else q.where(false())
        elif feed_category:
            q = q.where(Feed.fd_category == feed_category)
        if country_name:
            q = q.where(Feed.fd_country_name.ilike(f"%{country_name}%"))
        if country_id:
            q = q.where(Feed.fd_country_id == country_id)
        if search:
            q = q.where(Feed.fd_name.ilike(f"%{search}%"))

        count_result = await self.db.execute(
            select(func.count()).select_from(q.subquery())
        )
        total = count_result.scalar_one()
        feeds_result = await self.db.execute(q.offset(skip).limit(limit))
        return feeds_result.scalars().all(), total

    async def get_all_for_export(self) -> List[Feed]:
        result = await self.db.execute(select(Feed))
        return result.scalars().all()

    async def get_by_ids(self, ids: List[str]) -> List[Feed]:
        uids = [uuid.UUID(str(i)) for i in ids]
        result = await self.db.execute(select(Feed).where(Feed.id.in_(uids)))
        return result.scalars().all()

    async def create(self, data: Dict[str, Any], country_id: Optional[str] = None) -> Feed:
        feed = Feed(
            id=data.get("id") or uuid.uuid4(),
            fd_code=data.get("fd_code"),
            fd_name=data["fd_name"],
            fd_category=data.get("fd_category"),
            fd_type=data.get("fd_type"),
            fd_country_name=data.get("fd_country_name"),
            fd_country_cd=data.get("fd_country_cd"),
            fd_country_id=country_id,
            fd_type_id=data.get("fd_type_id"),
            fd_category_id=data.get("fd_category_id"),
            fd_dm=data.get("fd_dm"),
            fd_ash=data.get("fd_ash"),
            fd_cp=data.get("fd_cp"),
            fd_npn_cp=data.get("fd_npn_cp"),
            fd_ee=data.get("fd_ee"),
            fd_cf=data.get("fd_cf"),
            fd_nfe=data.get("fd_nfe"),
            fd_st=data.get("fd_st"),
            fd_ndf=data.get("fd_ndf"),
            fd_hemicellulose=data.get("fd_hemicellulose"),
            fd_adf=data.get("fd_adf"),
            fd_cellulose=data.get("fd_cellulose"),
            fd_lg=data.get("fd_lg"),
            fd_ndin=data.get("fd_ndin"),
            fd_adin=data.get("fd_adin"),
            fd_ca=data.get("fd_ca"),
            fd_p=data.get("fd_p"),
            fd_season=data.get("fd_season"),
            fd_orginin=data.get("fd_orginin"),
            fd_ipb_local_lab=data.get("fd_ipb_local_lab"),
        )
        self.db.add(feed)
        await self.db.flush()
        return feed

    async def update(self, feed: Feed, data: Dict[str, Any]) -> Feed:
        nutrient_fields = [
            "fd_name", "fd_category", "fd_type", "fd_country_name", "fd_country_cd",
            "fd_dm", "fd_ash", "fd_cp", "fd_npn_cp", "fd_ee", "fd_cf", "fd_nfe",
            "fd_st", "fd_ndf", "fd_hemicellulose", "fd_adf", "fd_cellulose", "fd_lg",
            "fd_ndin", "fd_adin", "fd_ca", "fd_p", "fd_season", "fd_orginin", "fd_ipb_local_lab",
            "fd_type_id", "fd_category_id",
        ]
        for field in nutrient_fields:
            if field in data:
                setattr(feed, field, data[field])
        await self.db.flush()
        return feed

    async def delete(self, feed: Feed) -> None:
        await self.db.delete(feed)
        await self.db.flush()

    # ── Custom feeds ──────────────────────────────────────────────────────────

    async def get_custom_by_id(self, feed_id: str, user_id: Optional[str] = None) -> Optional[CustomFeed]:
        try:
            fid = uuid.UUID(str(feed_id))
        except ValueError:
            return None
        q = select(CustomFeed).where(CustomFeed.id == fid)
        if user_id:
            q = q.where(CustomFeed.user_id == uuid.UUID(str(user_id)))
        result = await self.db.execute(q)
        return result.scalars().first()

    async def get_custom_by_ids(self, ids: List[str]) -> List[CustomFeed]:
        uids = [uuid.UUID(str(i)) for i in ids]
        result = await self.db.execute(
            select(CustomFeed).where(CustomFeed.id.in_(uids))
        )
        return result.scalars().all()

    async def get_all_custom_for_export(self) -> List[CustomFeed]:
        result = await self.db.execute(select(CustomFeed))
        return result.scalars().all()

    async def create_custom_feed(self, data: Dict[str, Any]) -> CustomFeed:
        feed = CustomFeed(**data)
        self.db.add(feed)
        await self.db.flush()
        return feed

    async def update_custom_feed(self, feed: CustomFeed, data: Dict[str, Any]) -> CustomFeed:
        for field, value in data.items():
            if hasattr(feed, field):
                setattr(feed, field, value)
        await self.db.flush()
        return feed

    # ── Feed names / types / categories (for diet recommendation UI) ──────────

    async def get_unique_types(
        self, country_id: str, user_id: str, lang: str = "en"
    ) -> List[str]:
        """UNION of feed types (standard + custom) for a country, with optional vocabulary translation."""
        std = select(Feed.fd_type).where(Feed.fd_country_id == country_id).distinct()
        cust = (
            select(CustomFeed.fd_type)
            .where(
                CustomFeed.fd_country_id == country_id,
                CustomFeed.user_id == uuid.UUID(str(user_id)),
            )
            .distinct()
        )
        result = await self.db.execute(std.union(cust))
        source_types = [r[0] for r in result.all() if r[0]]

        if lang == "en" or not source_types:
            return source_types

        trans = await self.db.execute(
            select(VocabularyTranslation.source_value, VocabularyTranslation.name)
            .where(
                VocabularyTranslation.country_id == country_id,
                VocabularyTranslation.kind == "feed_type",
                VocabularyTranslation.language == lang,
                VocabularyTranslation.source_value.in_(source_types),
            )
        )
        trans_map = {r[0]: r[1] for r in trans.all()}
        return [trans_map.get(t, t) for t in source_types]

    async def get_unique_categories(
        self, country_id: str, user_id: str, lang: str = "en"
    ) -> List[str]:
        """UNION of feed categories (standard + custom) for a country, with optional vocabulary translation."""
        std = select(Feed.fd_category).where(Feed.fd_country_id == country_id).distinct()
        cust = (
            select(CustomFeed.fd_category)
            .where(
                CustomFeed.fd_country_id == country_id,
                CustomFeed.user_id == uuid.UUID(str(user_id)),
            )
            .distinct()
        )
        result = await self.db.execute(std.union(cust))
        source_cats = [r[0] for r in result.all() if r[0]]

        if lang == "en" or not source_cats:
            return source_cats

        trans = await self.db.execute(
            select(VocabularyTranslation.source_value, VocabularyTranslation.name)
            .where(
                VocabularyTranslation.country_id == country_id,
                VocabularyTranslation.kind == "feed_category",
                VocabularyTranslation.language == lang,
                VocabularyTranslation.source_value.in_(source_cats),
            )
        )
        trans_map = {r[0]: r[1] for r in trans.all()}
        return [trans_map.get(c, c) for c in source_cats]

    def _localized_feed_select(self, lang: str):
        """Return a base SELECT with LEFT JOINs for feed name + type + category translations."""
        ft = aliased(FeedTranslation)
        vt = aliased(VocabularyTranslation)
        vc = aliased(VocabularyTranslation)
        return (
            select(
                Feed,
                func.coalesce(ft.name, Feed.fd_name).label("display_name"),
                func.coalesce(vt.name, Feed.fd_type).label("display_type"),
                func.coalesce(vc.name, Feed.fd_category).label("display_category"),
            )
            .outerjoin(ft, and_(ft.feed_id == Feed.id, ft.language == lang))
            .outerjoin(vt, and_(
                vt.country_id == Feed.fd_country_id,
                vt.kind == "feed_type",
                vt.source_value == Feed.fd_type,
                vt.language == lang,
            ))
            .outerjoin(vc, and_(
                vc.country_id == Feed.fd_country_id,
                vc.kind == "feed_category",
                vc.source_value == Feed.fd_category,
                vc.language == lang,
            ))
        )

    async def search_feeds(
        self,
        query: str,
        country_id: str,
        user_id: str,
        limit: int = 20,
        lang: str = "en",
    ) -> Tuple[List, List, int]:
        """Typeahead search on fd_name (and translated name) scoped to country + user.

        Returns (std_rows, custom_feeds, total_count).
        std_rows: Row(Feed, display_name, display_type, display_category)
        custom_feeds: List[CustomFeed] (custom feeds are not translated — I5/out-of-scope)
        """
        pattern = f"%{query}%"
        ft = aliased(FeedTranslation)

        sq = (
            self._localized_feed_select(lang)
            .where(
                Feed.fd_country_id == country_id,
                or_(Feed.fd_name.ilike(pattern), ft.name.ilike(pattern)),
            )
        )
        cq = select(CustomFeed).where(
            CustomFeed.fd_country_id == country_id,
            CustomFeed.user_id == uuid.UUID(str(user_id)),
            CustomFeed.fd_name.ilike(pattern),
        )

        std_count = (await self.db.execute(select(func.count()).select_from(sq.subquery()))).scalar_one()
        cust_count = (await self.db.execute(select(func.count()).select_from(cq.subquery()))).scalar_one()

        std_result = await self.db.execute(sq.order_by(Feed.fd_name.asc()).limit(limit))
        cust_result = await self.db.execute(cq.order_by(CustomFeed.fd_name.asc()))

        return (
            std_result.all(),
            cust_result.scalars().all(),
            std_count + cust_count,
        )

    async def resolve_taxonomy_names(
        self, type_id: Optional[str] = None, category_id: Optional[str] = None
    ) -> Tuple[Optional[str], Optional[str]]:
        """Resolve taxonomy IDs to their canonical English names.

        Transitional bridge (Ticket A): custom_feeds have no FK columns yet, so
        an id-based filter on them is applied by resolving id → English name and
        matching the denormalized text. Removed in Ticket B. Returns (None, None)
        for missing/invalid ids.
        """
        type_name = category_name = None
        tid = _uuid_or_none(type_id)
        cid = _uuid_or_none(category_id)
        if tid:
            r = await self.db.execute(select(FeedType.type_name).where(FeedType.id == tid))
            type_name = r.scalar_one_or_none()
        if cid:
            r = await self.db.execute(
                select(FeedCategory.category_name).where(FeedCategory.id == cid)
            )
            category_name = r.scalar_one_or_none()
        return type_name, category_name

    async def get_feed_names(
        self,
        country_id: str,
        user_id: str,
        feed_type: Optional[str] = None,
        category: Optional[str] = None,
        lang: str = "en",
        feed_type_id: Optional[str] = None,
        feed_category_id: Optional[str] = None,
    ) -> Tuple[List, List]:
        """Returns (std_rows, custom_feeds) matching the given filters.

        std_rows: Row(Feed, display_name, display_type, display_category)
        custom_feeds: List[CustomFeed]

        Taxonomy filter: a FK id (feed_type_id/feed_category_id) wins over the
        legacy string param (T4). Standard feeds filter by FK; custom feeds have
        no FK yet, so an id is resolved to its English name and matched on text.
        """
        sq = self._localized_feed_select(lang).where(Feed.fd_country_id == country_id)
        cq = select(CustomFeed).where(
            CustomFeed.fd_country_id == country_id,
            CustomFeed.user_id == uuid.UUID(str(user_id)),
        )

        # Resolve ids → names once for the custom-feed text bridge.
        res_type_name = res_cat_name = None
        if feed_type_id or feed_category_id:
            res_type_name, res_cat_name = await self.resolve_taxonomy_names(
                feed_type_id, feed_category_id
            )

        if feed_type_id:
            tid = _uuid_or_none(feed_type_id)
            sq = sq.where(Feed.fd_type_id == tid) if tid else sq.where(false())
            cq = cq.where(CustomFeed.fd_type == res_type_name) if res_type_name else cq.where(false())
        elif feed_type:
            sq = sq.where(Feed.fd_type == feed_type)
            cq = cq.where(CustomFeed.fd_type == feed_type)

        if feed_category_id:
            cid = _uuid_or_none(feed_category_id)
            sq = sq.where(Feed.fd_category_id == cid) if cid else sq.where(false())
            cq = cq.where(CustomFeed.fd_category == res_cat_name) if res_cat_name else cq.where(false())
        elif category:
            sq = sq.where(Feed.fd_category == category)
            cq = cq.where(CustomFeed.fd_category == category)

        std_result = await self.db.execute(sq)
        cust_result = await self.db.execute(cq)
        return std_result.all(), cust_result.scalars().all()

    async def get_by_id_localized(self, feed_id: str, lang: str = "en"):
        """Fetch a standard feed by ID with COALESCE'd display name/type/category.

        Returns Row(Feed, display_name, display_type, display_category) or None.
        Returns None if feed_id is not a valid UUID or the feed doesn't exist.
        """
        try:
            fid = uuid.UUID(str(feed_id))
        except ValueError:
            return None
        result = await self.db.execute(
            self._localized_feed_select(lang).where(Feed.id == fid)
        )
        return result.one_or_none()

    async def get_all_localized(
        self,
        skip: int = 0,
        limit: int = 20,
        feed_type: Optional[str] = None,
        feed_category: Optional[str] = None,
        country_name: Optional[str] = None,
        search: Optional[str] = None,
        country_id: Optional[str] = None,
        lang: str = "en",
        feed_type_id: Optional[str] = None,
        feed_category_id: Optional[str] = None,
    ) -> Tuple[List, int]:
        """Like get_all but joins translation tables and returns display_* labels.

        Returns (rows, total) where each row is Row(Feed, display_name, display_type, display_category).
        Taxonomy filter: FK id wins over the legacy string param (T4).
        """
        q = self._localized_feed_select(lang).order_by(Feed.fd_name.asc())
        if feed_type_id:
            tid = _uuid_or_none(feed_type_id)
            q = q.where(Feed.fd_type_id == tid) if tid else q.where(false())
        elif feed_type:
            q = q.where(Feed.fd_type == feed_type)
        if feed_category_id:
            cid = _uuid_or_none(feed_category_id)
            q = q.where(Feed.fd_category_id == cid) if cid else q.where(false())
        elif feed_category:
            q = q.where(Feed.fd_category == feed_category)
        if country_name:
            q = q.where(Feed.fd_country_name.ilike(f"%{country_name}%"))
        if country_id:
            q = q.where(Feed.fd_country_id == country_id)
        if search:
            q = q.where(Feed.fd_name.ilike(f"%{search}%"))

        count_result = await self.db.execute(
            select(func.count()).select_from(q.subquery())
        )
        total = count_result.scalar_one()
        feeds_result = await self.db.execute(q.offset(skip).limit(limit))
        return feeds_result.all(), total

    # ── Feed types ────────────────────────────────────────────────────────────

    async def get_feed_type_by_id(self, type_id: str) -> Optional[FeedType]:
        result = await self.db.execute(
            select(FeedType).where(FeedType.id == uuid.UUID(str(type_id)))
        )
        return result.scalars().first()

    async def get_all_feed_types(self) -> List[FeedType]:
        result = await self.db.execute(
            select(FeedType)
            .where(FeedType.is_active == True)  # noqa: E712
            .order_by(FeedType.sort_order, FeedType.type_name)
        )
        return result.scalars().all()

    async def create_feed_type(self, data: Dict[str, Any]) -> FeedType:
        ft = FeedType(
            type_name=data["type_name"],
            description=data.get("description"),
            sort_order=data.get("sort_order", 0),
        )
        self.db.add(ft)
        await self.db.flush()
        return ft

    async def delete_feed_type(self, ft: FeedType) -> None:
        await self.db.delete(ft)
        await self.db.flush()

    async def count_feeds_by_type_name(self, type_name: str) -> int:
        result = await self.db.execute(
            select(func.count(Feed.id)).where(Feed.fd_type == type_name)
        )
        return result.scalar_one()

    async def count_categories_by_type(self, type_id: str) -> int:
        result = await self.db.execute(
            select(func.count(FeedCategory.id)).where(
                FeedCategory.feed_type_id == uuid.UUID(str(type_id))
            )
        )
        return result.scalar_one()

    # ── Feed categories ───────────────────────────────────────────────────────

    async def get_category_by_id(self, cat_id: str) -> Optional[FeedCategory]:
        result = await self.db.execute(
            select(FeedCategory).where(FeedCategory.id == uuid.UUID(str(cat_id)))
        )
        return result.scalars().first()

    async def get_categories_by_type(self, type_id: str) -> List[FeedCategory]:
        result = await self.db.execute(
            select(FeedCategory)
            .where(
                FeedCategory.feed_type_id == uuid.UUID(str(type_id)),
                FeedCategory.is_active == True,  # noqa: E712
            )
            .order_by(FeedCategory.sort_order, FeedCategory.category_name)
        )
        return result.scalars().all()

    async def get_all_categories(self) -> List[FeedCategory]:
        result = await self.db.execute(
            select(FeedCategory)
            .join(FeedType)
            .order_by(FeedType.sort_order, FeedCategory.category_name)
        )
        return result.scalars().all()

    async def get_category_by_name_and_type(
        self, category_name: str, type_id: str
    ) -> Optional[FeedCategory]:
        result = await self.db.execute(
            select(FeedCategory).where(
                func.lower(FeedCategory.category_name) == func.lower(category_name),
                FeedCategory.feed_type_id == uuid.UUID(str(type_id)),
            )
        )
        return result.scalars().first()

    async def create_feed_category(self, data: Dict[str, Any]) -> FeedCategory:
        cat = FeedCategory(
            category_name=data["category_name"],
            feed_type_id=data["feed_type_id"],
            description=data.get("description"),
            sort_order=data.get("sort_order", 0),
        )
        self.db.add(cat)
        await self.db.flush()
        return cat

    async def delete_feed_category(self, cat: FeedCategory) -> None:
        await self.db.delete(cat)
        await self.db.flush()

    async def count_feeds_by_category_name(self, category_name: str) -> int:
        result = await self.db.execute(
            select(func.count(Feed.id)).where(Feed.fd_category == category_name)
        )
        return result.scalar_one()

    # ── Taxonomy validation maps (for bulk upload) ────────────────────────────

    async def get_active_taxonomy_maps(
        self,
    ) -> Tuple[Dict[str, FeedType], Dict[Tuple[Any, str], FeedCategory]]:
        """Load active feed types + categories once for in-memory validation.

        Returns:
          type_by_name: { lower(type_name): FeedType } — active types.
          cat_by_type_and_name: { (feed_type_id, lower(category_name)): FeedCategory } —
              active categories, keyed by their parent type so category↔type membership
              can be checked in one lookup.
        """
        types_result = await self.db.execute(
            select(FeedType).where(FeedType.is_active == True)  # noqa: E712
        )
        type_by_name = {
            t.type_name.strip().lower(): t for t in types_result.scalars().all()
        }

        cats_result = await self.db.execute(
            select(FeedCategory).where(FeedCategory.is_active == True)  # noqa: E712
        )
        cat_by_type_and_name = {
            (c.feed_type_id, c.category_name.strip().lower()): c
            for c in cats_result.scalars().all()
        }
        return type_by_name, cat_by_type_and_name

    # ── Country helper ────────────────────────────────────────────────────────

    async def get_country_by_id(self, country_id: str) -> Optional[CountryModel]:
        result = await self.db.execute(
            select(CountryModel).where(CountryModel.id == country_id)
        )
        return result.scalars().first()

    async def get_country_by_name(self, country_name: str) -> Optional[CountryModel]:
        result = await self.db.execute(
            select(CountryModel).where(
                func.lower(CountryModel.name) == func.lower(country_name)
            )
        )
        return result.scalars().first()
