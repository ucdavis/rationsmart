import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.db.models import (
    CountryModel,
    FeedAnalytics,
    Report,
    UserFeedback,
    UserInformationModel,
)


class ReportRepository:
    def __init__(self, db: Session):
        self.db = db

    # ── Reports ───────────────────────────────────────────────────────────────

    def save(self, report: Report) -> Report:
        self.db.add(report)
        self.db.flush()
        return report

    def get_by_report_id(
        self, report_id: str, user_id: Optional[str] = None
    ) -> Optional[Report]:
        q = self.db.query(Report).filter(Report.report_id == report_id)
        if user_id:
            q = q.filter(Report.user_id == uuid.UUID(str(user_id)))
        return q.first()

    def get_by_user(
        self, user_id: str, skip: int = 0, limit: int = 50
    ) -> List[Report]:
        return (
            self.db.query(Report)
            .filter(Report.user_id == uuid.UUID(str(user_id)))
            .order_by(Report.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_saved_by_user(self, user_id: str) -> List[Report]:
        return (
            self.db.query(Report)
            .filter(
                Report.user_id == uuid.UUID(str(user_id)),
                Report.save_report == True,  # noqa: E712
            )
            .order_by(Report.created_at.desc())
            .all()
        )

    def get_simulation_list(self, user_id: str) -> List:
        """Returns rows with Report + country_name for the simulation list endpoint."""
        return (
            self.db.query(
                Report,
                CountryModel.name.label("country_name"),
            )
            .join(CountryModel, Report.country_id == CountryModel.id)
            .filter(
                Report.user_id == uuid.UUID(str(user_id)),
                Report.save_report == True,  # noqa: E712
            )
            .order_by(Report.created_at.desc())
            .all()
        )

    def mark_saved(self, report: Report) -> None:
        report.save_report = True
        report.updated_at = datetime.utcnow()
        self.db.flush()

    def delete(self, report: Report) -> None:
        self.db.delete(report)
        self.db.flush()

    def delete_unsaved_for_user(self, user_id: str) -> None:
        """Purge un-saved reports for a user before generating a new one."""
        unsaved = (
            self.db.query(Report)
            .filter(
                Report.user_id == uuid.UUID(str(user_id)),
                Report.save_report == False,  # noqa: E712
            )
            .order_by(Report.created_at.desc())
            .all()
        )
        for r in unsaved:
            self.db.delete(r)
        self.db.flush()

    # ── Admin: all saved reports ──────────────────────────────────────────────

    def get_all_saved(
        self, skip: int = 0, limit: int = 20
    ) -> Tuple[List, int]:
        """Returns (rows, total) where each row carries Report + user name/email."""
        q = (
            self.db.query(
                Report,
                UserInformationModel.name.label("user_name"),
                UserInformationModel.email_id.label("user_email"),
            )
            .join(UserInformationModel, Report.user_id == UserInformationModel.id)
            .filter(Report.save_report == True)  # noqa: E712
            .order_by(Report.created_at.desc())
        )
        total = q.count()
        rows = q.offset(skip).limit(limit).all()
        return rows, total

    # ── Feed analytics ────────────────────────────────────────────────────────

    def save_feed_analytics(self, record: FeedAnalytics) -> FeedAnalytics:
        self.db.add(record)
        self.db.flush()
        return record

    # ── User feedback ─────────────────────────────────────────────────────────

    def save_feedback(self, feedback: UserFeedback) -> UserFeedback:
        self.db.add(feedback)
        self.db.flush()
        return feedback

    def get_all_feedback(
        self, skip: int = 0, limit: int = 20
    ) -> Tuple[List, int]:
        q = (
            self.db.query(UserFeedback)
            .join(UserInformationModel)
            .order_by(UserFeedback.created_at.desc())
        )
        total = self.db.query(UserFeedback).count()
        rows = q.offset(skip).limit(limit).all()
        return rows, total

    def get_feedback_by_user(self, user_id: str) -> List[UserFeedback]:
        return (
            self.db.query(UserFeedback)
            .filter(UserFeedback.user_id == uuid.UUID(str(user_id)))
            .order_by(UserFeedback.created_at.desc())
            .all()
        )

    def get_feedback_stats(self) -> Dict[str, Any]:
        total = self.db.query(UserFeedback).count()
        ratings = [
            r[0]
            for r in self.db.query(UserFeedback.overall_rating).all()
            if r[0] is not None
        ]
        avg = round(sum(ratings) / len(ratings), 2) if ratings else 0.0

        rating_dist: Dict[str, str] = {}
        for star in range(1, 6):
            count = (
                self.db.query(UserFeedback)
                .filter(UserFeedback.overall_rating == star)
                .count()
            )
            pct = round((count / total * 100), 1) if total else 0.0
            rating_dist[str(star)] = f"{pct}%"

        type_dist: Dict[str, int] = {}
        for ftype in ("General", "Defect", "Feature Request"):
            type_dist[ftype] = (
                self.db.query(UserFeedback)
                .filter(UserFeedback.feedback_type == ftype)
                .count()
            )

        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent = (
            self.db.query(UserFeedback)
            .filter(UserFeedback.created_at >= thirty_days_ago)
            .count()
        )

        return {
            "total_feedbacks": total,
            "average_rating": avg,
            "rating_distribution": rating_dist,
            "feedback_type_distribution": type_dist,
            "recent_feedbacks": recent,
        }
