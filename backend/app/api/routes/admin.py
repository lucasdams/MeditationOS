"""Admin routes. The WHOLE router is gated by `require_admin` (default-deny): an
unauthenticated caller gets 401, a non-admin gets 403, before any handler runs.

Handlers stay thin — aggregation and support logic live in the admin services. Every
privileged action (resend verification, disable/enable, delete) is audited inside the
service via `audit_service.record_audit`.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import require_admin
from app.core.db import get_db
from app.core.exceptions import AdminSelfActionError, UserNotFoundError
from app.models.user import User
from app.schemas.admin import AdminMetrics
from app.schemas.admin_users import AdminUserDetail, AdminUserList
from app.schemas.audit import AuditEntry, AuditList
from app.services import admin_service, admin_users_service, audit_service

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)

# Reused not-found mapping — return 404 for unknown user ids.
_USER_NOT_FOUND = not_found("User not found")


@router.get("/metrics", response_model=AdminMetrics)
def get_metrics(db: DBSession = Depends(get_db)) -> AdminMetrics:
    """Aggregate business metrics across the whole user base (counts/sums only)."""
    return admin_service.get_admin_metrics(db)


# ── User management / support (metadata-only reads; audited writes) ─────────


@router.get("/users", response_model=AdminUserList)
def list_users(
    db: DBSession = Depends(get_db),
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> AdminUserList:
    """Search/list users by email or username (paginated, newest-first).
    Returns account METADATA + counts only — never any user content."""
    users, total = admin_users_service.list_users(db, query=q, limit=limit, offset=offset)
    return AdminUserList(users=users, total=total)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
def get_user(user_id: str, db: DBSession = Depends(get_db)) -> AdminUserDetail:
    """One user's account summary (metadata + counts + last-activity). Never content."""
    try:
        return admin_users_service.get_user_detail(db, user_id)
    except UserNotFoundError:
        raise _USER_NOT_FOUND from None


@router.post(
    "/users/{user_id}/resend-verification", status_code=status.HTTP_202_ACCEPTED
)
def resend_verification(
    user_id: str,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict[str, str]:
    """Re-send the email-verification link to a user (audited)."""
    try:
        admin_users_service.resend_verification(db, admin, user_id)
    except UserNotFoundError:
        raise _USER_NOT_FOUND from None
    return {"detail": "Verification email re-sent if the address isn't already verified."}


@router.post("/users/{user_id}/disable", response_model=AdminUserDetail)
def disable_user(
    user_id: str,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserDetail:
    """Disable a user account (blocks login + existing sessions). Audited. An admin
    cannot disable their own account (→ 400)."""
    try:
        return admin_users_service.set_user_disabled(db, admin, user_id, disabled=True)
    except UserNotFoundError:
        raise _USER_NOT_FOUND from None
    except AdminSelfActionError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot disable your own account.",
        ) from None


@router.post("/users/{user_id}/enable", response_model=AdminUserDetail)
def enable_user(
    user_id: str,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> AdminUserDetail:
    """Re-enable a previously disabled account (restores access). Audited."""
    try:
        return admin_users_service.set_user_disabled(db, admin, user_id, disabled=False)
    except UserNotFoundError:
        raise _USER_NOT_FOUND from None


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: DBSession = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    """Permanently delete a user account and cascade its data (audited). An admin
    cannot delete their own account here (→ 400); use account self-service instead."""
    try:
        admin_users_service.delete_user(db, admin, user_id)
    except UserNotFoundError:
        raise _USER_NOT_FOUND from None
    except AdminSelfActionError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account from admin tools.",
        ) from None


# ── Audit log (read) ───────────────────────────────────────────────────────


@router.get("/audit", response_model=AuditList)
def list_audit(
    db: DBSession = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> AuditList:
    """Read the audit trail, newest-first (paginated)."""
    rows, total = audit_service.list_audit(db, limit=limit, offset=offset)
    return AuditList(
        entries=[AuditEntry.model_validate(r) for r in rows], total=total
    )
