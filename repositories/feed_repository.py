import uuid
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import (
    CountryModel,
    CustomFeed,
    FeedCategory,
    Feed,
    FeedType,
)


class FeedRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Standard feeds ────────────────────────────────────────────────────────

    def get_by_id(self, feed_id: str) -> Optional[Feed]:
        try:
            fid = uuid.UUID(str(feed_id))
        except ValueError:
            return None
        return self.db.query(Feed).filter(Feed.id == fid).first()

    def get_by_name(self, name: str) -> Optional[Feed]:
        return (
            self.db.query(Feed)
            .filter(func.lower(Feed.fd_name) == func.lower(name))
            .first()
        )

    def get_all(
        self,
        skip: int = 0,
        limit: int = 20,
        feed_type: Optional[str] = None,
        feed_category: Optional[str] = None,
        country_name: Optional[str] = None,
        search: Optional[str] = None,
        country_id: Optional[str] = None,
    ) -> Tuple[List[Feed], int]:
        query = self.db.query(Feed).order_by(Feed.fd_name.asc())
        if feed_type:
            query = query.filter(Feed.fd_type == feed_type)
        if feed_category:
            query = query.filter(Feed.fd_category == feed_category)
        if country_name:
            query = query.filter(Feed.fd_country_name.ilike(f"%{country_name}%"))
        if country_id:
            query = query.filter(Feed.fd_country_id == country_id)
        if search:
            query = query.filter(Feed.fd_name.ilike(f"%{search}%"))
        total = query.count()
        feeds = query.offset(skip).limit(limit).all()
        return feeds, total

    def get_all_for_export(self) -> List[Feed]:
        return self.db.query(Feed).all()

    def get_by_ids(self, ids: List[str]) -> List[Feed]:
        uids = [uuid.UUID(str(i)) for i in ids]
        return self.db.query(Feed).filter(Feed.id.in_(uids)).all()

    def create(self, data: Dict[str, Any], country_id: Optional[str] = None) -> Feed:
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
        self.db.flush()
        return feed

    def update(self, feed: Feed, data: Dict[str, Any]) -> Feed:
        nutrient_fields = [
            "fd_name", "fd_category", "fd_type", "fd_country_name", "fd_country_cd",
            "fd_dm", "fd_ash", "fd_cp", "fd_npn_cp", "fd_ee", "fd_cf", "fd_nfe",
            "fd_st", "fd_ndf", "fd_hemicellulose", "fd_adf", "fd_cellulose", "fd_lg",
            "fd_ndin", "fd_adin", "fd_ca", "fd_p", "fd_season", "fd_orginin", "fd_ipb_local_lab",
        ]
        for field in nutrient_fields:
            if field in data:
                setattr(feed, field, data[field])
        self.db.flush()
        return feed

    def delete(self, feed: Feed) -> None:
        self.db.delete(feed)
        self.db.flush()

    # ── Custom feeds ──────────────────────────────────────────────────────────

    def get_custom_by_id(self, feed_id: str, user_id: Optional[str] = None) -> Optional[CustomFeed]:
        try:
            fid = uuid.UUID(str(feed_id))
        except ValueError:
            return None
        q = self.db.query(CustomFeed).filter(CustomFeed.id == fid)
        if user_id:
            q = q.filter(CustomFeed.user_id == uuid.UUID(str(user_id)))
        return q.first()

    def get_custom_by_ids(self, ids: List[str]) -> List[CustomFeed]:
        uids = [uuid.UUID(str(i)) for i in ids]
        return self.db.query(CustomFeed).filter(CustomFeed.id.in_(uids)).all()

    def get_all_custom_for_export(self) -> List[CustomFeed]:
        return self.db.query(CustomFeed).all()

    def create_custom_feed(self, data: Dict[str, Any]) -> CustomFeed:
        feed = CustomFeed(**data)
        self.db.add(feed)
        self.db.flush()
        return feed

    def update_custom_feed(self, feed: CustomFeed, data: Dict[str, Any]) -> CustomFeed:
        for field, value in data.items():
            if hasattr(feed, field):
                setattr(feed, field, value)
        self.db.flush()
        return feed

    # ── Feed names / types / categories (for diet recommendation UI) ──────────

    def get_unique_types(self, country_id: str, user_id: str) -> List[str]:
        """UNION of feed types from standard + custom feeds for a given country."""
        std = (
            self.db.query(Feed.fd_type)
            .filter(Feed.fd_country_id == country_id)
            .distinct()
        )
        cust = (
            self.db.query(CustomFeed.fd_type)
            .filter(
                CustomFeed.fd_country_id == country_id,
                CustomFeed.user_id == uuid.UUID(str(user_id)),
            )
            .distinct()
        )
        rows = std.union(cust).all()
        return [r[0] for r in rows if r[0]]

    def get_unique_categories(self, country_id: str, user_id: str) -> List[str]:
        """UNION of feed categories from standard + custom feeds."""
        std = (
            self.db.query(Feed.fd_category)
            .filter(Feed.fd_country_id == country_id)
            .distinct()
        )
        cust = (
            self.db.query(CustomFeed.fd_category)
            .filter(
                CustomFeed.fd_country_id == country_id,
                CustomFeed.user_id == uuid.UUID(str(user_id)),
            )
            .distinct()
        )
        rows = std.union(cust).all()
        return [r[0] for r in rows if r[0]]

    def get_feed_names(
        self,
        country_id: str,
        user_id: str,
        feed_type: Optional[str] = None,
        category: Optional[str] = None,
    ) -> Tuple[List[Feed], List[CustomFeed]]:
        """Returns (standard_feeds, custom_feeds) matching the given filters."""
        sq = self.db.query(Feed).filter(Feed.fd_country_id == country_id)
        cq = self.db.query(CustomFeed).filter(
            CustomFeed.fd_country_id == country_id,
            CustomFeed.user_id == uuid.UUID(str(user_id)),
        )
        if feed_type:
            sq = sq.filter(Feed.fd_type == feed_type)
            cq = cq.filter(CustomFeed.fd_type == feed_type)
        if category:
            sq = sq.filter(Feed.fd_category == category)
            cq = cq.filter(CustomFeed.fd_category == category)
        return sq.all(), cq.all()

    # ── Feed types ────────────────────────────────────────────────────────────

    def get_feed_type_by_id(self, type_id: str) -> Optional[FeedType]:
        return (
            self.db.query(FeedType)
            .filter(FeedType.id == uuid.UUID(str(type_id)))
            .first()
        )

    def get_all_feed_types(self) -> List[FeedType]:
        return (
            self.db.query(FeedType)
            .filter(FeedType.is_active == True)  # noqa: E712
            .order_by(FeedType.sort_order, FeedType.type_name)
            .all()
        )

    def create_feed_type(self, data: Dict[str, Any]) -> FeedType:
        ft = FeedType(
            type_name=data["type_name"],
            description=data.get("description"),
            sort_order=data.get("sort_order", 0),
        )
        self.db.add(ft)
        self.db.flush()
        return ft

    def delete_feed_type(self, ft: FeedType) -> None:
        self.db.delete(ft)
        self.db.flush()

    def count_feeds_by_type_name(self, type_name: str) -> int:
        return (
            self.db.query(Feed)
            .filter(Feed.fd_type == type_name)
            .count()
        )

    def count_categories_by_type(self, type_id: str) -> int:
        return (
            self.db.query(FeedCategory)
            .filter(FeedCategory.feed_type_id == uuid.UUID(str(type_id)))
            .count()
        )

    # ── Feed categories ───────────────────────────────────────────────────────

    def get_category_by_id(self, cat_id: str) -> Optional[FeedCategory]:
        return (
            self.db.query(FeedCategory)
            .filter(FeedCategory.id == uuid.UUID(str(cat_id)))
            .first()
        )

    def get_categories_by_type(self, type_id: str) -> List[FeedCategory]:
        return (
            self.db.query(FeedCategory)
            .filter(
                FeedCategory.feed_type_id == uuid.UUID(str(type_id)),
                FeedCategory.is_active == True,  # noqa: E712
            )
            .order_by(FeedCategory.sort_order, FeedCategory.category_name)
            .all()
        )

    def get_all_categories(self) -> List[FeedCategory]:
        return (
            self.db.query(FeedCategory)
            .join(FeedType)
            .order_by(FeedType.sort_order, FeedCategory.category_name)
            .all()
        )

    def get_category_by_name_and_type(
        self, category_name: str, type_id: str
    ) -> Optional[FeedCategory]:
        return (
            self.db.query(FeedCategory)
            .filter(
                func.lower(FeedCategory.category_name) == func.lower(category_name),
                FeedCategory.feed_type_id == uuid.UUID(str(type_id)),
            )
            .first()
        )

    def create_feed_category(self, data: Dict[str, Any]) -> FeedCategory:
        cat = FeedCategory(
            category_name=data["category_name"],
            feed_type_id=data["feed_type_id"],
            description=data.get("description"),
            sort_order=data.get("sort_order", 0),
        )
        self.db.add(cat)
        self.db.flush()
        return cat

    def delete_feed_category(self, cat: FeedCategory) -> None:
        self.db.delete(cat)
        self.db.flush()

    def count_feeds_by_category_name(self, category_name: str) -> int:
        return (
            self.db.query(Feed)
            .filter(Feed.fd_category == category_name)
            .count()
        )

    # ── Country helper ────────────────────────────────────────────────────────

    def get_country_by_id(self, country_id: str) -> Optional[CountryModel]:
        return (
            self.db.query(CountryModel)
            .filter(CountryModel.id == country_id)
            .first()
        )

    def get_country_by_name(self, country_name: str) -> Optional[CountryModel]:
        return (
            self.db.query(CountryModel)
            .filter(func.lower(CountryModel.name) == func.lower(country_name))
            .first()
        )
