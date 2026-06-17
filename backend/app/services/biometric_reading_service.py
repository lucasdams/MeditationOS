"""Biometric reading business logic and data access. All queries scoped to the
user (see docs/decisions/0006-layered-architecture.md).

A `pre`/`post` pair sharing a `session_id` lets us surface the immediate calming
delta around a sit — averaged over the window, with the sample size, so the UI can
frame it gently and honestly.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.exceptions import LinkedSessionNotFoundError
from app.core.limits import enforce_daily_create_cap
from app.models.biometric_reading import BiometricReading
from app.models.session import Session
from app.schemas.biometric_reading import BiometricDelta, BiometricReadingCreate
from app.services._ownership import delete_owned, get_owned


def _session_owned(db: DBSession, user_id: uuid.UUID, session_id: uuid.UUID) -> bool:
    return (
        db.execute(
            select(Session.id).where(
                Session.id == session_id, Session.user_id == user_id
            )
        ).scalar_one_or_none()
        is not None
    )


def _by_client_token(
    db: DBSession, user_id: uuid.UUID, token: str
) -> BiometricReading | None:
    return db.execute(
        select(BiometricReading).where(
            BiometricReading.user_id == user_id,
            BiometricReading.client_token == token,
        )
    ).scalar_one_or_none()


def create_reading(
    db: DBSession, user_id: uuid.UUID, data: BiometricReadingCreate
) -> BiometricReading:
    # Idempotent on client_token: a rapid double-submit of the same reading collapses
    # to one row, keeping the pre/post delta deterministic instead of order-dependent.
    if data.client_token:
        existing = _by_client_token(db, user_id, data.client_token)
        if existing is not None:
            return existing
    # A reading may link to a sit — but only one the user owns. Treat an unknown or
    # other-user session id as not-found (no enumeration of foreign ids).
    if data.session_id is not None and not _session_owned(db, user_id, data.session_id):
        raise LinkedSessionNotFoundError()
    enforce_daily_create_cap(db, BiometricReading, user_id)
    reading = BiometricReading(user_id=user_id, **data.model_dump())
    db.add(reading)
    try:
        db.commit()
    except IntegrityError:
        # Concurrent save with the same token won the race — return that row.
        db.rollback()
        if data.client_token:
            existing = _by_client_token(db, user_id, data.client_token)
            if existing is not None:
                return existing
        raise
    db.refresh(reading)
    return reading


def list_readings(
    db: DBSession,
    user_id: uuid.UUID,
    *,
    days: int | None = None,
    limit: int = 200,
    offset: int = 0,
) -> list[BiometricReading]:
    """Recent readings, newest first. `days` windows them for the trend view."""
    stmt = select(BiometricReading).where(BiometricReading.user_id == user_id)
    if days is not None:
        cutoff = datetime.now(UTC) - timedelta(days=days)
        stmt = stmt.where(BiometricReading.measured_at >= cutoff)
    stmt = (
        stmt.order_by(BiometricReading.measured_at.desc()).limit(limit).offset(offset)
    )
    return list(db.execute(stmt).scalars().all())


def get_reading(
    db: DBSession, user_id: uuid.UUID, reading_id: uuid.UUID
) -> BiometricReading | None:
    """Fetch one reading owned by the user. None if missing or not theirs."""
    return get_owned(db, BiometricReading, user_id, reading_id)


def link_reading_session(
    db: DBSession,
    user_id: uuid.UUID,
    reading_id: uuid.UUID,
    session_id: uuid.UUID,
) -> BiometricReading | None:
    """Attach a saved reading to a sit (backfilling `session_id`).

    A pre-session reading is captured *before* the sit exists, so it's saved with
    no `session_id` and linked here once the session has been created. Both the
    reading and the target session must belong to the user; an unknown reading is a
    not-found (None) and an unknown/foreign session raises (no enumeration of
    foreign ids). Linking is what lets the pre/post delta pair it with the post
    reading.
    """
    reading = get_owned(db, BiometricReading, user_id, reading_id)
    if reading is None:
        return None
    if not _session_owned(db, user_id, session_id):
        raise LinkedSessionNotFoundError()
    reading.session_id = session_id
    db.commit()
    db.refresh(reading)
    return reading


def delete_reading(db: DBSession, user_id: uuid.UUID, reading_id: uuid.UUID) -> bool:
    """Delete one reading owned by the user. Returns False if it wasn't found."""
    return delete_owned(db, BiometricReading, user_id, reading_id)


def pre_post_delta(
    db: DBSession, user_id: uuid.UUID, *, days: int | None = None
) -> BiometricDelta:
    """Average pre→post change around sits that have BOTH a pre and a post reading.

    For each such session we take (post − pre); the result is the mean across
    sessions, plus the sample size so the UI can be honest about the basis.
    """
    stmt = select(BiometricReading).where(
        BiometricReading.user_id == user_id,
        BiometricReading.session_id.isnot(None),
        BiometricReading.context.in_(("pre", "post")),
    )
    if days is not None:
        cutoff = datetime.now(UTC) - timedelta(days=days)
        stmt = stmt.where(BiometricReading.measured_at >= cutoff)
    rows = list(db.execute(stmt).scalars().all())

    # Group by session, keeping the most recent pre and post for each.
    by_session: dict[uuid.UUID, dict[str, BiometricReading]] = {}
    for r in rows:
        slot = by_session.setdefault(r.session_id, {})
        current = slot.get(r.context)
        if current is None or r.measured_at > current.measured_at:
            slot[r.context] = r

    bpm_deltas: list[float] = []
    hrv_deltas: list[float] = []
    for pair in by_session.values():
        pre, post = pair.get("pre"), pair.get("post")
        if pre is None or post is None:
            continue
        bpm_deltas.append(post.bpm - pre.bpm)
        if pre.hrv_ms is not None and post.hrv_ms is not None:
            hrv_deltas.append(post.hrv_ms - pre.hrv_ms)

    return BiometricDelta(
        sample_size=len(bpm_deltas),
        hrv_sample_size=len(hrv_deltas),
        avg_bpm_delta=(
            round(sum(bpm_deltas) / len(bpm_deltas), 1) if bpm_deltas else None
        ),
        avg_hrv_ms_delta=(
            round(sum(hrv_deltas) / len(hrv_deltas), 1) if hrv_deltas else None
        ),
    )
