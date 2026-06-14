"""Tests for the Sanctuary routes (the plant-next loop with tracks, unlocks, vitality).

Catalog (grow cost · unlock):
  nature      — tree (60, starter) · flower (30) · pond (120, ≥100 pts)
  structures  — hut (90, ≥60 pts) · cottage (110, ≥120 pts) · barn (150, ≥150 pts) ·
                car (160, ≥200 pts) · beach_house (180, ≥250 pts) · boat (220, ≥350 pts)
  companions  — goldfish (35, ≥30 pts) · bird (40, ≥50 pts) · cat (60, ≥80 pts) ·
                snake (70, ≥120 pts) · fox (80, ≥3-day streak) · dog (100, ≥7-day streak)
Practice points = minutes, breathing ×3. A session of N*60s on a far-past day adds N
points with no current streak; sessions on recent consecutive days build the streak.
"""

from datetime import UTC, datetime, timedelta


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _practice(client, minutes, *, day="2026-01-01", type="mindfulness"):
    return client.post(
        "/api/v1/sessions",
        json={
            "type": type,
            "duration_seconds": minutes * 60,
            "occurred_at": f"{day}T08:00:00",
        },
    )


def _streak(client, n, minutes=25):
    """Practice on the last `n` consecutive days (today back), building a streak of n."""
    today = datetime.now(UTC).date()
    for i in range(n):
        _practice(client, minutes, day=(today - timedelta(days=i)).isoformat())


def _scene(client):
    return client.get("/api/v1/sanctuary").json()


def _unlocked(scene):
    return {o["item_key"] for o in scene["next_options"] if o["unlocked"]}


def _all_options(scene):
    return {o["item_key"] for o in scene["next_options"]}


def test_requires_auth(client):
    assert client.get("/api/v1/sanctuary").status_code == 401
    assert client.post("/api/v1/sanctuary/plantings", json={"item_key": "tree"}).status_code == 401


def test_fresh_user_is_seeded_and_dormant(client):
    _auth(client, "seed@example.com")
    scene = _scene(client)
    assert [p["item_key"] for p in scene["plantings"]] == ["tree"]
    assert scene["current_position"] == 0 and scene["next_options"] == []
    assert scene["current_streak"] == 0 and scene["vitality"] == "dormant"


def test_growth_progresses_with_practice(client):
    _auth(client, "grow@example.com")
    _practice(client, 30)
    p = _scene(client)["plantings"][0]
    assert p["progress"] == 0.5 and p["stage"] == 2 and p["complete"] is False


def test_complete_lists_all_options_with_unlock_state(client):
    _auth(client, "options@example.com")
    _practice(client, 60)  # tree done; 60 points, no streak
    scene = _scene(client)
    assert scene["current_position"] is None
    assert _all_options(scene) == {
        "tree", "flower", "pond",
        "hut", "cottage", "barn", "car", "beach_house", "boat",
        "goldfish", "bird", "cat", "snake", "fox", "dog",
    }
    # At 60 pts, no streak: only items needing ≤60 pts and no streak are offered.
    assert _unlocked(scene) == {"tree", "flower", "goldfish", "hut", "bird"}
    pond = next(o for o in scene["next_options"] if o["item_key"] == "pond")
    assert pond["unlocked"] is False and "100 practice points" in pond["hint"]
    fox = next(o for o in scene["next_options"] if o["item_key"] == "fox")
    assert "3-day streak" in fox["hint"]


def test_plant_unlocked_item(client):
    _auth(client, "plant@example.com")
    _practice(client, 60)
    res = client.post("/api/v1/sanctuary/plantings", json={"item_key": "hut"})
    assert res.status_code == 201
    assert [p["item_key"] for p in res.json()["plantings"]] == ["tree", "hut"]
    assert res.json()["current_position"] == 1


def test_locked_by_points_is_rejected(client):
    _auth(client, "lockpts@example.com")
    _practice(client, 60)  # < pond's 100
    assert client.post("/api/v1/sanctuary/plantings", json={"item_key": "pond"}).status_code == 409


def test_locked_by_streak_is_rejected(client):
    _auth(client, "lockstreak@example.com")
    _practice(client, 60)  # tree done but no streak → fox locked
    assert client.post("/api/v1/sanctuary/plantings", json={"item_key": "fox"}).status_code == 409


def test_streak_unlocks_fox_and_thriving_vitality(client):
    _auth(client, "streak@example.com")
    _streak(client, 3, minutes=25)  # 75 pts (tree done) + a 3-day streak
    scene = _scene(client)
    assert scene["current_streak"] == 3 and scene["vitality"] == "thriving"
    assert "fox" in _unlocked(scene)
    assert client.post("/api/v1/sanctuary/plantings", json={"item_key": "fox"}).status_code == 201


def test_long_streak_is_flourishing(client):
    _auth(client, "flourish@example.com")
    _streak(client, 7, minutes=10)  # 70 pts, 7-day streak
    assert _scene(client)["vitality"] == "flourishing"


def test_cannot_plant_while_growing(client):
    _auth(client, "busy@example.com")  # fresh: tree growing
    res = client.post("/api/v1/sanctuary/plantings", json={"item_key": "flower"})
    assert res.status_code == 409


def test_unknown_item_is_404(client):
    _auth(client, "unknown@example.com")
    _practice(client, 60)
    res = client.post("/api/v1/sanctuary/plantings", json={"item_key": "castle"})
    assert res.status_code == 404


def test_breathing_counts_triple(client):
    _auth(client, "breath@example.com")
    _practice(client, 20, type="resonance_breathing")  # 20 × 3 = 60 → tree done
    assert _scene(client)["plantings"][0]["complete"] is True


def test_user_scoped(client):
    _auth(client, "owner@example.com")
    _practice(client, 60)
    _auth(client, "other@example.com")  # different user → own fresh garden
    scene = _scene(client)
    assert len(scene["plantings"]) == 1 and scene["plantings"][0]["complete"] is False
