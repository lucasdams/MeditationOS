"""Audit trail for privileged admin actions.

`record_audit` appends one row describing an action an admin took. It is the single
write path for the audit log, called from `admin_service` on every privileged action.

PRIVACY: `detail` must hold only ids/flags/state (e.g. {"was_disabled": False}) — never
private user CONTENT (journal/gratitude/mood body text, biometric values). The read
endpoint surfaces these rows to admins, so anything stored here is admin-visible.
"""

from collections.abc import Sequence
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session as DBSession

from app.models.audit_log import AuditLog
from app.models.user import User

# Stable action identifiers, recorded verbatim so the log is queryable/greppable.
ACTION_RESEND_VERIFICATION = "user.resend_verification"
ACTION_DISABLE = "user.disable"
ACTION_ENABLE = "user.enable"
ACTION_DELETE = "user.delete"


def record_audit(
    db: DBSession,
    actor: User,
    action: str,
    *,
    target: User | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLog:
    """Append an audit entry for `action` performed by `actor` (optionally on `target`).

    Adds the row to the session and commits so the trail is durable on its own. Callers
    record the audit AFTER the action they are logging has been applied.
    """
    entry = AuditLog(
        actor_user_id=actor.id,
        target_user_id=target.id if target is not None else None,
        action=action,
        detail=detail,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_audit(db: DBSession, *, limit: int, offset: int) -> tuple[Sequence[AuditLog], int]:
    """Return a page of audit entries newest-first, plus the total row count."""
    total = int(
        db.execute(select(func.count()).select_from(AuditLog)).scalar_one()
    )
    rows = (
        db.execute(
            select(AuditLog)
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return rows, total
