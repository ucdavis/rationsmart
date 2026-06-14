import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select, union
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    CountryModel,
    CustomFeed,
    FeedCategory,
    Feed,
    FeedType,
)


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

    async def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        feed_type: Optional[str] = None,
        feed_category: Optional[str] = None,
        country_name: Optional[str] = None,
        search: Optional[str] = None,
        country_id: Optional[str] = None,
    ) -> Tuple[List[Feed], int]:
        q = select(Feed).order_by(Feed.fd_name.asc())
        if feed_type:
            q = q.where(Feed.fd_type == feed_type)
        if feed_category:
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
            fd_code=data.get("fd_code"),
            fd_name=data["fd_name"],
            fd_category=data.get("fd_category"),
            fd_type=data.get("fd_type"),
            fd_country_name=data.get("fd_country_name"),
            fd_country_cd=data.get("fd_country_cd"),
            fd_country_id=country_id,
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

    async def get_unique_types(self, country_id: str, user_id: str) -> List[str]:
        """UNION of feed types from standard + custom feeds for a given country."""
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
        return [r[0] for r in result.all() if r[0]]

    async def get_unique_categories(self, country_id: str, user_id: str) -> List[str]:
        """UNION of feed categories from standard + custom feeds."""
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
        return [r[0] for r in result.all() if r[0]]

    async def get_feed_names(
        self,
        country_id: str,
        user_id: str,
        feed_type: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Tuple[List[Feed], List[CustomFeed]]:
        """Returns (standard_feeds, custom_feeds) matching the given filters."""
        sq = select(Feed).where(Feed.fd_country_id == country_id)
        cq = select(CustomFeed).where(
            CustomFeed.fd_country_id == country_id,
            CustomFeed.user_id == uuid.UUID(str(user_id)),
        )
        if feed_type:
            sq = sq.where(Feed.fd_type == feed_type)
            cq = cq.where(CustomFeed.fd_type == feed_type)
        if category:
            sq = sq.where(Feed.fd_category == category)
            cq = cq.where(CustomFeed.fd_category == category)

        std_result = await self.db.execute(sq)
        cust_result = await self.db.execute(cq)
        return std_result.scalars().all(), cust_result.scalars().all()

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
