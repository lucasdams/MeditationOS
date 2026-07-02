"""Friends routes. Thin handlers — validate, delegate to friend_service, always scoped
to the authenticated user. A user may only act on their own friendships; ids they're not
part of return 404 (never 403), so ids can't be enumerated. A friend payload is stats-only
(username · level · streak · recent activity), never private content or email.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session as DBSession

from app.api._http import not_found
from app.api.deps import get_current_user, require_verified_email
from app.core.config import settings
from app.core.db import get_db
from app.core.exceptions import (
    FriendSelfError,
    FriendshipExistsError,
    FriendUsernameNotFoundError,
)
from app.core.rate_limit import limiter
from app.models.user import User
from app.schemas.friendship import (
    Friend,
    FriendRequestCreate,
    FriendRequests,
)
from app.services import friend_service

router = APIRouter(
    prefix="/friends",
    tags=["friends"],
    dependencies=[Depends(require_verified_email)],
)

_REQUEST_NOT_FOUND = not_found("Friend request not found")
_FRIEND_NOT_FOUND = not_found("Friend not found")
# A username that doesn't exist (or belongs to a guest) → 404, worded so it can't be used
# to enumerate accounts beyond a plain "no such username".
_USERNAME_NOT_FOUND = not_found("No user with that username.")
_SELF_REQUEST = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="You can't send a friend request to yourself.",
)
_ALREADY_LINKED = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="You're already friends or have a pending request with this user.",
)


@router.get("", response_model=list[Friend])
def list_friends(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Friend]:
    return friend_service.list_friends(db, current_user)


@router.get("/requests", response_model=FriendRequests)
def list_requests(
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FriendRequests:
    return friend_service.list_requests(db, current_user)


@router.post("/requests", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.write_rate_limit)
def send_request(
    request: Request,  # required by the rate limiter
    data: FriendRequestCreate,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    try:
        friend_service.send_request(db, current_user, data.username)
    except FriendSelfError:
        raise _SELF_REQUEST from None
    except FriendUsernameNotFoundError:
        raise _USERNAME_NOT_FOUND from None
    except FriendshipExistsError:
        raise _ALREADY_LINKED from None


@router.post("/requests/{friendship_id}/accept", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.write_rate_limit)
def accept_request(
    request: Request,  # required by the rate limiter
    friendship_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not friend_service.accept_request(db, current_user, friendship_id):
        raise _REQUEST_NOT_FOUND


@router.post("/requests/{friendship_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(settings.write_rate_limit)
def decline_request(
    request: Request,  # required by the rate limiter
    friendship_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not friend_service.decline_request(db, current_user, friendship_id):
        raise _REQUEST_NOT_FOUND


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_friend(
    user_id: uuid.UUID,
    db: DBSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    if not friend_service.remove_friend(db, current_user, user_id):
        raise _FRIEND_NOT_FOUND
