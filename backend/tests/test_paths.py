"""Tests for the beginner "Paths" feature.

Two layers:
  - HTTP (via `client`): catalog listing, auth, enrollment, user-scoping, unknown-path 404.
  - Service (via `db_session`): the derivation rules, where seeding sessions on explicit
    calendar dates lets us span the multiple days a path's "one completion per calendar day"
    pacing requires (the gratitude day of "first-7-days" is day 6, so it needs day-spanning
    activity that a single real-time HTTP test can't produce).

Derivation contract under test (see app/services/path_service.py):
  - last_done_date starts at started_on − 1 day; each day needs the EARLIEST qualifying
    activity strictly AFTER the previous day's completion date;
  - breathe → a breathing session ≥ min_minutes; meditate → a non-breathing session ≥
    min_minutes; gratitude → any gratitude entry that date;
  - at most one path-day completes per calendar day; a missing day just waits at `current`.
"""

from datetime import UTC, date, datetime, timedelta

from app.models.gratitude import GratitudeEntry
from app.models.path_enrollment import PathEnrollment
from app.models.session import Session as PracticeSession
from app.models.user import User
from app.services import path_service
from app.services.paths_catalog import get_path


# ----------------------------------------------------------------------------------------
# HTTP helpers
# ----------------------------------------------------------------------------------------


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def _today_iso(hour: int = 8) -> str:
    """A timestamp earlier *today* (UTC) — qualifies for day 1 of a just-enrolled path."""
    return f"{datetime.now(UTC).date().isoformat()}T{hour:02d}:00:00"


def _log_session(client, *, type_="resonance_breathing", seconds=120, occurred_at=None):
    return client.post(
        "/api/v1/sessions",
        json={
            "type": type_,
            "duration_seconds": seconds,
            "occurred_at": occurred_at or _today_iso(),
        },
    )


def _get_paths(client):
    return client.get("/api/v1/paths")


def _path(body, path_id):
    return next(p for p in body["paths"] if p["id"] == path_id)


# ----------------------------------------------------------------------------------------
# Service-level seeding helpers (full control over calendar dates)
# ----------------------------------------------------------------------------------------


def _user(db_session, email) -> User:
    user = User(email=email, password_hash="x")
    db_session.add(user)
    db_session.commit()
    return user


def _enroll_on(db_session, user_id, path_id, started_on: date) -> PathEnrollment:
    e = PathEnrollment(user_id=user_id, path_id=path_id, started_on=started_on)
    db_session.add(e)
    db_session.commit()
    return e


def _seed_session(db_session, user_id, *, day: date, seconds: int, type_: str, hour: int = 9):
    db_session.add(
        PracticeSession(
            user_id=user_id,
            type=type_,
            duration_seconds=seconds,
            occurred_at=datetime(day.year, day.month, day.day, hour, tzinfo=UTC),
        )
    )
    db_session.commit()


def _seed_gratitude(db_session, user_id, *, day: date):
    db_session.add(
        GratitudeEntry(
            user_id=user_id,
            category="people",
            text="warm tea",
        )
    )
    db_session.commit()
    # created_at is server-defaulted to now(); override to the target day so the local-date
    # bucket is deterministic regardless of when the test runs.
    entry = (
        db_session.query(GratitudeEntry)
        .filter(GratitudeEntry.user_id == user_id)
        .order_by(GratitudeEntry.created_at.desc())
        .first()
    )
    entry.created_at = datetime(day.year, day.month, day.day, 9, tzinfo=UTC)
    db_session.commit()


# ========================================================================================
# HTTP: listing & auth
# ========================================================================================


def test_list_requires_auth(client):
    assert _get_paths(client).status_code == 401


def test_enroll_requires_auth(client):
    assert client.post("/api/v1/paths/first-7-days/enroll").status_code == 401


def test_list_returns_both_paths_locked_when_not_enrolled(client):
    _auth(client, "p_list@example.com")
    res = _get_paths(client)
    assert res.status_code == 200
    body = res.json()
    ids = {p["id"] for p in body["paths"]}
    assert {"first-7-days", "three-calm-breaths"} <= ids

    seven = _path(body, "first-7-days")
    assert seven["total_days"] == 7
    assert seven["enrolled"] is False
    assert seven["started_on"] is None
    assert seven["current_day"] is None
    assert seven["completed"] is False
    assert seven["completed_days"] == 0
    assert len(seven["days"]) == 7
    assert all(d["status"] == "locked" for d in seven["days"])
    # Day shape matches the contract.
    d1 = seven["days"][0]
    assert d1["index"] == 1
    assert d1["practice"] == "breathe"
    assert d1["min_minutes"] == 1
    assert isinstance(d1["title"], str) and isinstance(d1["cue"], str)


# ========================================================================================
# HTTP: enrollment & user-scoping
# ========================================================================================


def test_enroll_unknown_path_404(client):
    _auth(client, "p_unknown@example.com")
    assert client.post("/api/v1/paths/no-such-path/enroll").status_code == 404


def test_enroll_creates_enrollment(client):
    _auth(client, "p_enroll@example.com")
    res = client.post("/api/v1/paths/first-7-days/enroll")
    assert res.status_code == 201
    body = res.json()
    assert body["id"] == "first-7-days"
    assert body["enrolled"] is True
    assert body["started_on"] is not None
    # No activity yet → day 1 is current, the rest locked.
    assert body["current_day"] == 1
    assert body["completed"] is False
    assert body["completed_days"] == 0
    assert body["days"][0]["status"] == "current"
    assert all(d["status"] == "locked" for d in body["days"][1:])


def test_enrollment_is_user_scoped(client):
    _auth(client, "p_owner@example.com")
    assert client.post("/api/v1/paths/first-7-days/enroll").status_code == 201
    assert _path(_get_paths(client).json(), "first-7-days")["enrolled"] is True

    _auth(client, "p_intruder@example.com")  # different user
    assert _path(_get_paths(client).json(), "first-7-days")["enrolled"] is False


def test_re_enroll_resets_start_and_does_not_duplicate(client):
    _auth(client, "p_reenroll@example.com")
    first = client.post("/api/v1/paths/first-7-days/enroll").json()
    second = client.post("/api/v1/paths/first-7-days/enroll").json()
    assert first["started_on"] == second["started_on"]
    # Exactly one enrollment visible (no duplicate row leaked).
    enrolled = [p for p in _get_paths(client).json()["paths"] if p["enrolled"]]
    assert len(enrolled) == 1


# ========================================================================================
# HTTP: derivation (single calendar day — what a real request can exercise)
# ========================================================================================


def test_matching_session_completes_day_one_and_advances(client):
    _auth(client, "p_derive@example.com")
    client.post("/api/v1/paths/first-7-days/enroll")
    assert _log_session(client, seconds=120).status_code == 201  # breathe ≥1 min

    body = _path(_get_paths(client).json(), "first-7-days")
    assert body["days"][0]["status"] == "done"
    assert body["days"][1]["status"] == "current"
    assert body["current_day"] == 2
    assert body["completed_days"] == 1
    assert body["completed"] is False


def test_second_session_same_day_does_not_advance_a_second_day(client):
    _auth(client, "p_oneperday@example.com")
    client.post("/api/v1/paths/first-7-days/enroll")
    _log_session(client, seconds=120, occurred_at=_today_iso(8))
    _log_session(client, seconds=180, occurred_at=_today_iso(20))

    body = _path(_get_paths(client).json(), "first-7-days")
    # Only one day advances per calendar day: day 1 done, day 2 current (not also done).
    assert body["days"][0]["status"] == "done"
    assert body["days"][1]["status"] == "current"
    assert body["current_day"] == 2
    assert body["completed_days"] == 1


def test_missing_day_keeps_current_stable_no_failure(client):
    _auth(client, "p_missing@example.com")
    client.post("/api/v1/paths/first-7-days/enroll")
    _log_session(client, seconds=120)  # complete day 1 only

    body = _path(_get_paths(client).json(), "first-7-days")
    assert body["current_day"] == 2
    assert body["completed_days"] == 1
    assert body["completed"] is False
    assert body["days"][1]["status"] == "current"


def test_meditation_does_not_complete_a_breathe_day(client):
    _auth(client, "p_wrongtype@example.com")
    client.post("/api/v1/paths/first-7-days/enroll")
    assert _log_session(client, type_="mindfulness", seconds=300).status_code == 201

    body = _path(_get_paths(client).json(), "first-7-days")
    assert body["days"][0]["status"] == "current"
    assert body["completed_days"] == 0


def test_too_short_session_does_not_complete_a_day(client):
    _auth(client, "p_short@example.com")
    client.post("/api/v1/paths/first-7-days/enroll")
    assert _log_session(client, seconds=30).status_code == 201  # < 1 min

    body = _path(_get_paths(client).json(), "first-7-days")
    assert body["days"][0]["status"] == "current"
    assert body["completed_days"] == 0


# ========================================================================================
# Service: derivation across calendar days (gratitude day, full walk, strict-after rule)
# ========================================================================================


def test_service_one_completion_per_calendar_day(db_session):
    # Two qualifying breathing sessions on the same day still only advance ONE day.
    user = _user(db_session, "svc_oneperday@example.com")
    start = date(2026, 6, 1)
    _enroll_on(db_session, user.id, "first-7-days", start)
    _seed_session(db_session, user.id, day=start, seconds=120, type_="resonance_breathing", hour=8)
    _seed_session(db_session, user.id, day=start, seconds=180, type_="resonance_breathing", hour=20)

    enrollment = (
        db_session.query(PathEnrollment).filter_by(user_id=user.id).one()
    )
    summary = path_service._summarize(db_session, user.id, get_path("first-7-days"), enrollment, tz="UTC")
    assert summary.completed_days == 1
    assert summary.current_day == 2
    assert summary.days[0].status == "done"
    assert summary.days[1].status == "current"


def test_service_gratitude_completes_the_gratitude_day(db_session):
    # Walk "first-7-days" across real calendar dates up to its gratitude day (day 6) and confirm
    # a gratitude entry completes it. Days 1-3 breathe, 4 meditate, 5 breathe, 6 gratitude.
    user = _user(db_session, "svc_grat@example.com")
    start = date(2026, 6, 1)
    _enroll_on(db_session, user.id, "first-7-days", start)
    # last_done_date = May 31 → day 1 needs a date ≥ June 1.
    _seed_session(db_session, user.id, day=date(2026, 6, 1), seconds=120, type_="resonance_breathing")
    _seed_session(db_session, user.id, day=date(2026, 6, 2), seconds=180, type_="resonance_breathing")
    _seed_session(db_session, user.id, day=date(2026, 6, 3), seconds=240, type_="resonance_breathing")
    _seed_session(db_session, user.id, day=date(2026, 6, 4), seconds=300, type_="mindfulness")
    _seed_session(db_session, user.id, day=date(2026, 6, 5), seconds=360, type_="resonance_breathing")
    _seed_gratitude(db_session, user.id, day=date(2026, 6, 6))

    enrollment = db_session.query(PathEnrollment).filter_by(user_id=user.id).one()
    summary = path_service._summarize(db_session, user.id, get_path("first-7-days"), enrollment, tz="UTC")

    assert summary.completed_days == 6
    assert summary.days[5].practice == "gratitude"
    assert summary.days[5].status == "done"
    assert summary.days[6].status == "current"  # day 7 (meditate) now waits
    assert summary.current_day == 7
    assert summary.completed is False


def test_service_full_completion_clears_current_day(db_session):
    # Completing every day of the 3-day path → completed True, current_day null.
    user = _user(db_session, "svc_complete@example.com")
    start = date(2026, 6, 1)
    _enroll_on(db_session, user.id, "three-calm-breaths", start)
    _seed_session(db_session, user.id, day=date(2026, 6, 1), seconds=120, type_="resonance_breathing")
    _seed_session(db_session, user.id, day=date(2026, 6, 2), seconds=180, type_="resonance_breathing")
    _seed_session(db_session, user.id, day=date(2026, 6, 3), seconds=240, type_="resonance_breathing")

    enrollment = db_session.query(PathEnrollment).filter_by(user_id=user.id).one()
    summary = path_service._summarize(db_session, user.id, get_path("three-calm-breaths"), enrollment, tz="UTC")

    assert summary.completed is True
    assert summary.completed_days == 3
    assert summary.current_day is None
    assert all(d.status == "done" for d in summary.days)


def test_service_session_before_start_does_not_count(db_session):
    # A session the day BEFORE started_on is not strictly after last_done_date (= start − 1),
    # so it must not complete day 1.
    user = _user(db_session, "svc_before@example.com")
    start = date(2026, 6, 1)
    _enroll_on(db_session, user.id, "first-7-days", start)
    _seed_session(db_session, user.id, day=date(2026, 5, 31), seconds=600, type_="resonance_breathing")

    enrollment = db_session.query(PathEnrollment).filter_by(user_id=user.id).one()
    summary = path_service._summarize(db_session, user.id, get_path("first-7-days"), enrollment, tz="UTC")
    assert summary.completed_days == 0
    assert summary.current_day == 1
    assert summary.days[0].status == "current"


def test_service_earliest_qualifying_date_used(db_session):
    # Day 1 (breathe ≥1m) completes on the EARLIEST qualifying date; day 2 (breathe ≥2m) must
    # then find a date strictly after that. A 30s session on June 1 doesn't qualify day 1, so
    # day 1 completes June 2 (120s) and day 2 completes June 3.
    user = _user(db_session, "svc_earliest@example.com")
    start = date(2026, 6, 1)
    _enroll_on(db_session, user.id, "first-7-days", start)
    _seed_session(db_session, user.id, day=date(2026, 6, 1), seconds=30, type_="resonance_breathing")
    _seed_session(db_session, user.id, day=date(2026, 6, 2), seconds=120, type_="resonance_breathing")
    _seed_session(db_session, user.id, day=date(2026, 6, 3), seconds=180, type_="resonance_breathing")

    enrollment = db_session.query(PathEnrollment).filter_by(user_id=user.id).one()
    summary = path_service._summarize(db_session, user.id, get_path("first-7-days"), enrollment, tz="UTC")
    assert summary.days[0].status == "done"
    assert summary.days[1].status == "done"
    assert summary.days[2].status == "current"  # day 3 (breathe ≥3m) waits
    assert summary.completed_days == 2
    assert summary.current_day == 3
