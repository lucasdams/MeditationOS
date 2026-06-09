# ADR-0004: UUID primary keys

**Status:** Accepted · 2026-06

## Context

Primary key choice affects URL/ID exposure, security, and future scaling. Resource IDs appear in API paths (`/api/v1/sessions/{id}`), so they're visible to clients.

## Decision

Use **UUID (v4)** primary keys for all tables, generated application-side by default.

## Consequences

- IDs are **non-sequential**, so they don't leak row counts or invite enumeration (`/sessions/1`, `/sessions/2`, …). This pairs with the "return `404` for unowned resources" rule.
- IDs can be generated before insert and are stable across environments — convenient for tests and for distributed creation later.
- Slightly larger keys/indexes than `bigint`; negligible at this product's scale.

## Alternatives considered

- **Auto-increment `bigint`** — smaller and naturally ordered, but exposes counts and enables ID-enumeration attacks on a user-data API. Rejected for a security-conscious portfolio.
- **UUIDv7 / ULID** — time-ordered, kinder to index locality. A reasonable future optimization; not worth the extra dependency for V1, so noted as a possible later ADR.
