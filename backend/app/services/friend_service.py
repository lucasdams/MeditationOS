"""Friendship business logic. Send/accept/decline/remove friend requests by username,
and expose an accepted friend's *stats-only* summary (level, current streak, recent
activity) — never their private content or email.

Privacy model
-------------
- You can only act on friendships you're part of; a request id / friend user_id you're
  not party to is a 404 (never 403), so ids can't be enumerated.
- Only the addressee of a pending request may accept or decline it.
- A friend sees your public username plus a derived stat summary. That derivation reuses
  the SAME level/streak core the dashboard uses (`dashboard_service.get_wallet_basis`), so
  a friend's numbers match your own — computed in *their* timezone so their streak/week is
  their local view. No journal/gratitude text, no session detail, no email is ever exposed.
- Guests have only a synthetic `guest_<hex>` username and can't be found by it in practice;
  a guest can still call these endpoints but simply has no real friends to see. Nothing
  crashes.

All queries are scoped to the two users in the relationship.
"""

import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import (
    FriendSelfError,
    FriendshipExistsError,
    FriendUsernameNotFoundError,
)
from app.core.limits import enforce_daily_create_cap
from app.models.friendship import Friendship
from app.models.session import Session as PracticeSession
from app.models.user import User
from app.schemas.friendship import Friend, FriendRequest, FriendRequests
from app.services.dashboard_service import get_wallet_basis
from app.services.time_utils import MIN_PRACTICE_SECONDS, local_date, zone


def _pair(a: uuid.UUID, b: uuid.UUID) -> tuple[uuid.UUID, uuid.UUID]:
    """The two user ids sorted (low, high) — the canonical unordered pair stored in
    `user_low`/`user_high` so a relationship is unique regardless of who requested."""
    return (a, b) if a.bytes < b.bytes else (b, a)


def _get_for_user(
    db: DBSession, user_id: uuid.UUID, friendship_id: uuid.UUID
) -> Friendship | None:
    """Fetch a friendship by id ONLY if `user_id` is one of its two parties. Returns
    None otherwise (missing or not yours) so the route can 404 without leaking ids."""
    stmt = select(Friendship).where(
        Friendship.id == friendship_id,
        or_(
            Friendship.requester_id == user_id,
            Friendship.addressee_id == user_id,
        ),
    )
    return db.execute(stmt).scalar_one_or_none()


def _friend_stats(db: DBSession, friend: User) -> tuple[int, int, int, date | None]:
    """A friend's (level, current_streak, sessions_this_week, last_practiced_on),
    derived on read. Level + streak come from the shared dashboard/wallet core (so they
    match the friend's own dashboard); the two recent-activity figures are counted in the
    friend's local timezone. Nothing private is read — only aggregate session activity."""
    tz = friend.timezone or "UTC"
    today = _today_in(tz)

    basis = get_wallet_basis(db, friend.id, today=today, tz=tz)

    # Sessions in the last 7 local days (a calm "recent activity" figure). Counts every
    # session row — a simple activity signal, not the streak-qualifying day count.
    week_start = today - timedelta(days=6)
    session_day = local_date(tz, PracticeSession.occurred_at)
    sessions_this_week = int(
        db.execute(
            select(func.count(PracticeSession.id)).where(
                PracticeSession.user_id == friend.id,
                session_day >= week_start,
                session_day <= today,
            )
        ).scalar_one()
    )

    # The friend's most recent local practice day that met the practice floor — so a
    # 1-second sit doesn't read as "practiced today". None if they've never practiced.
    last_practiced_on = db.execute(
        select(session_day)
        .where(PracticeSession.user_id == friend.id)
        .group_by(session_day)
        .having(func.sum(PracticeSession.duration_seconds) >= MIN_PRACTICE_SECONDS)
        .order_by(session_day.desc())
        .limit(1)
    ).scalar_one_or_none()

    return basis.level, basis.current_streak, sessions_this_week, last_practiced_on


def _today_in(tz: str) -> date:
    """The current local date in `tz` (UTC fallback for an unknown zone)."""
    return datetime.now(zone(tz)).date()


def _to_friend(db: DBSession, friendship: Friendship, other: User) -> Friend:
    level, streak, week, last = _friend_stats(db, other)
    return Friend(
        friendship_id=friendship.id,
        user_id=other.id,
        username=other.username or "",
        level=level,
        current_streak=streak,
        sessions_this_week=week,
        last_practiced_on=last,
        friends_since=friendship.updated_at,
    )


def send_request(db: DBSession, user: User, username: str) -> None:
    """Send a friend request from `user` to the account with `username`.

    Reverse-request handling: if the target has ALREADY sent *me* a pending request,
    we do NOT auto-accept — we raise FriendshipExistsError (→ 409) and let the caller
    accept the incoming request explicitly (a clearer, less surprising flow, and it
    keeps "accept" the single place a friendship is confirmed).

    Raises:
      FriendSelfError            — can't friend yourself.
      FriendUsernameNotFoundError — no such username (or it's a guest handle).
      FriendshipExistsError      — already friends, or a pending request exists either way.
    """
    # Per-user daily cap (anti-spam) — same DAILY_CREATE_LIMIT the other user-data
    # creators use, keyed on the requester (friendships have no `user_id` column).
    # DailyLimitError → 429 is mapped app-wide (see app/main.py).
    enforce_daily_create_cap(db, Friendship, user.id, owner_column="requester_id")

    target = db.execute(
        select(User).where(User.username == username)
    ).scalar_one_or_none()
    # Case-insensitive (citext) lookup. A guest's synthetic `guest_<hex>` handle is a
    # valid username row, but guests aren't meant to be befriended — and their handle
    # isn't discoverable — so treat a guest target as not-found rather than special-casing.
    if target is None or target.is_guest:
        raise FriendUsernameNotFoundError(username)
    if target.id == user.id:
        raise FriendSelfError()

    low, high = _pair(user.id, target.id)
    existing = db.execute(
        select(Friendship).where(
            Friendship.user_low == low, Friendship.user_high == high
        )
    ).scalar_one_or_none()
    if existing is not None:
        # Already friends, my own pending request, or their pending request to me —
        # all 409. (The reverse-pending case is theirs to accept, not mine to re-send.)
        raise FriendshipExistsError()

    friendship = Friendship(
        requester_id=user.id,
        addressee_id=target.id,
        user_low=low,
        user_high=high,
        status="pending",
    )
    db.add(friendship)
    try:
        db.commit()
    except IntegrityError:
        # Lost a race to the unique-pair constraint (a near-simultaneous request the
        # other way, or a double-submit). Idempotent: surface it as "already exists".
        db.rollback()
        raise FriendshipExistsError() from None


def accept_request(db: DBSession, user: User, friendship_id: uuid.UUID) -> bool:
    """Accept a pending request. Only the ADDRESSEE may accept. Returns False if the
    request doesn't exist, isn't the user's to accept, or isn't pending (so the route
    404s uniformly — no leaking whether an id exists for someone else)."""
    friendship = _get_for_user(db, user.id, friendship_id)
    if (
        friendship is None
        or friendship.status != "pending"
        or friendship.addressee_id != user.id
    ):
        return False
    friendship.status = "accepted"
    db.commit()
    return True


def decline_request(db: DBSession, user: User, friendship_id: uuid.UUID) -> bool:
    """Decline (delete) a pending request. Only the ADDRESSEE may decline. Returns False
    if it doesn't exist / isn't the user's to decline / isn't pending."""
    friendship = _get_for_user(db, user.id, friendship_id)
    if (
        friendship is None
        or friendship.status != "pending"
        or friendship.addressee_id != user.id
    ):
        return False
    db.delete(friendship)
    db.commit()
    return True


def remove_friend(db: DBSession, user: User, other_user_id: uuid.UUID) -> bool:
    """Remove an accepted friend (either party may). Identified by the friend's user id
    (not the friendship id) — the UI holds the friend's id. Returns False if there's no
    accepted friendship between the two."""
    low, high = _pair(user.id, other_user_id)
    friendship = db.execute(
        select(Friendship).where(
            Friendship.user_low == low,
            Friendship.user_high == high,
            Friendship.status == "accepted",
        )
    ).scalar_one_or_none()
    if friendship is None:
        return False
    db.delete(friendship)
    db.commit()
    return True


def list_friends(db: DBSession, user: User) -> list[Friend]:
    """My accepted friends, each with their stats-only summary (plus the friendship id
    and when it formed, for the UI's remove action). Ordered by username so the list is
    stable and non-competitive — deliberately NOT ranked by streak/level."""
    rows = db.execute(
        select(Friendship, User)
        .join(
            User,
            or_(
                # The friend is whichever party ISN'T me.
                (User.id == Friendship.requester_id)
                & (Friendship.addressee_id == user.id),
                (User.id == Friendship.addressee_id)
                & (Friendship.requester_id == user.id),
            ),
        )
        .where(
            Friendship.status == "accepted",
            or_(
                Friendship.requester_id == user.id,
                Friendship.addressee_id == user.id,
            ),
        )
        .order_by(User.username)
    ).all()
    return [_to_friend(db, f, u) for f, u in rows]


def list_requests(db: DBSession, user: User) -> FriendRequests:
    """My pending requests, split into incoming (I'm the addressee → I can act) and
    outgoing (I'm the requester → awaiting them). Each carries the other party's public
    username only (no stats until accepted)."""
    incoming_rows = db.execute(
        select(Friendship, User)
        .join(User, User.id == Friendship.requester_id)
        .where(Friendship.addressee_id == user.id, Friendship.status == "pending")
        .order_by(Friendship.created_at.desc())
    ).all()
    outgoing_rows = db.execute(
        select(Friendship, User)
        .join(User, User.id == Friendship.addressee_id)
        .where(Friendship.requester_id == user.id, Friendship.status == "pending")
        .order_by(Friendship.created_at.desc())
    ).all()

    def _req(f: Friendship, other: User) -> FriendRequest:
        return FriendRequest(id=f.id, username=other.username or "", created_at=f.created_at)

    return FriendRequests(
        incoming=[_req(f, u) for f, u in incoming_rows],
        outgoing=[_req(f, u) for f, u in outgoing_rows],
    )
