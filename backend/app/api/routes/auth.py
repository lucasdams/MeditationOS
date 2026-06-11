"""Authentication routes. Thin handlers: validate, call a service, map errors."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import (
    EmailAlreadyExistsError,
    GoogleAuthError,
    InvalidPasswordError,
    InvalidTimezoneError,
    UsernameTakenError,
)
from app.core.rate_limit import limiter
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.user import (
    GoogleLogin,
    PasswordUpdate,
    ReminderUpdate,
    TimezoneUpdate,
    UserCreate,
    UserLogin,
    UsernameUpdate,
    UserRead,
)
from app.services import reminder_service, user_service

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
def register(data: UserCreate, db: Session = Depends(get_db)) -> UserRead:
    try:
        return user_service.create_user(db, data)
    except EmailAlreadyExistsError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        ) from None


@router.post("/login", response_model=UserRead)
@limiter.limit(settings.login_rate_limit)
def login(
    request: Request,  # required by the rate limiter
    response: Response,
    data: UserLogin,
    db: Session = Depends(get_db),
) -> UserRead:
    user = user_service.authenticate(db, data.email, data.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
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


@router.post("/reminders", response_model=UserRead)
def set_reminders(
    data: ReminderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRead:
    return reminder_service.update_settings(
        db, current_user, enabled=data.enabled, hour=data.hour
    )
