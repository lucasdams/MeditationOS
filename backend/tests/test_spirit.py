"""Tests for the Spirit feature (docs/design/spirit.md, ADR-0022, ADR-0023, ADR-0024).

The spirit's state is computed on read from the user's earned-XP level; the only stored
state is the active spirit row (chosen path, name, applied cosmetics, and the monotonic
`coins_spent` ledger). Covered here:

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
- the cosmetics economy (ADR-0024) — buy at FULL cost; an applied slot LOCKS (no swap/re-buy);
  the stored `coins_spent` ledger only grows; and the catalog/cost invariant;
- the paid resets (ADR-0024) — reset-name (charges RESET_COST, sets a new name, 409 when
  broke) and reset-upgrades (charges RESET_COST, clears cosmetics with NO refund, 409 when
  nothing to reset / broke); the free PATCH rename is gone;
- and awaken / collection (radiant gate + retire+spark).
"""

from datetime import date, timedelta

from sqlalchemy import func, select

from app.models.spirit import Spirit
from app.services import spirit_service
from app.services.spirit_service import (
    COINS_PER_LEVEL,
    CONDITION_CONTENT,
    CONDITION_THRIVING,
    CONDITION_UNWELL,
    CONDITION_WINDOW_DAYS,
    RESET_COST,
    SPIRIT_COSMETICS_CATALOG,
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


def _needs(db_session, path, user_id, *, today=None, tz="UTC", current_streak=0):
    return spirit_service.needs(
        db_session,
        path,
        user_id,
        today=today or date.today(),
        tz=tz,
        current_streak=current_streak,
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


def _applied(body, slot):
    """The option currently applied in `slot` per the GET `available` catalog state."""
    for s in body["available"]:
        if s["slot"] == slot:
            return s["applied"]
    return None


def _option_state(body, slot, option):
    """The per-option state dict (cost / unlocked / affordable / applied) for one catalog
    option in the GET `available` shape."""
    for s in body["available"]:
        if s["slot"] == slot:
            for o in s["options"]:
                if o["option"] == option:
                    return o
    return None


def test_catalog_is_exposed_in_get(client):
    _auth(client, "cosmetics_catalog@example.com")
    body = _spirit(client)
    slots = {s["slot"] for s in body["available"]}
    assert slots == set(SPIRIT_COSMETICS_CATALOG)
    # Every catalog option is surfaced with its state hints, none applied on a fresh spirit,
    # and every slot reports unlocked (ADR-0024 `locked` flag) since nothing is applied yet.
    for s in body["available"]:
        assert s["applied"] is None
        assert s["locked"] is False
        opts = {o["option"] for o in s["options"]}
        assert opts == set(SPIRIT_COSMETICS_CATALOG[s["slot"]])
        for o in s["options"]:
            assert o["applied"] is False
    assert body["collection"] == []


def test_buy_cosmetic_happy_path(client):
    _auth(client, "cosmetics_buy@example.com")
    before = _spirit(client)
    coins_before = before["coins"]

    res = client.post("/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"})
    assert res.status_code == 200
    body = res.json()

    # Coins drop by exactly the option cost; the option is owned + shown applied.
    assert body["coins"] == coins_before - _cost("aura", "soft")
    assert body["cosmetics"]["aura"] == "soft"
    assert _applied(body, "aura") == "soft"

    # And it persists on the next GET.
    assert _spirit(client)["cosmetics"]["aura"] == "soft"


def test_buy_unknown_slot_or_option_404(client):
    _auth(client, "cosmetics_404@example.com")
    assert (
        client.post("/api/v1/spirit/cosmetics", json={"slot": "nope", "option": "soft"}).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "nope"}
        ).status_code
        == 404
    )


def test_buy_locked_option_409(client):
    # `starlit` aura unlocks at level 5; a fresh level-1 user can't apply it.
    _auth(client, "cosmetics_locked@example.com")
    assert SPIRIT_COSMETICS_CATALOG["aura"]["starlit"]["unlock_level"] > 1
    res = client.post("/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "starlit"})
    assert res.status_code == 409


def test_buy_unaffordable_409(client):
    # A fresh user has COINS_PER_LEVEL coins. Buy items until the balance can't cover the
    # next one, then assert the unaffordable purchase is rejected.
    _auth(client, "cosmetics_broke@example.com")
    # COINS_PER_LEVEL (80) buys at most: aura soft (30) + ribbon (35) = 65; habitat meadow
    # (50) then no longer fits (15 left). Spend down, then try the meadow.
    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).status_code == 200
    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "accessory", "option": "ribbon"}
    ).status_code == 200
    broke = client.post("/api/v1/spirit/cosmetics", json={"slot": "habitat", "option": "meadow"})
    assert broke.status_code == 409
    # The failed purchase changed nothing.
    assert "habitat" not in _spirit(client)["cosmetics"]


def test_applied_slot_is_locked_no_rebuy_or_swap(client):
    """ADR-0024: once a slot has an applied option it LOCKS — buying into it again (the same OR
    a different option) is a 409, the slot reads `locked`, and the spend ledger doesn't move."""
    _auth(client, "cosmetics_lock@example.com")
    _earn_to_level(client, 3)  # plenty of coins so affordability isn't the gate

    first = client.post("/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"})
    assert first.status_code == 200
    body = first.json()
    assert _applied(body, "aura") == "soft"
    # The slot now reports locked, and the (would-be cheaper/different) options can't be bought.
    slot = next(s for s in body["available"] if s["slot"] == "aura")
    assert slot["locked"] is True
    coins_after_first = body["coins"]

    # Re-buying the same option, or swapping to a different one in the locked slot, both 409.
    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).status_code == 409
    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "warm"}
    ).status_code == 409
    # Nothing changed: still `soft`, same balance (no second charge).
    after = _spirit(client)
    assert after["cosmetics"]["aura"] == "soft"
    assert after["coins"] == coins_after_first


def test_coins_spent_ledger_only_grows_and_drives_balance(client, db_session):
    """The stored `coins_spent` ledger (ADR-0024) only GROWS as upgrades are applied, and the
    coin balance is exactly `level × COINS_PER_LEVEL − coins_spent`."""
    _auth(client, "cosmetics_ledger@example.com")
    user_id = _user_id(db_session, "cosmetics_ledger@example.com")
    _earn_to_level(client, 3)

    level = _spirit(client)["bond"]["level"]
    soft = _cost("aura", "soft")
    halo = _cost("accessory", "halo")

    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).status_code == 200
    assert _stored_coins_spent(db_session, user_id) == soft

    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "accessory", "option": "halo"}
    ).status_code == 200
    # The ledger grew by the full second cost (no swap discounting across slots).
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


def test_reset_upgrades_charges_clears_and_does_not_refund(client, db_session):
    """The crux of ADR-0024: after buying a cosmetic then resetting upgrades, coins =
    before_buy − cost − RESET_COST. The cleared upgrade's cost stays SUNK (no refund), and the
    slot unlocks for a fresh buy."""
    _auth(client, "reset_upgrades@example.com")
    user_id = _user_id(db_session, "reset_upgrades@example.com")
    _earn_to_level(client, 5)
    before_buy = _spirit(client)["coins"]

    cost = _cost("aura", "soft")
    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).status_code == 200

    res = client.post("/api/v1/spirit/reset-upgrades")
    assert res.status_code == 200
    body = res.json()
    # Cosmetics cleared; the slot is unlocked again (not locked).
    assert body["cosmetics"] == {}
    assert _applied(body, "aura") is None
    assert _option_state(body, "aura", "soft")["applied"] is False
    # NO REFUND: the cosmetic cost AND the reset fee both stay sunk in the ledger.
    assert body["coins"] == before_buy - cost - RESET_COST
    assert _stored_coins_spent(db_session, user_id) == cost + RESET_COST


def test_reset_upgrades_nothing_to_reset_409(client, db_session):
    """With no cosmetics applied there's nothing to clear → 409, and no fee is charged (the
    ledger doesn't move)."""
    _auth(client, "reset_upgrades_empty@example.com")
    user_id = _user_id(db_session, "reset_upgrades_empty@example.com")
    _earn_to_level(client, 5)
    spent_before = _stored_coins_spent(db_session, user_id)

    res = client.post("/api/v1/spirit/reset-upgrades")
    assert res.status_code == 409
    # No coins spent — the fee is only charged when there's something to reset.
    assert _stored_coins_spent(db_session, user_id) == spent_before


def test_reset_upgrades_insufficient_coins_409(client):
    """A fresh user buys the cheapest aura (30 of 80 coins), leaving 50 < RESET_COST — so the
    upgrades reset is rejected and the cosmetic is left in place."""
    _auth(client, "reset_upgrades_broke@example.com")
    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).status_code == 200
    res = client.post("/api/v1/spirit/reset-upgrades")
    assert res.status_code == 409
    # The cosmetic is untouched (the failed reset changed nothing).
    assert _spirit(client)["cosmetics"]["aura"] == "soft"


def test_reset_upgrades_requires_auth(client):
    assert client.post("/api/v1/spirit/reset-upgrades").status_code == 401


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
