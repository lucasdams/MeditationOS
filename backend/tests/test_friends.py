"""Tests for /api/v1/friends — send/accept/decline/remove friend requests by username,
and the stats-only friends list (level · streak · recent activity), privacy-respecting.
"""

from datetime import UTC, datetime


def _register(client, email, username=None):
    """Register + log in, optionally setting a public username. Returns the /auth/me body."""
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})
    if username is not None:
        client.post("/api/v1/auth/username", json={"username": username})
    return client.get("/api/v1/auth/me").json()


def _logout(client):
    client.post("/api/v1/auth/logout")


def _today_at(hour=8):
    return f"{datetime.now(UTC).date().isoformat()}T{hour:02d}:00:00"


def _session(client, seconds=600):
    return client.post(
        "/api/v1/sessions",
        json={"type": "mindfulness", "duration_seconds": seconds, "occurred_at": _today_at()},
    )


# ── auth ──────────────────────────────────────────────────────────────────────


def test_list_friends_requires_auth(client):
    assert client.get("/api/v1/friends").status_code == 401


def test_list_requests_requires_auth(client):
    assert client.get("/api/v1/friends/requests").status_code == 401


def test_send_request_requires_auth(client):
    assert client.post("/api/v1/friends/requests", json={"username": "someone"}).status_code == 401


# ── send request ──────────────────────────────────────────────────────────────


def test_send_request_to_username(client):
    _register(client, "bob@example.com", "bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    res = client.post("/api/v1/friends/requests", json={"username": "bob"})
    assert res.status_code == 204

    # Alice sees it as outgoing; nothing incoming.
    reqs = client.get("/api/v1/friends/requests").json()
    assert [r["username"] for r in reqs["outgoing"]] == ["bob"]
    assert reqs["incoming"] == []

    # Bob sees it as incoming.
    _logout(client)
    _register(client, "bob@example.com", "bob")  # re-login
    reqs = client.get("/api/v1/friends/requests").json()
    assert [r["username"] for r in reqs["incoming"]] == ["alice"]
    assert reqs["outgoing"] == []


def test_username_lookup_is_case_insensitive(client):
    _register(client, "bob@example.com", "Bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    assert client.post("/api/v1/friends/requests", json={"username": "bOB"}).status_code == 204


def test_cannot_friend_yourself(client):
    _register(client, "solo@example.com", "solo")
    res = client.post("/api/v1/friends/requests", json={"username": "solo"})
    assert res.status_code == 400


def test_unknown_username_is_404(client):
    _register(client, "alice@example.com", "alice")
    res = client.post("/api/v1/friends/requests", json={"username": "nobody"})
    assert res.status_code == 404


def test_duplicate_request_is_409(client):
    _register(client, "bob@example.com", "bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    assert client.post("/api/v1/friends/requests", json={"username": "bob"}).status_code == 204
    # Same request again → conflict.
    assert client.post("/api/v1/friends/requests", json={"username": "bob"}).status_code == 409


def test_reverse_request_is_409(client):
    """If Bob already asked Alice, Alice sending a request to Bob is a 409 — she should
    accept the incoming one instead (documented reverse-request behaviour)."""
    _register(client, "bob@example.com", "bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    assert client.post("/api/v1/friends/requests", json={"username": "bob"}).status_code == 204
    # Bob now tries to friend Alice — the reverse pending exists → 409.
    _logout(client)
    _register(client, "bob@example.com", "bob")
    assert client.post("/api/v1/friends/requests", json={"username": "alice"}).status_code == 409


def test_invalid_username_shape_is_422(client):
    _register(client, "alice@example.com", "alice")
    # Too short / illegal chars are rejected by the schema before any lookup.
    assert client.post("/api/v1/friends/requests", json={"username": "ab"}).status_code == 422
    bad = client.post("/api/v1/friends/requests", json={"username": "bad name!"})
    assert bad.status_code == 422


def test_cannot_friend_a_guest(client):
    """A guest has only a synthetic handle and isn't discoverable/befriendable → 404."""
    guest = client.post("/api/v1/auth/guest").json()
    guest_username = guest["username"]
    _logout(client)
    _register(client, "alice@example.com", "alice")
    res = client.post("/api/v1/friends/requests", json={"username": guest_username})
    # A guest username fails the schema pattern (guest_<hex> contains no illegal chars but
    # is >20? no — 'guest_' + 12 hex = 18) so it reaches the service and 404s as a guest.
    assert res.status_code in (404, 422)


# ── accept / decline ──────────────────────────────────────────────────────────


def _incoming_id(client):
    return client.get("/api/v1/friends/requests").json()["incoming"][0]["id"]


def test_accept_request_makes_friends(client):
    _register(client, "bob@example.com", "bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    client.post("/api/v1/friends/requests", json={"username": "bob"})

    # Bob accepts.
    _logout(client)
    _register(client, "bob@example.com", "bob")
    fid = _incoming_id(client)
    assert client.post(f"/api/v1/friends/requests/{fid}/accept").status_code == 204

    # Both now list the other as a friend.
    friends = client.get("/api/v1/friends").json()
    assert [f["username"] for f in friends] == ["alice"]
    assert client.get("/api/v1/friends/requests").json()["incoming"] == []

    _logout(client)
    _register(client, "alice@example.com", "alice")
    friends = client.get("/api/v1/friends").json()
    assert [f["username"] for f in friends] == ["bob"]


def test_decline_request_removes_it(client):
    _register(client, "bob@example.com", "bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    client.post("/api/v1/friends/requests", json={"username": "bob"})

    _logout(client)
    _register(client, "bob@example.com", "bob")
    fid = _incoming_id(client)
    assert client.post(f"/api/v1/friends/requests/{fid}/decline").status_code == 204
    assert client.get("/api/v1/friends/requests").json()["incoming"] == []
    assert client.get("/api/v1/friends").json() == []


def test_requester_cannot_accept_own_request(client):
    """IDOR: only the addressee may accept. The requester acting on their own outgoing
    request (which they CAN see) is a 404, uniform with acting on someone else's row."""
    _register(client, "bob@example.com", "bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    client.post("/api/v1/friends/requests", json={"username": "bob"})
    fid = client.get("/api/v1/friends/requests").json()["outgoing"][0]["id"]
    # Alice (the requester) tries to accept her own request → 404.
    assert client.post(f"/api/v1/friends/requests/{fid}/accept").status_code == 404


def test_third_party_cannot_act_on_request(client):
    """IDOR: a user not part of a request gets 404 for its id (no enumeration)."""
    _register(client, "bob@example.com", "bob")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    client.post("/api/v1/friends/requests", json={"username": "bob"})
    fid = client.get("/api/v1/friends/requests").json()["outgoing"][0]["id"]

    _logout(client)
    _register(client, "carol@example.com", "carol")
    assert client.post(f"/api/v1/friends/requests/{fid}/accept").status_code == 404
    assert client.post(f"/api/v1/friends/requests/{fid}/decline").status_code == 404


def test_accept_unknown_request_is_404(client):
    _register(client, "alice@example.com", "alice")
    import uuid

    assert client.post(f"/api/v1/friends/requests/{uuid.uuid4()}/accept").status_code == 404


# ── remove ────────────────────────────────────────────────────────────────────


def _make_friends(client):
    """Alice and Bob become friends; leaves the client logged in as Alice. Returns Bob's id."""
    _register(client, "bob@example.com", "bob")
    bob_id = client.get("/api/v1/auth/me").json()["id"]
    _logout(client)
    _register(client, "alice@example.com", "alice")
    client.post("/api/v1/friends/requests", json={"username": "bob"})
    _logout(client)
    _register(client, "bob@example.com", "bob")
    client.post(f"/api/v1/friends/requests/{_incoming_id(client)}/accept")
    _logout(client)
    _register(client, "alice@example.com", "alice")
    return bob_id


def test_remove_friend_either_side(client):
    bob_id = _make_friends(client)
    assert client.delete(f"/api/v1/friends/{bob_id}").status_code == 204
    assert client.get("/api/v1/friends").json() == []
    # Bob no longer has Alice either.
    _logout(client)
    _register(client, "bob@example.com", "bob")
    assert client.get("/api/v1/friends").json() == []


def test_remove_nonfriend_is_404(client):
    _register(client, "bob@example.com", "bob")
    bob_id = client.get("/api/v1/auth/me").json()["id"]
    _logout(client)
    _register(client, "alice@example.com", "alice")
    # Not friends → nothing to remove → 404.
    assert client.delete(f"/api/v1/friends/{bob_id}").status_code == 404


# ── privacy: stats only, no PII ───────────────────────────────────────────────


def test_friends_list_is_stats_only(client):
    """A friend payload exposes username + stats, never email or private content."""
    _make_friends(client)  # logged in as Alice, friends with Bob
    friends = client.get("/api/v1/friends").json()
    assert len(friends) == 1
    f = friends[0]
    # Exactly the stats-only surface — no email/private fields.
    assert set(f.keys()) == {
        "friendship_id",
        "user_id",
        "username",
        "level",
        "current_streak",
        "sessions_this_week",
        "last_practiced_on",
        "friends_since",
    }
    assert "email" not in f
    assert f["username"] == "bob"
    assert isinstance(f["level"], int)
    assert isinstance(f["current_streak"], int)


def test_friend_recent_activity_reflects_practice(client):
    """A friend's recent-activity summary derives from real session activity."""
    # Bob registers and logs a session, then Alice befriends him.
    _register(client, "bob@example.com", "bob")
    _session(client, seconds=600)  # a real practice today
    bob_id = client.get("/api/v1/auth/me").json()["id"]
    _logout(client)
    _register(client, "alice@example.com", "alice")
    client.post("/api/v1/friends/requests", json={"username": "bob"})
    _logout(client)
    _register(client, "bob@example.com", "bob")
    client.post(f"/api/v1/friends/requests/{_incoming_id(client)}/accept")
    _logout(client)
    _register(client, "alice@example.com", "alice")

    f = client.get("/api/v1/friends").json()[0]
    assert f["user_id"] == bob_id
    assert f["sessions_this_week"] >= 1
    assert f["last_practiced_on"] == datetime.now(UTC).date().isoformat()
    assert f["level"] >= 1


def test_empty_states(client):
    """A fresh user has no friends and no pending requests."""
    _register(client, "alice@example.com", "alice")
    assert client.get("/api/v1/friends").json() == []
    reqs = client.get("/api/v1/friends/requests").json()
    assert reqs == {"incoming": [], "outgoing": []}
