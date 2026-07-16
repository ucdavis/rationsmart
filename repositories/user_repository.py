import uuid
from datetime import datetime
from typing import Any, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CountryModel, UserInformationModel


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Lookup ────────────────────────────────────────────────────────────────

    async def get_by_email(self, email: str) -> Optional[UserInformationModel]:
        result = await self.db.execute(
            select(UserInformationModel).where(
                UserInformationModel.email_id == email.lower().strip(),
                UserInformationModel.email_id.isnot(None),
            )
        )
        return result.scalars().first()

    async def get_by_id(self, user_id: str) -> Optional[UserInformationModel]:
        try:
            uid = uuid.UUID(str(user_id))
        except ValueError:
            return None
        result = await self.db.execute(
            select(UserInformationModel).where(UserInformationModel.id == uid)
        )
        return result.scalars().first()

    async def get_admin_by_id(self, user_id: str) -> Optional[UserInformationModel]:
        """Returns user only if they have admin privileges."""
        try:
            uid = uuid.UUID(str(user_id))
        except ValueError:
            return None
        result = await self.db.execute(
            select(UserInformationModel).where(
                UserInformationModel.id == uid,
                UserInformationModel.is_admin == True,  # noqa: E712
            )
        )
        return result.scalars().first()

    async def is_admin(self, user_id: str) -> bool:
        user = await self.get_by_id(user_id)
        return bool(user and user.is_admin)

    # ── Create ────────────────────────────────────────────────────────────────

    async def create(
        self,
        name: str,
        email: str,
        pin_hash: str,
        country_id: str,
        is_active: bool = False,
        is_email_verified: bool = False,
    ) -> UserInformationModel:
        user = UserInformationModel(
            name=name.strip(),
            email_id=email.lower().strip(),
            pin_hash=pin_hash,
            country_id=country_id,
            is_active=is_active,
            is_email_verified=is_email_verified,
        )
        self.db.add(user)
        await self.db.flush()
        return user

    # ── Email verification ────────────────────────────────────────────────────

    async def get_by_email_verify_token(self, token: str) -> Optional[UserInformationModel]:
        result = await self.db.execute(
            select(UserInformationModel).where(
                UserInformationModel.email_verify_token == token
            )
        )
        return result.scalars().first()

    async def set_email_verification_token(
        self,
        user: UserInformationModel,
        token: str,
        expiry: Any,
    ) -> None:
        user.email_verify_token = token
        user.email_verify_token_exp = expiry
        await self.db.flush()

    async def mark_email_verified(self, user: UserInformationModel) -> None:
        user.is_email_verified = True
        user.is_active = True
        user.email_verify_token = None
        user.email_verify_token_exp = None
        user.updated_at = datetime.utcnow()
        await self.db.flush()

    # ── Update ────────────────────────────────────────────────────────────────

    async def update_pin_hash(self, user: UserInformationModel, new_hash: str) -> None:
        user.pin_hash = new_hash
        user.updated_at = datetime.utcnow()
        await self.db.flush()

    async def update_profile(
        self,
        user: UserInformationModel,
        name: Optional[str] = None,
        country_id: Optional[str] = None,
        preferred_language: Optional[str] = None,
    ) -> UserInformationModel:
        if name is not None:
            user.name = name.strip()
        if country_id is not None:
            user.country_id = country_id
        if preferred_language is not None:
            user.preferred_language = preferred_language
        user.updated_at = datetime.utcnow()
        await self.db.flush()
        return user

    async def deactivate(self, user: UserInformationModel) -> None:
        user.is_active = False
        user.updated_at = datetime.utcnow()
        await self.db.flush()

    async def toggle_status(self, user: UserInformationModel, active: bool) -> None:
        user.is_active = active
        user.updated_at = datetime.utcnow()
        await self.db.flush()

    # ── List (admin) ──────────────────────────────────────────────────────────

    async def list_all(
        self,
        skip: int = 0,
        limit: int = 20,
        country_filter: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List, int]:
        """Returns (rows, total_count). Each row has UserInformationModel + country_name label."""
        q = (
            select(UserInformationModel, CountryModel.name.label("country_name"))
            .join(CountryModel, UserInformationModel.country_id == CountryModel.id)
        )

        if country_filter:
            q = q.where(CountryModel.name.ilike(f"%{country_filter}%"))
        if status_filter == "active":
            q = q.where(UserInformationModel.is_active == True)  # noqa: E712
        elif status_filter == "inactive":
            q = q.where(UserInformationModel.is_active == False)  # noqa: E712
        if search:
            q = q.where(
                UserInformationModel.name.ilike(f"%{search}%")
                | UserInformationModel.email_id.ilike(f"%{search}%")
            )

        count_result = await self.db.execute(
            select(func.count()).select_from(q.subquery())
        )
        total = count_result.scalar_one()

        rows_result = await self.db.execute(q.offset(skip).limit(limit))
        rows = rows_result.all()
        return rows, total

    # ── Countries ─────────────────────────────────────────────────────────────

    async def get_all_countries(self) -> List[CountryModel]:
        result = await self.db.execute(
            select(CountryModel)
            .where(CountryModel.is_active == True)  # noqa: E712
            .order_by(CountryModel.name)
        )
        return result.scalars().all()

    async def get_all_countries_unfiltered(self) -> List[CountryModel]:
        """All countries regardless of is_active status (admin listing)."""
        result = await self.db.execute(
            select(CountryModel).order_by(CountryModel.name)
        )
        return result.scalars().all()

    async def get_country_by_id(self, country_id: str) -> Optional[CountryModel]:
        result = await self.db.execute(
            select(CountryModel).where(CountryModel.id == country_id)
        )
        return result.scalars().first()

    async def get_country_by_name(self, name: str) -> Optional[CountryModel]:
        result = await self.db.execute(
            select(CountryModel).where(CountryModel.name.ilike(name))
        )
        return result.scalars().first()

    async def toggle_country_status(self, country: CountryModel, active: bool) -> None:
        country.is_active = active
        country.updated_at = datetime.utcnow()
        await self.db.flush()
