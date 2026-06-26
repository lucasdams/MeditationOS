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
    CONDITION_UNWELL,
    CONDITION_WINDOW_DAYS,
    NEED_KEYS,
    PAMPER_PRIMARY,
    PAMPER_SPILL,
    PAMPER_WINDOW_DAYS,
    PASSIVE_NEED_CAP,
    PASSIVE_PER_ITEM,
    RESET_COST,
    SET_HARMONY,
    SPIRIT_COSMETICS_CATALOG,
    stage_for_level,
)

# ADR-0025's PAMPER_BOOST was renamed to PAMPER_PRIMARY (the bought item's weighted buy-boost,
# ADR-0026). The legacy uniform-boost tests below still assert the full primary boost on every
# need (a row with no recorded need falls back to ADR-0025's uniform behaviour).
PAMPER_BOOST = PAMPER_PRIMARY


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
    SpiritState). NULL until the first cosmetic purchase."""
    db_session.expire_all()
    return db_session.execute(
        select(Spirit.last_pampered_at).where(
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


# --- The three tended needs (ADR-0023; demanding, visual-only care state) ----------------
#
# Each need is derived from the activity log over a rolling CONDITION_WINDOW_DAYS window:
# `nourished` from the chosen creature's SIGNATURE practice, `rested` from rhythm/consistency,
# `joyful` from variety. We call the service directly with an explicit `today` so the window
# lines up with the dated practice we log (and the test is date-independent).


def _recent_days(n):
    """`n` distinct recent days ending today, all inside the window — for logging practice
    that the rolling window will count."""
    today = date.today()
    return today, [today - timedelta(days=i) for i in range(n)]


def _needs(
    db_session,
    path,
    user_id,
    *,
    today=None,
    tz="UTC",
    current_streak=0,
    last_pampered_at=None,
    last_pampered_need=None,
    cosmetics=None,
):
    return spirit_service.needs(
        db_session,
        path,
        user_id,
        today=today or date.today(),
        tz=tz,
        current_streak=current_streak,
        last_pampered_at=last_pampered_at,
        last_pampered_need=last_pampered_need,
        cosmetics=cosmetics,
    )


def test_pathless_spark_has_neutral_needs(client, db_session):
    _auth(client, "needs_pathless@example.com")
    user_id = _user_id(db_session, "needs_pathless@example.com")
    client.get("/api/v1/spirit")  # create the spark
    n = _needs(db_session, None, user_id)
    # No creature chosen → no care requirement → every need is the neutral content-ish default.
    assert n.nourished.tier == CONDITION_CONTENT
    assert n.rested.tier == CONDITION_CONTENT
    assert n.joyful.tier == CONDITION_CONTENT
    # And the overall condition (the weakest need) is the same neutral default.
    assert spirit_service.overall_condition(n).tier == CONDITION_CONTENT


def test_nourished_rises_with_the_signature_practice(client, db_session):
    """A `stillness` (Kapha) creature's `nourished` thrives when fed enough recent BREATHING
    (its balancing practice) across distinct days."""
    _auth(client, "needs_nourish_rise@example.com")
    user_id = _user_id(db_session, "needs_nourish_rise@example.com")
    today, days = _recent_days(CONDITION_WINDOW_DAYS)
    for d in days:
        _breathe(client, 30, day=d.isoformat())  # breathing = the Kapha (stillness) creature's food
    n = _needs(db_session, "stillness", user_id, today=today)
    assert n.nourished.tier == CONDITION_THRIVING
    assert n.nourished.factor == 1.0


def test_energizing_breath_nourishes_the_kapha_creature(client, db_session):
    """Energizing breath is breathwork too: feeding a `stillness` (Kapha) creature enough
    recent energizing-breath days thrives its `nourished`, exactly like resonance does."""
    _auth(client, "needs_energize_kapha@example.com")
    user_id = _user_id(db_session, "needs_energize_kapha@example.com")
    today, days = _recent_days(CONDITION_WINDOW_DAYS)
    for d in days:
        _energize(client, 30, day=d.isoformat())  # energizing breath = Kapha's food too
    n = _needs(db_session, "stillness", user_id, today=today)
    assert n.nourished.tier == CONDITION_THRIVING
    assert n.nourished.factor == 1.0


def test_energizing_breath_does_not_nourish_the_vata_creature_as_meditation(client, db_session):
    """Energizing breath is breathwork, NOT meditation — so a `heart` (Vata) creature, whose
    food is non-breathing MEDITATION, stays at the `unwell` floor when fed only energizing
    breath. This guards the classifier: energizing must never count as meditation."""
    _auth(client, "needs_energize_vata@example.com")
    user_id = _user_id(db_session, "needs_energize_vata@example.com")
    today, days = _recent_days(CONDITION_WINDOW_DAYS)
    for d in days:
        _energize(client, 30, day=d.isoformat())  # breathwork, not the Vata creature's food
    n = _needs(db_session, "heart", user_id, today=today)
    assert n.nourished.tier == CONDITION_UNWELL


def test_nourished_declines_to_unwell_without_the_signature_practice(db_session):
    """No signature practice in the window → `nourished` declines to the `unwell` floor."""
    user = _make_user(db_session, "needs_nourish_decline@example.com")
    n = _needs(db_session, "stillness", user.id)
    assert n.nourished.tier == CONDITION_UNWELL


def test_other_practices_do_not_nourish_a_creature(client, db_session):
    """`nourished` is fed ONLY by the SIGNATURE practice: lots of meditation must not nourish a
    `stillness` (Kapha) creature — its food is energizing BREATHING, so it stays at the neglected
    floor. (Variety/rhythm may climb, but identity does not.)"""
    _auth(client, "needs_wrongfood@example.com")
    user_id = _user_id(db_session, "needs_wrongfood@example.com")
    today, days = _recent_days(CONDITION_WINDOW_DAYS)
    for d in days:
        _practice(client, 10, day=d.isoformat())  # meditation, not the Kapha creature's food
    n = _needs(db_session, "stillness", user_id, today=today)
    assert n.nourished.tier == CONDITION_UNWELL  # the wrong practice never nourishes it


def test_nourished_one_token_session_does_not_jump_to_thriving(client, db_session):
    """Demanding/slow-recovery: a single recent care day lifts `nourished` off the floor but
    NOT all the way to thriving — recovery reflects sustained recent practice."""
    _auth(client, "needs_token@example.com")
    user_id = _user_id(db_session, "needs_token@example.com")
    today = date.today()
    _breathe(client, 30, day=today.isoformat())  # one big breathing session, but only one care day
    n = _needs(db_session, "stillness", user_id, today=today)
    assert n.nourished.tier not in {CONDITION_THRIVING, CONDITION_CONTENT}
    assert n.nourished.factor < 1.0


def test_nourished_breath_counts_gratitude_and_journal(client, db_session):
    """The `breath` (Pitta) creature's signature practice is gratitude + journaling (its cooling
    balancing practice); a single reflection day is off the floor but not thriving (demanding
    day-distinct signal)."""
    _auth(client, "needs_pitta@example.com")
    user_id = _user_id(db_session, "needs_pitta@example.com")
    # Gratitude/journal stamp created_at = now, so they all land on today's window day.
    for _ in range(8):
        _gratitude(client)
        _journal(client)
    n = _needs(db_session, "breath", user_id)
    # Only one distinct care day (all today) → off the floor but not thriving.
    assert n.nourished.tier not in {CONDITION_THRIVING, CONDITION_CONTENT}
    assert n.nourished.tier != CONDITION_UNWELL


def test_rested_reflects_consistency(client, db_session):
    """`rested` tracks practice RHYTHM: enough distinct active days in the window thrives it,
    independent of WHICH practice (breathing here, on a stillness creature) — consistency, not
    identity. The current streak also feeds it."""
    _auth(client, "needs_rested@example.com")
    user_id = _user_id(db_session, "needs_rested@example.com")
    today, days = _recent_days(CONDITION_WINDOW_DAYS)
    for d in days:
        _breathe(client, 10, day=d.isoformat())  # a full week of active days
    n = _needs(db_session, "stillness", user_id, today=today)
    assert n.rested.tier == CONDITION_THRIVING

    # And a strong current streak alone reads as well-rested even before active-days fill.
    user2 = _make_user(db_session, "needs_rested_streak@example.com")
    streaked = _needs(db_session, "stillness", user2.id, current_streak=6)
    assert streaked.rested.tier == CONDITION_THRIVING


def test_rested_declines_without_recent_practice(db_session):
    """No recent active days and no streak → `rested` falls to the `unwell` floor."""
    user = _make_user(db_session, "needs_rested_decline@example.com")
    n = _needs(db_session, "stillness", user.id, current_streak=0)
    assert n.rested.tier == CONDITION_UNWELL


def test_joyful_reflects_variety(client, db_session):
    """`joyful` tracks VARIETY: practising all four distinct types (meditate / breathe /
    gratitude / journal) recently thrives it; doing only ONE type does not."""
    _auth(client, "needs_joyful@example.com")
    user_id = _user_id(db_session, "needs_joyful@example.com")
    today = date.today()
    # All four practice types, today (in-window).
    _practice(client, 5, day=today.isoformat())  # meditate
    _breathe(client, 5, day=today.isoformat())  # breathe
    _gratitude(client)  # gratitude
    _journal(client)  # journal
    n = _needs(db_session, "heart", user_id, today=today)
    assert n.joyful.tier == CONDITION_THRIVING

    # A user who only ever meditates has low variety — joyful stays off thriving.
    _auth(client, "needs_monotone@example.com")
    mono_id = _user_id(db_session, "needs_monotone@example.com")
    for d in _recent_days(CONDITION_WINDOW_DAYS)[1]:
        _practice(client, 10, day=d.isoformat())  # one type only
    mono = _needs(db_session, "heart", mono_id, today=today)
    assert mono.joyful.tier not in {CONDITION_THRIVING, CONDITION_CONTENT}


def test_overall_condition_is_the_weakest_need(client, db_session):
    """The overall `condition` summarises the three needs as their WEAKEST tier — so a single
    neglected need shows even if the others thrive."""
    _auth(client, "needs_overall@example.com")
    user_id = _user_id(db_session, "needs_overall@example.com")
    today, days = _recent_days(CONDITION_WINDOW_DAYS)
    # Feed ONLY meditation every day: a `stillness` (Kapha) creature is well-RESTED (consistency
    # counts any practice) but NOT nourished (its food is energizing breathing, not meditation).
    # So nourished is the floor and drives the overall condition.
    for d in days:
        _practice(client, 10, day=d.isoformat())
    n = _needs(db_session, "stillness", user_id, today=today)
    overall = spirit_service.overall_condition(n)
    assert n.nourished.tier == CONDITION_UNWELL  # the weakest need
    assert n.rested.tier == CONDITION_THRIVING  # a well-tended need
    assert overall.tier == n.nourished.tier  # overall = the weakest


def test_needs_never_change_coins_or_stage(client, db_session):
    """THE GUARDRAIL (ADR-0023): needs are visual-only. A fully-neglected creature (every need
    at `unwell`) has the SAME coins and stage as the moment it was earned — needs never reduce
    any progress."""
    _auth(client, "needs_guardrail@example.com")
    user_id = _user_id(db_session, "needs_guardrail@example.com")
    # Earn some coins/levels, then choose a creature and never feed it.
    _earn_to_level(client, 3)
    assert _choose(client, "stillness").status_code == 200

    before = _spirit(client)
    # Drive every need to the floor by computing them with a `today` far past any practice.
    far_future = date.today() + timedelta(days=400)
    floor = _needs(db_session, "stillness", user_id, today=far_future)
    assert floor.nourished.tier == CONDITION_UNWELL
    assert floor.rested.tier == CONDITION_UNWELL
    assert floor.joyful.tier == CONDITION_UNWELL

    after = _spirit(client)
    # Coins and stage are unchanged — derived from earned XP, never from any need.
    assert after["coins"] == before["coins"]
    assert after["stage"] == before["stage"]
    assert after["bond"]["level"] == before["bond"]["level"]


# --- Pamper boost (ADR-0025): buying perks the spirit up with a decaying needs boost --------
#
# Buying a cosmetic stamps `last_pampered_at`; the needs read then adds a DECAYING bonus to
# every need's factor — full right after the purchase, fading to 0 over PAMPER_WINDOW_DAYS. It
# is PARTIAL/CAPPED (can lift off the floor but not alone reach thriving) and VISUAL-ONLY (the
# ADR-0023 guardrail still holds: needs/condition never touch coins/stage/level/cosmetics).


def _aware_now():
    """A tz-aware 'now' (UTC) — what the DB stores for last_pampered_at. Passed straight to
    `needs(last_pampered_at=…)` so the boost reads as freshly pampered ('today')."""
    return datetime.now(UTC)


def _need_factors(n):
    """The three need factors as a tuple — handy for the boost comparisons."""
    return (n.nourished.factor, n.rested.factor, n.joyful.factor)


def test_pamper_boost_lifts_needs_above_the_unpampered_baseline(client, db_session):
    """A freshly-pampered spirit (last_pampered_at = today) reports HIGHER need factors than the
    SAME spirit with the SAME activity but un-pampered — the boost lifts every need."""
    _auth(client, "pamper_lift@example.com")
    user_id = _user_id(db_session, "pamper_lift@example.com")
    # A little (but not maxed) signature practice so the needs sit in the middle, with headroom
    # for the boost to show without clamping.
    today, days = _recent_days(3)
    for d in days:
        _breathe(client, 30, day=d.isoformat())  # feeds nourished (Kapha) + rested + joyful

    baseline = _needs(db_session, "stillness", user_id, today=today)
    pampered = _needs(
        db_session, "stillness", user_id, today=today, last_pampered_at=_aware_now()
    )

    # Every need's factor is strictly higher when freshly pampered.
    for b, p in zip(_need_factors(baseline), _need_factors(pampered), strict=True):
        assert p > b
    # And the boosted factor is exactly the baseline + PAMPER_BOOST, clamped at 1.0.
    assert pampered.nourished.factor == min(1.0, baseline.nourished.factor + PAMPER_BOOST)


def test_pamper_boost_decays_to_nothing_after_the_window(client, db_session):
    """The boost DECAYS: a spirit pampered PAMPER_WINDOW_DAYS ago (the window has fully elapsed)
    reads exactly like the un-pampered baseline — no lingering boost."""
    _auth(client, "pamper_decay@example.com")
    user_id = _user_id(db_session, "pamper_decay@example.com")
    today, days = _recent_days(3)
    for d in days:
        _breathe(client, 30, day=d.isoformat())

    baseline = _needs(db_session, "stillness", user_id, today=today)
    # Pampered exactly PAMPER_WINDOW_DAYS ago → factor 1 - days/window = 0 → no boost.
    stale = _aware_now() - timedelta(days=PAMPER_WINDOW_DAYS)
    decayed = _needs(
        db_session, "stillness", user_id, today=today, last_pampered_at=stale
    )
    assert _need_factors(decayed) == _need_factors(baseline)


def test_pamper_boost_is_partial_lifts_off_the_floor_but_not_to_thriving(db_session):
    """The boost is PARTIAL: a fully-neglected spirit (every need at the unwell floor) that's
    just pampered is lifted OFF the floor, but NOT all the way to thriving — practice is still
    required. Guards against a treat substituting for the work."""
    user = _make_user(db_session, "pamper_partial@example.com")
    floor = _needs(db_session, "stillness", user.id)  # no activity → all needs at the floor
    assert floor.nourished.tier == CONDITION_UNWELL
    assert floor.rested.tier == CONDITION_UNWELL
    assert floor.joyful.tier == CONDITION_UNWELL

    pampered = _needs(
        db_session, "stillness", user.id, last_pampered_at=_aware_now()
    )
    for need in (pampered.nourished, pampered.rested, pampered.joyful):
        # Lifted off the floor...
        assert need.factor > floor.nourished.factor
        assert need.tier != CONDITION_UNWELL
        # ...but a single treat can't reach thriving (factor stays < 1.0 with PAMPER_BOOST=0.35).
        assert need.tier != CONDITION_THRIVING
        assert need.factor < 1.0


def test_pamper_guardrail_buying_does_not_change_coins_or_stage_beyond_the_spend(
    client, db_session
):
    """THE GUARDRAIL still holds under ADR-0025: pampering (buying) lifts only the visual
    needs/condition. Coins drop by EXACTLY the option cost (the normal spend) and stage/level
    are untouched — the boost never adds or removes any progress."""
    _auth(client, "pamper_guardrail@example.com")
    user_id = _user_id(db_session, "pamper_guardrail@example.com")
    assert _choose(client, "stillness").status_code == 200

    before = _spirit(client)
    cost = _cost("aura", "soft")
    res = client.post("/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"})
    assert res.status_code == 200
    after = res.json()

    # The ONLY economic effect is the normal cosmetic spend; the pamper boost adds nothing.
    assert after["coins"] == before["coins"] - cost
    assert after["stage"] == before["stage"]
    assert after["bond"]["level"] == before["bond"]["level"]
    # The visual needs/condition may now read brighter (the boost) — but that's display-only.
    # Stamp was recorded so the needs read can apply the boost.
    assert _stored_last_pampered_at(db_session, user_id) is not None


def test_buy_cosmetic_stamps_last_pampered_at(client, db_session):
    """`buy_cosmetic` records `last_pampered_at` (NULL before the first purchase)."""
    _auth(client, "pamper_stamp@example.com")
    user_id = _user_id(db_session, "pamper_stamp@example.com")
    client.get("/api/v1/spirit")  # create the spark
    assert _stored_last_pampered_at(db_session, user_id) is None

    res = client.post("/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"})
    assert res.status_code == 200
    assert _stored_last_pampered_at(db_session, user_id) is not None


def test_name_reset_and_free_equip_do_not_pamper(client, db_session):
    """Only UNLOCKING pampers — the paid name reset and a FREE equip must NOT bump
    `last_pampered_at` (ADR-0025/0027). Unlock once to stamp it, then a name reset and a
    re-equip both leave the stamp at the unlock time."""
    _auth(client, "pamper_resets@example.com")
    user_id = _user_id(db_session, "pamper_resets@example.com")
    # Earn enough to afford the unlock + a RESET_COST name reset.
    _earn_to_level(client, 10)
    assert _choose(client, "stillness").status_code == 200

    assert _unlock(client, "aura", "soft").status_code == 200
    stamp_after_unlock = _stored_last_pampered_at(db_session, user_id)
    assert stamp_after_unlock is not None

    # A paid name reset does not pamper.
    assert client.post(
        "/api/v1/spirit/reset-name", json={"name": "Renamed"}
    ).status_code == 200
    assert _stored_last_pampered_at(db_session, user_id) == stamp_after_unlock

    # A free equip (re-equip the owned soft aura, then clear it) does not pamper either.
    assert _equip(client, "aura", "soft").status_code == 200
    assert _equip(client, "aura", None).status_code == 200
    assert _stored_last_pampered_at(db_session, user_id) == stamp_after_unlock


def test_awaken_does_not_pamper(client, db_session):
    """Awaken starts a fresh spark — it must not be born pampered (last_pampered_at stays NULL
    on the new active row)."""
    _auth(client, "pamper_awaken@example.com")
    user_id = _user_id(db_session, "pamper_awaken@example.com")
    _earn_to_level(client, 24)  # radiant
    _choose(client, "breath")
    assert client.post("/api/v1/spirit/awaken").status_code == 200
    assert _stored_last_pampered_at(db_session, user_id) is None


def test_pathless_spark_is_never_pampered(db_session):
    """A pathless spark keeps its neutral defaults even if a stray pamper stamp is passed — no
    boost on a creature-less spark (the neutral path returns before the boost is applied)."""
    user = _make_user(db_session, "pamper_pathless@example.com")
    n = _needs(db_session, None, user.id, last_pampered_at=_aware_now())
    assert n.nourished.tier == CONDITION_CONTENT
    assert n.rested.tier == CONDITION_CONTENT
    assert n.joyful.tier == CONDITION_CONTENT


# --- Per-item need affinities (ADR-0026): passive while-owned + weighted fading buy-boost ----
#
# Each catalog item FAVOURS one need (its `need`). Owning an item adds a small passive lift to
# that need (PASSIVE_PER_ITEM, capped at PASSIVE_NEED_CAP). Buying it stamps `last_pampered_need`
# so the decaying buy-boost is WEIGHTED toward that need (PAMPER_PRIMARY) with a smaller spillover
# to the other two (PAMPER_SPILL). A legacy row (last_pampered_at set, last_pampered_need None)
# still lifts all three (ADR-0025's uniform boost), so existing pampered spirits don't regress.


def _stored_last_pampered_need(db_session, user_id):
    """The active spirit's stored last-pampered need (ADR-0026) — read off the row (not in
    SpiritState). NULL until the first cosmetic purchase."""
    db_session.expire_all()
    return db_session.execute(
        select(Spirit.last_pampered_need).where(
            Spirit.user_id == user_id, Spirit.retired_at.is_(None)
        )
    ).scalar_one()


def test_every_catalog_option_has_a_need(client):
    """ADR-0026 invariant: EVERY catalog option declares which need it favours, and it must be
    one of the three valid need keys. A missing/invalid `need` is a bug."""
    for slot, options in SPIRIT_COSMETICS_CATALOG.items():
        for option, spec in options.items():
            assert "need" in spec, f"{slot}.{option} is missing a `need` affinity"
            need = spec["need"]
            assert need in NEED_KEYS, f"{slot}.{option} has an invalid need {need!r}"


def test_available_slots_response_includes_need_per_option(client):
    """The GET `available` catalog state exposes `need` on every option, matching the catalog —
    so the shop can tag which need each item favours."""
    _auth(client, "affinity_need_exposed@example.com")
    body = _spirit(client)
    for s in body["available"]:
        for o in s["options"]:
            assert "need" in o
            assert o["need"] == SPIRIT_COSMETICS_CATALOG[s["slot"]][o["option"]]["need"]


def test_passive_owned_item_raises_its_favoured_need(db_session):
    """An APPLIED item with need=rested raises the rested factor above an identical spirit with no
    cosmetics (the passive while-owned lift), and only the rested need moves."""
    user = _make_user(db_session, "affinity_passive@example.com")
    today, days = _recent_days(3)
    # A `frost` aura favours rested. Owning it should lift rested passively (no purchase stamp).
    assert SPIRIT_COSMETICS_CATALOG["aura"]["frost"]["need"] == "rested"

    bare = _needs(db_session, "stillness", user.id, today=today)
    owned = _needs(
        db_session, "stillness", user.id, today=today, cosmetics={"aura": "frost"}
    )
    # Rested is lifted by exactly one item's passive step (clamped at 1.0); the other two are
    # unchanged (no rested-favouring purchase, no other owned items).
    assert owned.rested.factor == min(1.0, bare.rested.factor + PASSIVE_PER_ITEM)
    assert owned.rested.factor > bare.rested.factor
    assert owned.nourished.factor == bare.nourished.factor
    assert owned.joyful.factor == bare.joyful.factor


def test_passive_lift_is_capped_per_need(db_session):
    """The passive per-need lift is capped at PASSIVE_NEED_CAP — owning many rested-favouring
    items can't lift rested beyond the cap above the base."""
    user = _make_user(db_session, "affinity_passive_cap@example.com")
    today, _ = _recent_days(3)
    bare = _needs(db_session, "stillness", user.id, today=today)
    # Four rested-favouring items (soft/frost auras can't coexist in one slot, so use one per
    # slot): aura frost, accessory scarf, habitat night, mount cloud — all need=rested.
    rested_items = {
        "aura": "frost",
        "accessory": "scarf",
        "habitat": "night",
        "mount": "cloud",
    }
    for slot, option in rested_items.items():
        assert SPIRIT_COSMETICS_CATALOG[slot][option]["need"] == "rested"
    owned = _needs(
        db_session, "stillness", user.id, today=today, cosmetics=rested_items
    )
    # Four items × PASSIVE_PER_ITEM (0.20) would exceed the 0.15 cap → lift is exactly the cap.
    assert owned.rested.factor == min(1.0, bare.rested.factor + PASSIVE_NEED_CAP)


def test_buyboost_is_weighted_toward_the_bought_items_need(db_session):
    """After buying a rested-affinity item, the rested need gets the LARGER buy-boost
    (PAMPER_PRIMARY) while the other two get the smaller spillover (PAMPER_SPILL) — and a
    nourished-affinity purchase favours nourished instead. Compared at the base factor (no owned
    items), so only the weighted buy-boost is in play."""
    user = _make_user(db_session, "affinity_buyboost@example.com")
    today, _ = _recent_days(3)
    bare = _needs(db_session, "stillness", user.id, today=today)

    # A rested-affinity purchase: rested gets PAMPER_PRIMARY, the others PAMPER_SPILL.
    rested = _needs(
        db_session,
        "stillness",
        user.id,
        today=today,
        last_pampered_at=_aware_now(),
        last_pampered_need="rested",
    )
    assert rested.rested.factor == min(1.0, bare.rested.factor + PAMPER_PRIMARY)
    assert rested.nourished.factor == min(1.0, bare.nourished.factor + PAMPER_SPILL)
    assert rested.joyful.factor == min(1.0, bare.joyful.factor + PAMPER_SPILL)
    # The favoured need is boosted strictly more than each other need's boost.
    rested_lift = rested.rested.factor - bare.rested.factor
    other_lift = rested.nourished.factor - bare.nourished.factor
    assert rested_lift > other_lift

    # A nourished-affinity purchase favours nourished instead (symmetry).
    nourished = _needs(
        db_session,
        "stillness",
        user.id,
        today=today,
        last_pampered_at=_aware_now(),
        last_pampered_need="nourished",
    )
    assert nourished.nourished.factor == min(1.0, bare.nourished.factor + PAMPER_PRIMARY)
    assert nourished.rested.factor == min(1.0, bare.rested.factor + PAMPER_SPILL)


def test_buyboost_spillover_still_helps_overall_condition(db_session):
    """Non-punishing: even the SPILLOVER lifts the other needs above the un-pampered baseline, so
    buying any item still helps overall condition somewhat (PAMPER_SPILL > 0)."""
    user = _make_user(db_session, "affinity_spill@example.com")
    today, _ = _recent_days(3)
    bare = _needs(db_session, "stillness", user.id, today=today)
    pampered = _needs(
        db_session,
        "stillness",
        user.id,
        today=today,
        last_pampered_at=_aware_now(),
        last_pampered_need="rested",
    )
    # The two NON-favoured needs are still strictly higher than the baseline (spillover helps).
    assert pampered.nourished.factor > bare.nourished.factor
    assert pampered.joyful.factor > bare.joyful.factor


def test_legacy_pampered_row_still_lifts_all_three_needs(db_session):
    """LEGACY FALLBACK (no regression): a row pampered BEFORE this feature has `last_pampered_at`
    set but `last_pampered_need` None. It still gets ADR-0025's UNIFORM boost — every need lifted
    by the full PAMPER_PRIMARY — so existing pampered spirits don't regress."""
    user = _make_user(db_session, "affinity_legacy@example.com")
    today, _ = _recent_days(3)
    bare = _needs(db_session, "stillness", user.id, today=today)
    legacy = _needs(
        db_session,
        "stillness",
        user.id,
        today=today,
        last_pampered_at=_aware_now(),
        last_pampered_need=None,  # legacy: stamped but no recorded need
    )
    for need in ("nourished", "rested", "joyful"):
        base = getattr(bare, need).factor
        lifted = getattr(legacy, need).factor
        assert lifted == min(1.0, base + PAMPER_PRIMARY)
        assert lifted > base


def test_buy_cosmetic_stamps_last_pampered_need(client, db_session):
    """`buy_cosmetic` records `last_pampered_need` = the bought option's catalog need (NULL before
    the first purchase). A `soft` aura favours rested."""
    _auth(client, "affinity_stamp_need@example.com")
    user_id = _user_id(db_session, "affinity_stamp_need@example.com")
    client.get("/api/v1/spirit")  # create the spark
    assert _stored_last_pampered_need(db_session, user_id) is None

    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).status_code == 200
    assert SPIRIT_COSMETICS_CATALOG["aura"]["soft"]["need"] == "rested"
    assert _stored_last_pampered_need(db_session, user_id) == "rested"


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


def test_signature_option_is_the_path_exclusive_capstone_per_slot():
    """`_signature_option(slot, path)` returns the slot's path-exclusive option for that path, and
    None for a pathless spark. Every slot has exactly one signature for a chosen path."""
    for path in ("stillness", "breath", "heart"):
        for slot in SPIRIT_COSMETICS_CATALOG:
            sig = spirit_service._signature_option(slot, path)
            assert sig is not None
            assert SPIRIT_COSMETICS_CATALOG[slot][sig].get("per_path") == path
        # A pathless spark has no signature in any slot.
        assert spirit_service._signature_option(slot, None) is None


def test_incomplete_set_is_inactive_and_does_not_lift_needs(db_session):
    """A 6/7 signature loadout → the set is INACTIVE (count 6, total 7) and the needs get NO set
    harmony lift (identical to the same spirit without the set)."""
    user = _make_user(db_session, "set_incomplete@example.com")
    today, _ = _recent_days(3)
    full = _full_signature_loadout("stillness")
    # Break ONE slot back to a universal option → 6/7, set incomplete.
    six_of_seven = dict(full)
    six_of_seven["aura"] = "soft"  # universal, NOT the stillness signature ("grove")

    status = spirit_service._signature_set_bonus(six_of_seven, "stillness")
    assert status.active is False
    assert status.kind is None
    assert status.count == 6
    assert status.total == 7

    # The needs read with set_bonus_active=False matches the same cosmetics with no set lift —
    # i.e. an incomplete set adds nothing beyond the (unchanged) passive item lifts.
    incomplete = _needs(
        db_session, "stillness", user.id, today=today, cosmetics=six_of_seven
    )
    no_set = spirit_service.needs(
        db_session,
        "stillness",
        user.id,
        today=today,
        tz="UTC",
        cosmetics=six_of_seven,
        set_bonus_active=False,
    )
    for need in ("nourished", "rested", "joyful"):
        assert getattr(incomplete, need).factor == getattr(no_set, need).factor


def test_complete_set_is_active_with_kind_signature():
    """A full 7/7 signature loadout → the set bonus is ACTIVE, kind 'signature', count == total."""
    full = _full_signature_loadout("breath")
    status = spirit_service._signature_set_bonus(full, "breath")
    assert status.active is True
    assert status.kind == "signature"
    assert status.count == 7
    assert status.total == 7
    assert status.label == "Signature radiance"


def test_complete_set_lifts_every_need_by_the_harmony(db_session):
    """With the full signature set, EACH need's factor is higher than the same spirit (same
    cosmetics) WITHOUT the set — the gentle SET_HARMONY lift (clamped at 1.0). Compared at the
    no-practice floor base, which leaves ample headroom for the lift to be strictly visible."""
    user = _make_user(db_session, "set_lift@example.com")
    full = _full_signature_loadout("stillness")

    without_set = spirit_service.needs(
        db_session,
        "stillness",
        user.id,
        today=date.today(),
        tz="UTC",
        cosmetics=full,
        set_bonus_active=False,
    )
    with_set = spirit_service.needs(
        db_session,
        "stillness",
        user.id,
        today=date.today(),
        tz="UTC",
        cosmetics=full,
        set_bonus_active=True,
    )
    for need in ("nourished", "rested", "joyful"):
        base = getattr(without_set, need).factor
        lifted = getattr(with_set, need).factor
        assert lifted == min(1.0, base + SET_HARMONY)
        assert lifted > base  # the floor base leaves room → the harmony strictly lifts each need


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
