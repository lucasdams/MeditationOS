# ADR-0003: FastAPI + SQLAlchemy + Alembic backend

**Status:** Accepted · 2026-06

## Context

The backend needs typed request/response validation, auto-generated API docs (useful for a portfolio reviewer), a mature ORM, and a disciplined migration story — without heavyweight framework ceremony for a solo project.

## Decision

Build the backend on **FastAPI** (web), **SQLAlchemy** (ORM/Core), and **Alembic** (migrations), in Python.

## Consequences

- **Pydantic** validation at the edge gives `422` field-level errors for free and keeps untyped data out of the core.
- **OpenAPI `/docs`** is generated from the code — the API contract is always live and explorable.
- SQLAlchemy keeps queries parameterized (no string-interpolated SQL) and centralizes data access in the service layer.
- Alembic enforces one-logical-change migrations with `downgrade` paths.
- Async-capable if endpoints later need it.

## Alternatives considered

- **Django / DRF** — batteries-included but heavier; the admin and ORM conventions are more than this project needs, and FastAPI's typing + OpenAPI story is a better demonstration fit.
- **Flask** — minimal but would require assembling validation, docs, and serialization by hand.
- **Node/Express** — fine, but Python better showcases the data/analytics and AI-integration parts of the roadmap.
