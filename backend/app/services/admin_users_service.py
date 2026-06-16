"""Admin user-management / support tooling.

Read-side: search/list users and one-user summaries — ACCOUNT METADATA ONLY (ids,
email/username, flags, timestamps, and per-user row COUNTS). This module never reads or
returns any individual user's private CONTENT (journal/gratitude/mood body text,
biometric values) — same no-leak guarantee as `admin_service` metrics.

Write-side (support actions): resend a verification email, disable / re-enable an
account, and admin-initiated account deletion. Every privileged action is recorded via
`audit_service.record_audit`. Guard rails stop an admin from disabling or deleting THEIR
OWN account (lockout foot-gun → AdminSelfActionError).
"""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import AdminSelfActionError, UserNotFoundError
from app.models.goal import Goal
from app.models.gratitude import GratitudeEntry
from app.models.journal import Journal
from app.models.mood_log import MoodLog
from app.models.session import Session
from app.models.user import User
from app.schemas.admin_users import AdminUserCounts, AdminUserDetail, AdminUserSummary
from app.services import audit_service, user_service

# Per-user row counts surfaced in the summary. (model, attr-name) — counts only, no body.
_COUNT_SOURCES: tuple[tuple[type, str], ...] = (
    (Session, "sessions"),
    (Journal, "journals"),
    (GratitudeEntry, "gratitude"),
    (MoodLog, "mood_logs"),
    (Goal, "goals"),
)


def _counts_for(db: DBSession, user_id) -> AdminUserCounts:
    """Per-user row counts (one COUNT per source). Counts only — never any body text."""
    values: dict[str, int] = {}
    for model, name in _COUNT_SOURCES:
        values[name] = int(
            db.execute(
                select(func.count()).select_from(model).where(model.user_id == user_id)
            ).scalar_one()
        )
    return AdminUserCounts(**values)


def _last_active_at(db: DBSession, user_id) -> datetime | None:
    """Most recent session occurrence for the user (a cheap last-activity proxy)."""
    return db.execute(
        select(func.max(Session.occurred_at)).where(Session.user_id == user_id)
    ).scalar_one()


def _summary(user: User) -> AdminUserSummary:
    """Map a user to its metadata-only summary (no counts; used by list)."""
    return AdminUserSummary(
        id=user.id,
        email=user.email,
        username=user.username,
        created_at=user.created_at,
        email_verified=user.email_verified,
        is_guest=user.is_guest,
        is_admin=user.is_admin,
        is_disabled=user.is_disabled,
    )


def list_users(
    db: DBSession, *, query: str | None, limit: int, offset: int
) -> tuple[Sequence[AdminUserSummary], int]:
    """Search/list users by email or username (case-insensitive substring), newest-first.

    Returns metadata-only summaries plus the total match count for pagination. Touches
    identity/flag/timestamp columns only — never any user content.
    """
    stmt = select(User)
    if query:
        like = f"%{query.strip()}%"
        # email/username are citext, so ILIKE is redundant but harmless; cast username to
        # avoid NULLs short-circuiting the OR.
        stmt = stmt.where(
            or_(User.email.ilike(like), func.coalesce(User.username, "").ilike(like))
        )

    total = int(
        db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    )
    rows = (
        db.execute(
            stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
        )
        .scalars()
        .all()
    )
    return [_summary(u) for u in rows], total


def _get_user_or_404(db: DBSession, user_id: str) -> User:
    user = user_service.get_user_by_id(db, user_id)
    if user is None:
        raise UserNotFoundError()
    return user


def get_user_detail(db: DBSession, user_id: str) -> AdminUserDetail:
    """One user's account summary: metadata + per-user counts + last-activity. Raises
    UserNotFoundError if the id is unknown. Metadata-only — never any content."""
    user = _get_user_or_404(db, user_id)
    summary = _summary(user)
    return AdminUserDetail(
        **summary.model_dump(),
        last_active_at=_last_active_at(db, user.id),
        counts=_counts_for(db, user.id),
    )


def resend_verification(db: DBSession, actor: User, user_id: str) -> None:
    """Re-send the email-verification link to a user, and audit it. Silent (no-op send)
    if the address is already verified — still audited so the action is on record."""
    target = _get_user_or_404(db, user_id)
    user_service.send_verification_email(db, target)
    audit_service.record_audit(
        db,
        actor,
        audit_service.ACTION_RESEND_VERIFICATION,
        target=target,
        detail={"already_verified": target.email_verified},
    )


def set_user_disabled(
    db: DBSession, actor: User, user_id: str, *, disabled: bool
) -> AdminUserDetail:
    """Disable or re-enable a user's account, and audit the change.

    Guard: an admin may not disable their OWN account (lockout foot-gun →
    AdminSelfActionError). Disabling another admin IS allowed (and audited). Idempotent
    on the flag; the audit records the prior state.
    """
    target = _get_user_or_404(db, user_id)
    if disabled and target.id == actor.id:
        raise AdminSelfActionError()
    was_disabled = target.is_disabled
    target.is_disabled = disabled
    db.commit()
    db.refresh(target)
    audit_service.record_audit(
        db,
        actor,
        audit_service.ACTION_DISABLE if disabled else audit_service.ACTION_ENABLE,
        target=target,
        detail={"was_disabled": was_disabled, "target_is_admin": target.is_admin},
    )
    return get_user_detail(db, str(target.id))


def delete_user(db: DBSession, actor: User, user_id: str) -> None:
    """Admin-initiated permanent account deletion (cascades all the user's data), audited.

    Guard: an admin may not delete their OWN account here (→ AdminSelfActionError); they
    have account self-service (DELETE /auth/me) for that. Deleting another admin IS
    allowed and audited. The audit row is written BEFORE the delete and survives it (the
    target FK is SET NULL), so the deletion stays on record by id.
    """
    target = _get_user_or_404(db, user_id)
    if target.id == actor.id:
        raise AdminSelfActionError()
    # Capture identifying metadata for the trail, then record, then delete. The audit's
    # target FK becomes NULL on cascade, so the detail preserves who was deleted.
    deleted_id = str(target.id)
    audit_service.record_audit(
        db,
        actor,
        audit_service.ACTION_DELETE,
        target=target,
        detail={
            "deleted_user_id": deleted_id,
            "target_was_admin": target.is_admin,
            "target_is_guest": target.is_guest,
        },
    )
    user_service.delete_user(db, target)
