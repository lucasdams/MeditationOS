"""Authentication routes. Thin handlers: validate, call a service, map errors."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core import login_guard, send_guard
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import (
    EmailAlreadyExistsError,
    GoogleAuthError,
    InvalidPasswordError,
    InvalidQuestFeaturesError,
    InvalidResetTokenError,
    InvalidTimezoneError,
    InvalidVerificationTokenError,
    NotAGuestError,
    UsernameTakenError,
)
from app.core.rate_limit import limiter
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.user import (
    ClaimAccount,
    EmailUpdate,
    EmailVerify,
    GoogleLogin,
    PasswordResetConfirm,
    PasswordResetRequest,
    PasswordUpdate,
    QuestFeaturesUpdate,
    ReminderUpdate,
    TimezoneUpdate,
    UserCreate,
    UserLogin,
    UsernameUpdate,
    UserRead,
    WeeklySummaryUpdate,
)
from app.services import reminder_service, user_service, weekly_review_service

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_NAME = "access_token"


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.environment == "production",  # HTTPS-only outside dev/test
        samesite="lax",
        max_age=settings.access_token_expire_minutes * 60,
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.login_rate_limit)
def register(
    request: Request,  # required by the rate limiter
    data: UserCreate,
    db: Session = Depends(get_db),
) -> UserRead:
    try:
        return user_service.create_user(db, data)
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None


@router.post("/guest", response_model=UserRead)
@limiter.limit(settings.login_rate_limit)
def guest(
    request: Request,  # required by the rate limiter
    response: Response,
    db: Session = Depends(get_db),
) -> UserRead:
    """Create an anonymous account and sign it in — "use without signing up"."""
    user = user_service.create_guest(db)
    _set_auth_cookie(response, create_access_token(str(user.id)))
    return user


@router.post("/login", response_model=UserRead)
@limiter.limit(settings.login_rate_limit)
def login(
    request: Request,  # required by the rate limiter
    response: Response,
    data: UserLogin,
    db: Session = Depends(get_db),
) -> UserRead:
    # Per-email throttle (on top of the per-IP limiter) to resist distributed brute force.
    if login_guard.is_locked(data.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts for this account. Try again later.",
        )
    user = user_service.authenticate(db, data.email, data.password)
    if user is None:
        login_guard.record_failure(data.email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    login_guard.clear(data.email)
    _set_auth_cookie(response, create_access_token(str(user.id)))
    return user


@router.post("/google", response_model=UserRead)
@limiter.limit(settings.login_rate_limit)
def google_login(
    request: Request,  # required by the rate limiter
    response: Response,
    data: GoogleLogin,
    db: Session = Depends(get_db),
) -> UserRead:
    try:
        user = user_service.login_with_google(db, data.credential)
    except GoogleAuthError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google sign-in failed",
        ) from None
    _set_auth_cookie(response, create_access_token(str(user.id)))
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME)


@router.get("/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.get("/export")
def export_my_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Download everything this account owns (data portability)."""
    return user_service.export_user_data(db, current_user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Permanently delete the account and all its data, then clear the session."""
    user_service.delete_user(db, current_user)
    response.delete_cookie(COOKIE_NAME)


@router.post("/timezone", response_model=UserRead)
def set_timezone(
    data: TimezoneUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    try:
        return user_service.set_timezone(db, current_user, data.timezone)
    except InvalidTimezoneError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid timezone"
        ) from None


@router.post("/quest-features", response_model=UserRead)
def set_quest_features(
    data: QuestFeaturesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    try:
        return user_service.set_quest_features(db, current_user, data.features)
    except InvalidQuestFeaturesError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(err)
        ) from None


@router.post("/username", response_model=UserRead)
def set_username(
    data: UsernameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    try:
        return user_service.set_username(db, current_user, data.username)
    except UsernameTakenError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username taken"
        ) from None


@router.post("/password", response_model=UserRead)
def change_password(
    data: PasswordUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    try:
        return user_service.set_password(
            db,
            current_user,
            current_password=data.current_password,
            new_password=data.new_password,
        )
    except InvalidPasswordError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        ) from None


@router.post("/email", response_model=UserRead)
@limiter.limit(settings.login_rate_limit)  # sends an email — guard against abuse
def change_email(
    request: Request,  # required by the rate limiter
    data: EmailUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    """Change the account email (re-auth with the current password). The new
    address is unverified until the emailed link is confirmed."""
    try:
        return user_service.change_email(
            db, current_user, new_email=data.new_email, current_password=data.current_password
        )
    except InvalidPasswordError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        ) from None
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email already has an account",
        ) from None


@router.post("/claim", response_model=UserRead)
def claim_account(
    data: ClaimAccount,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    """Turn the current guest account into a real one (email + password)."""
    try:
        return user_service.claim_account(db, current_user, data.email, data.password)
    except NotAGuestError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account is already a full account.",
        ) from None
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        ) from None


@router.post("/password/reset-request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(settings.login_rate_limit)
def request_password_reset(
    request: Request,  # required by the rate limiter
    data: PasswordResetRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    # Per-email cooldown (on top of the per-IP limiter) so IP rotation can't inbox-bomb
    # one address. Checked before lookup, so it leaks nothing about account existence.
    if send_guard.is_throttled(data.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="A link was just sent. Please wait a moment before trying again.",
        )
    send_guard.record_sent(data.email)
    # Always the same response, sent or not — no account enumeration.
    user_service.request_password_reset(db, data.email)
    return {"detail": "If that email has an account, a reset link is on its way."}


@router.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(data: PasswordResetConfirm, db: Session = Depends(get_db)) -> None:
    try:
        user_service.reset_password(db, data.token, data.new_password)
    except InvalidResetTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired.",
        ) from None


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
def verify_email(data: EmailVerify, db: Session = Depends(get_db)) -> None:
    try:
        user_service.verify_email(db, data.token)
    except InvalidVerificationTokenError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has expired.",
        ) from None


@router.post("/verify-email/resend", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(settings.login_rate_limit)
def resend_verification(
    request: Request,  # required by the rate limiter
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    # Per-email cooldown (on top of the per-IP limiter) so IP rotation can't inbox-bomb
    # the target address.
    if send_guard.is_throttled(current_user.email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="A link was just sent. Please wait a moment before trying again.",
        )
    send_guard.record_sent(current_user.email)
    user_service.send_verification_email(db, current_user)
    return {"detail": "If your email isn't verified yet, a new link is on its way."}


@router.post("/reminders", response_model=UserRead)
def set_reminders(
    data: ReminderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    return reminder_service.update_settings(
        db, current_user, enabled=data.enabled, hour=data.hour
    )


@router.post("/weekly-summary", response_model=UserRead)
def set_weekly_summary(
    data: WeeklySummaryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    return weekly_review_service.update_summary_settings(
        db, current_user, enabled=data.enabled, day=data.day
    )
