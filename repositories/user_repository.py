import uuid
from datetime import datetime
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.db.models import CountryModel, UserInformationModel


class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Lookup ────────────────────────────────────────────────────────────────

    def get_by_email(self, email: str) -> Optional[UserInformationModel]:
        return (
            self.db.query(UserInformationModel)
            .filter(
                UserInformationModel.email_id == email.lower().strip(),
                UserInformationModel.email_id.isnot(None),
            )
            .first()
        )

    def get_by_id(self, user_id: str) -> Optional[UserInformationModel]:
        try:
            uid = uuid.UUID(str(user_id))
        except ValueError:
            return None
        return (
            self.db.query(UserInformationModel)
            .filter(UserInformationModel.id == uid)
            .first()
        )

    def get_admin_by_id(self, user_id: str) -> Optional[UserInformationModel]:
        """Returns user only if they have admin privileges."""
        try:
            uid = uuid.UUID(str(user_id))
        except ValueError:
            return None
        return (
            self.db.query(UserInformationModel)
            .filter(
                UserInformationModel.id == uid,
                UserInformationModel.is_admin == True,  # noqa: E712
            )
            .first()
        )

    def is_admin(self, user_id: str) -> bool:
        user = self.get_by_id(user_id)
        return bool(user and user.is_admin)

    # ── Create ────────────────────────────────────────────────────────────────

    def create(
        self, name: str, email: str, pin_hash: str, country_id: str
    ) -> UserInformationModel:
        user = UserInformationModel(
            name=name.strip(),
            email_id=email.lower().strip(),
            pin_hash=pin_hash,
            country_id=country_id,
        )
        self.db.add(user)
        self.db.flush()
        return user

    # ── Update ────────────────────────────────────────────────────────────────

    def update_pin_hash(self, user: UserInformationModel, new_hash: str) -> None:
        user.pin_hash = new_hash
        user.updated_at = datetime.utcnow()
        self.db.flush()

    def update_profile(
        self,
        user: UserInformationModel,
        name: Optional[str] = None,
        country_id: Optional[str] = None,
    ) -> UserInformationModel:
        if name is not None:
            user.name = name.strip()
        if country_id is not None:
            user.country_id = country_id
        user.updated_at = datetime.utcnow()
        self.db.flush()
        return user

    def deactivate(self, user: UserInformationModel) -> None:
        user.is_active = False
        user.updated_at = datetime.utcnow()
        self.db.flush()

    def toggle_status(self, user: UserInformationModel, active: bool) -> None:
        user.is_active = active
        user.updated_at = datetime.utcnow()
        self.db.flush()

    # ── List (admin) ──────────────────────────────────────────────────────────

    def list_all(
        self,
        skip: int = 0,
        limit: int = 20,
        country_filter: Optional[str] = None,
        status_filter: Optional[str] = None,
        search: Optional[str] = None,
    ) -> Tuple[List, int]:
        """Returns (rows, total_count). Each row has UserInformationModel + country_name label."""
        query = (
            self.db.query(
                UserInformationModel,
                CountryModel.name.label("country_name"),
            )
            .join(CountryModel, UserInformationModel.country_id == CountryModel.id)
        )

        if country_filter:
            query = query.filter(
                CountryModel.name.ilike(f"%{country_filter}%")
            )
        if status_filter == "active":
            query = query.filter(UserInformationModel.is_active == True)  # noqa: E712
        elif status_filter == "inactive":
            query = query.filter(UserInformationModel.is_active == False)  # noqa: E712
        if search:
            query = query.filter(
                UserInformationModel.name.ilike(f"%{search}%")
                | UserInformationModel.email_id.ilike(f"%{search}%")
            )

        total = query.count()
        rows = query.offset(skip).limit(limit).all()
        return rows, total

    # ── Countries ─────────────────────────────────────────────────────────────

    def get_all_countries(self) -> List[CountryModel]:
        return (
            self.db.query(CountryModel)
            .filter(CountryModel.is_active == True)  # noqa: E712
            .order_by(CountryModel.name)
            .all()
        )

    def get_country_by_id(self, country_id: str) -> Optional[CountryModel]:
        return (
            self.db.query(CountryModel)
            .filter(CountryModel.id == country_id)
            .first()
        )
