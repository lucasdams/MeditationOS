"""Tests for the Sanctuary spend economy (ADR-0011 + ADR-0012): coins from levelling,
buying items with a variant, and applying mix-and-match customizations.

Coins come from a level computed on earned XP, so a fresh user (level 1) starts with
exactly COINS_PER_LEVEL coins and an empty garden. We read the scene's reported `coins`
as the source of truth and assert relative changes, since exact XP includes daily-quest
bonuses that vary by date.
"""

import uuid

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


def _owned_keys(scene):
    return {o["item_key"] for o in scene["owned"]}


def test_requires_auth(client):
    assert client.get("/api/v1/sanctuary").status_code == 401
    assert client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).status_code == 401
    assert (
        client.post(
            f"/api/v1/sanctuary/items/{uuid.uuid4()}/customize",
            json={"slot": "grown", "option": "grown"},
        ).status_code
        == 401
    )


def test_fresh_user_has_starter_coins_and_empty_garden(client):
    _auth(client, "fresh@example.com")
    scene = _scene(client)
    assert scene["coins"] == COINS_PER_LEVEL  # level 1, nothing earned/spent
    assert scene["level"] == 1
    assert scene["owned"] == []
    # The shop lists every item, with level-locked ones flagged and variants exposed.
    shop = {s["item_key"]: s for s in scene["shop"]}
    assert shop["flower"]["unlocked"] is True
    assert shop["pond"]["unlocked"] is False and "level 4" in shop["pond"]["hint"]
    tree_variants = {v["variant"] for v in shop["tree"]["variants"]}
    assert {"oak", "pine", "cherry", "willow"} <= tree_variants


def test_buy_deducts_coins_and_adds_the_item(client):
    _auth(client, "buy@example.com")
    before = _scene(client)["coins"]
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    assert res.status_code == 201
    scene = res.json()
    assert "flower" in _owned_keys(scene)
    flower = next(o for o in scene["owned"] if o["item_key"] == "flower")
    # No variant chosen → resolves to the default (first) variant.
    assert flower["variant"] == SANCTUARY_CATALOG["flower"].default_variant
    assert flower["customizations"] == {}
    assert scene["coins"] == before - SANCTUARY_CATALOG["flower"].cost


def test_buy_with_a_variant_records_it_and_is_charged(client):
    _auth(client, "variant@example.com")
    _practice(client, 60)  # level up for coins
    before = _scene(client)["coins"]
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree", "variant": "cherry"})
    assert res.status_code == 201
    scene = res.json()
    tree = next(o for o in scene["owned"] if o["item_key"] == "tree")
    assert tree["variant"] == "cherry"
    # cherry has no cost delta in the shipped catalog → charged the base cost.
    delta = SANCTUARY_CATALOG["tree"].variant_cost_delta("cherry")
    assert scene["coins"] == before - (SANCTUARY_CATALOG["tree"].cost + delta)


def test_buy_with_invalid_variant_is_404(client):
    _auth(client, "badvariant@example.com")
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree", "variant": "banana"})
    assert res.status_code == 404


def test_buy_rejects_unexpected_fields(client):
    _auth(client, "extra@example.com")
    res = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "flower", "tier": 3}
    )
    assert res.status_code == 422


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


def _grown_cost(item_key):
    return SANCTUARY_CATALOG[item_key].slot("grown").option("grown").cost


def test_customize_applies_and_deducts_balance(client):
    _auth(client, "customize@example.com")
    _practice(client, 60)  # level up for coins
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree = next(o for o in bought["owned"] if o["item_key"] == "tree")
    assert tree["customizations"] == {}
    # The available slots come back with cost + applied hints.
    grown_slot = next(s for s in tree["available"] if s["slot"] == "grown")
    assert grown_slot["applied"] is None
    coins_before = bought["coins"]

    res = client.post(
        f"/api/v1/sanctuary/items/{tree['id']}/customize",
        json={"slot": "foliage", "option": "blossom"},
    )
    assert res.status_code == 200
    scene = res.json()
    upgraded = next(o for o in scene["owned"] if o["item_key"] == "tree")
    assert upgraded["customizations"] == {"foliage": "blossom"}
    cost = SANCTUARY_CATALOG["tree"].slot("foliage").option("blossom").cost
    assert scene["coins"] == coins_before - cost
    foliage_slot = next(s for s in upgraded["available"] if s["slot"] == "foliage")
    assert foliage_slot["applied"] == "blossom"


def test_customizations_are_independent_slots(client):
    _auth(client, "mixmatch@example.com")
    _practice(client, 200)  # plenty of coins
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "dog", "variant": "corgi"}).json()
    dog = next(o for o in bought["owned"] if o["item_key"] == "dog")
    client.post(
        f"/api/v1/sanctuary/items/{dog['id']}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    res = client.post(
        f"/api/v1/sanctuary/items/{dog['id']}/customize",
        json={"slot": "accessory", "option": "hat"},
    )
    assert res.status_code == 200
    updated = next(o for o in res.json()["owned"] if o["item_key"] == "dog")
    # A dog can be grown AND wear a hat — independent slots.
    assert updated["customizations"] == {"grown": "grown", "accessory": "hat"}
    assert updated["variant"] == "corgi"


def test_customize_invalid_slot_is_404(client):
    _auth(client, "badslot@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = bought["owned"][0]["id"]
    res = client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "rocket", "option": "boost"},
    )
    assert res.status_code == 404


def test_customize_invalid_option_is_404(client):
    _auth(client, "badoption@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = bought["owned"][0]["id"]
    res = client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "foliage", "option": "neon"},
    )
    assert res.status_code == 404


def test_customize_rejects_unexpected_fields(client):
    _auth(client, "extracustom@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = bought["owned"][0]["id"]
    res = client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown", "cost": 0},
    )
    assert res.status_code == 422


def test_customize_when_too_poor_is_409(client):
    _auth(client, "poorcustom@example.com")
    # Buy a flower (25 of 50). 25 left; the grown option costs round(25*1.5)=38.
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    flower_id = bought["owned"][0]["id"]
    res = client.post(
        f"/api/v1/sanctuary/items/{flower_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    assert res.status_code == 409


def test_customize_reapplying_same_option_is_409(client):
    _auth(client, "reapply@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = bought["owned"][0]["id"]
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "foliage", "option": "fruit"},
    )
    again = client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "foliage", "option": "fruit"},
    )
    assert again.status_code == 409


def test_customize_unowned_item_is_404(client):
    _auth(client, "notmine@example.com")
    res = client.post(
        f"/api/v1/sanctuary/items/{uuid.uuid4()}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    assert res.status_code == 404


def test_items_are_user_scoped(client):
    _auth(client, "owner@example.com")
    client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    _auth(client, "other@example.com")  # switch users
    assert _scene(client)["owned"] == []


def test_legacy_row_without_variant_or_customizations_loads(client, db_session):
    """A row created before personalization (no variant, empty customizations) still loads
    and computes coins as the base form — no retroactive spend (ADR-0011 monotonicity)."""
    from sqlalchemy import select

    from app.models.sanctuary import SanctuaryPlanting
    from app.models.user import User

    _auth(client, "legacy@example.com")
    before = _scene(client)["coins"]
    user_id = db_session.execute(
        select(User.id).where(User.email == "legacy@example.com")
    ).scalar_one()
    # Insert a bare row directly (simulating a pre-migration legacy planting: no variant,
    # default empty customizations).
    db_session.add(
        SanctuaryPlanting(user_id=user_id, item_key="flower", position=0, customizations={})
    )
    db_session.commit()

    scene = _scene(client)
    flower = next(o for o in scene["owned"] if o["item_key"] == "flower")
    assert flower["variant"] == SANCTUARY_CATALOG["flower"].default_variant
    assert flower["customizations"] == {}
    # Legacy base form costs exactly the buy price — no extra spend folded in.
    assert scene["coins"] == before - SANCTUARY_CATALOG["flower"].cost
