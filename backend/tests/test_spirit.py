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
from app.services.spirit_service import GLOW_FLOOR, GLOW_FULL, GLOW_MID, stage_for_level


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
