import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.db.models import UserFeedback, UserInformationModel
from app.schemas.report import (
    FeedbackListResponse,
    FeedbackSubmitRequest,
    UserFeedbackResponse,
)
from repositories.report_repository import ReportRepository

logger = logging.getLogger(__name__)
router = APIRouter(tags=["User Feedback"])


@router.post("/submit", response_model=UserFeedbackResponse, status_code=status.HTTP_201_CREATED,
             summary="Submit app feedback")
async def submit_feedback(
    body: FeedbackSubmitRequest,
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a feedback entry for the RationSmart mobile app. The submitting user is identified via the JWT.

    **Requires:** Bearer JWT.

    **Mandatory body fields:** `overall_rating` (integer 1–5).

    **Optional body fields:** `text_feedback` (free-text comments), `feedback_type` (category string, e.g. `"bug"`, `"suggestion"`).

    Returns the saved feedback record with its assigned `id` and `created_at` timestamp.
    """
    feedback = UserFeedback(
        user_id=current_user.id,
        overall_rating=body.overall_rating,
        text_feedback=body.text_feedback,
        feedback_type=body.feedback_type,
    )
    await ReportRepository(db).save_feedback(feedback)
    await db.commit()
    await db.refresh(feedback)
    return UserFeedbackResponse(
        id=str(feedback.id),
        overall_rating=feedback.overall_rating,
        text_feedback=feedback.text_feedback,
        feedback_type=feedback.feedback_type or "",
        created_at=feedback.created_at,
    )


@router.get("/my", response_model=FeedbackListResponse, summary="Get the authenticated user's feedback history")
async def get_my_feedback(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: UserInformationModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retrieve all feedback submissions made by the currently authenticated user.

    **Requires:** Bearer JWT.

    **Optional query parameters:**
    - `limit` (default 50, max 100) — number of records to return.
    - `offset` (default 0) — number of records to skip for pagination.

    Returns a list of feedback entries and the total count across all pages.
    """
    repo = ReportRepository(db)
    all_feedback = await repo.get_feedback_by_user(str(current_user.id))
    paged = all_feedback[offset: offset + limit]
    items = [
        UserFeedbackResponse(
            id=str(f.id),
            overall_rating=f.overall_rating,
            text_feedback=f.text_feedback,
            feedback_type=f.feedback_type or "",
            created_at=f.created_at,
        )
        for f in paged
    ]
    return FeedbackListResponse(feedbacks=items, total_count=len(all_feedback))
