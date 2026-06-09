# ADR-0002: PostgreSQL as the primary datastore

**Status:** Accepted · 2026-06

## Context

MeditationOS is relational at its core: users own sessions, journals, goals, and breathing patterns, and the product's value is in **aggregations over that data** (streaks, weekly totals, trends). It also has a clear path toward richer queries (analytics in V2, pattern analysis in V3).

## Decision

Use **PostgreSQL** as the single primary datastore for all versions.

## Consequences

- Strong relational modeling with real foreign keys and constraints (see [data-model](../design/data-model.md)).
- Powerful aggregation/window functions for streaks and analytics without extra infra.
- `citext` for case-insensitive email, `uuid` support, and JSON columns available if needed later.
- Managed in production via **AWS RDS** — backups and failover without hand-rolling them.
- One database engine to run locally (Docker) and in prod; no dev/prod store mismatch.

## Alternatives considered

- **SQLite** — zero-config and fine for local dev, but no real concurrency story and a dev/prod gap once deployed. Rejected as the primary store.
- **MongoDB** — the data is inherently relational and aggregation-heavy; document modeling would fight the domain and complicate streak/analytics queries.
- **MySQL** — viable, but Postgres's window functions, `citext`, and constraint expressiveness fit the analytics roadmap better.
