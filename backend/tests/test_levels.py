"""XP / level curve (dashboard_service._level_progress)."""

from app.services.dashboard_service import _level_progress


def test_zero_xp_is_level_one():
    assert _level_progress(0) == (1, 0, 20)


def test_level_boundaries():
    assert _level_progress(19) == (1, 19, 20)  # just shy of level 2
    assert _level_progress(20) == (2, 0, 40)  # reaches level 2
    assert _level_progress(60) == (3, 0, 60)  # reaches level 3


def test_mid_level_progress():
    # cumulative for L3 = 60, L4 = 120 → 100 XP is level 3, 40 into it
    assert _level_progress(100) == (3, 40, 60)


def test_levels_are_monotonic():
    last = 0
    for xp in range(0, 1000, 7):
        level = _level_progress(xp)[0]
        assert level >= last
        last = level


def test_stats_endpoint_reports_xp_and_level(client):
    creds = {"email": "xp@example.com", "password": "correct horse"}
    client.post("/api/v1/auth/register", json=creds)
    client.post("/api/v1/auth/login", json=creds)
    # 60 minutes of meditation → 120 XP (2/min)
    client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": 3600,
            "occurred_at": "2026-01-01T08:00:00",
        },
    )
    body = client.get("/api/v1/dashboard/stats").json()
    # 120 practice + 15 (meditate quest for that day) + 0 (current streak is 0 — the
    # session is back in January) = 135 → level 4 (L4=120, L5=200).
    assert body["xp"] == 135
    assert body["level"] == 4
    assert body["xp_for_next_level"] == 80
