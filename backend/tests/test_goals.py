"""Tests for /api/v1/goals — activity + cadence habits with period progress."""

import uuid
from datetime import UTC, datetime


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _today_at(hour=8):
    return f"{datetime.now(UTC).date().isoformat()}T{hour:02d}:00:00"


def _session(client, type="mindfulness"):
    return client.post(
        "/api/v1/sessions",
        json={"type": type, "duration_seconds": 600, "occurred_at": _today_at()},
    )


def _goal(client, activity, period, count, label=None):
    payload = {"activity": activity, "period": period, "count": count}
    if label is not None:
        payload["label"] = label
    return client.post("/api/v1/goals", json=payload)


def test_list_requires_auth(client):
    assert client.get("/api/v1/goals").status_code == 401


def test_create_starts_unmet(client):
    _auth(client, "g1@example.com")
    res = _goal(client, "journal", "day", 1)
    assert res.status_code == 201
    body = res.json()
    assert body["activity"] == "journal"
    assert body["period"] == "day"
    assert body["count"] == 1
    assert body["status"] == "active"
    assert body["done"] == 0 and body["achieved"] is False and body["progress"] == 0.0


def test_invalid_activity_rejected(client):
    _auth(client, "g2@example.com")
    assert _goal(client, "dance", "day", 1).status_code == 422


def test_invalid_period_rejected(client):
    _auth(client, "g3@example.com")
    assert _goal(client, "journal", "fortnight", 1).status_code == 422


def test_nonpositive_count_rejected(client):
    _auth(client, "g4@example.com")
    assert _goal(client, "journal", "day", 0).status_code == 422


def test_journal_once_a_day_met(client):
    _auth(client, "g5@example.com")
    client.post("/api/v1/journals", json={"body": "reflection"})
    _goal(client, "journal", "day", 1)
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["done"] == 1 and goal["achieved"] is True and goal["progress"] == 1.0


def test_gratitude_three_a_week_partial_then_met(client):
    _auth(client, "g6@example.com")
    for _ in range(2):
        client.post("/api/v1/gratitude", json={"category": "people", "text": "thanks"})
    _goal(client, "gratitude", "week", 3)
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["done"] == 2 and goal["achieved"] is False
    client.post("/api/v1/gratitude", json={"category": "people", "text": "more thanks"})
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["done"] == 3 and goal["achieved"] is True


def test_breathe_counts_only_resonance_sessions(client):
    _auth(client, "g7@example.com")
    _session(client, type="mindfulness")  # not breathing
    _session(client, type="resonance_breathing")
    _goal(client, "breathe", "day", 1)
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["done"] == 1 and goal["achieved"] is True  # only the resonance one counts


def test_meditate_counts_any_session(client):
    _auth(client, "g8@example.com")
    _session(client, type="mindfulness")
    _session(client, type="walking")
    _goal(client, "meditate", "day", 2)
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["done"] == 2 and goal["achieved"] is True


def test_list_is_user_scoped(client):
    _auth(client, "mine@example.com")
    _goal(client, "journal", "day", 1)
    _auth(client, "other@example.com")
    assert client.get("/api/v1/goals").json() == []


def test_archive_and_filter(client):
    _auth(client, "g9@example.com")
    gid = _goal(client, "breathe", "week", 5).json()["id"]
    res = client.patch(f"/api/v1/goals/{gid}", json={"status": "archived"})
    assert res.status_code == 200 and res.json()["status"] == "archived"
    assert client.get("/api/v1/goals?status=active").json() == []
    assert len(client.get("/api/v1/goals?status=archived").json()) == 1


def test_update_cadence(client):
    _auth(client, "g10@example.com")
    gid = _goal(client, "journal", "day", 1).json()["id"]
    res = client.patch(f"/api/v1/goals/{gid}", json={"count": 2, "period": "week"})
    assert res.status_code == 200
    assert res.json()["count"] == 2 and res.json()["period"] == "week"


def test_get_and_delete_scoped(client):
    _auth(client, "del@example.com")
    gid = _goal(client, "journal", "day", 1).json()["id"]
    _auth(client, "nope@example.com")
    assert client.get(f"/api/v1/goals/{gid}").status_code == 404
    assert client.delete(f"/api/v1/goals/{gid}").status_code == 404
    _auth(client, "del@example.com")
    assert client.delete(f"/api/v1/goals/{gid}").status_code == 204


# --- Custom-habit goals (manual check-ins) ---


def test_custom_goal_requires_label(client):
    _auth(client, "c1@example.com")
    assert _goal(client, "custom", "day", 1).status_code == 422  # no label


def test_builtin_goal_rejects_label(client):
    _auth(client, "c2@example.com")
    assert _goal(client, "journal", "day", 1, label="Gym").status_code == 422


def test_custom_goal_create_starts_unmet(client):
    _auth(client, "c3@example.com")
    res = _goal(client, "custom", "week", 3, label="Gym")
    assert res.status_code == 201
    body = res.json()
    assert body["activity"] == "custom" and body["label"] == "Gym"
    assert body["done"] == 0 and body["achieved"] is False
    assert body["checked_in_today"] is False


def test_checkin_marks_done_and_is_idempotent(client):
    _auth(client, "c4@example.com")
    gid = _goal(client, "custom", "day", 1, label="Read").json()["id"]

    res = client.post(f"/api/v1/goals/{gid}/checkins")
    assert res.status_code == 200
    body = res.json()
    assert body["done"] == 1 and body["achieved"] is True and body["checked_in_today"] is True

    # Checking in again the same day doesn't double-count.
    again = client.post(f"/api/v1/goals/{gid}/checkins").json()
    assert again["done"] == 1


def test_undo_checkin(client):
    _auth(client, "c5@example.com")
    gid = _goal(client, "custom", "day", 1, label="Walk").json()["id"]
    client.post(f"/api/v1/goals/{gid}/checkins")
    res = client.delete(f"/api/v1/goals/{gid}/checkins/today")
    assert res.status_code == 200
    body = res.json()
    assert body["done"] == 0 and body["checked_in_today"] is False


def test_checkin_on_builtin_goal_rejected(client):
    _auth(client, "c6@example.com")
    gid = _goal(client, "journal", "day", 1).json()["id"]
    assert client.post(f"/api/v1/goals/{gid}/checkins").status_code == 400


def test_checkin_requires_auth(client):
    assert client.post(f"/api/v1/goals/{uuid.uuid4()}/checkins").status_code == 401


def test_total_goal_counts_all_time(client):
    _auth(client, "c9@example.com")
    for _ in range(2):
        client.post("/api/v1/journals", json={"body": "reflection"})
    res = _goal(client, "journal", "total", 3)
    assert res.status_code == 201
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["period"] == "total"
    assert goal["done"] == 2 and goal["achieved"] is False
    client.post("/api/v1/journals", json={"body": "third"})
    goal = client.get("/api/v1/goals").json()[0]
    assert goal["done"] == 3 and goal["achieved"] is True


def test_checkin_other_users_goal_404(client):
    _auth(client, "c7@example.com")
    gid = _goal(client, "custom", "day", 1, label="Gym").json()["id"]
    _auth(client, "c8@example.com")
    assert client.post(f"/api/v1/goals/{gid}/checkins").status_code == 404
    assert client.delete(f"/api/v1/goals/{gid}/checkins/today").status_code == 404
