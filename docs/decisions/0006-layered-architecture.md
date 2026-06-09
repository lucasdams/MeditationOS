# ADR-0006: Layered backend (routes / services / models / schemas)

**Status:** Accepted · 2026-06

## Context

A common failure mode in small projects is fat route handlers that mix HTTP concerns, business logic, and database access — untestable and hard to review. The project's rules already mandate separation; this ADR records the rationale.

## Decision

Enforce a four-layer backend, one responsibility each:

| Layer | Location | Responsibility |
|-------|----------|----------------|
| Routes | `backend/app/api/routes/` | HTTP only: parse, call a service, map result/exception to status |
| Services | `backend/app/services/` | Business logic and **all** database access |
| Models | `backend/app/models/` | SQLAlchemy ORM definitions |
| Schemas | `backend/app/schemas/` | Pydantic request/response shapes |

Routes never touch the DB directly; endpoints never return ORM models; domain errors are raised in services and mapped to HTTP in routes.

## Consequences

- Business logic is unit-testable without spinning up HTTP.
- Swapping transport or reusing logic (e.g. a future CLI or background job) doesn't touch business rules.
- Reviews are easier: each file has one altitude of concern.
- Small amount of boilerplate (a service call per endpoint) — an acceptable trade for testability.

## Alternatives considered

- **Logic in route handlers** — faster to write initially, but couples HTTP to business rules and resists testing. This is the anti-pattern the project explicitly avoids.
- **Full hexagonal/ports-and-adapters** — more indirection than a solo V1 warrants; the four-layer split captures most of the benefit at a fraction of the ceremony.
