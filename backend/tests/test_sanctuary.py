"""Tests for the Sanctuary routes (Phase 2: the plant-next cultivation loop).

Catalog: tree (grow 60, unlock 0, starter) · flower (grow 30, unlock 0) ·
pond (grow 120, unlock 100). Practice points = minutes practiced, breathing ×3.
A session of N*60 seconds = N points.
"""


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _practice(client, minutes, type="mindfulness"):
    """Log a session worth `minutes` practice points (breathing is ×3 in the service)."""
    return client.post(
        "/api/v1/sessions",
        json={
            "type": type,
            "duration_seconds": minutes * 60,
            "occurred_at": "2026-01-01T08:00:00",
        },
    )


def _scene(client):
    return client.get("/api/v1/sanctuary").json()


def test_requires_auth(client):
    assert client.get("/api/v1/sanctuary").status_code == 401
    assert client.post("/api/v1/sanctuary/plantings", json={"item_key": "tree"}).status_code == 401


def test_fresh_user_is_seeded_with_a_growing_starter(client):
    _auth(client, "seed@example.com")
    scene = _scene(client)
    assert len(scene["plantings"]) == 1
    p = scene["plantings"][0]
    assert p["item_key"] == "tree" and p["position"] == 0
    assert p["stage"] == 0 and p["progress"] == 0.0 and p["complete"] is False
    assert scene["current_position"] == 0  # still growing
    assert scene["next_options"] == []  # can't plant next until it's done


def test_growth_progresses_with_practice(client):
    _auth(client, "grow@example.com")
    _practice(client, 30)  # 30 / 60 of the tree
    p = _scene(client)["plantings"][0]
    assert p["progress"] == 0.5 and p["stage"] == 2 and p["complete"] is False


def test_complete_starter_offers_unlocked_next_options(client):
    _auth(client, "done@example.com")
    _practice(client, 60)  # tree fully grown; 60 points < 100, so pond stays locked
    scene = _scene(client)
    assert scene["plantings"][0]["complete"] is True
    assert scene["current_position"] is None
    keys = {o["item_key"] for o in scene["next_options"]}
    assert keys == {"tree", "flower"}  # pond not yet unlocked


def test_plant_next_appends_and_starts_growing_it(client):
    _auth(client, "plant@example.com")
    _practice(client, 60)  # finish the tree
    res = client.post("/api/v1/sanctuary/plantings", json={"item_key": "flower"})
    assert res.status_code == 201
    scene = res.json()
    assert [p["item_key"] for p in scene["plantings"]] == ["tree", "flower"]
    assert scene["current_position"] == 1  # the flower is now the growing one
    assert scene["next_options"] == []


def test_cannot_plant_while_current_is_growing(client):
    _auth(client, "busy@example.com")  # fresh: tree growing, 0 points
    res = client.post("/api/v1/sanctuary/plantings", json={"item_key": "flower"})
    assert res.status_code == 409


def test_locked_item_is_rejected(client):
    _auth(client, "locked@example.com")
    _practice(client, 60)  # tree done, but only 60 points (< pond's 100)
    res = client.post("/api/v1/sanctuary/plantings", json={"item_key": "pond"})
    assert res.status_code == 409


def test_unlock_pond_after_enough_practice(client):
    _auth(client, "unlock@example.com")
    _practice(client, 100)  # 100 points: tree done (60) + pond unlocked (>=100)
    scene = _scene(client)
    assert "pond" in {o["item_key"] for o in scene["next_options"]}
    assert client.post("/api/v1/sanctuary/plantings", json={"item_key": "pond"}).status_code == 201


def test_unknown_item_is_404(client):
    _auth(client, "unknown@example.com")
    _practice(client, 60)
    res = client.post("/api/v1/sanctuary/plantings", json={"item_key": "castle"})
    assert res.status_code == 404


def test_breathing_counts_triple(client):
    _auth(client, "breath@example.com")
    _practice(client, 20, type="resonance_breathing")  # 20 × 3 = 60 points → tree done
    assert _scene(client)["plantings"][0]["complete"] is True


def test_user_scoped(client):
    _auth(client, "owner@example.com")
    _practice(client, 60)
    _auth(client, "other@example.com")  # different user → own fresh garden
    scene = _scene(client)
    assert len(scene["plantings"]) == 1
    assert scene["plantings"][0]["complete"] is False
