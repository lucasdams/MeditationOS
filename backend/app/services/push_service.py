"""Web Push: store browser subscriptions and send notifications.

Provider-optional, mirroring email/AI: with no VAPID keys configured, subscriptions
still store but sends no-op (return 0). The `pywebpush` dependency is imported lazily
inside the send path, so it's only needed once push is actually configured + used.
"""

import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.models.push_subscription import PushSubscription
from app.schemas.push import PushSubscriptionCreate

logger = logging.getLogger("meditationos.push")


def is_configured() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key)


def subscribe(
    db: DBSession, user_id: uuid.UUID, data: PushSubscriptionCreate
) -> PushSubscription:
    """Store (or refresh) a browser push subscription. Upserts on (user, endpoint)."""
    existing = _find_subscription(db, user_id, data.endpoint)
    if existing is not None:
        existing.p256dh = data.keys.p256dh
        existing.auth = data.keys.auth
        db.commit()
        db.refresh(existing)
        return existing
    sub = PushSubscription(
        user_id=user_id,
        endpoint=data.endpoint,
        p256dh=data.keys.p256dh,
        auth=data.keys.auth,
    )
    db.add(sub)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent subscribe inserted the same (user, endpoint) first. Roll back and
        # update that now-existing row instead of 500-ing — an idempotent upsert.
        db.rollback()
        existing = _find_subscription(db, user_id, data.endpoint)
        if existing is None:  # the racing row vanished between rollback and re-read
            raise
        existing.p256dh = data.keys.p256dh
        existing.auth = data.keys.auth
        db.commit()
        db.refresh(existing)
        return existing
    db.refresh(sub)
    return sub


def _find_subscription(
    db: DBSession, user_id: uuid.UUID, endpoint: str
) -> PushSubscription | None:
    return db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    ).scalar_one_or_none()


def unsubscribe(db: DBSession, user_id: uuid.UUID, endpoint: str) -> bool:
    sub = db.execute(
        select(PushSubscription).where(
            PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint
        )
    ).scalar_one_or_none()
    if sub is None:
        return False
    db.delete(sub)
    db.commit()
    return True


def send_to_user(db: DBSession, user_id: uuid.UUID, title: str, body: str) -> int:
    """Send a push to all of a user's subscriptions. Returns the count sent.

    No-ops (returns 0) when VAPID isn't configured. Dead subscriptions (410/404) are
    pruned. Never raises — push is best-effort, like the email nudge."""
    if not is_configured():
        return 0

    subs = (
        db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
        .scalars()
        .all()
    )
    if not subs:
        return 0

    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush not installed; cannot send push")
        return 0

    payload = json.dumps({"title": title, "body": body})
    vapid_claims = {"sub": settings.vapid_subject}
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=settings.vapid_private_key,
                vapid_claims=dict(vapid_claims),
                timeout=10,
            )
            sent += 1
        except WebPushException as err:
            status = getattr(getattr(err, "response", None), "status_code", None)
            if status in (404, 410):  # gone — prune it
                db.delete(sub)
            else:
                logger.warning("push send failed: %s", err)
        except Exception as err:  # noqa: BLE001
            # Non-WebPush transport errors (e.g. network failures) must not skip the
            # commit below — log and continue so dead-subscription pruning still applies.
            logger.warning("push send unexpected error: %s", err)
    db.commit()
    return sent
