# Architecture Decision Records

[← Back to README](../../README.md)

Short records of the **why** behind significant technical choices. Each ADR is immutable once accepted — if a decision changes, a new ADR supersedes the old one rather than editing history. Format: Context → Decision → Consequences → Alternatives.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-use-adrs.md) | Record architecture decisions | Accepted |
| [0002](0002-postgresql.md) | PostgreSQL as the primary datastore | Accepted |
| [0003](0003-fastapi-stack.md) | FastAPI + SQLAlchemy + Alembic backend | Accepted |
| [0004](0004-uuid-primary-keys.md) | UUID primary keys | Accepted |
| [0005](0005-httponly-cookie-jwt-auth.md) | httpOnly-cookie JWT authentication | Accepted |
| [0006](0006-layered-architecture.md) | Layered backend (routes / services / models / schemas) | Accepted |
| [0007](0007-google-oauth-id-token.md) | Sign in with Google via ID-token verification | Accepted |
| [0008](0008-ai-suggestions-curated-fallback.md) | AI suggestions with a curated fallback | Accepted |
| [0009](0009-gamification-computed-from-activity.md) | Gamification computed from activity, not stored | Accepted |
| [0010](0010-sanctuary-cultivation.md) | Sanctuary — cultivation sequence, not a spend economy | Superseded by 0011 |
| [0011](0011-sanctuary-spend-economy.md) | Sanctuary — a spend economy (coins, buy, upgrade) | Accepted |
| [0012](0012-sanctuary-personalization.md) | Sanctuary — variants + mix-and-match customizations | Accepted |
| [0013](0013-sanctuary-progressive-pricing.md) | Sanctuary — progressive pricing + economy retune | Accepted |
