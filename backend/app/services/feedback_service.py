"""In-app feedback business logic and data access (see
docs/decisions/0006-layered-architecture.md).

Two concerns:
  - the write path (`create_feedback`), scoped to the authenticated sender and rate-capped
    per user per day like the other user-created rows, and
  - the admin read path (`list_feedback`), which joins the sender's email for the owner's
    support inbox.

PRIVACY note: unlike the metadata-only admin metrics/user views, feedback is content the
user chose to send us, so the admin inbox intentionally surfaces the message body. The
message is never written to the application logs (only its length/category metadata, at
the call site).
"""

import uuid
from collections.abc import Sequence

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.core.limits import enforce_daily_create_cap
from app.models.feedback import Feedback
from app.models.user import User
from app.schemas.feedback import AdminFeedbackEntry, FeedbackCreate


def create_feedback(
    db: DBSession, user_id: uuid.UUID, data: FeedbackCreate
) -> Feedback:
    """Persist one note from `user_id`. Enforces the per-user daily creation cap first
    (raises DailyLimitError → 429 app-wide). The message is already trimmed + non-empty
    by the schema validator."""
    enforce_daily_create_cap(db, Feedback, user_id)
    feedback = Feedback(user_id=user_id, **data.model_dump())
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return feedback


def list_feedback(
    db: DBSession, *, limit: int, offset: int
) -> tuple[Sequence[AdminFeedbackEntry], int]:
    """A page of feedback notes newest-first, each with the sender's email (null if the
    account was since deleted — the FK is SET NULL), plus the total count. Admin-only read."""
    total = int(
        db.execute(select(func.count()).select_from(Feedback)).scalar_one()
    )
    # Outer join so a note whose sender was deleted (user_id NULL) still appears.
    rows = db.execute(
        select(
            Feedback.id,
            Feedback.category,
            Feedback.message,
            Feedback.path,
            Feedback.created_at,
            User.email,
        )
        .outerjoin(User, User.id == Feedback.user_id)
        .order_by(Feedback.created_at.desc(), Feedback.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    entries = [
        AdminFeedbackEntry(
            id=r.id,
            category=r.category,
            message=r.message,
            path=r.path,
            created_at=r.created_at,
            email=r.email,
        )
        for r in rows
    ]
    return entries, total
