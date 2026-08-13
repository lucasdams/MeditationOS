"""Tests for Web Push: config, subscribe/upsert/unsubscribe, scoping, and the
provider-optional (no-VAPID) send no-op."""

import uuid

from app.core.config import settings
from app.models.push_subscription import PushSubscription
from app.models.user import User
from app.schemas.push import PushKeys, PushSubscriptionCreate
from app.services import push_service

SUB = {"endpoint": "https://fcm.googleapis.com/abc", "keys": {"p256dh": "key1", "auth": "auth1"}}


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


# --- config + routes --------------------------------------------------------


def test_config_requires_auth(client):
    assert client.get("/api/v1/push/config").status_code == 401


def test_config_unconfigured_by_default(client):
    _auth(client, "pu1@example.com")
    body = client.get("/api/v1/push/config").json()
    assert body["configured"] is False
    assert body["public_key"] == ""


def test_config_reports_configured_with_keys(client, monkeypatch):
    monkeypatch.setattr(settings, "vapid_public_key", "PUBKEY")
    monkeypatch.setattr(settings, "vapid_private_key", "PRIVKEY")
    _auth(client, "pu2@example.com")
    body = client.get("/api/v1/push/config").json()
    assert body["configured"] is True
    assert body["public_key"] == "PUBKEY"


def test_subscribe_and_unsubscribe(client):
    _auth(client, "pu3@example.com")
    assert client.post("/api/v1/push/subscribe", json=SUB).status_code == 204
    res = client.post("/api/v1/push/unsubscribe", json={"endpoint": SUB["endpoint"]})
    assert res.status_code == 204


def test_subscribe_requires_auth(client):
    assert client.post("/api/v1/push/subscribe", json=SUB).status_code == 401


# --- SSRF allowlist (audit fix #4) ------------------------------------------


def test_subscribe_rejects_non_https_endpoint(client):
    _auth(client, "ssrf1@example.com")
    bad = {"endpoint": "http://fcm.googleapis.com/x", "keys": SUB["keys"]}
    assert client.post("/api/v1/push/subscribe", json=bad).status_code == 422


def test_subscribe_rejects_internal_host_endpoint(client):
    _auth(client, "ssrf2@example.com")
    bad = {"endpoint": "https://169.254.169.254/latest/meta-data", "keys": SUB["keys"]}
    assert client.post("/api/v1/push/subscribe", json=bad).status_code == 422


def test_subscribe_accepts_known_push_service(client):
    _auth(client, "ssrf3@example.com")
    ok = {
        "endpoint": "https://updates.push.services.mozilla.com/wpush/v2/abc",
        "keys": SUB["keys"],
    }
    assert client.post("/api/v1/push/subscribe", json=ok).status_code == 204


# --- service ----------------------------------------------------------------


def _user(db_session, email):
    u = User(email=email, password_hash="x")
    db_session.add(u)
    db_session.commit()
    return u


def _create(endpoint="https://fcm.googleapis.com/x"):
    return PushSubscriptionCreate(endpoint=endpoint, keys=PushKeys(p256dh="p", auth="a"))


def test_subscribe_upserts_on_endpoint(db_session):
    user = _user(db_session, "svc1@example.com")
    push_service.subscribe(db_session, user.id, _create())
    push_service.subscribe(db_session, user.id, _create())  # same endpoint again
    count = (
        db_session.query(PushSubscription).filter(PushSubscription.user_id == user.id).count()
    )
    assert count == 1  # upserted, not duplicated


def test_subscribe_recovers_from_insert_race(db_session, monkeypatch):
    """The pre-check sees no row, so subscribe() takes the INSERT path; meanwhile a concurrent
    subscribe inserts the same (user, endpoint) first, so our commit hits the unique
    constraint. The service rolls back and updates that now-existing row (idempotent upsert)
    instead of 500-ing."""
    from sqlalchemy.exc import IntegrityError

    ENDPOINT = "https://fcm.googleapis.com/x"
    user = _user(db_session, "svc-race@example.com")

    real_commit = db_session.commit
    state = {"armed": True}

    def fake_commit(*args, **kwargs):
        # On the first (insert) commit, simulate the concurrent writer winning the race:
        # really commit a colliding row, then raise the unique-violation our commit would hit.
        if state["armed"]:
            state["armed"] = False
            db_session.rollback()  # drop our pending INSERT (as a real uq-violation rollback would)
            db_session.add(
                PushSubscription(
                    user_id=user.id, endpoint=ENDPOINT, p256dh="theirs", auth="theirs"
                )
            )
            real_commit()
            raise IntegrityError("INSERT", {}, Exception("uq user+endpoint"))
        return real_commit(*args, **kwargs)

    monkeypatch.setattr(db_session, "commit", fake_commit)
    refreshed = push_service.subscribe(
        db_session,
        user.id,
        PushSubscriptionCreate(endpoint=ENDPOINT, keys=PushKeys(p256dh="new-p", auth="new-a")),
    )
    # Recovery updated the existing row to our keys, no duplicate, no 500.
    assert refreshed.p256dh == "new-p" and refreshed.auth == "new-a"
    count = (
        db_session.query(PushSubscription).filter(PushSubscription.user_id == user.id).count()
    )
    assert count == 1


def test_subscribe_caps_rows_per_user_evicting_oldest(db_session):
    """The per-user subscription cap: a fresh subscribe over a full set evicts the OLDEST
    rows, so a user can't grow unbounded rows (DB bloat + reminder-cron send amplification).
    Rows are seeded with explicit, distinct created_at stamps (inside a test transaction the
    server-default now() would tie them all)."""
    from datetime import UTC, datetime, timedelta

    user = _user(db_session, "svc-cap@example.com")
    base = datetime(2026, 1, 1, tzinfo=UTC)
    for i in range(push_service.MAX_SUBSCRIPTIONS_PER_USER + 2):
        db_session.add(
            PushSubscription(
                user_id=user.id,
                endpoint=f"https://fcm.googleapis.com/e{i}",
                p256dh="p",
                auth="a",
                created_at=base + timedelta(minutes=i),
            )
        )
    db_session.commit()

    push_service.subscribe(db_session, user.id, _create("https://fcm.googleapis.com/new"))

    rows = (
        db_session.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    )
    assert len(rows) == push_service.MAX_SUBSCRIPTIONS_PER_USER
    endpoints = {r.endpoint for r in rows}
    # The fresh subscription and the newest seeds survived; the three oldest were evicted.
    assert "https://fcm.googleapis.com/new" in endpoints
    assert f"https://fcm.googleapis.com/e{push_service.MAX_SUBSCRIPTIONS_PER_USER + 1}" in endpoints
    for i in range(3):
        assert f"https://fcm.googleapis.com/e{i}" not in endpoints


def test_subscribe_cap_does_not_evict_other_users(db_session):
    """Eviction is scoped to the subscribing user — a busy user can't age out anyone else's rows."""
    a = _user(db_session, "svc-cap-a@example.com")
    b = _user(db_session, "svc-cap-b@example.com")
    push_service.subscribe(db_session, b.id, _create("https://fcm.googleapis.com/b0"))
    for i in range(push_service.MAX_SUBSCRIPTIONS_PER_USER + 2):
        push_service.subscribe(db_session, a.id, _create(f"https://fcm.googleapis.com/a{i}"))
    b_count = (
        db_session.query(PushSubscription).filter(PushSubscription.user_id == b.id).count()
    )
    assert b_count == 1


def test_send_is_noop_without_vapid(db_session):
    user = _user(db_session, "svc2@example.com")
    push_service.subscribe(db_session, user.id, _create())
    # No VAPID keys configured in tests → send is a no-op, returns 0.
    assert push_service.send_to_user(db_session, user.id, "Hi", "Body") == 0


def test_send_with_no_subscriptions_is_zero(db_session):
    assert push_service.send_to_user(db_session, uuid.uuid4(), "Hi", "Body") == 0
