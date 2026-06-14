"""Tests for programs: the static catalog + per-user enrollment & progress."""


def _auth(client, email):
    client.post("/api/v1/auth/register", json={"email": email, "password": "correct horse"})
    client.post("/api/v1/auth/login", json={"email": email, "password": "correct horse"})


def test_catalog_is_public_and_listed(client):
    body = client.get("/api/v1/programs").json()
    keys = {p["key"] for p in body}
    assert {"calm7", "focus10", "habit21"} <= keys
    calm = next(p for p in body if p["key"] == "calm7")
    assert calm["total_days"] == 7


def test_program_detail_has_days(client):
    body = client.get("/api/v1/programs/calm7").json()
    assert len(body["days"]) == 7
    assert body["days"][0]["day"] == 1
    assert body["days"][0]["activity"] in ("meditate", "breathe", "gratitude", "journal")


def test_unknown_program_is_404(client):
    assert client.get("/api/v1/programs/nope").status_code == 404


def test_enroll_requires_auth(client):
    res = client.post("/api/v1/programs/enrollments", json={"program_key": "calm7"})
    assert res.status_code == 401


def test_enroll_and_list(client):
    _auth(client, "p1@example.com")
    res = client.post("/api/v1/programs/enrollments", json={"program_key": "calm7"})
    assert res.status_code == 201
    body = res.json()
    assert body["current_day"] == 1
    assert body["total_days"] == 7
    assert body["today"]["day"] == 1
    assert body["completed"] is False
    rows = client.get("/api/v1/programs/enrollments").json()
    assert len(rows) == 1


def test_enroll_unknown_program_is_404(client):
    _auth(client, "p2@example.com")
    res = client.post("/api/v1/programs/enrollments", json={"program_key": "nope"})
    assert res.status_code == 404


def test_enroll_is_idempotent_while_active(client):
    _auth(client, "p3@example.com")
    first = client.post("/api/v1/programs/enrollments", json={"program_key": "calm7"}).json()
    second = client.post("/api/v1/programs/enrollments", json={"program_key": "calm7"}).json()
    assert first["id"] == second["id"]  # no duplicate active enrollment
    assert len(client.get("/api/v1/programs/enrollments").json()) == 1


def test_advance_moves_through_and_completes(client):
    _auth(client, "p4@example.com")
    eid = client.post("/api/v1/programs/enrollments", json={"program_key": "calm7"}).json()["id"]
    # Advance through all 7 days.
    last = None
    for _ in range(7):
        last = client.post(f"/api/v1/programs/enrollments/{eid}/advance").json()
    assert last["completed"] is True
    assert last["today"] is None
    # A further advance is a no-op (stays completed).
    again = client.post(f"/api/v1/programs/enrollments/{eid}/advance").json()
    assert again["completed"] is True


def test_advance_other_users_enrollment_is_404(client):
    _auth(client, "p5@example.com")
    eid = client.post("/api/v1/programs/enrollments", json={"program_key": "calm7"}).json()["id"]
    _auth(client, "p6@example.com")
    assert client.post(f"/api/v1/programs/enrollments/{eid}/advance").status_code == 404


def test_leave_program(client):
    _auth(client, "p7@example.com")
    eid = client.post("/api/v1/programs/enrollments", json={"program_key": "habit21"}).json()["id"]
    assert client.delete(f"/api/v1/programs/enrollments/{eid}").status_code == 204
    assert client.get("/api/v1/programs/enrollments").json() == []


def test_enrollments_user_scoped(client):
    _auth(client, "owner@example.com")
    client.post("/api/v1/programs/enrollments", json={"program_key": "calm7"})
    _auth(client, "other@example.com")
    assert client.get("/api/v1/programs/enrollments").json() == []
