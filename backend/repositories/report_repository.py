import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    CountryModel,
    FeedAnalytics,
    Report,
    UserFeedback,
    UserInformationModel,
)


class ReportRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ── Reports ───────────────────────────────────────────────────────────────

    async def save(self, report: Report) -> Report:
        self.db.add(report)
        await self.db.flush()
        return report

    async def get_by_report_id(
        self, report_id: str, user_id: Optional[str] = None
    ) -> Optional[Report]:
        q = select(Report).where(Report.report_id == report_id)
        if user_id:
            q = q.where(Report.user_id == uuid.UUID(str(user_id)))
        result = await self.db.execute(q)
        return result.scalars().first()

    async def get_by_user(
        self, user_id: str, skip: int = 0, limit: int = 50
    ) -> List[Report]:
        result = await self.db.execute(
            select(Report)
            .where(Report.user_id == uuid.UUID(str(user_id)))
            .order_by(Report.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return result.scalars().all()

    async def get_saved_by_user(self, user_id: str) -> List[Report]:
        result = await self.db.execute(
            select(Report)
            .where(
                Report.user_id == uuid.UUID(str(user_id)),
                Report.save_report == True,  # noqa: E712
            )
            .order_by(Report.created_at.desc())
        )
        return result.scalars().all()

    async def get_simulation_list(self, user_id: str) -> List:
        """Returns rows with Report + country_name for the simulation list endpoint."""
        result = await self.db.execute(
            select(Report, CountryModel.name.label("country_name"))
            .join(CountryModel, Report.country_id == CountryModel.id)
            .where(
                Report.user_id == uuid.UUID(str(user_id)),
                Report.save_report == True,  # noqa: E712
            )
            .order_by(Report.created_at.desc())
        )
        return result.all()

    async def mark_saved(self, report: Report) -> None:
        report.save_report = True
        report.updated_at = datetime.utcnow()
        await self.db.flush()

    async def delete(self, report: Report) -> None:
        await self.db.delete(report)
        await self.db.flush()

    async def delete_unsaved_for_user(self, user_id: str) -> None:
        """Purge un-saved reports for a user before generating a new one."""
        result = await self.db.execute(
            select(Report)
            .where(
                Report.user_id == uuid.UUID(str(user_id)),
                Report.save_report == False,  # noqa: E712
            )
            .order_by(Report.created_at.desc())
        )
        for r in result.scalars().all():
            await self.db.delete(r)
        await self.db.flush()

    # ── Admin: all saved reports ──────────────────────────────────────────────

    async def get_all_saved(
        self, skip: int = 0, limit: int = 20
    ) -> Tuple[List, int]:
        """Returns (rows, total) where each row carries Report + user name/email."""
        q = (
            select(
                Report,
                UserInformationModel.name.label("user_name"),
                UserInformationModel.email_id.label("user_email"),
            )
            .join(UserInformationModel, Report.user_id == UserInformationModel.id)
            .where(Report.save_report == True)  # noqa: E712
            .order_by(Report.created_at.desc())
        )
        count_result = await self.db.execute(
            select(func.count()).select_from(q.subquery())
        )
        total = count_result.scalar_one()
        rows_result = await self.db.execute(q.offset(skip).limit(limit))
        return rows_result.all(), total

    # ── Feed analytics ────────────────────────────────────────────────────────

    async def save_feed_analytics(self, record: FeedAnalytics) -> FeedAnalytics:
        self.db.add(record)
        await self.db.flush()
        return record

    # ── User feedback ─────────────────────────────────────────────────────────

    async def save_feedback(self, feedback: UserFeedback) -> UserFeedback:
        self.db.add(feedback)
        await self.db.flush()
        return feedback

    async def get_all_feedback(
        self, skip: int = 0, limit: int = 20
    ) -> Tuple[List, int]:
        count_result = await self.db.execute(
            select(func.count(UserFeedback.id))
        )
        total = count_result.scalar_one()
        rows_result = await self.db.execute(
            select(UserFeedback)
            .join(UserInformationModel)
            .order_by(UserFeedback.created_at.desc())
            .offset(skip)
            .limit(limit)
        )
        return rows_result.scalars().all(), total

    async def get_feedback_by_user(self, user_id: str) -> List[UserFeedback]:
        result = await self.db.execute(
            select(UserFeedback)
            .where(UserFeedback.user_id == uuid.UUID(str(user_id)))
            .order_by(UserFeedback.created_at.desc())
        )
        return result.scalars().all()

    async def get_feedback_stats(self) -> Dict[str, Any]:
        total_result = await self.db.execute(select(func.count(UserFeedback.id)))
        total = total_result.scalar_one()

        ratings_result = await self.db.execute(select(UserFeedback.overall_rating))
        ratings = [r[0] for r in ratings_result.all() if r[0] is not None]
        avg = round(sum(ratings) / len(ratings), 2) if ratings else 0.0

        rating_dist: Dict[str, str] = {}
        for star in range(1, 6):
            count_result = await self.db.execute(
                select(func.count(UserFeedback.id)).where(
                    UserFeedback.overall_rating == star
                )
            )
            count = count_result.scalar_one()
            pct = round((count / total * 100), 1) if total else 0.0
            rating_dist[str(star)] = f"{pct}%"

        type_dist: Dict[str, int] = {}
        for ftype in ("General", "Defect", "Feature Request"):
            type_count_result = await self.db.execute(
                select(func.count(UserFeedback.id)).where(
                    UserFeedback.feedback_type == ftype
                )
            )
            type_dist[ftype] = type_count_result.scalar_one()

        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_result = await self.db.execute(
            select(func.count(UserFeedback.id)).where(
                UserFeedback.created_at >= thirty_days_ago
            )
        )
        recent = recent_result.scalar_one()

        return {
            "total_feedbacks": total,
            "average_rating": avg,
            "rating_distribution": rating_dist,
            "feedback_type_distribution": type_dist,
            "recent_feedbacks": recent,
        }
