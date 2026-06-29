"""Tests for the Spirit feature (docs/design/spirit.md, ADR-0022, ADR-0023, ADR-0024, ADR-0027).

The spirit's state is computed on read from the user's earned-XP level; the only stored
state is the active spirit row (chosen path, name, the `unlocked` collection + equipped
`cosmetics` loadout, and the monotonic `coins_spent` ledger). Covered here:

- the GET read API — happy-path shape, auth-required, and lazy get-or-create (first GET
  creates exactly one active spirit; a second GET does not duplicate it);
- the pure stage-from-level band computation;
- choose (ADR-0023 / ADR-0024) — sets the path + REQUIRED name once (422 on missing/blank
  name, 409 on re-choose, 422 on a bad path), a fresh spark is pathless, and after awaken the
  new spark is pathless again (choose-able anew);
- the three tended needs (ADR-0023) — neutral defaults while pathless; `nourished` RISES with
  the chosen creature's SIGNATURE practice and DECLINES without it (other practices do NOT
  nourish it); `rested` reflects rhythm/consistency; `joyful` reflects variety; a depleted need
  doesn't jump to thriving from one session; the overall condition is the WEAKEST need; and the
  GUARDRAIL — needs never change coins/stage;
- the cosmetics skill tree (ADR-0027) — UNLOCK at FULL cost adds to the owned collection +
  auto-equips + charges the monotonic `coins_spent` ledger + pampers; tier prerequisites gate
  unlocking (tier2 needs an owned tier1, tier3 an owned tier2); EQUIP is free, only works on
  owned options, can clear a slot and swap between owned options; a legacy already-equipped item
  counts as owned; per_path + level + affordability still gate unlock; and the catalog invariant;
- the paid name reset (ADR-0024) — reset-name (charges RESET_COST, sets a new name, 409 when
  broke); the free PATCH rename is gone; the removed reset-upgrades route is gone (ADR-0027);
- and awaken / collection (radiant gate + retire+spark).
"""

from datetime import UTC, date, datetime, timedelta

from sqlalchemy import func, select

from app.models.spirit import Spirit
from app.services import spirit_service
from app.services.spirit_service import (
    COINS_PER_LEVEL,
    CONDITION_CONTENT,
    CONDITION_THRIVING,
    DECAY_DAYS,
    NEED_KEYS,
    NEEDS_FLOOR,
    RESET_COST,
    SPIRIT_COSMETICS_CATALOG,
    TEND_CAP,
    stage_for_level,
)


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _choose(client, path, name="Ember"):
    """Choose the creature + (required, ADR-0024) name in one call — the helper most tests use
    now that the name is mandatory at creation."""
    return client.post("/api/v1/spirit/choose", json={"path": path, "name": name})


def _practice(client, minutes, *, day="2026-01-01"):
    return client.post(
        "/api/v1/sessions",
        json={
            "type": "mindfulness",
            "duration_seconds": minutes * 60,
            "occurred_at": f"{day}T08:00:00",
        },
    )


def _spirit(client):
    return client.get("/api/v1/spirit").json()


# --- Stage bands (pure function of level) -----------------------------------------------


def test_stage_for_level_bands():
    # Below / at the first gate → spark.
    assert stage_for_level(1) == "spark"
    assert stage_for_level(2) == "spark"
    # Each band is the highest threshold ≤ level.
    assert stage_for_level(3) == "wisp"
    assert stage_for_level(6) == "wisp"
    assert stage_for_level(7) == "fledgling"
    assert stage_for_level(13) == "fledgling"
    assert stage_for_level(14) == "ascendant"
    assert stage_for_level(23) == "ascendant"
    assert stage_for_level(24) == "radiant"
    assert stage_for_level(99) == "radiant"


def test_stage_is_monotonic_in_level():
    order = ["spark", "wisp", "fledgling", "ascendant", "radiant"]
    last = -1
    for level in range(1, 60):
        idx = order.index(stage_for_level(level))
        assert idx >= last  # never regresses as level rises
        last = idx


# --- Auth ------------------------------------------------------------------------------


def test_requires_auth(client):
    assert client.get("/api/v1/spirit").status_code == 401


# --- Happy path: the computed shape ----------------------------------------------------


def test_get_returns_computed_shape(client):
    _auth(client, "spirit_shape@example.com")
    res = client.get("/api/v1/spirit")
    assert res.status_code == 200
    body = res.json()

    # A fresh user is a level-1 pathless, unnamed spark with no cosmetics.
    assert body["stage"] == "spark"
    assert body["path"] is None
    assert body["name"] is None
    assert body["cosmetics"] == {}

    # Bond reads the level + XP-into-level + XP-for-next.
    bond = body["bond"]
    assert bond["level"] == 1
    assert bond["xp_into_level"] >= 0
    assert bond["xp_for_next"] > 0

    # Coins are level × COINS_PER_LEVEL (no cosmetics spend in step 1).
    assert body["coins"] == bond["level"] * COINS_PER_LEVEL

    # A pathless spark reports neutral, content-ish needs (no care requirement until a creature
    # is chosen), and the overall condition (= the weakest need) is the same neutral default.
    for need in ("nourished", "rested", "joyful"):
        assert body["needs"][need]["tier"] == CONDITION_CONTENT
        assert 0.0 <= body["needs"][need]["factor"] <= 1.0
    assert body["condition"]["tier"] == CONDITION_CONTENT
    assert 0.0 <= body["condition"]["factor"] <= 1.0
    # ADR-0023 retired the auto-detected lean and the single daily_glow — gone from the shape.
    assert "path_lean" not in body
    assert "daily_glow" not in body


def test_response_forbids_extra_fields():
    # The response schema rejects unexpected fields (a stable contract).
    from app.schemas.spirit import SpiritState

    assert SpiritState.model_config.get("extra") == "forbid"


# --- Get-or-create (exactly one active spirit) -----------------------------------------


def _active_count(db, user_id):
    return db.execute(
        select(func.count())
        .select_from(Spirit)
        .where(Spirit.user_id == user_id, Spirit.retired_at.is_(None))
    ).scalar_one()


def test_first_get_creates_one_active_spirit(client, db_session):
    _auth(client, "spirit_create@example.com")
    from app.models.user import User

    user_id = db_session.execute(
        select(User.id).where(User.email == "spirit_create@example.com")
    ).scalar_one()

    # No spirit before the first read.
    assert _active_count(db_session, user_id) == 0

    assert client.get("/api/v1/spirit").status_code == 200
    assert _active_count(db_session, user_id) == 1

    # A second read does not create a duplicate.
    assert client.get("/api/v1/spirit").status_code == 200
    assert _active_count(db_session, user_id) == 1


def _make_user(db, email):
    from app.core.security import hash_password
    from app.models.user import User

    user = User(email=email, password_hash=hash_password("correct horse"))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def test_service_get_or_create_is_idempotent(db_session):
    user = _make_user(db_session, "svc_spirit@example.com")

    first = spirit_service.get_or_create_active_spirit(db_session, user.id)
    second = spirit_service.get_or_create_active_spirit(db_session, user.id)
    assert first.id == second.id
    assert _active_count(db_session, user.id) == 1


# --- Practice helpers + id lookups ------------------------------------------------------


def _breathe(client, minutes, *, day="2026-01-01"):
    return client.post(
        "/api/v1/sessions",
        json={
            "type": "resonance_breathing",
            "duration_seconds": minutes * 60,
            "occurred_at": f"{day}T08:00:00",
            "inhale_seconds": 6,
            "exhale_seconds": 6,
        },
    )


def _energize(client, minutes, *, day="2026-01-01"):
    """A brisk energizing-breath session (active inhale, quick exhale) — also breathwork,
    so it feeds the Kapha (stillness) creature just like resonance breathing does."""
    return client.post(
        "/api/v1/sessions",
        json={
            "type": "energizing_breathing",
            "duration_seconds": minutes * 60,
            "occurred_at": f"{day}T08:00:00",
            "inhale_seconds": 3,
            "exhale_seconds": 2,
        },
    )


def _gratitude(client, text="thankful"):
    return client.post("/api/v1/gratitude", json={"category": "people", "text": text})


def _journal(client, body="a reflection on the day, written out at length"):
    return client.post("/api/v1/journals", json={"body": body})


def _user_id(db_session, email):
    from app.models.user import User

    return db_session.execute(select(User.id).where(User.email == email)).scalar_one()


def _stored_path(db_session, user_id):
    return db_session.execute(
        select(Spirit.path).where(Spirit.user_id == user_id, Spirit.retired_at.is_(None))
    ).scalar_one()


def _stored_coins_spent(db_session, user_id):
    """The active spirit's stored monotonic spend ledger (ADR-0024) — read directly off the
    row (it isn't in SpiritState)."""
    db_session.expire_all()
    return db_session.execute(
        select(Spirit.coins_spent).where(
            Spirit.user_id == user_id, Spirit.retired_at.is_(None)
        )
    ).scalar_one()


def _stored_last_pampered_at(db_session, user_id):
    """The active spirit's stored pamper timestamp (ADR-0025) — read off the row (it isn't in
    SpiritState). NULL until the first cosmetic purchase. ADR-0029 still STAMPS it on unlock for
    forward-compat, even though it no longer affects needs, so the unlock tests still check it."""
    db_session.expire_all()
    return db_session.execute(
        select(Spirit.last_pampered_at).where(
            Spirit.user_id == user_id, Spirit.retired_at.is_(None)
        )
    ).scalar_one()


def _stored_last_pampered_need(db_session, user_id):
    """The active spirit's stored last-pampered need (ADR-0026) — read off the row (not in
    SpiritState). NULL until the first cosmetic purchase. Still STAMPED on unlock under ADR-0029
    (forward-compat only; it no longer affects needs)."""
    db_session.expire_all()
    return db_session.execute(
        select(Spirit.last_pampered_need).where(
            Spirit.user_id == user_id, Spirit.retired_at.is_(None)
        )
    ).scalar_one()


# --- Choose the creature (ADR-0023; path is chosen, not auto-detected) ------------------


def test_choose_requires_auth(client):
    assert _choose(client, "stillness").status_code == 401


def test_fresh_spark_is_pathless(client):
    _auth(client, "choose_fresh@example.com")
    assert _spirit(client)["path"] is None  # nothing auto-detected — pathless until chosen


def test_choose_sets_the_path_and_name_once(client, db_session):
    _auth(client, "choose_set@example.com")
    user_id = _user_id(db_session, "choose_set@example.com")

    res = _choose(client, "breath", name="  Zephyr  ")
    assert res.status_code == 200
    assert res.json()["path"] == "breath"
    # The required name is trimmed, set, and echoed on the state (ADR-0024).
    assert res.json()["name"] == "Zephyr"
    # Persisted, and echoed on a fresh GET.
    db_session.expire_all()
    assert _stored_path(db_session, user_id) == "breath"
    fresh = _spirit(client)
    assert fresh["path"] == "breath"
    assert fresh["name"] == "Zephyr"


def test_choose_requires_a_name_422(client):
    """ADR-0024: the name is REQUIRED at creation — missing or blank → 422, and the spirit
    stays pathless (nothing committed)."""
    _auth(client, "choose_noname@example.com")
    # Missing name entirely.
    assert client.post("/api/v1/spirit/choose", json={"path": "stillness"}).status_code == 422
    # Empty / whitespace-only name.
    assert _choose(client, "stillness", name="").status_code == 422
    assert _choose(client, "stillness", name="   ").status_code == 422
    # Nothing was committed — still pathless and unnamed.
    body = _spirit(client)
    assert body["path"] is None
    assert body["name"] is None


def test_choose_again_is_409(client):
    _auth(client, "choose_twice@example.com")
    assert _choose(client, "stillness").status_code == 200
    # The choice is once-only — re-choosing (even the same value) conflicts.
    assert _choose(client, "heart").status_code == 409
    assert _choose(client, "stillness").status_code == 409


def test_choose_bad_value_is_422(client):
    _auth(client, "choose_bad@example.com")
    assert _choose(client, "wrathful").status_code == 422
    assert _choose(client, "nope").status_code == 422


def test_choose_rejects_unexpected_fields(client):
    _auth(client, "choose_extra@example.com")
    res = client.post(
        "/api/v1/spirit/choose", json={"path": "stillness", "name": "Ember", "x": 1}
    )
    assert res.status_code == 422


# --- Gentle, floored needs (ADR-0031: the companion stops being mortal) -------------------
#
# Needs ease down on a clock since last fed but are FLOORED at NEEDS_FLOOR so they never empty or
# punish. We test the pure math by calling the service directly with an explicit `now` +
# `needs_baseline_at` (and per-need tend stamps), and the end-to-end behaviour by setting the stored
# row's timestamps in the PAST (we do NOT mock `now` — elapsed time is simulated by backdating the
# anchors).

_AWARE = datetime.now(UTC)  # a stable aware "now" for the direct-call decay tests


def _decayed_needs(
    db_session,
    path,
    user_id,
    *,
    now=None,
    baseline=None,
    nourished_tended_at=None,
    rested_tended_at=None,
    joyful_tended_at=None,
):
    """Call the ADR-0029 decay `needs(...)` with an explicit `now` + born-fed `baseline` (defaulting
    to now), so decay is deterministic and date-independent."""
    now = now or datetime.now(UTC)
    return spirit_service.needs(
        db_session,
        path,
        user_id,
        now=now,
        needs_baseline_at=baseline or now,
        nourished_tended_at=nourished_tended_at,
        rested_tended_at=rested_tended_at,
        joyful_tended_at=joyful_tended_at,
    )


def _active_spirit(db_session, user_id):
    return db_session.execute(
        select(Spirit).where(Spirit.user_id == user_id, Spirit.retired_at.is_(None))
    ).scalar_one()


def _backdate_baseline(db_session, user_id, *, days_ago):
    """Backdate the active spirit's needs_baseline_at by `days_ago` days and clear any tend stamps
    — simulating that much elapsed time with no activity/tend (no `now` mocking)."""
    spirit = _active_spirit(db_session, user_id)
    spirit.needs_baseline_at = datetime.now(UTC) - timedelta(days=days_ago)
    spirit.nourished_tended_at = None
    spirit.rested_tended_at = None
    spirit.joyful_tended_at = None
    db_session.commit()
    return spirit


def test_pathless_spark_has_neutral_needs(client, db_session):
    _auth(client, "needs_pathless@example.com")
    user_id = _user_id(db_session, "needs_pathless@example.com")
    client.get("/api/v1/spirit")  # create the spark
    n = _decayed_needs(db_session, None, user_id)
    # No creature chosen → no care requirement → every need is the neutral content-ish default.
    assert n.nourished.tier == CONDITION_CONTENT
    assert n.rested.tier == CONDITION_CONTENT
    assert n.joyful.tier == CONDITION_CONTENT
    # And the overall condition (the weakest need) is the same neutral default.
    assert spirit_service.overall_condition(n).tier == CONDITION_CONTENT


def test_born_fed_baseline_starts_full_and_healthy(client, db_session):
    """A spirit with `needs_baseline_at` ~now (the fresh-spark semantics) reads with every need at
    full — and, since ADR-0031, it can never be ailing or dead at all."""
    _auth(client, "needs_bornfed@example.com")
    user_id = _user_id(db_session, "needs_bornfed@example.com")
    now = datetime.now(UTC)
    # No activity at all, baseline = now → practice_value = 1.0 for all three.
    n = _decayed_needs(db_session, "stillness", user_id, now=now, baseline=now)
    for need in (n.nourished, n.rested, n.joyful):
        assert need.factor == 1.0
        assert need.tier == CONDITION_THRIVING
    # The overall condition is full.
    assert spirit_service.overall_condition(n).factor == 1.0
    # ADR-0031: there is no death/ailing state to compute — the GET shape no longer carries it.
    body = _spirit(client)
    assert "dead" not in body
    assert "ailing" not in body
    assert "died_at" not in body


def test_needs_decay_partway_after_some_days(db_session):
    """A baseline ~DECAY_DAYS/2 in the past with no activity/tend → needs ease PARTWAY (value
    ≈ 0.5)... but the NEEDS_FLOOR clamps that up to the floor, so the reported value never drops
    below NEEDS_FLOOR (ADR-0031)."""
    user = _make_user(db_session, "needs_decay_partway@example.com")
    now = datetime.now(UTC)
    baseline = now - timedelta(days=DECAY_DAYS / 2)
    n = _decayed_needs(db_session, "stillness", user.id, now=now, baseline=baseline)
    for need in (n.nourished, n.rested, n.joyful):
        # The raw ease would be 0.5, but the floor lifts it to NEEDS_FLOOR.
        assert abs(need.factor - NEEDS_FLOOR) < 1e-9


def test_needs_never_drop_below_the_floor(db_session):
    """ADR-0031: no matter how long since last fed (or tend), a need never drops below NEEDS_FLOOR,
    and its tier is therefore never below `content` (never restless/unwell). The spirit is never
    empty/ailing/dead."""
    user = _make_user(db_session, "needs_floor@example.com")
    now = datetime.now(UTC)
    # Years of total neglect — the raw ease would be 0; the floor holds it up.
    baseline = now - timedelta(days=DECAY_DAYS + 365)
    n = _decayed_needs(db_session, "stillness", user.id, now=now, baseline=baseline)
    for need in (n.nourished, n.rested, n.joyful):
        assert need.factor == NEEDS_FLOOR
        # The worst reachable tier is `content` — never restless/unwell.
        assert need.tier == CONDITION_CONTENT
    # The overall condition (weakest need) is likewise floored at content.
    overall = spirit_service.overall_condition(n)
    assert overall.factor == NEEDS_FLOOR
    assert overall.tier == CONDITION_CONTENT


def test_recent_signature_practice_keeps_nourished_full(client, db_session):
    """A recent matching session resets the nourished clock: a `stillness` (Kapha) creature fed
    BREATHING just now reads nourished ≈ full even when the baseline is old (practice beats it)."""
    _auth(client, "needs_recent_practice@example.com")
    user_id = _user_id(db_session, "needs_recent_practice@example.com")
    now = datetime.now(UTC)
    # Practice today; an old baseline that would otherwise have decayed nourished to 0.
    _breathe(client, 30, day=now.date().isoformat())  # breathing = the Kapha creature's food
    old_baseline = now - timedelta(days=DECAY_DAYS + 5)
    n = _decayed_needs(db_session, "stillness", user_id, now=now, baseline=old_baseline)
    # The recent breathing session refills nourished (and rested — any sit feeds rested too).
    assert n.nourished.factor > 0.9
    assert n.rested.factor > 0.9
    # joyful is fed by gratitude/journal, which we didn't do → it eases down to the FLOOR (ADR-0031).
    assert n.joyful.factor == NEEDS_FLOOR


def test_rested_fed_by_any_session_joyful_by_reflection(client, db_session):
    """`rested` is fed by ANY sit; `joyful` by a gratitude/journal entry. A meditation today keeps
    rested full while joyful (no reflection) decays; a gratitude entry keeps joyful full."""
    _auth(client, "needs_signals@example.com")
    user_id = _user_id(db_session, "needs_signals@example.com")
    now = datetime.now(UTC)
    old = now - timedelta(days=DECAY_DAYS + 5)

    _practice(client, 10, day=now.date().isoformat())  # a meditation sit → feeds rested
    rested_only = _decayed_needs(db_session, "heart", user_id, now=now, baseline=old)
    assert rested_only.rested.factor > 0.9  # any sit feeds rested
    assert rested_only.joyful.factor == NEEDS_FLOOR  # no reflection → joyful eased to the floor

    _gratitude(client)  # a gratitude entry → feeds joyful
    with_joy = _decayed_needs(db_session, "heart", user_id, now=now, baseline=old)
    assert with_joy.joyful.factor > 0.9


def test_signature_practice_is_path_specific(client, db_session):
    """nourished is fed ONLY by the chosen creature's signature practice. Meditation feeds a
    `heart` (Vata) creature's nourished but NOT a `stillness` (Kapha) one (whose food is
    breathing)."""
    _auth(client, "needs_pathfood@example.com")
    user_id = _user_id(db_session, "needs_pathfood@example.com")
    now = datetime.now(UTC)
    old = now - timedelta(days=DECAY_DAYS + 5)
    _practice(client, 10, day=now.date().isoformat())  # meditation

    heart = _decayed_needs(db_session, "heart", user_id, now=now, baseline=old)
    assert heart.nourished.factor > 0.9  # meditation IS the Vata creature's food

    kapha = _decayed_needs(db_session, "stillness", user_id, now=now, baseline=old)
    # meditation is NOT the Kapha creature's food → nourished eases to the FLOOR, not 0 (ADR-0031).
    assert kapha.nourished.factor == NEEDS_FLOOR


def test_tend_lifts_a_need_above_the_floor(db_session):
    """A manual tend is a real-but-gentle, optional lift (ADR-0031): a fresh tend raises a need
    above the content floor, up to TEND_CAP, while the un-tended needs sit at the gentle floor.
    Practice still fills fullest; nothing is ever below the floor."""
    user = _make_user(db_session, "needs_tend_cap@example.com")
    now = datetime.now(UTC)
    old = now - timedelta(days=DECAY_DAYS + 5)  # practice value would be 0 → floored to NEEDS_FLOOR
    n = _decayed_needs(
        db_session, "stillness", user.id, now=now, baseline=old, nourished_tended_at=now
    )
    # A fresh tend lifts the need above the floor, up to TEND_CAP.
    assert NEEDS_FLOOR < n.nourished.factor <= TEND_CAP
    # The un-tended needs are at the gentle floor (never empty).
    assert n.rested.factor == NEEDS_FLOOR
    assert n.joyful.factor == NEEDS_FLOOR


def test_an_old_tend_eases_back_to_the_floor(db_session):
    """A tend's lift eases back to the gentle floor over time — never below it (ADR-0031). A tend
    long enough ago has fully eased, so the need reads exactly NEEDS_FLOOR again."""
    user = _make_user(db_session, "needs_tend_decay@example.com")
    now = datetime.now(UTC)
    old = now - timedelta(days=DECAY_DAYS + 5)
    tended_long_ago = now - timedelta(days=TEND_CAP * DECAY_DAYS + 0.5)
    n = _decayed_needs(
        db_session,
        "stillness",
        user.id,
        now=now,
        baseline=old,
        nourished_tended_at=tended_long_ago,
    )
    assert n.nourished.factor == NEEDS_FLOOR  # the lift has eased; the floor holds it up


def test_overall_condition_is_the_weakest_need(db_session):
    """The overall condition = the WEAKEST need. With nourished fed full by recent practice but the
    others only at the floor, the overall condition follows the weakest — which is the floor, never
    below (ADR-0031)."""
    user = _make_user(db_session, "needs_overall@example.com")
    now = datetime.now(UTC)
    old = now - timedelta(days=DECAY_DAYS + 5)
    # nourished fed full by a recent signature practice; rested/joyful only at the floor.
    _user = user  # readability
    n = _decayed_needs(db_session, "stillness", user.id, now=now, baseline=old)
    # Without activity all three are floored, so the weakest = the floor.
    assert n.rested.factor == NEEDS_FLOOR
    overall = spirit_service.overall_condition(n)
    assert overall.factor == NEEDS_FLOOR


def test_needs_never_change_coins_or_stage(client, db_session):
    """Needs are still un-coupled from progress: a fully-eased (floored) creature has the SAME coins
    and stage as the moment they were earned (XP/level/coins stay computed from activity)."""
    _auth(client, "needs_guardrail@example.com")
    user_id = _user_id(db_session, "needs_guardrail@example.com")
    _earn_to_level(client, 3)
    assert _choose(client, "stillness").status_code == 200

    before = _spirit(client)
    # Ease every need to the floor by computing with an old baseline.
    now = datetime.now(UTC)
    floored = _decayed_needs(
        db_session, "stillness", user_id, now=now, baseline=now - timedelta(days=DECAY_DAYS + 5)
    )
    assert floored.nourished.factor == NEEDS_FLOOR
    assert floored.rested.factor == NEEDS_FLOOR
    assert floored.joyful.factor == NEEDS_FLOOR

    after = _spirit(client)
    assert after["coins"] == before["coins"]
    assert after["stage"] == before["stage"]
    assert after["bond"]["level"] == before["bond"]["level"]


# --- The companion is never mortal (ADR-0031) ---------------------------------------------
#
# There is no health/ailing/death anymore: needs are floored, so even total, indefinite neglect
# leaves the spirit calm and alive. The GET response no longer carries any survival field.


def test_long_neglected_spirit_is_never_ailing_or_dead(client, db_session):
    """Even after long, total neglect (a baseline well past any old decay window), the spirit reads
    calm and alive: its needs are floored at the content tier, and the response carries NO
    dead/ailing/died_at fields (ADR-0031)."""
    _auth(client, "never_mortal@example.com")
    user_id = _user_id(db_session, "never_mortal@example.com")
    assert _choose(client, "stillness").status_code == 200
    # Far past any historical decay/death window — would have been "dead" under ADR-0029.
    _backdate_baseline(db_session, user_id, days_ago=DECAY_DAYS + 100)

    body = _spirit(client)
    # The survival fields are gone from the contract.
    assert "dead" not in body
    assert "ailing" not in body
    assert "died_at" not in body
    # The condition is floored at the calm content tier — never empty, never alarming.
    assert body["condition"]["factor"] == NEEDS_FLOOR
    assert body["condition"]["tier"] == CONDITION_CONTENT
    for need in NEED_KEYS:
        assert body["needs"][need]["factor"] >= NEEDS_FLOOR
        assert body["needs"][need]["tier"] in (CONDITION_CONTENT, CONDITION_THRIVING)


def test_no_died_at_column_on_the_model():
    """ADR-0031 dropped the `died_at` column — the model no longer has the attribute."""
    assert not hasattr(Spirit, "died_at")


def test_practice_lifts_a_floored_need_back_up(client, db_session):
    """A long-neglected (floored) spirit brightens the instant you practise — its nourished rises
    from the floor toward full after a recent signature sit (ADR-0031: it eases down and brightens
    back up, never lost)."""
    _auth(client, "never_mortal_recover@example.com")
    user_id = _user_id(db_session, "never_mortal_recover@example.com")
    assert _choose(client, "stillness").status_code == 200
    _backdate_baseline(db_session, user_id, days_ago=DECAY_DAYS + 100)
    assert _spirit(client)["needs"]["nourished"]["factor"] == NEEDS_FLOOR

    # A breathing sit today (the Kapha creature's signature) refills nourished above the floor.
    _breathe(client, 30, day=date.today().isoformat())
    assert _spirit(client)["needs"]["nourished"]["factor"] > NEEDS_FLOOR


# --- Tend action (ADR-0031: Feed / Rest / Play — gentle, optional care) -------------------


def _tend(client, kind):
    return client.post("/api/v1/spirit/tend", json={"kind": kind})


def test_tend_feed_stamps_nourished_and_holds_the_floor(client, db_session):
    """`POST /spirit/tend {feed}` stamps nourished_tended_at and the need never reads below the
    gentle floor (ADR-0031: the floor sits above TEND_CAP, so tending is a purely-positive, optional
    touch that can't make a need worse)."""
    _auth(client, "tend_feed@example.com")
    user_id = _user_id(db_session, "tend_feed@example.com")
    assert _choose(client, "stillness").status_code == 200
    # Ease everything to the floor first.
    _backdate_baseline(db_session, user_id, days_ago=DECAY_DAYS + 0.5)
    assert _spirit(client)["needs"]["nourished"]["factor"] == NEEDS_FLOOR

    res = _tend(client, "feed")
    assert res.status_code == 200
    body = res.json()
    # The need stays at (at least) the floor; tending never lowers it.
    assert body["needs"]["nourished"]["factor"] >= NEEDS_FLOOR
    # The stamp persisted on the row.
    assert _active_spirit(db_session, user_id).nourished_tended_at is not None


def test_tend_rest_and_play_stamp_their_columns(client, db_session):
    """`rest` stamps rested_tended_at, `play` stamps joyful_tended_at (the kind→column mapping), and
    each leaves the need at or above the floor."""
    _auth(client, "tend_rest_play@example.com")
    user_id = _user_id(db_session, "tend_rest_play@example.com")
    assert _choose(client, "stillness").status_code == 200
    _backdate_baseline(db_session, user_id, days_ago=DECAY_DAYS + 0.5)

    rest = _tend(client, "rest").json()
    assert rest["needs"]["rested"]["factor"] >= NEEDS_FLOOR
    assert _active_spirit(db_session, user_id).rested_tended_at is not None
    play = _tend(client, "play").json()
    assert play["needs"]["joyful"]["factor"] >= NEEDS_FLOOR
    assert _active_spirit(db_session, user_id).joyful_tended_at is not None


def test_tend_rejects_unknown_kind_422(client):
    _auth(client, "tend_bad_kind@example.com")
    assert _choose(client, "stillness").status_code == 200
    assert client.post("/api/v1/spirit/tend", json={"kind": "hug"}).status_code == 422
    # Missing kind and unexpected fields are 422 too.
    assert client.post("/api/v1/spirit/tend", json={}).status_code == 422
    assert client.post(
        "/api/v1/spirit/tend", json={"kind": "feed", "x": 1}
    ).status_code == 422


def test_tend_always_succeeds_no_dead_state_to_block_it(client, db_session):
    """ADR-0031: there is no dead state, so a long-neglected spirit can always still be tended (the
    tend route never 409s on a 'dead' spirit — that path is gone)."""
    _auth(client, "tend_never_dead@example.com")
    user_id = _user_id(db_session, "tend_never_dead@example.com")
    assert _choose(client, "stillness").status_code == 200
    _backdate_baseline(db_session, user_id, days_ago=DECAY_DAYS + 100)

    assert _tend(client, "feed").status_code == 200


def test_tend_requires_auth(client):
    assert _tend(client, "feed").status_code == 401


def test_tend_is_user_scoped(client, db_session):
    """Tending only ever touches the authenticated user's own spirit. Two users tend independently;
    user A's feed doesn't stamp user B's row."""
    _auth(client, "tend_scope_a@example.com")
    a_id = _user_id(db_session, "tend_scope_a@example.com")
    assert _choose(client, "stillness").status_code == 200
    _auth(client, "tend_scope_b@example.com")
    b_id = _user_id(db_session, "tend_scope_b@example.com")
    assert _choose(client, "stillness").status_code == 200

    # User B (currently authed) feeds — only B's row is stamped.
    assert _tend(client, "feed").status_code == 200
    assert _active_spirit(db_session, b_id).nourished_tended_at is not None
    assert _active_spirit(db_session, a_id).nourished_tended_at is None


def test_tend_pathless_spark_is_fine(client, db_session):
    """Tending a pathless spark (no creature) still works — it just stamps the need (a pathless
    spark's needs read neutral regardless)."""
    _auth(client, "tend_pathless@example.com")
    user_id = _user_id(db_session, "tend_pathless@example.com")
    client.get("/api/v1/spirit")  # create the pathless spark
    assert _tend(client, "feed").status_code == 200
    assert _active_spirit(db_session, user_id).nourished_tended_at is not None


# --- Awaken is graduation-only (ADR-0031 removed the death-triggered awaken path) ----------


def test_neglected_non_radiant_spirit_cannot_awaken(client, db_session):
    """ADR-0031: a long-neglected (but never-dead) non-radiant spirit cannot awaken — awaken is now
    graduation-at-radiant ONLY; the death-triggered path is gone. So even a heavily-neglected spark
    is rejected with 409 (it must grow to radiant to graduate)."""
    _auth(client, "neglect_no_awaken@example.com")
    user_id = _user_id(db_session, "neglect_no_awaken@example.com")
    assert _choose(client, "stillness", name="Mori").status_code == 200
    _backdate_baseline(db_session, user_id, days_ago=DECAY_DAYS + 100)

    assert client.post("/api/v1/spirit/awaken").status_code == 409


def test_living_non_radiant_spirit_cannot_awaken(client, db_session):
    """A non-radiant spirit cannot awaken — radiant is the only gate (graduation)."""
    _auth(client, "awaken_living_early@example.com")
    assert _choose(client, "stillness").status_code == 200
    assert client.post("/api/v1/spirit/awaken").status_code == 409


def test_awaken_returns_a_pathless_spark(client, db_session):
    """After awaken the fresh spark is pathless again — so the user chooses a creature anew
    (ADR-0023's set-free → re-choose loop)."""
    _auth(client, "cond_awaken_pathless@example.com")
    _earn_to_level(client, 24)  # radiant
    _choose(client, "breath")
    fresh = client.post("/api/v1/spirit/awaken").json()
    assert fresh["path"] is None
    # And it can be chosen again on the new spark.
    assert _choose(client, "heart").status_code == 200


# --- ADR-0030: rebirth from a spark — growth on the spirit's OWN life ----------------------
#
# The spirit's stage / bond.level / unlock-LEVEL gates key off the SPIRIT-LEVEL: the XP earned
# SINCE `awakened_at` (this pet's own life), NOT the user's lifetime XP. COINS stay on the
# lifetime level (the account budget). To simulate a seasoned account whose spirit just awakened,
# we seed lots of past activity dated (both occurred_at AND created_at) BEFORE the spirit's
# `awakened_at`: that lifetime XP funds the coin budget, but it predates this spark's birth, so it
# doesn't count toward its growth. (Activity seeded via the API has created_at≈now, AFTER awaken,
# so it DOES grow the spirit — that's the first/never-died, backward-compatible case.)


def _seed_past_breathing(db_session, user_id, *, minutes_each, count, created_before):
    """Insert `count` resonance-breathing sessions whose occurred_at AND created_at are dated
    BEFORE `created_before` (so the `since=awakened_at` filter excludes them from the spirit's
    own-life XP, while they still count toward the user's lifetime XP / coin budget)."""
    from app.models.session import Session as SessionModel

    for i in range(count):
        # Spread the past sessions across distinct days well before the cutoff.
        when = created_before - timedelta(days=10 + i)
        db_session.add(
            SessionModel(
                user_id=user_id,
                type="resonance_breathing",
                duration_seconds=minutes_each * 60,
                occurred_at=when,
                created_at=when,
                inhale_seconds=6,
                exhale_seconds=6,
            )
        )
    db_session.commit()


def _set_awakened_now(db_session, user_id):
    """Stamp the active spirit's awakened_at (and needs baseline) to ~now, so its own-life XP
    window starts here — any activity created earlier is pre-birth and ignored for growth."""
    spirit = _active_spirit(db_session, user_id)
    spirit.awakened_at = datetime.now(UTC)
    spirit.needs_baseline_at = datetime.now(UTC)
    db_session.commit()


def test_seasoned_account_just_awakened_reads_as_spark(client, db_session):
    """A spirit awakened JUST NOW on a HIGH-lifetime-XP account reads as spark / bond level 1 —
    growth ignores pre-birth XP (ADR-0030)."""
    _auth(client, "rebirth_seasoned@example.com")
    user_id = _user_id(db_session, "rebirth_seasoned@example.com")
    # Create the spark, then bank a big pile of lifetime XP dated BEFORE its birth.
    assert client.get("/api/v1/spirit").status_code == 200
    now = datetime.now(UTC)
    _seed_past_breathing(db_session, user_id, minutes_each=200, count=30, created_before=now)
    _set_awakened_now(db_session, user_id)

    body = _spirit(client)
    # Stage + bond key off the SPIRIT-level (own life ≈ 0 XP) → spark, level 1.
    assert body["stage"] == "spark"
    assert body["bond"]["level"] == 1


def test_seasoned_just_awakened_keeps_lifetime_coin_budget(client, db_session):
    """COINS stay on the LIFETIME level: the same just-awakened-but-seasoned spirit still holds the
    full lifetime coin budget, not a spark's worth (ADR-0030 — keep your coin budget)."""
    _auth(client, "rebirth_coins@example.com")
    user_id = _user_id(db_session, "rebirth_coins@example.com")
    assert client.get("/api/v1/spirit").status_code == 200
    now = datetime.now(UTC)
    _seed_past_breathing(db_session, user_id, minutes_each=200, count=30, created_before=now)
    _set_awakened_now(db_session, user_id)

    # Read the lifetime level straight off the dashboard (the coin-budget basis).
    lifetime_level = client.get("/api/v1/dashboard/stats").json()["level"]
    assert lifetime_level >= 24  # the seed is enough to be a seasoned account

    body = _spirit(client)
    # A spark by growth, but the coin budget is lifetime_level × COINS_PER_LEVEL (coins_spent 0).
    assert body["bond"]["level"] == 1
    assert body["coins"] == lifetime_level * COINS_PER_LEVEL
    assert body["coins"] > 1 * COINS_PER_LEVEL  # NOT a spark's worth


def test_unlock_gates_use_spirit_level_not_lifetime(client, db_session):
    """The unlock-LEVEL gates use the SPIRIT-level: a young (just-awakened) spark sees a
    high-`unlock_level` option as locked ("reach level N"), even with plenty of coins (ADR-0030)."""
    _auth(client, "rebirth_gates@example.com")
    user_id = _user_id(db_session, "rebirth_gates@example.com")
    assert client.get("/api/v1/spirit").status_code == 200
    now = datetime.now(UTC)
    _seed_past_breathing(db_session, user_id, minutes_each=200, count=30, created_before=now)
    _set_awakened_now(db_session, user_id)
    _choose(client, "stillness", name="Spark")

    body = _spirit(client)
    # Plenty of coins (lifetime budget) but a young spark by growth.
    assert body["coins"] > 200
    # A high-unlock_level option (aura/aurora @ level 7) is NOT unlockable, with a level hint —
    # even though it's affordable. The gate is the SPIRIT-level (1), not the lifetime level.
    aurora = _option_state(body, "aura", "aurora")
    assert aurora["affordable"] is True
    assert aurora["unlockable"] is False
    assert aurora["unlock_hint"] == "Reach level 7"

    # And the write path refuses it too → CosmeticLocked (409), not InsufficientCoins.
    res = _unlock(client, "aura", "aurora")
    assert res.status_code == 409


def test_first_spark_grows_on_its_own_life(client, db_session):
    """A first/never-died spirit (awakened ≈ account start) grows on activity done AFTER awaken —
    backward-compatible: practice after birth raises the spirit-level/stage, enough advances it."""
    _auth(client, "rebirth_firstspark@example.com")
    # All earning happens via the API (created_at≈now, AFTER the spark's birth), so it grows.
    base = _spirit(client)
    assert base["bond"]["level"] == 1 and base["stage"] == "spark"

    body = _earn_to_level(client, 3)  # enough own-life XP to advance past spark → wisp
    assert body["bond"]["level"] >= 3
    assert body["stage"] == "wisp"


def test_long_awakened_spirit_reads_like_lifetime_level(client, db_session):
    """A spirit awakened LONG ago (so its life ≈ the account's lifetime) reads ≈ the lifetime level
    — backward-compatible (ADR-0030 point 4)."""
    _auth(client, "rebirth_oldspirit@example.com")
    user_id = _user_id(db_session, "rebirth_oldspirit@example.com")
    # Backdate the spark's birth far into the past, THEN earn (API activity, created_at≈now, well
    # after that ancient awaken) — so all of it falls inside the spirit's own life.
    assert client.get("/api/v1/spirit").status_code == 200
    spirit = _active_spirit(db_session, user_id)
    spirit.awakened_at = datetime.now(UTC) - timedelta(days=365)
    db_session.commit()

    _earn_to_level(client, 5)
    lifetime_level = client.get("/api/v1/dashboard/stats").json()["level"]
    body = _spirit(client)
    # Own-life XP ≈ lifetime XP (all activity is after the ancient awaken), so the levels match.
    assert body["bond"]["level"] == lifetime_level


# --- Cosmetics economy (ADR-0024: committed upgrades, stored spend ledger) --------------
#
# Buying a cosmetic drops the derived coin balance (now `level × COINS_PER_LEVEL −
# coins_spent`) by the FULL option cost and adds it to the stored, monotonic `coins_spent`
# ledger; the option shows `applied` and its slot LOCKS (no swap / re-buy). Costs/unlock
# levels come from the in-code SPIRIT_COSMETICS_CATALOG.

# Non-consecutive days so earning lots of coins never accrues a streak (streak-bonus XP is
# excluded from the earned XP that funds coins) and never depends on the current date.
_EARN_DAYS = [
    "2026-01-01", "2026-01-05", "2026-01-09", "2026-01-13", "2026-01-17",
    "2026-01-21", "2026-01-25", "2026-01-29", "2026-02-02", "2026-02-06",
    "2026-02-10", "2026-02-14", "2026-02-18", "2026-02-22", "2026-02-26",
    "2026-03-02", "2026-03-06", "2026-03-10", "2026-03-14", "2026-03-18",
    "2026-03-22", "2026-03-26", "2026-03-30", "2026-04-03", "2026-04-07",
    "2026-04-11", "2026-04-15", "2026-04-19", "2026-04-23", "2026-04-27",
    "2026-05-01", "2026-05-05", "2026-05-09", "2026-05-13", "2026-05-17",
]


def _earn_to_level(client, target_level):
    """Practice long, full-rate sits across distinct (non-consecutive) days until the spirit
    reports >= target_level. Uses resonance breathing (the higher-XP practice) so even the
    radiant gate (level 24) is reachable within the earn-day list. Each 200-min sit pays the
    front-loaded curve once per day; we stop once the level is reached."""
    for day in _EARN_DAYS:
        _breathe(client, 200, day=day)
        if _spirit(client)["bond"]["level"] >= target_level:
            break
    return _spirit(client)


def _cost(slot, option):
    return SPIRIT_COSMETICS_CATALOG[slot][option]["cost"]


def _equipped(body, slot):
    """The option currently EQUIPPED in `slot` per the GET `available` catalog state (ADR-0027)."""
    for s in body["available"]:
        if s["slot"] == slot:
            return s["equipped"]
    return None


def _option_state(body, slot, option):
    """The per-option state dict (cost / tier / owned / equipped / unlockable / affordable) for
    one catalog option in the GET `available` shape (ADR-0027)."""
    for s in body["available"]:
        if s["slot"] == slot:
            for o in s["options"]:
                if o["option"] == option:
                    return o
    return None


def _unlock(client, slot, option):
    """Unlock (+ auto-equip) a cosmetic — the ADR-0027 replacement for buying."""
    return client.post("/api/v1/spirit/cosmetics", json={"slot": slot, "option": option})


def _equip(client, slot, option):
    """Equip an owned cosmetic (or clear the slot with option=None) — free (ADR-0027)."""
    return client.post("/api/v1/spirit/cosmetics/equip", json={"slot": slot, "option": option})


def test_catalog_is_exposed_in_get(client):
    _auth(client, "cosmetics_catalog@example.com")
    body = _spirit(client)
    slots = {s["slot"] for s in body["available"]}
    assert slots == set(SPIRIT_COSMETICS_CATALOG)
    # Every catalog option is surfaced with its state hints; a fresh spirit has nothing equipped
    # and owns nothing, and slots no longer carry a `locked` flag (ADR-0027 removed it).
    for s in body["available"]:
        assert s["equipped"] is None
        assert "locked" not in s
        opts = {o["option"] for o in s["options"]}
        assert opts == set(SPIRIT_COSMETICS_CATALOG[s["slot"]])
        for o in s["options"]:
            assert o["equipped"] is False
            assert o["owned"] is False
            # The tier is surfaced, matching the catalog.
            assert o["tier"] == SPIRIT_COSMETICS_CATALOG[s["slot"]][o["option"]]["tier"]
    assert body["collection"] == []


# The cosmetic slot mechanic is generic — it iterates SPIRIT_COSMETICS_CATALOG — so the two new
# cosmetic slots (`weather`, the drifting ambient overlay; `ground`, the foreground base strip)
# must flow through the available catalog AND the choose preview automatically, and must honour
# the same per-option invariants (a valid `need` + a tier) as every other slot. These are the
# UNIVERSAL options of each new slot — each slot also carries three PATH-EXCLUSIVE tier-3 capstones
# (one per dosha), tested with the other per-path cosmetics below.
_NEW_SLOTS = {
    "weather": {"petals", "mist", "rain", "leaffall", "snow", "fireflies"},
    "ground": {"grass", "pebbles", "clover", "mushrooms", "wildflowers", "crystals"},
}


def test_new_weather_and_ground_slots_are_in_the_catalog(client):
    """The two new slots appear in the static catalog with every UNIVERSAL option, each a
    well-formed `{cost, unlock_level, tier, need}` with a valid need + tier and no per_path."""
    for slot, options in _NEW_SLOTS.items():
        assert slot in SPIRIT_COSMETICS_CATALOG, f"missing new slot {slot}"
        # The universal options are all present (the slot also has the per-path capstones).
        assert options <= set(SPIRIT_COSMETICS_CATALOG[slot])
        for option in options:
            spec = SPIRIT_COSMETICS_CATALOG[slot][option]
            # The generic invariants still hold for the universal options.
            assert spec["need"] in NEED_KEYS, f"{slot}.{option} has an invalid need"
            assert spec["tier"] in (1, 2, 3), f"{slot}.{option} has an invalid tier"
            assert spec["cost"] > 0
            assert spec["unlock_level"] >= 1
            # The universal options carry no path exclusivity.
            assert "per_path" not in spec, f"{slot}.{option} should be universal"


def test_new_slots_flow_through_available_catalog(client):
    """The GET `available` skill-tree (which iterates the catalog) surfaces both new slots, each
    universal option carrying the same shape (need + tier) as the existing slots."""
    _auth(client, "new_slots_available@example.com")
    body = _spirit(client)
    by_slot = {s["slot"]: s for s in body["available"]}
    for slot, options in _NEW_SLOTS.items():
        assert slot in by_slot, f"available is missing the new {slot} slot"
        opts = {o["option"]: o for o in by_slot[slot]["options"]}
        # Every universal option is present in the catalog state.
        assert options <= set(opts)
        for option in options:
            o = opts[option]
            assert o["need"] == SPIRIT_COSMETICS_CATALOG[slot][option]["need"]
            assert o["tier"] == SPIRIT_COSMETICS_CATALOG[slot][option]["tier"]


def test_new_slots_flow_through_choose_preview(client):
    """The read-only choose-page preview (also catalog-driven) lists both new slots for every
    path, with all options tier-ordered — the universal slots grow into the same tree per path
    (plus that path's own exclusive capstone)."""
    _auth(client, "new_slots_preview@example.com")
    body = client.get("/api/v1/spirit/preview").json()
    for path in _ALL_PATHS:
        by_slot = {s["slot"]: s for s in body[path]}
        for slot, options in _NEW_SLOTS.items():
            assert slot in by_slot, f"{path} preview missing the new {slot} slot"
            opts = {o["option"] for o in by_slot[slot]["options"]}
            # Every universal option grows into each path's tree.
            assert options <= opts
            tiers = [o["tier"] for o in by_slot[slot]["options"]]
            assert tiers == sorted(tiers), f"{path}/{slot} options not tier-ordered"


# The BODY cosmetics (the recolour + resize that change the creature ITSELF, not a layer drawn
# around it) are two more universal catalog slots, so they must flow through the SAME generic
# machinery as every other slot — exposed in the catalog + preview, unlockable + equippable,
# user-scoped — with the same per-option shape (cost + need + tier), and (being universal) no
# per_path key.
_BODY_SLOT_OPTIONS = {
    "palette": {"ember", "rose", "sage", "gold", "frost", "aqua", "dusk"},
    "size": {"tiny", "small", "large", "giant"},
}


def test_body_cosmetic_slots_are_in_the_catalog(client):
    """The two new BODY slots appear in the static catalog with every option, each a well-formed
    `{cost, unlock_level, tier, need}` with a valid need + tier, costing > 0, and universal (no
    per_path — any creature can recolour/resize)."""
    for slot, options in _BODY_SLOT_OPTIONS.items():
        assert slot in SPIRIT_COSMETICS_CATALOG, f"missing body slot {slot}"
        assert options == set(SPIRIT_COSMETICS_CATALOG[slot]), f"{slot} options drifted"
        for option in options:
            spec = SPIRIT_COSMETICS_CATALOG[slot][option]
            assert spec["need"] in NEED_KEYS, f"{slot}.{option} has an invalid need"
            assert spec["tier"] in (1, 2), f"{slot}.{option} should be tier 1 or 2"
            assert spec["cost"] > 0, f"{slot}.{option} must cost > 0"
            assert spec["unlock_level"] >= 1
            assert "per_path" not in spec, f"{slot}.{option} should be universal"


def test_body_slots_flow_through_available_and_preview(client):
    """The body slots surface in BOTH the GET `available` catalog (every option, tier-matching) and
    the read-only choose-page preview for every path (tier-ordered) — same as any other slot."""
    _auth(client, "body_slots_catalog@example.com")
    body = _spirit(client)
    by_slot = {s["slot"]: s for s in body["available"]}
    for slot, options in _BODY_SLOT_OPTIONS.items():
        assert slot in by_slot, f"available is missing the {slot} body slot"
        opts = {o["option"]: o for o in by_slot[slot]["options"]}
        assert options == set(opts), f"{slot} catalog options drifted"
        for option in options:
            assert opts[option]["tier"] == SPIRIT_COSMETICS_CATALOG[slot][option]["tier"]
    preview = client.get("/api/v1/spirit/preview").json()
    for path in _ALL_PATHS:
        by_slot_p = {s["slot"]: s for s in preview[path]}
        for slot, options in _BODY_SLOT_OPTIONS.items():
            assert slot in by_slot_p, f"{path} preview missing the {slot} body slot"
            opts = {o["option"] for o in by_slot_p[slot]["options"]}
            assert options <= opts
            tiers = [o["tier"] for o in by_slot_p[slot]["options"]]
            assert tiers == sorted(tiers), f"{path}/{slot} options not tier-ordered"


def test_unlock_and_equip_a_palette_and_a_size(client):
    """A user can unlock + equip a body RECOLOUR (palette) and a body RESIZE (size) through the
    existing unlock/equip machinery — they land in the equipped `cosmetics` loadout like any slot
    (a tier-1 palette + tier-1 size need no prereq chain)."""
    _auth(client, "body_unlock@example.com")
    _earn_to_level(client, 3)  # afford a tier-1 palette + a tier-1 size

    # Unlock (+ auto-equip) a tier-1 recolour and a tier-1 resize.
    assert _unlock(client, "palette", "ember").status_code == 200
    assert _unlock(client, "size", "large").status_code == 200
    body = _spirit(client)
    assert body["cosmetics"]["palette"] == "ember"
    assert body["cosmetics"]["size"] == "large"
    assert _option_state(body, "palette", "ember")["owned"] is True
    assert _option_state(body, "size", "large")["owned"] is True

    # Equip is free + only on OWNED options: swapping to an unowned palette 409s.
    assert _equip(client, "palette", "frost").status_code == 409
    # Clearing the size slot is free and leaves the palette equipped.
    cleared = _equip(client, "size", None)
    assert cleared.status_code == 200
    assert "size" not in cleared.json()["cosmetics"]
    assert cleared.json()["cosmetics"]["palette"] == "ember"


def test_body_cosmetics_are_user_scoped(client):
    """A palette/size unlocked by one user is NOT owned by another — the loadout is per-user."""
    _auth(client, "body_owner@example.com")
    _earn_to_level(client, 2)
    assert _unlock(client, "palette", "ember").status_code == 200
    assert _unlock(client, "size", "tiny").status_code == 200

    _auth(client, "body_other@example.com")
    body = _spirit(client)
    assert body["cosmetics"].get("palette") is None
    assert body["cosmetics"].get("size") is None
    assert _option_state(body, "palette", "ember")["owned"] is False
    assert _option_state(body, "size", "tiny")["owned"] is False


# --- The `form` (shape) body slot — per-path silhouette variants --------------------------
#
# `form` is a BODY cosmetic that changes the creature's SILHOUETTE (its trailing wisp/leg count +
# proportions), not just colour/size. Unlike palette/size it is PER-PATH: every option is exclusive
# to ONE dosha, so each creature sees + buys only ITS OWN shapes — Vata's airy wisps (heart),
# Pitta's blazes (breath), Kapha's still-life bodies (stillness). It is still a body cosmetic, NOT a
# signature capstone, so it stays OUTSIDE the signature set (total 7).
_FORM_OPTIONS_BY_PATH = {
    "heart": {"tendrils", "sleek", "billowy", "flurry", "streamer", "halo"},
    "breath": {"wildfire", "emberlit", "bonfire", "inferno", "flicker", "puff"},
    "stillness": {"cluster", "cairn", "orbital", "lotus", "enso", "prism"},
}
_FORM_OPTIONS = set().union(*_FORM_OPTIONS_BY_PATH.values())


def test_form_slot_is_in_the_catalog_per_path(client):
    """The `form` slot appears in the static catalog with every option a well-formed
    `{cost, unlock_level, tier, need, per_path}` — each EXCLUSIVE to exactly one dosha (Vata's
    wisps, Pitta's blazes, Kapha's still-life bodies), and option keys don't overlap across paths."""
    assert "form" in SPIRIT_COSMETICS_CATALOG, "missing the form slot"
    assert set(SPIRIT_COSMETICS_CATALOG["form"]) == _FORM_OPTIONS
    for path, options in _FORM_OPTIONS_BY_PATH.items():
        for option in options:
            spec = SPIRIT_COSMETICS_CATALOG["form"][option]
            assert spec["per_path"] == path, f"form/{option} must be {path}-exclusive"
            assert spec["need"] in NEED_KEYS, f"form/{option} has an invalid need"
            assert spec["tier"] in (1, 2), f"form/{option} should be tier 1 or 2"
            assert spec["cost"] > 0
            assert spec["unlock_level"] >= 1


def test_form_slot_available_only_for_matching_dosha(client):
    """Each `form` option is offered (`available: True`) ONLY to its own dosha; every other path
    sees it present but unavailable (the per-path machinery, no new code)."""
    for path in _ALL_PATHS:
        _auth(client, f"form_avail_{path}@example.com")
        assert _choose(client, path).status_code == 200
        body = _spirit(client)
        for option in _FORM_OPTIONS:
            opt = _option_state(body, "form", option)
            assert opt is not None, f"{option} missing from the {path} catalog"
            assert opt["available"] is (option in _FORM_OPTIONS_BY_PATH[path])


def test_form_slot_in_preview_fills_per_path(client):
    """The choose-page preview lists the `form` slot for every path (catalog-driven); each path's
    tree fills it with ONLY its own forms, flagged EXCLUSIVE, and none of the other paths'."""
    _auth(client, "form_preview@example.com")
    preview = client.get("/api/v1/spirit/preview").json()
    for path in _ALL_PATHS:
        by_slot = {s["slot"]: s for s in preview[path]}
        assert "form" in by_slot, f"{path} preview missing the form slot"
        opts = {o["option"]: o for o in by_slot["form"]["options"]}
        # This path's own forms are present and exclusive; no other path's forms appear.
        assert set(opts) == _FORM_OPTIONS_BY_PATH[path]
        for option in _FORM_OPTIONS_BY_PATH[path]:
            assert opts[option]["exclusive"] is True


def test_unlock_and_equip_a_form_per_path(client):
    """Each dosha can unlock + equip ITS OWN body SHAPE through the existing machinery — it lands in
    the equipped `cosmetics` loadout (a tier-1 form needs no prereq; the tier-2 form needs an owned
    tier-1 form of the same path first)."""
    # (path, tier-1 option, tier-2 option) — the tier-2 form's prereq is any owned tier-1 form.
    cases = [
        ("heart", "tendrils", "sleek"),
        ("breath", "wildfire", "bonfire"),
        ("stillness", "cluster", "orbital"),
    ]
    for path, tier1, tier2 in cases:
        _auth(client, f"form_unlock_{path}@example.com")
        assert _choose(client, path).status_code == 200
        _earn_to_level(client, 3)  # afford the tier-1 + tier-2 forms and clear the tier-2 L3 gate

        # Tier-1 form unlocks + auto-equips.
        res = _unlock(client, "form", tier1)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["cosmetics"]["form"] == tier1
        assert _equipped(body, "form") == tier1

        # Tier-2 form is now unlockable (its tier-1 prereq is the owned tier-1 form).
        res2 = _unlock(client, "form", tier2)
        assert res2.status_code == 200, res2.text
        assert res2.json()["cosmetics"]["form"] == tier2
        assert _spirit(client)["cosmetics"]["form"] == tier2


def test_unlock_and_equip_each_new_form_per_path(client):
    """Every NEW Vata + Kapha shape (flurry/streamer/halo and lotus/enso/prism) unlocks + equips
    through the existing machinery for its own dosha. The tier-1 forms are unlocked first, so by the
    time the tier-2 form (halo / prism) is reached its same-path tier-1 prereq is already owned."""
    # Ordered tier-1 → tier-1 → tier-2 so the tier-2 form's prereq is owned by the time it's reached.
    cases = [
        ("heart", ["flurry", "streamer", "halo"]),
        ("stillness", ["lotus", "enso", "prism"]),
    ]
    for path, options in cases:
        _auth(client, f"new_form_{path}@example.com")
        assert _choose(client, path).status_code == 200
        _earn_to_level(client, 3)  # afford every form + clear the tier-2 L3 gate
        for option in options:
            res = _unlock(client, "form", option)
            assert res.status_code == 200, res.text
            assert res.json()["cosmetics"]["form"] == option
            assert _spirit(client)["cosmetics"]["form"] == option


def test_cannot_unlock_another_paths_form_404(client):
    """A spirit can't buy another dosha's form — it isn't in its catalog → 404, no charge. (Each
    path is offered one of the OTHER two paths' tier-1 forms.)"""
    foreign = {"heart": "wildfire", "breath": "cluster", "stillness": "tendrils"}
    for path, option in foreign.items():
        _auth(client, f"form_wrongpath_{path}@example.com")
        assert _choose(client, path).status_code == 200
        _earn_to_level(client, 3)  # afford + level, so neither is the gate
        coins_before = _spirit(client)["coins"]
        res = _unlock(client, "form", option)
        assert res.status_code == 404, res.text
        after = _spirit(client)
        assert "form" not in after["cosmetics"]
        assert after["coins"] == coins_before  # no charge for the rejected unlock


def test_form_is_user_scoped(client):
    """A form unlocked by one spirit is NOT owned by another — the loadout is per-user. Covers a
    Pitta and a Kapha form (each user-scoped to its owner)."""
    for path, option in (("breath", "wildfire"), ("stillness", "cluster")):
        _auth(client, f"form_owner_{path}@example.com")
        assert _choose(client, path).status_code == 200
        _earn_to_level(client, 1)
        assert _unlock(client, "form", option).status_code == 200

        _auth(client, f"form_other_{path}@example.com")
        assert _choose(client, path).status_code == 200
        body = _spirit(client)
        assert body["cosmetics"].get("form") is None
        assert _option_state(body, "form", option)["owned"] is False


def test_form_slot_is_outside_the_signature_set(client):
    """`form` carries per-path options but is a BODY cosmetic, not a signature capstone: it has NO
    signature for any path, so the signature-set total stays 7 (not 8) for Vata."""
    for path in _ALL_PATHS:
        assert spirit_service._signature_option("form", path) is None
    # A full Vata signature loadout still totals 7 (form excluded), even though form has per-path opts.
    full = {
        slot: spirit_service._signature_option(slot, "heart")
        for slot in SPIRIT_COSMETICS_CATALOG
    }
    status = spirit_service._signature_set_bonus(full, "heart")
    assert status.total == 7


def test_available_options_unlockable_before_locked(client):
    """The Personalize panel orders each slot's options so currently-UNLOCKABLE ones lead and
    level/tier-locked ones trail (ADR-0027; ties broken by tier then cost). For a fresh level-1
    user the `aura` slot's tier-1 L1 options (`rose`/`ember`/`soft`/`warm`) are unlockable and
    must precede the L5 tier-2 `starlit` and the L2 tier-2 `frost` (neither level-eligible yet)."""
    _auth(client, "cosmetics_order@example.com")
    body = _spirit(client)
    assert body["bond"]["level"] == 1

    aura = next(s for s in body["available"] if s["slot"] == "aura")
    order = [o["option"] for o in aura["options"]]

    # Sanity: the fixture still has a tier-1 L1 option and the L5 tier-2 `starlit`.
    assert SPIRIT_COSMETICS_CATALOG["aura"]["rose"]["unlock_level"] == 1
    assert SPIRIT_COSMETICS_CATALOG["aura"]["starlit"]["unlock_level"] == 5

    # Every unlockable option precedes every non-unlockable one.
    unlockable = [o["option"] for o in aura["options"] if o["unlockable"]]
    locked = [o["option"] for o in aura["options"] if not o["unlockable"]]
    assert max(order.index(u) for u in unlockable) < min(order.index(x) for x in locked)
    # Concretely, the L1 `rose`/`ember` come before the L5 `starlit`.
    assert order.index("rose") < order.index("starlit")
    assert order.index("ember") < order.index("starlit")


def test_available_options_equipped_leads_then_cost(client):
    """The EQUIPPED option leads its slot; the remaining options are ordered by ownership then
    tier then cost (ADR-0027). Unlock the warm aura (cost 45) — it becomes equipped and must be
    first, with the cheaper tier-1 `soft` (30) still ordered ahead of the pricier `ember` (50)."""
    _auth(client, "cosmetics_order_equipped@example.com")
    assert _unlock(client, "aura", "warm").status_code == 200
    body = _spirit(client)

    aura = next(s for s in body["available"] if s["slot"] == "aura")
    order = [o["option"] for o in aura["options"]]
    assert order[0] == "warm"  # the equipped option leads
    # Among the remaining unlockable options, cheaper precedes pricier (soft 30 before ember 50).
    assert order.index("soft") < order.index("ember")


def test_unlock_cosmetic_happy_path(client):
    _auth(client, "cosmetics_unlock@example.com")
    before = _spirit(client)
    coins_before = before["coins"]

    res = _unlock(client, "aura", "soft")
    assert res.status_code == 200
    body = res.json()

    # Coins drop by exactly the option cost; the option is owned + auto-equipped.
    assert body["coins"] == coins_before - _cost("aura", "soft")
    assert body["cosmetics"]["aura"] == "soft"
    assert _equipped(body, "aura") == "soft"
    assert _option_state(body, "aura", "soft")["owned"] is True

    # And it persists on the next GET.
    assert _spirit(client)["cosmetics"]["aura"] == "soft"


def test_unlock_companion_firefly_equips(client):
    # The `companion` slot (the "friends" upgrade) unlocks like any other: firefly is
    # unlock_level 1. Companions are premium-priced (firefly 100 > a fresh level-1 balance of
    # 80), so earn a couple of levels first to afford it.
    _auth(client, "cosmetics_companion@example.com")
    _earn_to_level(client, 2)  # 2 × 80 = 160 coins, covers the firefly companion
    before = _spirit(client)
    coins_before = before["coins"]
    assert "companion" in {s["slot"] for s in before["available"]}

    res = _unlock(client, "companion", "firefly")
    assert res.status_code == 200
    body = res.json()
    assert body["coins"] == coins_before - _cost("companion", "firefly")
    assert body["cosmetics"]["companion"] == "firefly"
    assert _equipped(body, "companion") == "firefly"
    # Persists on the next GET.
    assert _spirit(client)["cosmetics"]["companion"] == "firefly"


def test_unlock_mount_cloud_equips(client):
    # The `mount` slot (the calm "vehicle" upgrade) unlocks like any other: cloud is
    # unlock_level 1 and affordable (cost 70 ≤ a fresh level-1 balance of 80).
    _auth(client, "cosmetics_mount@example.com")
    before = _spirit(client)
    coins_before = before["coins"]
    assert "mount" in {s["slot"] for s in before["available"]}

    res = _unlock(client, "mount", "cloud")
    assert res.status_code == 200
    body = res.json()
    assert body["coins"] == coins_before - _cost("mount", "cloud")
    assert body["cosmetics"]["mount"] == "cloud"
    assert _equipped(body, "mount") == "cloud"
    # Persists on the next GET.
    assert _spirit(client)["cosmetics"]["mount"] == "cloud"


def test_unlock_unknown_slot_or_option_404(client):
    _auth(client, "cosmetics_404@example.com")
    assert _unlock(client, "nope", "soft").status_code == 404
    assert _unlock(client, "aura", "nope").status_code == 404


def test_unlock_level_locked_option_409(client):
    # `starlit` aura unlocks at level 5; a fresh level-1 user can't unlock it.
    _auth(client, "cosmetics_locked@example.com")
    assert SPIRIT_COSMETICS_CATALOG["aura"]["starlit"]["unlock_level"] > 1
    res = _unlock(client, "aura", "starlit")
    assert res.status_code == 409


def test_unlock_unaffordable_409(client):
    # A fresh user has COINS_PER_LEVEL coins. Unlock items until the balance can't cover the
    # next one, then assert the unaffordable unlock is rejected.
    _auth(client, "cosmetics_broke@example.com")
    # COINS_PER_LEVEL (80) buys at most: aura soft (30) + ribbon (35) = 65; habitat meadow
    # (50) then no longer fits (15 left). Spend down, then try the meadow.
    assert _unlock(client, "aura", "soft").status_code == 200
    assert _unlock(client, "accessory", "ribbon").status_code == 200
    broke = _unlock(client, "habitat", "meadow")
    assert broke.status_code == 409
    # The failed unlock changed nothing.
    assert "habitat" not in _spirit(client)["cosmetics"]


def test_unlock_already_owned_is_409_and_does_not_recharge(client):
    """ADR-0027: owned is forever — re-unlocking an option the spirit already owns is a 409 (the
    free `equip` path is how you re-show it), and the spend ledger doesn't move."""
    _auth(client, "cosmetics_owned@example.com")
    _earn_to_level(client, 3)  # plenty of coins so affordability isn't the gate

    first = _unlock(client, "aura", "soft")
    assert first.status_code == 200
    body = first.json()
    assert _equipped(body, "aura") == "soft"
    # Slots no longer carry a `locked` flag (ADR-0027).
    slot = next(s for s in body["available"] if s["slot"] == "aura")
    assert "locked" not in slot
    coins_after_first = body["coins"]

    # Re-unlocking the SAME (now-owned) option is a 409; no second charge.
    assert _unlock(client, "aura", "soft").status_code == 409
    after = _spirit(client)
    assert after["cosmetics"]["aura"] == "soft"
    assert after["coins"] == coins_after_first


def test_unlock_swaps_freely_across_owned_options_in_a_slot(client):
    """ADR-0027 replaces the old slot-lock: a DIFFERENT tier-1 option in the same slot is still
    unlockable (and equipping owned options is free), so a slot is a collection, not a one-shot."""
    _auth(client, "cosmetics_swap@example.com")
    _earn_to_level(client, 3)  # plenty of coins

    assert _unlock(client, "aura", "soft").status_code == 200
    # A second tier-1 aura is unlockable (no slot-lock); unlocking it auto-equips it.
    res = _unlock(client, "aura", "warm")
    assert res.status_code == 200
    body = res.json()
    assert _equipped(body, "aura") == "warm"
    # Both are now owned.
    assert _option_state(body, "aura", "soft")["owned"] is True
    assert _option_state(body, "aura", "warm")["owned"] is True
    # Re-equipping the first owned option is free and instant.
    back = _equip(client, "aura", "soft")
    assert back.status_code == 200
    assert _equipped(back.json(), "aura") == "soft"


def test_coins_spent_ledger_only_grows_and_drives_balance(client, db_session):
    """The stored `coins_spent` ledger (ADR-0024) only GROWS as cosmetics are unlocked, and the
    coin balance is exactly `level × COINS_PER_LEVEL − coins_spent`."""
    _auth(client, "cosmetics_ledger@example.com")
    user_id = _user_id(db_session, "cosmetics_ledger@example.com")
    _earn_to_level(client, 3)

    level = _spirit(client)["bond"]["level"]
    soft = _cost("aura", "soft")
    halo = _cost("accessory", "halo")

    assert _unlock(client, "aura", "soft").status_code == 200
    assert _stored_coins_spent(db_session, user_id) == soft

    assert _unlock(client, "accessory", "halo").status_code == 200
    # The ledger grew by the full second cost.
    assert _stored_coins_spent(db_session, user_id) == soft + halo
    # And the balance matches the formula exactly.
    body = _spirit(client)
    assert body["coins"] == level * COINS_PER_LEVEL - (soft + halo)


def test_owned_options_all_price_above_zero(client):
    """Catalog/spend-ledger invariant: every option a user can own must price > 0. The coin
    balance derives owned spend from SPIRIT_COSMETICS_CATALOG (`_option_cost` → 0 for missing
    keys), so dropping/renaming an owned key would silently refund its coins. This guards the
    catalog's append-only-for-owned-keys contract: a missing owned key would show as cost 0."""
    for slot, options in SPIRIT_COSMETICS_CATALOG.items():
        for option, spec in options.items():
            assert spec["cost"] > 0, f"{slot}.{option} must cost > 0 to stay in the ledger"


def test_buy_cosmetic_rejects_unexpected_fields(client):
    _auth(client, "cosmetics_extra@example.com")
    res = client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft", "x": 1}
    )
    assert res.status_code == 422


def test_buy_cosmetic_requires_auth(client):
    assert (
        client.post("/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}).status_code
        == 401
    )


# --- Path-exclusive companions (per_path catalog options) -------------------------------
#
# Three companions are PATH-EXCLUSIVE via a `per_path` key in the catalog: kitsune → breath
# (Pitta), tortoise → stillness (Kapha), crane → heart (Vata). Each is cost 220, unlock_level
# 6. They appear `available` ONLY for the matching path and can only be bought by it; the
# universal firefly/bird/cat stay available to every path.

# (slot, option, path) for each path-exclusive companion + its owning creature.
_PATH_COMPANIONS = [
    ("companion", "kitsune", "breath"),
    ("companion", "tortoise", "stillness"),
    ("companion", "crane", "heart"),
]

_ALL_PATHS = ["stillness", "breath", "heart"]


def test_path_companion_available_only_for_its_path(client):
    """A path-exclusive companion is offered (`available: True`) only to its matching creature;
    every other path (and the universal options) read correctly."""
    for slot, option, owner_path in _PATH_COMPANIONS:
        for path in _ALL_PATHS:
            email = f"avail_{option}_{path}@example.com"
            _auth(client, email)
            assert _choose(client, path).status_code == 200
            opt = _option_state(_spirit(client), slot, option)
            assert opt is not None, f"{option} missing from the {path} catalog"
            assert opt["available"] is (path == owner_path)


def test_universal_companions_available_to_every_path(client):
    """The universal firefly/bird/cat carry no `per_path`, so they stay `available` for all
    three creatures (and a path-exclusive option never hides them)."""
    for path in _ALL_PATHS:
        _auth(client, f"univ_companion_{path}@example.com")
        assert _choose(client, path).status_code == 200
        body = _spirit(client)
        for option in ("firefly", "bird", "cat"):
            opt = _option_state(body, "companion", option)
            assert opt is not None
            assert opt["available"] is True


def test_pathless_spark_sees_no_path_exclusive_companion(client):
    """A pathless spark matches no path, so every path-exclusive companion is unavailable to it
    (while the universal companions remain available)."""
    _auth(client, "pathless_companion@example.com")
    body = _spirit(client)  # never chose a path
    for _slot, option, _owner in _PATH_COMPANIONS:
        opt = _option_state(body, "companion", option)
        assert opt is not None
        assert opt["available"] is False
    assert _option_state(body, "companion", "firefly")["available"] is True


def test_unlock_matching_path_companion_succeeds_and_equips(client):
    """Unlocking the path-exclusive companion that matches the chosen path owns + equips it and
    charges its full cost (ADR-0027). These tier-3 capstones require an owned tier-2 companion
    (`bird`) first — the skill-tree prereq."""
    for _slot, option, owner_path in _PATH_COMPANIONS:
        email = f"buy_{option}@example.com"
        _auth(client, email)
        assert _choose(client, owner_path).status_code == 200
        _earn_to_level(client, 6)  # kitsune/tortoise/crane unlock at level 6
        # The capstones are tier 3 → climb the tree: tier-1 `firefly` then tier-2 `bird` first.
        assert _unlock(client, "companion", "firefly").status_code == 200, "tier-1 prereq"
        assert _unlock(client, "companion", "bird").status_code == 200, "tier-2 prereq"
        before = _spirit(client)
        coins_before = before["coins"]
        assert coins_before >= _cost("companion", option)

        res = _unlock(client, "companion", option)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["coins"] == coins_before - _cost("companion", option)
        assert body["cosmetics"]["companion"] == option
        assert _equipped(body, "companion") == option
        # No slot-lock flag anymore; it persists on the next GET.
        slot_state = next(s for s in body["available"] if s["slot"] == "companion")
        assert "locked" not in slot_state
        assert _spirit(client)["cosmetics"]["companion"] == option


def test_buy_non_matching_path_companion_is_rejected_404(client):
    """Buying a companion exclusive to a DIFFERENT path is rejected as an unknown cosmetic (404)
    — it isn't in this creature's catalog — and nothing is applied or charged."""
    # A Pitta (breath) spirit trying to buy the Kapha-only tortoise / Vata-only crane.
    _auth(client, "wrongpath_companion@example.com")
    assert _choose(client, "breath").status_code == 200
    _earn_to_level(client, 6)  # plenty of coins + the unlock level, so neither is the gate
    coins_before = _spirit(client)["coins"]

    for option in ("tortoise", "crane"):
        res = _unlock(client, "companion", option)
        assert res.status_code == 404, res.text

    after = _spirit(client)
    assert "companion" not in after["cosmetics"]
    assert after["coins"] == coins_before  # no charge for the rejected unlocks


def test_pathless_spark_cannot_unlock_a_path_exclusive_companion_404(client):
    """A pathless spark matches no path, so even a path-exclusive companion it could afford is a
    404 (it isn't in its catalog)."""
    _auth(client, "pathless_buy_companion@example.com")
    _earn_to_level(client, 6)  # afford + unlock, but never chose a path
    res = _unlock(client, "companion", "kitsune")
    assert res.status_code == 404


def test_universal_companion_still_unlockable_for_any_path(client):
    """Per-path exclusivity doesn't touch the universal companions: a creature on any path can
    still unlock firefly (the cheapest, tier-1, unlock_level 1)."""
    for path in _ALL_PATHS:
        _auth(client, f"univ_buy_{path}@example.com")
        assert _choose(client, path).status_code == 200
        _earn_to_level(client, 2)  # firefly costs 100; 2 levels = 160 coins
        res = _unlock(client, "companion", "firefly")
        assert res.status_code == 200, res.text
        assert res.json()["cosmetics"]["companion"] == "firefly"


# --- Name immutability + paid resets (ADR-0024) -----------------------------------------


def _stored_name(db_session):
    """The active spirit's stored name (not always in SpiritState — read the row directly)."""
    db_session.expire_all()
    return db_session.execute(
        select(Spirit.name).where(Spirit.retired_at.is_(None))
    ).scalars().first()


def test_free_rename_route_is_gone(client):
    """ADR-0024: the free PATCH /spirit rename is removed — the name is immutable except via a
    paid reset, so the old route 404/405s (never a 200)."""
    _auth(client, "rename_gone@example.com")
    res = client.patch("/api/v1/spirit", json={"name": "Ember"})
    assert res.status_code in {404, 405}


def test_reset_name_charges_and_sets_new_name(client, db_session):
    """reset-name changes the (otherwise immutable) name, charges RESET_COST against the
    balance, and adds it to the monotonic ledger (no refund)."""
    _auth(client, "reset_name@example.com")
    user_id = _user_id(db_session, "reset_name@example.com")
    _earn_to_level(client, 5)  # 5 × 80 = 400 coins, comfortably over RESET_COST
    _choose(client, "stillness", name="Old")
    before = _spirit(client)["coins"]
    spent_before = _stored_coins_spent(db_session, user_id)

    res = client.post("/api/v1/spirit/reset-name", json={"name": "  New  "})
    assert res.status_code == 200
    body = res.json()
    # The new (trimmed) name is set and echoed; coins dropped by exactly RESET_COST.
    assert body["name"] == "New"
    assert body["coins"] == before - RESET_COST
    assert _stored_name(db_session) == "New"
    assert _stored_coins_spent(db_session, user_id) == spent_before + RESET_COST


def test_reset_name_requires_a_valid_name_422(client):
    _auth(client, "reset_name_bad@example.com")
    _earn_to_level(client, 5)
    _choose(client, "stillness")
    assert client.post("/api/v1/spirit/reset-name", json={"name": "   "}).status_code == 422
    assert client.post("/api/v1/spirit/reset-name", json={"name": "x" * 41}).status_code == 422
    # Unexpected fields are rejected too.
    assert client.post(
        "/api/v1/spirit/reset-name", json={"name": "Ok", "x": 1}
    ).status_code == 422


def test_reset_name_insufficient_coins_409(client):
    """A fresh user (only COINS_PER_LEVEL = 80 coins) can't afford the 250 reset → 409, and the
    name is unchanged."""
    _auth(client, "reset_name_broke@example.com")
    _choose(client, "stillness", name="Keep")
    res = client.post("/api/v1/spirit/reset-name", json={"name": "Nope"})
    assert res.status_code == 409
    assert _spirit(client)["name"] == "Keep"


def test_reset_name_requires_auth(client):
    assert client.post("/api/v1/spirit/reset-name", json={"name": "Ember"}).status_code == 401


def test_reset_upgrades_route_is_gone(client):
    """ADR-0027 removes the paid upgrades-reset entirely — equipping owned options is now free,
    so the old route 404/405s (never a 200)."""
    _auth(client, "reset_upgrades_gone@example.com")
    res = client.post("/api/v1/spirit/reset-upgrades")
    assert res.status_code in {404, 405}


# --- Skill-tree tiers + free equip (ADR-0027) -------------------------------------------
#
# Each slot is a tree: tier 1 has no prerequisite; tier N>1 needs an owned option of tier N−1 in
# the same slot. Unlocking owns + auto-equips + charges + pampers; equipping owned options is free.


def test_tier_two_requires_an_owned_tier_one_in_the_slot(client):
    """A tier-2 option can't be unlocked until the spirit owns a tier-1 option in the SAME slot
    (ADR-0027). `frost` (aura tier 2, L2) is gated behind any owned tier-1 aura."""
    _auth(client, "tier2_gate@example.com")
    _earn_to_level(client, 5)  # past frost's L2 + plenty of coins, so tier is the only gate
    assert SPIRIT_COSMETICS_CATALOG["aura"]["frost"]["tier"] == 2
    assert SPIRIT_COSMETICS_CATALOG["aura"]["soft"]["tier"] == 1

    # With no owned tier-1 aura, frost is not unlockable → 409, and the GET marks it so.
    body = _spirit(client)
    assert _option_state(body, "aura", "frost")["unlockable"] is False
    assert _unlock(client, "aura", "frost").status_code == 409

    # Own a tier-1 aura → the tier-2 prereq is met and frost unlocks.
    assert _unlock(client, "aura", "soft").status_code == 200
    assert _option_state(_spirit(client), "aura", "frost")["unlockable"] is True
    assert _unlock(client, "aura", "frost").status_code == 200
    assert _spirit(client)["cosmetics"]["aura"] == "frost"  # auto-equipped


def test_tier_three_requires_an_owned_tier_two(client):
    """A tier-3 capstone needs an owned tier-2 in the slot, not just any tier-1 (ADR-0027).
    `night` (habitat tier 3, L7) needs a tier-2 habitat (`dusk`/`seaside`), and owning only a
    tier-1 (`meadow`) is not enough."""
    _auth(client, "tier3_gate@example.com")
    _earn_to_level(client, 7)  # past night's L7 + plenty of coins
    assert SPIRIT_COSMETICS_CATALOG["habitat"]["night"]["tier"] == 3
    assert SPIRIT_COSMETICS_CATALOG["habitat"]["dusk"]["tier"] == 2
    assert SPIRIT_COSMETICS_CATALOG["habitat"]["meadow"]["tier"] == 1

    # Owning only a tier-1 habitat does NOT satisfy the tier-3 prereq.
    assert _unlock(client, "habitat", "meadow").status_code == 200
    assert _option_state(_spirit(client), "habitat", "night")["unlockable"] is False
    assert _unlock(client, "habitat", "night").status_code == 409

    # Own a tier-2 habitat → night becomes unlockable.
    assert _unlock(client, "habitat", "dusk").status_code == 200
    assert _option_state(_spirit(client), "habitat", "night")["unlockable"] is True
    assert _unlock(client, "habitat", "night").status_code == 200


# --- Tier-4 legendary ultimates (the prestige endgame, one universal capstone per slot) -----
#
# Each of the 7 slots gains ONE tier-4 "legendary" option (PART 4a): the highest level + cost +
# richest art, universal (no per_path). The generic tier-prereq logic gates tier 4 automatically
# (a tier-4 needs an owned tier-3 in the SAME slot), so no new tier/unlock code is needed.

# {slot: (tier-4 legendary option, an owned tier-3 prereq in that slot)}. The tier-3 prereqs are
# universal options so any path can climb to them (no per_path on the legendary chain).
_LEGENDARY_TIER4 = {
    "aura": ("prismatic", "aurora"),
    "accessory": ("star_crown", "antlers"),
    "habitat": ("nebula", "starfall"),
    "companion": ("dragon", "owl"),
    "mount": ("comet", "crystal"),
    "weather": ("aurora_storm", "fireflies"),
    "ground": ("mandala", "crystals"),
}


def test_every_slot_has_one_universal_tier_four_legendary(client):
    """PART 4a: each of the 7 slots carries exactly the expected tier-4 legendary ultimate, each a
    well-formed `{cost, unlock_level, tier: 4, need}` — universal (no per_path), with a valid need,
    a high unlock_level, and a high cost — the prestige endgame option of the slot."""
    for slot, (option, _prereq) in _LEGENDARY_TIER4.items():
        assert slot in SPIRIT_COSMETICS_CATALOG, f"missing slot {slot}"
        assert option in SPIRIT_COSMETICS_CATALOG[slot], f"{slot} missing tier-4 {option}"
        spec = SPIRIT_COSMETICS_CATALOG[slot][option]
        assert spec["tier"] == 4, f"{slot}.{option} should be tier 4"
        assert spec["need"] in NEED_KEYS, f"{slot}.{option} has an invalid need"
        assert "per_path" not in spec, f"{slot}.{option} legendary must be universal"
        # The endgame tier: gated higher and pricier than the tier-3 capstones.
        assert spec["unlock_level"] >= 10, f"{slot}.{option} should gate high"
        assert spec["cost"] >= 350, f"{slot}.{option} should be the priciest in the slot"
        # Exactly ONE tier-4 option per slot (the single ultimate).
        tier4 = [o for o, s in SPIRIT_COSMETICS_CATALOG[slot].items() if s["tier"] == 4]
        assert tier4 == [option], f"{slot} should have exactly one tier-4 option"


def test_tier_four_is_the_top_tier_in_the_catalog(client):
    """Tier 4 is now the highest tier present anywhere in the catalog (so SpiritPage's generic
    tier rendering treats it as the new top/capstone row)."""
    max_tier = max(
        spec["tier"]
        for options in SPIRIT_COSMETICS_CATALOG.values()
        for spec in options.values()
    )
    assert max_tier == 4


def test_tier_four_legendary_requires_an_owned_tier_three(client):
    """A tier-4 legendary can't be unlocked until the spirit owns a tier-3 option in the SAME slot
    (PART 4a — the generic tier prereq handles tier 4). Owning the tier-1/tier-2 chain up to (but
    not including) the tier-3 is NOT enough; the tier-4 is locked + the unlock 409s. Use the aura
    slot: prismatic (tier 4) is gated behind the tier-3 aurora."""
    _auth(client, "tier4_gate@example.com")
    _earn_to_level(client, 10)  # past prismatic's L10 + plenty of coins, so tier is the only gate
    assert SPIRIT_COSMETICS_CATALOG["aura"]["prismatic"]["tier"] == 4
    assert SPIRIT_COSMETICS_CATALOG["aura"]["aurora"]["tier"] == 3

    # Climb the tier-1 → tier-2 chain but stop short of any tier-3: prismatic is NOT unlockable.
    assert _unlock(client, "aura", "soft").status_code == 200  # tier 1
    assert _unlock(client, "aura", "frost").status_code == 200  # tier 2
    assert _option_state(_spirit(client), "aura", "prismatic")["unlockable"] is False
    assert _unlock(client, "aura", "prismatic").status_code == 409

    # Own a tier-3 aura → the tier-4 prereq is met and prismatic unlocks + auto-equips.
    assert _unlock(client, "aura", "aurora").status_code == 200  # tier 3
    assert _option_state(_spirit(client), "aura", "prismatic")["unlockable"] is True
    assert _unlock(client, "aura", "prismatic").status_code == 200
    assert _spirit(client)["cosmetics"]["aura"] == "prismatic"  # auto-equipped


def test_high_level_spirit_owning_the_tier_three_can_unlock_each_tier_four(client):
    """A fresh, high-level spirit that owns a slot's tier-3 prereq can then unlock that slot's
    tier-4 legendary (PART 4a). Walks every slot with a FRESH spirit per slot (so coins reset and
    affordability never masks the prereq gate): climb to an owned tier-3, then the tier-4 reports
    unlockable and unlocks. Confirms the generic prereq chain reaches tier 4 in all 7 slots."""
    for slot, (legendary, tier3) in _LEGENDARY_TIER4.items():
        # A fresh, radiant-level spirit per slot: every unlock_level (≤ 10) is met and the whole
        # single-slot climb (tier1 → tier4) is comfortably affordable.
        _auth(client, f"tier4_climb_{slot}@example.com")
        _earn_to_level(client, 24)
        assert _choose(client, "stillness").status_code == 200

        # The tier-3 prereq's own chain: own any universal tier-1 then any universal tier-2 in the
        # slot so the tier-3 is unlockable, then own the tier-3 itself.
        for lower_tier in (1, 2):
            opt = next(
                o
                for o, s in SPIRIT_COSMETICS_CATALOG[slot].items()
                if s["tier"] == lower_tier and "per_path" not in s
            )
            assert _unlock(client, slot, opt).status_code == 200, f"{slot} tier-{lower_tier}"
        assert _unlock(client, slot, tier3).status_code == 200, f"{slot} tier-3 {tier3}"

        # With the tier-3 owned, the tier-4 legendary is unlockable and unlocks (auto-equips).
        assert _option_state(_spirit(client), slot, legendary)["unlockable"] is True, (
            f"{slot}.{legendary} should be unlockable once its tier-3 is owned"
        )
        assert _unlock(client, slot, legendary).status_code == 200, f"{slot} tier-4 {legendary}"
        assert _spirit(client)["cosmetics"][slot] == legendary


def test_unlock_owns_auto_equips_charges_and_pampers(client, db_session):
    """One unlock does all of ADR-0027's effects: the option is owned, auto-equipped, charged to
    the ledger, and the spirit is pampered (stamp + need recorded)."""
    _auth(client, "unlock_effects@example.com")
    user_id = _user_id(db_session, "unlock_effects@example.com")
    assert _choose(client, "stillness").status_code == 200
    coins_before = _spirit(client)["coins"]

    res = _unlock(client, "aura", "soft")
    assert res.status_code == 200
    body = res.json()
    # Owned + auto-equipped.
    assert _option_state(body, "aura", "soft")["owned"] is True
    assert body["cosmetics"]["aura"] == "soft"
    # Charged to the ledger.
    assert body["coins"] == coins_before - _cost("aura", "soft")
    assert _stored_coins_spent(db_session, user_id) == _cost("aura", "soft")
    # Pampered: stamp + the bought option's need recorded (soft favours rested).
    assert _stored_last_pampered_at(db_session, user_id) is not None
    assert _stored_last_pampered_need(db_session, user_id) == "rested"


def test_equip_is_free_owned_only_and_can_clear_and_swap(client, db_session):
    """Equip (ADR-0027) is FREE, only works on OWNED options, can CLEAR a slot, and can SWAP
    between owned options — none of it touches coins or the ledger."""
    _auth(client, "equip_flow@example.com")
    user_id = _user_id(db_session, "equip_flow@example.com")
    _earn_to_level(client, 3)  # afford two tier-1 auras

    # Equipping an UNOWNED option is rejected (409) and costs nothing.
    spent_before = _stored_coins_spent(db_session, user_id)
    assert _equip(client, "aura", "soft").status_code == 409
    assert _stored_coins_spent(db_session, user_id) == spent_before

    # Own two tier-1 auras.
    assert _unlock(client, "aura", "soft").status_code == 200
    assert _unlock(client, "aura", "warm").status_code == 200
    coins_after_unlocks = _spirit(client)["coins"]
    spent_after_unlocks = _stored_coins_spent(db_session, user_id)

    # Swap to the other owned option — free (no coin/ledger change).
    res = _equip(client, "aura", "soft")
    assert res.status_code == 200
    assert _equipped(res.json(), "aura") == "soft"
    assert res.json()["coins"] == coins_after_unlocks
    assert _stored_coins_spent(db_session, user_id) == spent_after_unlocks

    # Clear the slot — free; the slot reads empty but both options stay OWNED.
    cleared = _equip(client, "aura", None)
    assert cleared.status_code == 200
    body = cleared.json()
    assert "aura" not in body["cosmetics"]
    assert _equipped(body, "aura") is None
    assert _option_state(body, "aura", "soft")["owned"] is True
    assert _option_state(body, "aura", "warm")["owned"] is True
    assert body["coins"] == coins_after_unlocks


def test_equip_unknown_slot_or_mismatched_option_404(client):
    """Equip 404s on an unknown slot, and on an option that doesn't belong to the named slot
    (so a valid option can't be equipped into the wrong slot) — ADR-0027."""
    _auth(client, "equip_404@example.com")
    _earn_to_level(client, 3)
    # `soft` is an aura option, not an accessory — equipping it into `accessory` is a 404.
    assert _unlock(client, "aura", "soft").status_code == 200
    assert _equip(client, "nope", "soft").status_code == 404
    assert _equip(client, "accessory", "soft").status_code == 404


def test_equip_requires_auth(client):
    assert _equip(client, "aura", "soft").status_code == 401


def test_legacy_equipped_item_counts_as_owned(client, db_session):
    """ADR-0027 legacy bridge: a spirit whose item lives only in the equipped `cosmetics` map
    (not in `unlocked`) — the pre-feature state — still counts that item as OWNED, so it can be
    re-equipped for free and isn't re-unlockable."""
    _auth(client, "legacy_owned@example.com")
    user_id = _user_id(db_session, "legacy_owned@example.com")
    client.get("/api/v1/spirit")  # create the spark

    # Simulate a legacy row: equipped soft aura but an empty `unlocked` collection.
    spirit = db_session.execute(
        select(Spirit).where(Spirit.user_id == user_id, Spirit.retired_at.is_(None))
    ).scalar_one()
    spirit.cosmetics = {"aura": "soft"}
    spirit.unlocked = []
    db_session.commit()

    body = _spirit(client)
    # The equipped-only item reads as owned (the union with cosmetics.values()).
    assert _option_state(body, "aura", "soft")["owned"] is True
    assert _equipped(body, "aura") == "soft"
    # Re-unlocking it is rejected (already owned), so no double-charge.
    assert _unlock(client, "aura", "soft").status_code == 409
    # And it can be cleared then re-equipped for free (it's owned).
    assert _equip(client, "aura", None).status_code == 200
    assert _equip(client, "aura", "soft").status_code == 200
    assert _spirit(client)["cosmetics"]["aura"] == "soft"


# --- Awaken / collection (step 6) -------------------------------------------------------


def test_awaken_requires_radiant_409(client):
    # A fresh (non-radiant) spirit cannot awaken a new spark.
    _auth(client, "awaken_early@example.com")
    res = client.post("/api/v1/spirit/awaken")
    assert res.status_code == 409


def test_awaken_at_radiant_retires_old_and_creates_new_spark(client, db_session):
    _auth(client, "awaken_radiant@example.com")
    user_id = _user_id(db_session, "awaken_radiant@example.com")

    body = _earn_to_level(client, 24)  # radiant
    assert body["stage"] == "radiant"

    # Name the spirit (required at creation, ADR-0024) so we can confirm the retired collection
    # records it.
    _choose(client, "stillness", name="Lumen")

    res = client.post("/api/v1/spirit/awaken")
    assert res.status_code == 200
    fresh = res.json()
    # The new spark is pathless and unnamed; the collection now holds the old one.
    assert fresh["path"] is None
    assert len(fresh["collection"]) == 1
    retired = fresh["collection"][0]
    assert retired["stage"] == "radiant"
    assert retired["name"] == "Lumen"

    # Exactly one active spirit remains (the partial unique index guarantee).
    db_session.expire_all()
    assert _active_count(db_session, user_id) == 1
    # And a total of two rows: the active spark + the one retired.
    total = db_session.execute(
        select(func.count()).select_from(Spirit).where(Spirit.user_id == user_id)
    ).scalar_one()
    assert total == 2


def test_awaken_rejects_unexpected_fields(client):
    _auth(client, "awaken_extra@example.com")
    # A body with fields is rejected (the endpoint takes no body).
    res = client.post("/api/v1/spirit/awaken", json={"x": 1})
    # FastAPI 422s an unexpected JSON body against a no-body endpoint.
    assert res.status_code in {409, 422}


def test_awaken_requires_auth(client):
    assert client.post("/api/v1/spirit/awaken").status_code == 401


# --- Path-exclusive cosmetics across the other slots (aura/accessory/habitat/mount/weather/
# ground) ----------
#
# The same per_path mechanic now powers path-exclusive options in every cosmetic slot — one per
# dosha, each cost 220 / unlock_level 6. They appear `available` only for the matching path and
# can only be bought by it. weather and ground are the two newest slots, each with its own
# per-dosha tier-3 capstone (ember_drift/pollenfall/galeswirl; emberbed/stonegarden/cloudfloor).

# (slot, option, owning_path) for each path-exclusive option added across the slots.
_PATH_SLOT_COSMETICS = [
    ("aura", "emberflame", "breath"),
    ("aura", "grove", "stillness"),
    ("aura", "zephyr", "heart"),
    ("accessory", "ember_crown", "breath"),
    ("accessory", "mossy_circlet", "stillness"),
    ("accessory", "feather_plume", "heart"),
    ("habitat", "ember_canyon", "breath"),
    ("habitat", "misty_grove", "stillness"),
    ("habitat", "open_sky", "heart"),
    ("mount", "emberstone", "breath"),
    ("mount", "boulder", "stillness"),
    ("mount", "feather", "heart"),
    ("weather", "ember_drift", "breath"),
    ("weather", "pollenfall", "stillness"),
    ("weather", "galeswirl", "heart"),
    ("ground", "emberbed", "breath"),
    ("ground", "stonegarden", "stillness"),
    ("ground", "cloudfloor", "heart"),
]


def test_path_slot_cosmetic_available_only_for_its_path(client):
    """Every path-exclusive aura/accessory/habitat/mount is offered (`available: True`) only to
    its matching dosha, and is hidden from the other two paths."""
    for slot, option, owner_path in _PATH_SLOT_COSMETICS:
        for path in _ALL_PATHS:
            _auth(client, f"avail_{slot}_{option}_{path}@example.com")
            assert _choose(client, path).status_code == 200
            opt = _option_state(_spirit(client), slot, option)
            assert opt is not None, f"{slot}/{option} missing from the {path} catalog"
            assert opt["available"] is (path == owner_path)


# A universal tier-2 option per slot — owned first to satisfy the tier-3 capstone prereq.
_SLOT_TIER2_PREREQ = {
    "aura": "frost",
    "accessory": "scarf",
    "habitat": "dusk",
    "mount": "lotus",
    "weather": "rain",
    "ground": "clover",
}


def test_unlock_matching_path_slot_cosmetic_succeeds(client):
    """Each path-exclusive capstone (tier 3), unlocked on its matching path after owning a tier-1
    then a tier-2 in the slot, owns + equips into its slot (ADR-0027)."""
    for slot, option, owner_path in _PATH_SLOT_COSMETICS:
        _auth(client, f"buyslot_{slot}_{option}@example.com")
        assert _choose(client, owner_path).status_code == 200
        _earn_to_level(client, 6)  # unlock_level 6 + enough coins (6 × 80 = 480 > 220)
        # Climb the tree: a tier-1 then the universal tier-2 in this slot satisfy the tier-3 prereq.
        tier2 = _SLOT_TIER2_PREREQ[slot]
        assert SPIRIT_COSMETICS_CATALOG[slot][tier2]["tier"] == 2
        tier1 = next(
            o for o, spec in SPIRIT_COSMETICS_CATALOG[slot].items() if spec["tier"] == 1
        )
        assert _unlock(client, slot, tier1).status_code == 200, f"{slot}/{tier1} tier-1"
        assert _unlock(client, slot, tier2).status_code == 200, f"{slot}/{tier2} tier-2"
        res = _unlock(client, slot, option)
        assert res.status_code == 200, res.text
        assert res.json()["cosmetics"][slot] == option


def test_unlock_non_matching_path_slot_cosmetic_is_rejected_404(client):
    """A Pitta (breath) spirit cannot unlock any other path's exclusive option in any slot (the
    per-path gate is a 404, ahead of any tier check)."""
    _auth(client, "wrongpath_slots@example.com")
    assert _choose(client, "breath").status_code == 200
    _earn_to_level(client, 6)  # so neither coins nor the unlock level is the gate
    for slot, option, owner_path in _PATH_SLOT_COSMETICS:
        if owner_path == "breath":
            continue
        res = _unlock(client, slot, option)
        assert res.status_code == 404, f"{slot}/{option} should be 404 for a breath spirit"


# --- The read-only per-path tree PREVIEW for the choose page (GET /spirit/preview) -------
#
# A stateless, catalog-only preview of what each creature GROWS INTO: each path's slots with
# their options ordered by tier, including that path's own exclusive capstones and excluding the
# other paths' exclusives. No spirit row needed.

# The expected EXCLUSIVE tier-3 capstones (the per-path options) per path, by (slot, option) —
# one per slot, so every creature grows into seven path-exclusive capstones (one per cosmetic slot).
_PATH_EXCLUSIVES = {
    "breath": [
        ("aura", "emberflame"),
        ("accessory", "ember_crown"),
        ("habitat", "ember_canyon"),
        ("companion", "kitsune"),
        ("mount", "emberstone"),
        ("weather", "ember_drift"),
        ("ground", "emberbed"),
    ],
    "stillness": [
        ("aura", "grove"),
        ("accessory", "mossy_circlet"),
        ("habitat", "misty_grove"),
        ("companion", "tortoise"),
        ("mount", "boulder"),
        ("weather", "pollenfall"),
        ("ground", "stonegarden"),
    ],
    "heart": [
        ("aura", "zephyr"),
        ("accessory", "feather_plume"),
        ("habitat", "open_sky"),
        ("companion", "crane"),
        ("mount", "feather"),
        ("weather", "galeswirl"),
        ("ground", "cloudfloor"),
    ],
}


def test_preview_requires_auth(client):
    """The choose-page preview is auth-gated like the other spirit routes."""
    assert client.get("/api/v1/spirit/preview").status_code == 401


def test_preview_returns_all_three_paths_with_all_slots(client):
    """The preview returns every choosable path, each with all five cosmetic slots — so the
    choose page can fetch once and render every creature's tree."""
    _auth(client, "preview_shape@example.com")
    res = client.get("/api/v1/spirit/preview")
    assert res.status_code == 200
    body = res.json()
    assert set(body) == set(_ALL_PATHS)
    for path in _ALL_PATHS:
        slots = {s["slot"] for s in body[path]}
        assert slots == set(SPIRIT_COSMETICS_CATALOG)


def test_preview_options_are_tier_ordered(client):
    """Within each slot the preview lists options tier-ascending (the tree reads low → high)."""
    _auth(client, "preview_tiers@example.com")
    body = client.get("/api/v1/spirit/preview").json()
    for path in _ALL_PATHS:
        for slot in body[path]:
            tiers = [o["tier"] for o in slot["options"]]
            assert tiers == sorted(tiers), f"{path}/{slot['slot']} options not tier-ordered"


def test_preview_includes_own_exclusive_capstones_and_excludes_others(client):
    """Each path's preview includes ITS exclusive tier-3 capstones (flagged `exclusive`) and
    excludes the other paths' exclusives entirely."""
    _auth(client, "preview_exclusives@example.com")
    body = client.get("/api/v1/spirit/preview").json()

    def _slot_options(path, slot):
        return {o["option"]: o for o in next(s for s in body[path] if s["slot"] == slot)["options"]}

    for path, exclusives in _PATH_EXCLUSIVES.items():
        # This path's own exclusives are present and flagged exclusive + tier 3.
        for slot, option in exclusives:
            opts = _slot_options(path, slot)
            assert option in opts, f"{path} preview missing its own {slot}/{option}"
            assert opts[option]["exclusive"] is True
            assert opts[option]["tier"] == 3
        # The OTHER paths' exclusives never appear in this path's preview.
        for other, other_exclusives in _PATH_EXCLUSIVES.items():
            if other == path:
                continue
            for slot, option in other_exclusives:
                assert option not in _slot_options(path, slot), (
                    f"{path} preview should not include {other}'s {slot}/{option}"
                )


def test_preview_universal_options_are_not_exclusive(client):
    """Universal options (no per_path) appear in every path's preview and are never flagged
    exclusive — only the path's own capstones are."""
    _auth(client, "preview_universal@example.com")
    body = client.get("/api/v1/spirit/preview").json()
    for path in _ALL_PATHS:
        for slot in body[path]:
            for opt in slot["options"]:
                spec = SPIRIT_COSMETICS_CATALOG[slot["slot"]][opt["option"]]
                if "per_path" not in spec:
                    assert opt["exclusive"] is False
                    # Catalog facts are surfaced verbatim for the preview.
                    assert opt["cost"] == spec["cost"]
                    assert opt["unlock_level"] == spec["unlock_level"]
                    assert opt["need"] == spec["need"]


# --- ADR-0028: signature SET BONUS --------------------------------------------------------


def _full_signature_loadout(path):
    """Every slot equipped with `path`'s signature (path-exclusive tier-3 capstone) option — the
    COMPLETE signature set. Built straight from the catalog via the service helper."""
    return {
        slot: spirit_service._signature_option(slot, path)
        for slot in SPIRIT_COSMETICS_CATALOG
    }


# The DECORATIVE slots carry a per-path signature capstone (ADR-0028); the BODY-cosmetic slots
# (palette / size / form) change the CREATURE ITSELF, so they sit outside the signature set (the
# set-status helper skips them, keeping the total at 7). palette/size are universal recolour/resize;
# `form` is per-path (Vata-only shapes) but is still a body cosmetic, not a signature capstone, so it
# is excluded too (the service's `_NON_SIGNATURE_SLOTS`).
_BODY_SLOTS = {"palette", "size", "form"}
_SIGNATURE_SLOTS = [s for s in SPIRIT_COSMETICS_CATALOG if s not in _BODY_SLOTS]


def test_signature_option_is_the_path_exclusive_capstone_per_slot():
    """`_signature_option(slot, path)` returns the slot's path-exclusive option for that path, and
    None for a pathless spark. Every DECORATIVE slot has exactly one signature for a chosen path;
    the universal body slots (palette / size) have none."""
    for path in ("stillness", "breath", "heart"):
        for slot in _SIGNATURE_SLOTS:
            sig = spirit_service._signature_option(slot, path)
            assert sig is not None
            assert SPIRIT_COSMETICS_CATALOG[slot][sig].get("per_path") == path
        # The universal body slots have NO signature for any chosen path.
        for slot in _BODY_SLOTS:
            assert spirit_service._signature_option(slot, path) is None
        # A pathless spark has no signature in any slot.
        assert spirit_service._signature_option(slot, None) is None


def test_incomplete_set_is_inactive_status(db_session):
    """A 6/7 signature loadout → the set STATUS is INACTIVE (count 6, total 7). ADR-0029: the set
    bonus no longer affects needs, so this is purely the derived status object."""
    full = _full_signature_loadout("stillness")
    # Break ONE slot back to a universal option → 6/7, set incomplete.
    six_of_seven = dict(full)
    six_of_seven["aura"] = "soft"  # universal, NOT the stillness signature ("grove")

    status = spirit_service._signature_set_bonus(six_of_seven, "stillness")
    assert status.active is False
    assert status.kind is None
    assert status.count == 6
    assert status.total == 7


def test_complete_set_is_active_with_kind_signature():
    """A full 7/7 signature loadout → the set status is ACTIVE, kind 'signature', count == total."""
    full = _full_signature_loadout("breath")
    status = spirit_service._signature_set_bonus(full, "breath")
    assert status.active is True
    assert status.kind == "signature"
    assert status.count == 7
    assert status.total == 7
    assert status.label == "Signature radiance"


def test_complete_set_does_not_lift_needs(db_session):
    """ADR-0028's harmony lift stays removed (ADR-0029 → ADR-0031): cosmetics are purely cosmetic, so
    a spirit wearing the FULL signature set reads the SAME needs as a bare spirit (same activity).
    The `needs()` signature takes no cosmetics or set-bonus flag at all."""
    user = _make_user(db_session, "set_no_lift@example.com")
    now = datetime.now(UTC)
    # A recent baseline so the eased value (~0.9) sits ABOVE the floor — room for any lift to show,
    # if one existed; the floor isn't masking the value here.
    eased = now - timedelta(days=DECAY_DAYS * 0.1)
    # The `needs()` takes no cosmetics — the same call regardless of the loadout.
    decayed = _decayed_needs(db_session, "stillness", user.id, now=now, baseline=eased)
    for need in ("nourished", "rested", "joyful"):
        # value = 1 - 0.1 = 0.9, unaffected by any set (there's no set parameter anymore).
        assert abs(getattr(decayed, need).factor - 0.9) < 1e-9


def test_universal_option_in_a_slot_does_not_count_toward_the_set():
    """A UNIVERSAL (non-signature) option equipped in a slot does NOT count toward the set — only
    the path-exclusive signature option does."""
    # All slots signature EXCEPT one universal tier-3 option (aurora) in the aura slot.
    full = _full_signature_loadout("stillness")
    mixed = dict(full)
    mixed["aura"] = "aurora"  # universal tier-3, not the stillness signature
    status = spirit_service._signature_set_bonus(mixed, "stillness")
    assert status.active is False
    assert status.count == 6  # the aura slot's universal option doesn't count
    assert status.total == 7


def test_pathless_spark_has_no_set(db_session):
    """A pathless spark → no signature set: count 0, total 0, never active (and the needs read with
    no path gets neutral defaults regardless)."""
    status = spirit_service._signature_set_bonus({}, None)
    assert status.active is False
    assert status.count == 0
    assert status.total == 0
    # Even if (defensively) equipped with another path's signatures, a pathless spirit has no set.
    other = _full_signature_loadout("heart")
    assert spirit_service._signature_set_bonus(other, None).count == 0


def test_get_response_includes_set_bonus_shape(client):
    """The GET /spirit response exposes the derived `set_bonus` block (inactive for a fresh,
    un-decorated chosen creature)."""
    _auth(client, "set_shape@example.com")
    _choose(client, "stillness")
    body = _spirit(client)
    assert "set_bonus" in body
    sb = body["set_bonus"]
    assert sb["active"] is False
    assert sb["kind"] is None
    assert sb["count"] == 0
    assert sb["total"] == 7
    assert sb["label"] == "Signature radiance"


def test_get_response_set_bonus_active_when_full_set_equipped(db_session):
    """End-to-end through the read state: a spirit whose stored cosmetics ARE the full signature
    set reports `set_bonus.active` true with kind 'signature' (derived — no stored flag)."""
    user = _make_user(db_session, "set_e2e@example.com")
    spirit = spirit_service.get_or_create_active_spirit(db_session, user.id)
    spirit.path = "heart"
    spirit.cosmetics = _full_signature_loadout("heart")
    db_session.commit()

    state = spirit_service.get_spirit(db_session, user.id, today=date.today(), tz="UTC")
    assert state.set_bonus.active is True
    assert state.set_bonus.kind == "signature"
    assert state.set_bonus.count == 7
    assert state.set_bonus.total == 7
