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


def test_send_is_noop_without_vapid(db_session):
    user = _user(db_session, "svc2@example.com")
    push_service.subscribe(db_session, user.id, _create())
    # No VAPID keys configured in tests → send is a no-op, returns 0.
    assert push_service.send_to_user(db_session, user.id, "Hi", "Body") == 0


def test_send_with_no_subscriptions_is_zero(db_session):
    assert push_service.send_to_user(db_session, uuid.uuid4(), "Hi", "Body") == 0
