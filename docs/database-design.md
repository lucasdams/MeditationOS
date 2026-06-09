# Database Design

[← Back to README](../README.md)

## Core Tables (V1-V2)

```
users ──┬── sessions
        ├── breathing_patterns   (saved inhale/exhale presets per user)
        ├── journals
        ├── goals
        └── streaks
```

**`breathing_patterns`** (planned): `name`, `inhale_seconds`, `exhale_seconds`, `is_preset`, `user_id`

**`sessions`** (extended for breathing): optional `inhale_seconds`, `exhale_seconds`, `cycles_completed` when `type = resonance_breathing`

## Future Tables (V3+)

```
friendships · groups · challenges · notifications
```

**Demonstrates:** relational modeling, foreign keys, query design, indexing

---

For schema conventions (UUID keys, timestamps, indexing, Alembic migrations), see [`.claude/rules/database.md`](../.claude/rules/database.md).
