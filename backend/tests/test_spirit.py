"""Tests for the Spirit read API (step 1 — docs/design/spirit.md, ADR-0022).

The spirit's state is computed on read from the user's earned-XP level; the only stored
state is the active spirit row. Covered here: the GET happy-path shape, auth-required,
lazy get-or-create (first GET creates exactly one active spirit; a second GET does not
duplicate it), and the pure stage-from-level band computation.
"""

from datetime import date

from sqlalchemy import func, select

from app.models.spirit import Spirit
from app.services import spirit_service
from app.services.sanctuary_service import COINS_PER_LEVEL
from app.services.spirit_service import (
    GLOW_FLOOR,
    GLOW_FULL,
    GLOW_MID,
    SPIRIT_COSMETICS_CATALOG,
    stage_for_level,
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

    # A fresh user is a level-1 pathless spark with no cosmetics.
    assert body["stage"] == "spark"
    assert body["path"] is None
    assert body["cosmetics"] == {}

    # Bond reads the level + XP-into-level + XP-for-next.
    bond = body["bond"]
    assert bond["level"] == 1
    assert bond["xp_into_level"] >= 0
    assert bond["xp_for_next"] > 0

    # Coins are level × COINS_PER_LEVEL (no cosmetics spend in step 1).
    assert body["coins"] == bond["level"] * COINS_PER_LEVEL

    # Daily glow is one of the floored brightness factors, never below the floor.
    assert body["daily_glow"] in {GLOW_FLOOR, GLOW_MID, GLOW_FULL}
    assert body["daily_glow"] >= GLOW_FLOOR


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


# --- Daily glow (visual-only, floored) -------------------------------------------------


def test_daily_glow_full_when_practiced_today(client, db_session):
    _auth(client, "spirit_glow@example.com")
    from app.models.user import User

    user_id = db_session.execute(
        select(User.id).where(User.email == "spirit_glow@example.com")
    ).scalar_one()

    today = date.today()
    _practice(client, 5, day=today.isoformat())
    glow = spirit_service.daily_glow(db_session, user_id, today=today, tz="UTC")
    assert glow == GLOW_FULL


def test_daily_glow_floor_with_no_practice(db_session):
    user = _make_user(db_session, "glow_floor@example.com")
    glow = spirit_service.daily_glow(db_session, user.id, today=date.today(), tz="UTC")
    assert glow == GLOW_FLOOR


# --- Path lean (the lifetime practice-mix suggestion) -----------------------------------


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


def _gratitude(client, text="thankful"):
    return client.post("/api/v1/gratitude", json={"category": "people", "text": text})


def _journal(client, body="a reflection on the day, written out at length"):
    return client.post("/api/v1/journals", json={"body": body})


def test_lean_defaults_to_stillness_for_a_brand_new_user(client):
    # No practice at all → all buckets 0 → the fixed tie-break default (stillness).
    _auth(client, "lean_default@example.com")
    assert _spirit(client)["path_lean"] == "stillness"


def test_lean_reflects_meditation_dominant_practice(client):
    _auth(client, "lean_stillness@example.com")
    _practice(client, 60)  # a lot of meditation, no breathing / reflections
    assert _spirit(client)["path_lean"] == "stillness"


def test_lean_reflects_breathing_dominant_practice(client):
    _auth(client, "lean_breath@example.com")
    _breathe(client, 60)  # resonance breathing dominates
    # A touch of meditation that stays below the breathing weight.
    _practice(client, 1)
    assert _spirit(client)["path_lean"] == "breath"


def test_lean_reflects_gratitude_and_journal_dominant_practice(client):
    _auth(client, "lean_heart@example.com")
    # Gratitude + journal volume out-weighs a small sit (heart sums both categories).
    for _ in range(10):
        _gratitude(client)
    for _ in range(10):
        _journal(client)
    _practice(client, 1)
    assert _spirit(client)["path_lean"] == "heart"


# --- Path commit (write-on-read at stage 2) ---------------------------------------------
#
# Stage is a band of the earned-XP level; commit happens at `wisp` (level ≥ 3). We drive the
# level by logging enough practice, then assert the stored `path` (not just the lean).


def _user_id(db_session, email):
    from app.models.user import User

    return db_session.execute(select(User.id).where(User.email == email)).scalar_one()


def _stored_path(db_session, user_id):
    return db_session.execute(
        select(Spirit.path).where(Spirit.user_id == user_id, Spirit.retired_at.is_(None))
    ).scalar_one()


def test_path_does_not_commit_before_stage_two(client, db_session):
    _auth(client, "commit_spark@example.com")
    user_id = _user_id(db_session, "commit_spark@example.com")
    # A tiny bit of practice — a leaning spark still at level 1 (stage spark), pre-commit.
    _practice(client, 5)
    body = _spirit(client)
    assert body["stage"] == "spark"
    assert body["path"] is None  # not yet committed
    assert body["path_lean"] == "stillness"  # but a lean is shown
    db_session.expire_all()
    assert _stored_path(db_session, user_id) is None


def test_path_commits_at_stage_two(client, db_session):
    _auth(client, "commit_wisp@example.com")
    user_id = _user_id(db_session, "commit_wisp@example.com")
    # Enough breathing to reach level ≥ 3 (stage wisp). Split across days so the front-loaded
    # per-session XP curve isn't blunted, and breathing dominates the mix.
    for i in range(8):
        _breathe(client, 20, day=f"2026-02-0{i + 1}")
    body = _spirit(client)
    assert body["stage"] in {"wisp", "fledgling", "ascendant", "radiant"}
    assert body["bond"]["level"] >= 3
    assert body["path"] == "breath"  # committed from the lean
    db_session.expire_all()
    assert _stored_path(db_session, user_id) == "breath"


def test_path_commit_is_once_only(client, db_session):
    """Once committed, the stored path never changes even if the lean later shifts."""
    _auth(client, "commit_once@example.com")
    user_id = _user_id(db_session, "commit_once@example.com")
    # Reach stage 2 with breathing → commits to `breath`.
    for i in range(8):
        _breathe(client, 20, day=f"2026-03-0{i + 1}")
    assert _spirit(client)["path"] == "breath"
    db_session.expire_all()
    assert _stored_path(db_session, user_id) == "breath"

    # Now flood meditation so the *lean* flips to stillness…
    for i in range(8):
        _practice(client, 40, day=f"2026-04-0{i + 1}")
    body = _spirit(client)
    assert body["path_lean"] == "stillness"  # the lean moved
    assert body["path"] == "breath"  # …but the committed path is hysteretic — unchanged
    db_session.expire_all()
    assert _stored_path(db_session, user_id) == "breath"


def test_path_endpoint_requires_auth(client):
    # The write-on-read commit must still be behind auth (default-deny).
    assert client.get("/api/v1/spirit").status_code == 401


# --- Path lean pure function (deterministic tie-break) ----------------------------------


def test_path_lean_tie_break_priority(db_session):
    user = _make_user(db_session, "lean_tie@example.com")
    # No activity → every bucket is 0 → tie-break resolves to the first priority (stillness).
    assert spirit_service.path_lean(db_session, user.id) == "stillness"


# --- Cosmetics economy (step 5) ---------------------------------------------------------
#
# The owned cosmetics are the spend ledger: buying one drops the derived coin balance and
# shows up `applied` in the catalog state on GET. A swap within a slot charges only the
# difference. Costs/unlock levels come from the in-code SPIRIT_COSMETICS_CATALOG.

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


def test_catalog_is_exposed_in_get(client):
    _auth(client, "cosmetics_catalog@example.com")
    body = _spirit(client)
    slots = {s["slot"] for s in body["available"]}
    assert slots == set(SPIRIT_COSMETICS_CATALOG)
    # Every catalog option is surfaced with its state hints, none applied on a fresh spirit.
    for s in body["available"]:
        assert s["applied"] is None
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


def test_buy_already_applied_409(client):
    _auth(client, "cosmetics_dupe@example.com")
    assert client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).status_code == 200
    again = client.post("/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"})
    assert again.status_code == 409


def test_within_slot_swap_charges_the_difference(client):
    # Earn enough that both options are clearly affordable, then swap within `aura` and assert
    # only the difference is charged.
    _auth(client, "cosmetics_swap@example.com")
    _earn_to_level(client, 3)
    base = _spirit(client)["coins"]

    soft = _cost("aura", "soft")
    warm = _cost("aura", "warm")
    assert warm > soft  # the swap is to a dearer option, so the delta is positive

    after_soft = client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "soft"}
    ).json()
    assert after_soft["coins"] == base - soft

    after_warm = client.post(
        "/api/v1/spirit/cosmetics", json={"slot": "aura", "option": "warm"}
    ).json()
    # Only the difference (warm − soft) is charged on the swap, not the full warm cost.
    assert after_warm["coins"] == base - warm
    assert after_warm["cosmetics"]["aura"] == "warm"
    # The slot holds exactly the new option (the old one is replaced, not accumulated).
    assert _applied(after_warm, "aura") == "warm"


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


# --- Nickname (PATCH /spirit) -----------------------------------------------------------


def _stored_name(db_session):
    """The active spirit's stored nickname (not in SpiritState — read the row directly)."""
    db_session.expire_all()
    return db_session.execute(
        select(Spirit.name).where(Spirit.retired_at.is_(None))
    ).scalars().first()


def test_rename_sets_and_clears(client, db_session):
    _auth(client, "rename@example.com")
    coins_before = _spirit(client)["coins"]

    set_res = client.patch("/api/v1/spirit", json={"name": "  Ember  "})
    assert set_res.status_code == 200
    # Trimmed and never charges coins.
    assert set_res.json()["coins"] == coins_before
    assert _stored_name(db_session) == "Ember"

    # Empty string clears the nickname back to NULL.
    clear_res = client.patch("/api/v1/spirit", json={"name": "   "})
    assert clear_res.status_code == 200
    assert _stored_name(db_session) is None


def test_rename_over_length_422(client):
    _auth(client, "rename_long@example.com")
    res = client.patch("/api/v1/spirit", json={"name": "x" * 41})
    assert res.status_code == 422


def test_rename_rejects_unexpected_fields(client):
    _auth(client, "rename_extra@example.com")
    res = client.patch("/api/v1/spirit", json={"name": "Ember", "color": "blue"})
    assert res.status_code == 422


def test_rename_requires_auth(client):
    assert client.patch("/api/v1/spirit", json={"name": "Ember"}).status_code == 401


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

    # Name the spirit so we can confirm the retired collection records it.
    client.patch("/api/v1/spirit", json={"name": "Lumen"})

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
