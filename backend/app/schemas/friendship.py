"""Friendship request/response schemas.

Privacy: a friend is only ever exposed as their public username plus a small,
derived stat summary (level, current streak, recent-activity line). No email, no
journal/gratitude content, no session detail — see friend_service._to_friend.
"""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class FriendRequestCreate(BaseModel):
    """Send a friend request to the user with this public username."""

    model_config = ConfigDict(extra="forbid")

    # Same shape as the username the account was set with (see UsernameUpdate): 3–20
    # chars, letters/digits/underscore. Lookup is case-insensitive (citext).
    username: str = Field(min_length=3, max_length=20, pattern=r"^[a-zA-Z0-9_]+$")


class FriendStats(BaseModel):
    """The stats-only view of a friend — everything a friend is allowed to see.
    Derived on read from the same activity the dashboard uses; nothing private."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    username: str
    level: int
    current_streak: int  # current consecutive-day practice streak
    # A small, calm recent-activity summary — never content, just counts/dates.
    sessions_this_week: int  # practice sessions in the last 7 local days
    last_practiced_on: date | None  # local date of their most recent practice, or None


class Friend(FriendStats):
    """An accepted friend: their stat summary plus when the friendship was formed."""

    friendship_id: uuid.UUID
    friends_since: datetime


class FriendRequest(BaseModel):
    """A pending friend request, incoming or outgoing. Carries only the other party's
    public username (plus the request id + timestamp) — no stats until accepted."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str  # the other party's public username
    created_at: datetime


class FriendRequests(BaseModel):
    """My pending requests, split by direction."""

    incoming: list[FriendRequest]  # others asked to friend me — I can accept/decline
    outgoing: list[FriendRequest]  # I asked to friend them — awaiting their reply
