# Analytics

[← Back to README](../../README.md) · Related: [API contract](api-v1.md) · [Data model](data-model.md) · [ADR-0009](../decisions/0009-gamification-computed-from-activity.md)

A dedicated `/analytics` page that turns the practice + journal data into insights —
the "how am I actually practicing?" view that complements the at-a-glance dashboard.

## Computed by SQL, nothing stored

One read-only endpoint, `GET /api/v1/analytics`, returns everything (see
[api-v1](api-v1.md)). Like streaks and the dashboard, every figure is **aggregated by
SQL on read** and bucketed in the **user's timezone** (`timezone(tz, …)`) — there are
no analytics tables and no precomputed rollups to drift ([ADR-0009](../decisions/0009-gamification-computed-from-activity.md)).

| Insight | How it's computed |
|---------|-------------------|
| **Headline** | total sessions, total minutes, distinct local days practiced |
| **Minutes per week** | `sum(duration)` grouped by `date_trunc('week', local)`, last 12 Monday-aligned weeks, zero-filled |
| **By type** | `count` + `sum(duration)` grouped by `sessions.type` |
| **By day of week** | `count` grouped by `extract(dow, local)`, 7 buckets (Sun→Sat) |
| **By time of day** | `count` grouped by `extract(hour, local)`, folded into morning / afternoon / evening / night |
| **Journal moods** | `count` grouped by `journals.mood` |

## Frontend

The `/analytics` page renders the payload as simple CSS bar charts (no chart library):
a column trend for minutes-per-week and labelled horizontal bars for the categorical
breakdowns. Loading / error / empty states per the frontend rules.

## Deliberately deferred

- **Comparisons** ("this month vs last") and goal-progress history — larger
  reporting features (some are V3 AI). *(Mood-over-time and session CSV export have
  since shipped — per-week journal mood counts as stacked bars, and a one-click CSV
  download from the history page.)*
