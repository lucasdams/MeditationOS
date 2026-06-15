"""Tests for the Sanctuary spend economy (ADR-0011): coins from levelling, buying, and
upgrading items through tiers.

Coins come from a level computed on earned XP, so a fresh user (level 1) starts with
exactly COINS_PER_LEVEL coins and an empty garden. We read the scene's reported `coins`
as the source of truth and assert relative changes, since exact XP includes daily-quest
bonuses that vary by date.
"""

from app.services.sanctuary_service import COINS_PER_LEVEL, SANCTUARY_CATALOG


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _practice(client, minutes, *, day="2026-01-01"):
    return client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": minutes * 60,
            "occurred_at": f"{day}T08:00:00",
        },
    )


def _scene(client):
    return client.get("/api/v1/sanctuary").json()


def _owned(scene):
    return {(o["item_key"], o["tier"]) for o in scene["owned"]}


def test_requires_auth(client):
    assert client.get("/api/v1/sanctuary").status_code == 401
    assert client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).status_code == 401


def test_fresh_user_has_starter_coins_and_empty_garden(client):
    _auth(client, "fresh@example.com")
    scene = _scene(client)
    assert scene["coins"] == COINS_PER_LEVEL  # level 1, nothing earned/spent
    assert scene["level"] == 1
    assert scene["owned"] == []
    # The shop lists every item, with level-locked ones flagged.
    shop = {s["item_key"]: s for s in scene["shop"]}
    assert shop["flower"]["unlocked"] is True
    assert shop["pond"]["unlocked"] is False and "level 4" in shop["pond"]["hint"]


def test_buy_deducts_coins_and_adds_the_item(client):
    _auth(client, "buy@example.com")
    before = _scene(client)["coins"]
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    assert res.status_code == 201
    scene = res.json()
    assert ("flower", 0) in _owned(scene)
    assert scene["coins"] == before - SANCTUARY_CATALOG["flower"].cost


def test_buy_rejected_when_too_poor(client):
    _auth(client, "broke@example.com")
    client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})  # 25 of 50 spent
    # Tree (40) now unaffordable (25 left).
    assert client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).status_code == 409


def test_buy_rejected_when_level_locked(client):
    _auth(client, "locked@example.com")
    # Pond needs level 4; a fresh user is level 1.
    assert client.post("/api/v1/sanctuary/buy", json={"item_key": "pond"}).status_code == 409


def test_buy_unknown_item_is_404(client):
    _auth(client, "unknown@example.com")
    assert client.post("/api/v1/sanctuary/buy", json={"item_key": "castle"}).status_code == 404


def test_upgrade_bumps_tier_and_spends_coins(client):
    _auth(client, "upgrade@example.com")
    _practice(client, 60)  # level up for coins
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree = next(o for o in bought["owned"] if o["item_key"] == "tree")
    assert tree["tier"] == 0
    assert tree["next_upgrade_cost"] == SANCTUARY_CATALOG["tree"].upgrade_costs[0]
    coins_before = bought["coins"]

    res = client.post(f"/api/v1/sanctuary/items/{tree['id']}/upgrade")
    assert res.status_code == 200
    scene = res.json()
    upgraded = next(o for o in scene["owned"] if o["item_key"] == "tree")
    assert upgraded["tier"] == 1
    assert scene["coins"] == coins_before - SANCTUARY_CATALOG["tree"].upgrade_costs[0]


def test_upgrade_past_max_tier_is_409(client):
    _auth(client, "maxtier@example.com")
    _practice(client, 200)  # plenty of coins
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = bought["owned"][0]["id"]
    client.post(f"/api/v1/sanctuary/items/{tree_id}/upgrade")  # tier 1
    client.post(f"/api/v1/sanctuary/items/{tree_id}/upgrade")  # tier 2 (max)
    assert client.post(f"/api/v1/sanctuary/items/{tree_id}/upgrade").status_code == 409


def test_upgrade_unowned_item_is_404(client):
    _auth(client, "notmine@example.com")
    import uuid

    assert client.post(f"/api/v1/sanctuary/items/{uuid.uuid4()}/upgrade").status_code == 404


def test_items_are_user_scoped(client):
    _auth(client, "owner@example.com")
    client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    _auth(client, "other@example.com")  # switch users
    assert _scene(client)["owned"] == []
