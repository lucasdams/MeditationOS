"""Tests for the Sanctuary spend economy (ADR-0011 + ADR-0012): coins from levelling,
buying items with a variant, and applying mix-and-match customizations.

Coins come from a level computed on earned XP, so a fresh user (level 1) starts with
exactly COINS_PER_LEVEL coins and an empty garden. We read the scene's reported `coins`
as the source of truth and assert relative changes, since exact XP includes daily-quest
bonuses that vary by date.
"""

import uuid

from app.services.sanctuary_service import (
    COINS_PER_LEVEL,
    SANCTUARY_CATALOG,
    progressive_surcharge,
)


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


# Non-consecutive January days, so earning lots of coins never accrues a streak
# (streak-bonus XP is excluded from the earned XP that funds coins) and never
# depends on the current date (avoids daily-quest date coupling).
_EARN_DAYS = [
    "2026-01-01", "2026-01-05", "2026-01-09", "2026-01-13", "2026-01-17",
    "2026-01-21", "2026-01-25", "2026-01-29", "2026-02-02", "2026-02-06",
]


def _earn_coins(client, sessions):
    """Earn coins the front-loaded-curve way: many short, full-rate sits on separate days.

    The XP curve front-loads each session (the first 20 min pay full rate), so several
    20-minute sits across different days earn far more than one long sit. Returns the
    scene's reported coin balance.
    """
    for day in _EARN_DAYS[:sessions]:
        _practice(client, 20, day=day)
    return _scene(client)["coins"]


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
    # A fresh user (level 1) has COINS_PER_LEVEL coins. Buy cheap items until the balance
    # can no longer cover the next surcharged purchase, then assert the next buy is 409.
    flower = SANCTUARY_CATALOG["flower"].cost  # cheapest item
    n = 0
    while True:
        next_price = flower + progressive_surcharge(n)
        if _scene(client)["coins"] < next_price:
            break
        res = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
        assert res.status_code == 201
        n += 1
    assert n >= 1  # at least one purchase was affordable to start
    # The next flower (with its progressive surcharge) is now unaffordable.
    assert client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).status_code == 409


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
    # Dog unlocks at level 6 and corgi + grown + hat cost 90 + 135 + 40 = 265; earn well
    # past that with short sits across separate days (front-loaded curve, no streak bonus).
    _earn_coins(client, 8)
    bought = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "dog", "variant": "corgi"}
    ).json()
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
    grown_cost = SANCTUARY_CATALOG["flower"].slot("grown").option("grown").cost
    # The first flower is our (never-grown) target; growing it should later be rejected.
    target_id = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()[
        "owned"
    ][0]["id"]
    # Drain the wallet below the grown option's cost by buying + growing *other* flowers; the
    # rising progressive surcharge guarantees the balance falls under grown_cost eventually.
    while _scene(client)["coins"] >= grown_cost:
        bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
        if bought.status_code == 409:
            break  # too poor even to buy the cheapest item
        other_id = bought.json()["owned"][-1]["id"]
        if _scene(client)["coins"] >= grown_cost:
            client.post(
                f"/api/v1/sanctuary/items/{other_id}/customize",
                json={"slot": "grown", "option": "grown"},
            )
    assert _scene(client)["coins"] < grown_cost
    # Growing the still-base target flower is now unaffordable.
    res = client.post(
        f"/api/v1/sanctuary/items/{target_id}/customize",
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
    # Legacy base form costs exactly the buy price — no extra spend folded in. (Position 0
    # carries no progressive surcharge, so a single legacy row is unaffected by ADR-0013.)
    assert scene["coins"] == before - SANCTUARY_CATALOG["flower"].cost


# --- Progressive pricing (ADR-0013) -----------------------------------------------------


def test_each_additional_item_costs_more(client):
    """The k-th item a user buys carries a progressive surcharge round(STEP*position): the
    first item has none, and each later identical item costs strictly more than the last."""
    _auth(client, "progressive@example.com")
    _practice(client, 200)  # plenty of coins so affordability never interferes
    flower_cost = SANCTUARY_CATALOG["flower"].cost

    prev_balance = _scene(client)["coins"]
    last_charge = None
    for k in range(4):
        after = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
        charge = prev_balance - after["coins"]
        assert charge == flower_cost + progressive_surcharge(k)
        if last_charge is not None:
            assert charge > last_charge  # each additional item costs strictly more
        last_charge, prev_balance = charge, after["coins"]


def test_buy_rejected_when_surcharge_exceeds_balance(client):
    """The affordability check uses the surcharged cost: an item whose base price is
    affordable but whose base + surcharge is not must be rejected with 409."""
    _auth(client, "surcharge409@example.com")
    flower_cost = SANCTUARY_CATALOG["flower"].cost
    # Buy flowers until the next one's *base* price still fits but base + surcharge does not.
    while True:
        coins = _scene(client)["coins"]
        n = len(_scene(client)["owned"])
        surcharged = flower_cost + progressive_surcharge(n)
        if flower_cost <= coins < surcharged:
            break  # base affordable, surcharged not — the case we want to assert
        if coins < flower_cost:
            # Practice a little to top up so we can reach the target window deterministically.
            _practice(client, 60, day="2026-02-01")
            continue
        assert client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).status_code == 201
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    assert res.status_code == 409


def test_shop_cost_includes_next_progressive_surcharge(client):
    """The shop's displayed `cost` is what `buy()` will actually charge: base + the next
    item's progressive surcharge. Empty garden → bare base; after buying N items the listed
    cost rises by the surcharge for ordinal N, so the client's affordability gate and the
    buy charge stay in lock-step (ADR-0013)."""
    _auth(client, "shopcost@example.com")
    _practice(client, 200)  # plenty of coins so items stay unlocked/affordable

    # Empty garden: the next ordinal is 0, which carries no surcharge — bare base cost.
    shop = {s["item_key"]: s for s in _scene(client)["shop"]}
    assert shop["flower"]["cost"] == SANCTUARY_CATALOG["flower"].cost

    # After N purchases, the next ordinal is N: every shop item shows base + surcharge(N).
    n = 3
    for _ in range(n):
        client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    shop = {s["item_key"]: s for s in _scene(client)["shop"]}
    surcharge = progressive_surcharge(n)
    assert surcharge > 0  # guard: a non-empty garden actually surcharges
    assert shop["flower"]["cost"] == SANCTUARY_CATALOG["flower"].cost + surcharge
    assert shop["tree"]["cost"] == SANCTUARY_CATALOG["tree"].cost + surcharge

    # The displayed cost equals the real charge: balance drops by exactly shop cost on buy.
    before = _scene(client)["coins"]
    listed = {s["item_key"]: s for s in _scene(client)["shop"]}["flower"]["cost"]
    after = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()["coins"]
    assert before - after == listed


def test_small_garden_spend_not_above_flat_pricing(client):
    """A small/typical garden's *spend* under the new (cheaper base + surcharge) economy must
    not exceed its spend under the old flat pricing for a representative item — so nobody
    typical is punished even before counting the higher COINS_PER_LEVEL (ADR-0013).

    Old flat economy (pre-tuning): tree base=40, no surcharge.
    """
    _auth(client, "notpunished@example.com")
    _practice(client, 300)  # enough coins for several items
    OLD_TREE = 40  # pre-ADR-0013 flat buy cost; new base is cheaper (offsets early surcharge)

    before = _scene(client)["coins"]
    for k in range(3):  # a small, typical 3-item garden
        client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"})
        new_spent = before - _scene(client)["coins"]
        old_spent = OLD_TREE * (k + 1)
        assert new_spent <= old_spent  # new spend never exceeds the old flat spend


def test_small_garden_balance_not_reduced_vs_old_economy(client):
    """At a fixed level, a small existing garden's *balance* under the new economy is at
    least its balance under the old economy (old COINS_PER_LEVEL=50, old flower base=25,
    no surcharge) — the cheaper base + higher COINS_PER_LEVEL more than offset the early
    surcharge for 1–4 items (ADR-0013)."""
    _auth(client, "balanceok@example.com")
    _practice(client, 300)
    scene = _scene(client)
    level = scene["level"]
    OLD_CPL, OLD_FLOWER = 50, 25

    before = scene["coins"]
    for k in range(4):  # 1..4-item garden
        client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
        new_balance = _scene(client)["coins"]
        old_balance = max(0, level * OLD_CPL - OLD_FLOWER * (k + 1))
        assert new_balance >= old_balance, f"k={k}: {new_balance} < {old_balance}"
    assert before > 0
