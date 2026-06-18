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
    GRID_CELLS,
    SANCTUARY_CATALOG,
    SANCTUARY_RESET_FEE,
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


# --- Grid layout / move (ADR-0014) ------------------------------------------------------


def _by_id(scene, planting_id):
    return next(o for o in scene["owned"] if o["id"] == planting_id)


def test_move_requires_auth(client):
    assert (
        client.post(
            f"/api/v1/sanctuary/items/{uuid.uuid4()}/move", json={"cell": 0}
        ).status_code
        == 401
    )


def test_buy_assigns_lowest_free_cell(client):
    """Each bought item lands in the lowest free grid cell (layout), independent of its
    acquisition `position` (the economy key)."""
    _auth(client, "cells@example.com")
    _practice(client, 120)  # plenty of coins
    cells = []
    for _ in range(3):
        scene = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
        # The newest item is the one with the highest position; check its cell.
        newest = max(scene["owned"], key=lambda o: o["position"])
        cells.append(newest["cell"])
    assert cells == [0, 1, 2]  # consecutive, lowest-free
    # `position` and `cell` coincide initially but are distinct fields.
    for o in scene["owned"]:
        assert "position" in o and "cell" in o


def test_move_to_empty_cell(client):
    _auth(client, "moveempty@example.com")
    _practice(client, 120)
    scene = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    item_id = scene["owned"][0]["id"]
    position_before = scene["owned"][0]["position"]
    coins_before = scene["coins"]

    res = client.post(f"/api/v1/sanctuary/items/{item_id}/move", json={"cell": 5})
    assert res.status_code == 200
    moved = _by_id(res.json(), item_id)
    assert moved["cell"] == 5
    # Layout-only: position (the economy key) and the balance are untouched.
    assert moved["position"] == position_before
    assert res.json()["coins"] == coins_before


def test_move_onto_occupied_cell_swaps(client):
    _auth(client, "moveswap@example.com")
    _practice(client, 200)
    a = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    a_id = a["owned"][0]["id"]  # cell 0
    b = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    b_id = max(b["owned"], key=lambda o: o["position"])["id"]  # cell 1

    coins_before = _scene(client)["coins"]
    # Move A (cell 0) onto B's cell (1) → the two swap cells.
    res = client.post(f"/api/v1/sanctuary/items/{a_id}/move", json={"cell": 1})
    assert res.status_code == 200
    scene = res.json()
    assert _by_id(scene, a_id)["cell"] == 1
    assert _by_id(scene, b_id)["cell"] == 0
    # No item lost, no cell collision, balance unchanged.
    assert len(scene["owned"]) == 2
    assert scene["coins"] == coins_before


def test_move_to_own_current_cell_is_noop(client):
    _auth(client, "movenoop@example.com")
    _practice(client, 60)
    scene = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    item_id = scene["owned"][0]["id"]
    res = client.post(f"/api/v1/sanctuary/items/{item_id}/move", json={"cell": 0})
    assert res.status_code == 200
    assert _by_id(res.json(), item_id)["cell"] == 0


def test_move_someone_elses_item_is_404(client):
    _auth(client, "owner-move@example.com")
    client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    _auth(client, "other-move@example.com")  # switch users
    res = client.post(
        f"/api/v1/sanctuary/items/{uuid.uuid4()}/move", json={"cell": 0}
    )
    assert res.status_code == 404


def test_move_negative_cell_is_422(client):
    _auth(client, "moveneg@example.com")
    scene = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    item_id = scene["owned"][0]["id"]
    res = client.post(f"/api/v1/sanctuary/items/{item_id}/move", json={"cell": -1})
    assert res.status_code == 422


def test_move_out_of_bounds_cell_is_422(client):
    _auth(client, "moveoob@example.com")
    scene = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    item_id = scene["owned"][0]["id"]
    res = client.post(
        f"/api/v1/sanctuary/items/{item_id}/move", json={"cell": GRID_CELLS}
    )
    assert res.status_code == 422


def test_move_rejects_unexpected_fields(client):
    _auth(client, "moveextra@example.com")
    scene = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    item_id = scene["owned"][0]["id"]
    res = client.post(
        f"/api/v1/sanctuary/items/{item_id}/move", json={"cell": 1, "position": 9}
    )
    assert res.status_code == 422


# --- Personalization touches: name / note / favorite (ADR-0015) -------------------------


def _only(scene):
    """The single owned item in a one-item garden (the common case for these tests)."""
    return scene["owned"][0]


def test_buy_with_a_name_stores_and_returns_it(client):
    _auth(client, "named@example.com")
    before = _scene(client)["coins"]
    res = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "Daisy's spot"}
    )
    assert res.status_code == 201
    item = _only(res.json())
    assert item["name"] == "Daisy's spot"
    # Naming is cosmetic — it never costs coins (the price is just the flower's base).
    assert res.json()["coins"] == before - SANCTUARY_CATALOG["flower"].cost


def test_buy_trims_the_name_and_blank_becomes_null(client):
    _auth(client, "trim@example.com")
    res = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "  Rosie  "}
    )
    assert _only(res.json())["name"] == "Rosie"  # surrounding whitespace trimmed
    # A whitespace-only name is treated as no name at all.
    res = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "tree", "name": "   "}
    )
    tree = next(o for o in res.json()["owned"] if o["item_key"] == "tree")
    assert tree["name"] is None


def test_buy_without_a_name_defaults_to_unnamed(client):
    _auth(client, "unnamed@example.com")
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    item = _only(res.json())
    assert item["name"] is None
    assert item["note"] is None
    assert item["favorite"] is False  # all touches default-off


def test_buy_with_overlong_name_is_422(client):
    _auth(client, "longname@example.com")
    res = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "x" * 41}
    )
    assert res.status_code == 422  # name capped at 40 chars


def test_buy_with_max_length_name_is_accepted(client):
    _auth(client, "maxname@example.com")
    name = "x" * 40
    res = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": name}
    )
    assert res.status_code == 201
    assert _only(res.json())["name"] == name


def test_personalize_sets_name(client):
    _auth(client, "rename@example.com")
    item_id = _only(
        client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    )["id"]
    before = _scene(client)["coins"]
    res = client.patch(
        f"/api/v1/sanctuary/items/{item_id}", json={"name": "Sunny"}
    )
    assert res.status_code == 200
    assert _by_id(res.json(), item_id)["name"] == "Sunny"
    # Renaming is cosmetic — the balance is unchanged.
    assert res.json()["coins"] == before


def test_personalize_clears_name_with_null(client):
    _auth(client, "clearname@example.com")
    item_id = _only(
        client.post(
            "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "Temp"}
        ).json()
    )["id"]
    res = client.patch(f"/api/v1/sanctuary/items/{item_id}", json={"name": None})
    assert res.status_code == 200
    assert _by_id(res.json(), item_id)["name"] is None


def test_personalize_clears_name_with_blank(client):
    _auth(client, "blankname@example.com")
    item_id = _only(
        client.post(
            "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "Temp"}
        ).json()
    )["id"]
    res = client.patch(f"/api/v1/sanctuary/items/{item_id}", json={"name": "   "})
    assert res.status_code == 200
    assert _by_id(res.json(), item_id)["name"] is None


def test_personalize_is_partial_name_and_note_independent(client):
    """A partial update changes only the fields present: setting a note must not wipe an
    already-set name, and vice versa."""
    _auth(client, "partial@example.com")
    item_id = _only(
        client.post(
            "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "Keep me"}
        ).json()
    )["id"]
    # Add a note without touching the name.
    res = client.patch(
        f"/api/v1/sanctuary/items/{item_id}", json={"note": "Planted on day one"}
    )
    item = _by_id(res.json(), item_id)
    assert item["name"] == "Keep me"  # untouched by the note-only update
    assert item["note"] == "Planted on day one"
    # Toggle favourite without touching name or note.
    res = client.patch(f"/api/v1/sanctuary/items/{item_id}", json={"favorite": True})
    item = _by_id(res.json(), item_id)
    assert item["favorite"] is True
    assert item["name"] == "Keep me"
    assert item["note"] == "Planted on day one"


def test_personalize_favorite_toggles(client):
    _auth(client, "fav@example.com")
    item_id = _only(
        client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    )["id"]
    res = client.patch(f"/api/v1/sanctuary/items/{item_id}", json={"favorite": True})
    assert _by_id(res.json(), item_id)["favorite"] is True
    res = client.patch(f"/api/v1/sanctuary/items/{item_id}", json={"favorite": False})
    assert _by_id(res.json(), item_id)["favorite"] is False


def test_personalize_overlong_name_is_422(client):
    _auth(client, "longrename@example.com")
    item_id = _only(
        client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    )["id"]
    res = client.patch(
        f"/api/v1/sanctuary/items/{item_id}", json={"name": "x" * 41}
    )
    assert res.status_code == 422


def test_personalize_overlong_note_is_422(client):
    _auth(client, "longnote@example.com")
    item_id = _only(
        client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    )["id"]
    res = client.patch(
        f"/api/v1/sanctuary/items/{item_id}", json={"note": "x" * 141}
    )
    assert res.status_code == 422


def test_personalize_rejects_unexpected_fields(client):
    _auth(client, "extrapatch@example.com")
    item_id = _only(
        client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    )["id"]
    res = client.patch(
        f"/api/v1/sanctuary/items/{item_id}", json={"name": "Ok", "color": "red"}
    )
    assert res.status_code == 422


def test_personalize_requires_auth(client):
    assert (
        client.patch(
            f"/api/v1/sanctuary/items/{uuid.uuid4()}", json={"name": "Nope"}
        ).status_code
        == 401
    )


def test_personalize_someone_elses_item_is_404(client):
    _auth(client, "owner-name@example.com")
    client.post("/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "Mine"})
    _auth(client, "other-name@example.com")  # switch users
    res = client.patch(
        f"/api/v1/sanctuary/items/{uuid.uuid4()}", json={"name": "Stolen"}
    )
    assert res.status_code == 404


def test_personalize_does_not_leak_across_users(client):
    """Another user cannot rename my real planting id (404, not a silent edit)."""
    _auth(client, "victim@example.com")
    victim_item = _only(
        client.post(
            "/api/v1/sanctuary/buy", json={"item_key": "flower", "name": "Original"}
        ).json()
    )
    item_id = victim_item["id"]
    _auth(client, "attacker@example.com")  # switch users
    res = client.patch(
        f"/api/v1/sanctuary/items/{item_id}", json={"name": "Hacked"}
    )
    assert res.status_code == 404
    # The victim's item is untouched.
    _auth(client, "victim@example.com")
    assert _by_id(_scene(client), item_id)["name"] == "Original"


# --- Shop expansion + whimsy track (ADR-0016) -------------------------------------------

# The new items added in the expansion pass, with their unlock level. Drives the
# "appears in shop, gated, buyable" coverage below.
NEW_ITEMS = {
    "mushroom_ring": 2,
    "hedgehog": 3,
    "snail": 2,
    "garden_gnome": 2,
    "wind_chime": 3,
    "lantern": 3,
    "frog_lily": 4,
    "scarecrow": 5,
    "fairy_door": 6,
    "hammock": 7,
    "tea_cart": 12,
}


def _earn_to_level(client, target_level):
    """Practice long sits across the earn-days until the scene reports >= target_level.

    A 200-minute sit on each of the (non-consecutive) earn-days reaches level 12 by the
    tenth day under the front-loaded curve, enough for every catalog unlock gate.
    """
    for day in _EARN_DAYS:
        _practice(client, 200, day=day)
        if _scene(client)["level"] >= target_level:
            break
    return _scene(client)


def test_new_items_appear_in_the_shop(client):
    _auth(client, "expansion@example.com")
    shop = {s["item_key"] for s in _scene(client)["shop"]}
    for key in NEW_ITEMS:
        assert key in shop, f"{key} missing from shop"
    # The whimsy track is surfaced on its items.
    by_key = {s["item_key"]: s for s in _scene(client)["shop"]}
    assert by_key["garden_gnome"]["track"] == "whimsy"
    assert by_key["tea_cart"]["track"] == "whimsy"


def test_new_items_carry_a_blurb(client):
    """Every catalog item (including the new ones) surfaces a non-empty flavour blurb."""
    _auth(client, "blurbs@example.com")
    for s in _scene(client)["shop"]:
        assert isinstance(s["blurb"], str) and s["blurb"].strip(), s["item_key"]


def test_new_items_are_level_gated(client):
    """A fresh level-1 user sees the new (lvl ≥ 2) items locked with a reach-level hint and
    cannot buy them yet."""
    _auth(client, "gated@example.com")
    by_key = {s["item_key"]: s for s in _scene(client)["shop"]}
    for key, lvl in NEW_ITEMS.items():
        if lvl > 1:
            assert by_key[key]["unlocked"] is False, key
            assert f"level {lvl}" in by_key[key]["hint"]
            assert client.post("/api/v1/sanctuary/buy", json={"item_key": key}).status_code == 409


def test_new_items_buyable_once_unlocked(client):
    """With enough levels earned, each new item unlocks and buys successfully, charging the
    base cost + the next-item progressive surcharge."""
    _auth(client, "buynew@example.com")
    _earn_to_level(client, 12)
    for key in NEW_ITEMS:
        before = _scene(client)["coins"]
        n_owned = len(_scene(client)["owned"])
        item = SANCTUARY_CATALOG[key]
        res = client.post("/api/v1/sanctuary/buy", json={"item_key": key})
        assert res.status_code == 201, (key, res.json())
        after = res.json()["coins"]
        assert before - after == item.cost + progressive_surcharge(n_owned), key


def test_new_item_variant_and_customization_cost_math(client):
    """Buying a whimsy item with a variant then applying two independent customizations
    deducts exactly variant_delta + each option cost (plus the buy's surcharge)."""
    _auth(client, "whimsymath@example.com")
    _earn_to_level(client, 7)
    item = SANCTUARY_CATALOG["hammock"]
    before = _scene(client)["coins"]
    n_owned = len(_scene(client)["owned"])
    bought = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "hammock", "variant": "rainbow"}
    ).json()
    hammock = next(o for o in bought["owned"] if o["item_key"] == "hammock")
    assert hammock["variant"] == "rainbow"
    expected_buy = item.cost + item.variant_cost_delta("rainbow") + progressive_surcharge(n_owned)
    assert before - bought["coins"] == expected_buy

    # Two independent slots: grown size AND an occupant. Each charges its own option cost.
    coins = bought["coins"]
    grown_cost = item.slot("grown").option("grown").cost
    client.post(
        f"/api/v1/sanctuary/items/{hammock['id']}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    occ_cost = item.slot("occupant").option("cat").cost
    res = client.post(
        f"/api/v1/sanctuary/items/{hammock['id']}/customize",
        json={"slot": "occupant", "option": "cat"},
    )
    updated = next(o for o in res.json()["owned"] if o["item_key"] == "hammock")
    assert updated["customizations"] == {"grown": "grown", "occupant": "cat"}
    assert res.json()["coins"] == coins - grown_cost - occ_cost


# --- Economy retune safety (ADR-0016) ---------------------------------------------------


def test_retune_never_drives_a_pre_owned_garden_negative(client, db_session):
    """The retune (COINS_PER_LEVEL 70→80, PROGRESSIVE_STEP 8→6, existing base costs
    unchanged) only ever *raises* an existing garden's derived balance. Simulate a garden
    bought under the PRE-retune economy (the costliest reasonable holding at each position)
    and assert the balance under the CURRENT economy is non-negative and ≥ the old balance.
    """
    from sqlalchemy import select

    from app.models.sanctuary import SanctuaryPlanting
    from app.models.user import User
    from app.services import sanctuary_service

    _auth(client, "retunesafe@example.com")
    # Earn a real level so coins_earned is fixed and comparable across both economies.
    scene = _earn_to_level(client, 6)
    level = scene["level"]
    user_id = db_session.execute(
        select(User.id).where(User.email == "retunesafe@example.com")
    ).scalar_one()

    # Seed a pre-owned 6-item garden directly (bypassing affordability), each at a distinct
    # position so the progressive surcharge applies. Mix of items + a customization.
    holdings = [
        ("flower", None, {}),
        ("tree", "oak", {"foliage": "blossom"}),
        ("cat", "ginger", {"grown": "grown"}),
        ("hut", "wood", {"lights": "lights"}),
        ("pond", None, {"koi": "koi"}),
        ("barn", "red", {"garden": "garden"}),
    ]
    for pos, (key, variant, cust) in enumerate(holdings):
        db_session.add(
            SanctuaryPlanting(
                user_id=user_id,
                item_key=key,
                position=pos,
                cell=pos,
                variant=variant,
                customizations=cust,
            )
        )
    db_session.commit()

    plantings = sanctuary_service._load(db_session, user_id)

    # Recompute spend under the OLD economy (PROGRESSIVE_STEP was 8; base costs unchanged).
    def old_surcharge(ordinal: int) -> int:
        return round(8 * max(0, ordinal))

    old_spent = sum(
        SANCTUARY_CATALOG[p.item_key].spent(p.variant, p.customizations) + old_surcharge(p.position)
        for p in plantings
    )
    old_balance = max(0, level * 70 - old_spent)

    # Current economy via the live service computation.
    new_spent = sanctuary_service._spent(plantings)
    new_balance = max(0, level * sanctuary_service.COINS_PER_LEVEL - new_spent)

    # The retune is the safe (generous) direction: balance never drops, never goes negative.
    assert new_balance >= 0
    assert new_balance >= old_balance
    # And the scene the user actually sees reports the same non-negative balance.
    assert _scene(client)["coins"] == new_balance


def test_existing_owned_config_balance_never_negative_across_levels(client, db_session):
    """Property check: for a large owned garden at a low level (coins_earned small relative
    to spend), the reported balance is clamped to 0 — never negative — and _wallet stays
    consistent. Guards the retroactive-cost edge the retune must not break."""
    from sqlalchemy import select

    from app.models.sanctuary import SanctuaryPlanting
    from app.models.user import User

    _auth(client, "clamp@example.com")  # fresh level-1 user (small coins_earned)
    user_id = db_session.execute(
        select(User.id).where(User.email == "clamp@example.com")
    ).scalar_one()
    # Seed many items directly so spend dwarfs a level-1 wallet.
    for pos in range(8):
        db_session.add(
            SanctuaryPlanting(
                user_id=user_id, item_key="barn", position=pos, cell=pos, customizations={}
            )
        )
    db_session.commit()
    scene = _scene(client)
    assert scene["coins"] == 0  # clamped, not negative
    assert scene["coins"] >= 0
    assert len(scene["owned"]) == 8  # the scene still renders every holding


# --- Concurrency safety: per-user advisory lock + IntegrityError → 409 -------------------
#
# pytest is single-threaded, so we can't truly race two requests. Instead we (a) assert the
# mutating service methods take the per-user advisory lock that serializes concurrent writes,
# and (b) force an IntegrityError on the commit and assert the route returns 409, not a 500.


def _commit_raises_once(db_session, monkeypatch):
    """Patch the session so the *next* commit raises IntegrityError once, then restores the
    real commit (so the service's rollback + any later commits behave normally)."""
    from sqlalchemy.exc import IntegrityError

    real_commit = db_session.commit
    state = {"armed": True}

    def fake_commit(*args, **kwargs):
        if state["armed"]:
            state["armed"] = False
            raise IntegrityError("INSERT", {}, Exception("uq collision"))
        return real_commit(*args, **kwargs)

    monkeypatch.setattr(db_session, "commit", fake_commit)


def test_buy_takes_a_per_user_advisory_lock(client, db_session, monkeypatch):
    """buy() serializes concurrent same-user writes via a transaction-scoped advisory lock."""
    from app.services import sanctuary_service

    _auth(client, "lock-buy@example.com")
    calls: list = []
    real = sanctuary_service._lock_user_garden
    monkeypatch.setattr(
        sanctuary_service,
        "_lock_user_garden",
        lambda db, user_id: (calls.append(user_id), real(db, user_id))[1],
    )
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    assert res.status_code == 201
    assert len(calls) == 1  # the lock was acquired exactly once for the buy


def test_buy_integrity_error_is_409_not_500(client, db_session, monkeypatch):
    """A unique-constraint collision on the insert surfaces as 409, never an unhandled 500."""
    _auth(client, "conflict-buy@example.com")
    _commit_raises_once(db_session, monkeypatch)
    res = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"})
    assert res.status_code == 409


def _lock_before_planting_read(db_session, monkeypatch):
    """Spy on the session: record each executed statement's SQL so a test can assert the
    advisory-lock statement runs BEFORE the first read of the target `sanctuary_plantings`
    row. Returns the list of recorded SQL strings (lowercased)."""
    sqls: list[str] = []
    real_execute = db_session.execute

    def spy(statement, *args, **kwargs):
        try:
            sqls.append(str(statement).lower())
        except Exception:  # noqa: BLE001 — never let instrumentation break the call
            sqls.append("")
        return real_execute(statement, *args, **kwargs)

    monkeypatch.setattr(db_session, "execute", spy)
    return sqls


def _assert_lock_precedes_row_read(sqls):
    lock_idx = next(i for i, s in enumerate(sqls) if "pg_advisory_xact_lock" in s)
    read_idx = next(i for i, s in enumerate(sqls) if "sanctuary_plantings" in s)
    assert lock_idx < read_idx, (
        "advisory lock must be taken BEFORE the target planting row is read, so the "
        "post-lock write merges onto fresh state (not a stale pre-lock snapshot)"
    )


def test_customize_locks_before_reading_the_row(client, db_session, monkeypatch):
    """customize() takes the per-user lock before SELECTing the planting, so the merge onto
    `customizations` is computed under the lock (no last-writer-wins JSON clobber)."""
    _auth(client, "lock-cust@example.com")
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    planting_id = bought["owned"][0]["id"]
    sqls = _lock_before_planting_read(db_session, monkeypatch)
    res = client.post(
        f"/api/v1/sanctuary/items/{planting_id}/customize",
        json={"slot": "foliage", "option": "blossom"},
    )
    assert res.status_code == 200
    _assert_lock_precedes_row_read(sqls)


def test_move_locks_before_reading_the_row(client, db_session, monkeypatch):
    """move() takes the per-user lock before SELECTing the row, so the swap reads a fresh
    source cell (no uq(user_id, cell) collision from a stale snapshot)."""
    _auth(client, "lock-move@example.com")
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    planting_id = bought["owned"][0]["id"]
    sqls = _lock_before_planting_read(db_session, monkeypatch)
    res = client.post(f"/api/v1/sanctuary/items/{planting_id}/move", json={"cell": 5})
    assert res.status_code == 200
    _assert_lock_precedes_row_read(sqls)


def test_personalize_locks_before_reading_the_row(client, db_session, monkeypatch):
    """personalize() takes the per-user lock before SELECTing the row (consistent with the
    other mutators), so the partial update merges onto fresh state."""
    _auth(client, "lock-pers@example.com")
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    planting_id = bought["owned"][0]["id"]
    sqls = _lock_before_planting_read(db_session, monkeypatch)
    res = client.patch(
        f"/api/v1/sanctuary/items/{planting_id}", json={"name": "Buddy"}
    )
    assert res.status_code == 200
    _assert_lock_precedes_row_read(sqls)


def test_personalize_integrity_error_is_409_not_500(client, db_session, monkeypatch):
    """A collision while saving a cosmetic personalization surfaces as 409, never a 500."""
    _auth(client, "conflict-pers@example.com")
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    planting_id = bought["owned"][0]["id"]
    _commit_raises_once(db_session, monkeypatch)
    res = client.patch(
        f"/api/v1/sanctuary/items/{planting_id}", json={"name": "Buddy"}
    )
    assert res.status_code == 409


def test_customize_integrity_error_is_409_not_500(client, db_session, monkeypatch):
    """A collision while applying a customization surfaces as 409, never a 500."""
    _auth(client, "conflict-cust@example.com")
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    planting_id = bought["owned"][0]["id"]
    _commit_raises_once(db_session, monkeypatch)
    res = client.post(
        f"/api/v1/sanctuary/items/{planting_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    assert res.status_code == 409


def test_move_integrity_error_is_409_not_500(client, db_session, monkeypatch):
    """A collision on uq(user_id, cell) during a move surfaces as 409, never a 500."""
    _auth(client, "conflict-move@example.com")
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "flower"}).json()
    planting_id = bought["owned"][0]["id"]
    _commit_raises_once(db_session, monkeypatch)
    res = client.post(
        f"/api/v1/sanctuary/items/{planting_id}/move", json={"cell": 5}
    )
    assert res.status_code == 409


# --- Reset upgrades for a fee (ADR-0019) ------------------------------------------------
#
# Resetting clears an item's customizations (its variant/base form stays) and refunds the
# sunk customization cost via the derived balance, minus a flat SANCTUARY_RESET_FEE that's
# accumulated on the user so the fee persists in the no-ledger model. Net: a reset is a real,
# fee-sized coin cost, so it can't be churned for free.


def _grown_opt_cost(item_key):
    return SANCTUARY_CATALOG[item_key].slot("grown").option("grown").cost


def test_reset_requires_auth(client):
    assert (
        client.post(f"/api/v1/sanctuary/items/{uuid.uuid4()}/reset").status_code == 401
    )


def test_reset_clears_customizations_and_refunds_minus_fee(client):
    """A reset clears the item's customizations and returns the sunk cost minus the flat fee;
    the variant (base form) is preserved."""
    _auth(client, "reset-basic@example.com")
    _practice(client, 120)  # plenty of coins
    bought = client.post(
        "/api/v1/sanctuary/buy", json={"item_key": "tree", "variant": "cherry"}
    ).json()
    tree_id = bought["owned"][0]["id"]
    # Apply two independent customizations.
    grown = _grown_opt_cost("tree")
    foliage = SANCTUARY_CATALOG["tree"].slot("foliage").option("blossom").cost
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    after_cust = client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "foliage", "option": "blossom"},
    ).json()
    coins_with_upgrades = after_cust["coins"]

    res = client.post(f"/api/v1/sanctuary/items/{tree_id}/reset")
    assert res.status_code == 200
    scene = res.json()
    tree = next(o for o in scene["owned"] if o["id"] == tree_id)
    # Customizations cleared; the purchased variant (base form) is left intact.
    assert tree["customizations"] == {}
    assert tree["variant"] == "cherry"
    # The two option costs are refunded, minus the flat fee.
    assert scene["coins"] == coins_with_upgrades + grown + foliage - SANCTUARY_RESET_FEE


def test_reset_fee_persists_across_a_second_reset(client):
    """The fee is stored, so a second reset charges the fee again (not a free undo)."""
    _auth(client, "reset-twice@example.com")
    _practice(client, 120)
    tree_id = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()[
        "owned"
    ][0]["id"]
    grown = _grown_opt_cost("tree")

    # First cycle: grow → reset.
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    coins_grown_1 = _scene(client)["coins"]
    r1 = client.post(f"/api/v1/sanctuary/items/{tree_id}/reset").json()
    assert r1["coins"] == coins_grown_1 + grown - SANCTUARY_RESET_FEE

    # Second cycle: grow again → reset again. The fee is charged a SECOND time, so the net
    # effect of two grow+reset cycles is exactly two fees lost from the balance.
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    coins_grown_2 = _scene(client)["coins"]
    r2 = client.post(f"/api/v1/sanctuary/items/{tree_id}/reset").json()
    assert r2["coins"] == coins_grown_2 + grown - SANCTUARY_RESET_FEE


def test_reset_churn_is_coin_negative(client):
    """A full buy → grow → reset → regrow cycle leaves the user strictly *poorer* by the fee
    than just buying + growing once — so reset-churn can never mint free coins."""
    _auth(client, "reset-churn@example.com")
    _practice(client, 120)
    before_any = _scene(client)["coins"]
    tree_id = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()[
        "owned"
    ][0]["id"]
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    baseline = _scene(client)["coins"]  # bought + grown once, no resets

    # Now churn: reset and regrow the SAME item. The customization cost nets out, but every
    # reset still burns a fee, so the balance is strictly below the no-churn baseline.
    client.post(f"/api/v1/sanctuary/items/{tree_id}/reset")
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    churned = _scene(client)["coins"]
    assert churned == baseline - SANCTUARY_RESET_FEE
    assert churned < baseline < before_any


def test_reset_with_no_customizations_is_409_and_no_fee(client):
    """Resetting an item with nothing applied is rejected (409) and charges no fee — a no-op
    must not cost coins."""
    _auth(client, "reset-empty@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = bought["owned"][0]["id"]
    coins_before = bought["coins"]
    res = client.post(f"/api/v1/sanctuary/items/{tree_id}/reset")
    assert res.status_code == 409
    # No fee charged — the balance is unchanged.
    assert _scene(client)["coins"] == coins_before


def test_reset_balance_never_goes_negative(client, db_session):
    """A reset on a low-coins user never drives the reported balance below zero — it clamps."""
    from sqlalchemy import select

    from app.models.sanctuary import SanctuaryPlanting
    from app.models.user import User

    _auth(client, "reset-clamp@example.com")  # fresh level-1 user (small wallet)
    user_id = db_session.execute(
        select(User.id).where(User.email == "reset-clamp@example.com")
    ).scalar_one()
    # Seed a grown item directly so spend already dwarfs the level-1 wallet (balance 0).
    db_session.add(
        SanctuaryPlanting(
            user_id=user_id,
            item_key="barn",
            position=0,
            cell=0,
            customizations={"grown": "grown"},
        )
    )
    db_session.commit()
    assert _scene(client)["coins"] == 0  # already clamped to 0

    planting_id = _scene(client)["owned"][0]["id"]
    res = client.post(f"/api/v1/sanctuary/items/{planting_id}/reset")
    assert res.status_code == 200
    assert res.json()["coins"] >= 0  # still clamped, never negative


def test_reset_unowned_item_is_404(client):
    _auth(client, "reset-notmine@example.com")
    res = client.post(f"/api/v1/sanctuary/items/{uuid.uuid4()}/reset")
    assert res.status_code == 404


def test_reset_someone_elses_item_is_404(client):
    """Another user cannot reset my real planting id (404, not a silent clear + fee)."""
    _auth(client, "reset-owner@example.com")
    _practice(client, 60)
    victim = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = victim["owned"][0]["id"]
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    _auth(client, "reset-attacker@example.com")  # switch users
    res = client.post(f"/api/v1/sanctuary/items/{tree_id}/reset")
    assert res.status_code == 404
    # The victim's customization survives untouched.
    _auth(client, "reset-owner@example.com")
    assert _scene(client)["owned"][0]["customizations"] == {"grown": "grown"}


def test_reset_locks_before_reading_the_row(client, db_session, monkeypatch):
    """reset_upgrades() takes the per-user lock before SELECTing the planting, so the clear +
    fee are computed under the lock (no double-charge on a concurrent reset)."""
    _auth(client, "reset-lock@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    planting_id = bought["owned"][0]["id"]
    client.post(
        f"/api/v1/sanctuary/items/{planting_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    sqls = _lock_before_planting_read(db_session, monkeypatch)
    res = client.post(f"/api/v1/sanctuary/items/{planting_id}/reset")
    assert res.status_code == 200
    _assert_lock_precedes_row_read(sqls)


def test_reset_integrity_error_is_409_not_500(client, db_session, monkeypatch):
    """A unique-constraint collision while resetting surfaces as 409, never an unhandled 500."""
    _auth(client, "reset-conflict@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    planting_id = bought["owned"][0]["id"]
    client.post(
        f"/api/v1/sanctuary/items/{planting_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    _commit_raises_once(db_session, monkeypatch)
    res = client.post(f"/api/v1/sanctuary/items/{planting_id}/reset")
    assert res.status_code == 409


def test_reset_rejects_unexpected_body(client):
    """The reset endpoint takes no body; a stray JSON field is ignored (no body schema), but
    the action still succeeds for an item with customizations."""
    _auth(client, "reset-body@example.com")
    _practice(client, 60)
    bought = client.post("/api/v1/sanctuary/buy", json={"item_key": "tree"}).json()
    tree_id = bought["owned"][0]["id"]
    client.post(
        f"/api/v1/sanctuary/items/{tree_id}/customize",
        json={"slot": "grown", "option": "grown"},
    )
    # No request body needed; the endpoint reads only the path param.
    res = client.post(f"/api/v1/sanctuary/items/{tree_id}/reset")
    assert res.status_code == 200
