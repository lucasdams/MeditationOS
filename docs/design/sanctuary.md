# Sanctuary Design — a garden you grow by practicing

[← Back to README](../../README.md) · Related: [ADR-0010 (cultivation, not a spend economy)](../decisions/0010-sanctuary-cultivation.md) · [gamification](gamification.md) · [data-model](data-model.md)

The Sanctuary is the product's strongest retention loop: a space — a garden /
homestead — that fills up over time **through practice**. You grow **one thing at a
time**; as you practice it grows; when it finishes, you **choose what to grow next**
(another tree, a flower, a barn, a companion). The page background becomes the
accumulated assortment of everything you've completed, with the current item visibly
growing among them.

It extends, in stored form, the same idea already shipped in miniature: the dashboard
ASCII tree that grows with your level. Here the tree is just the first plant in a
larger, user-shaped scene.

## Core principle

Practice **is** the currency — there is no separate one to bank or spend. The only
thing the user *decides* is **what to grow and in what order**, so that is the only
thing stored. Everything else (progress, completion, what's unlocked, thriving vs.
dormant) is **computed on read** from the activity log + the sequence. See
[ADR-0010](../decisions/0010-sanctuary-cultivation.md); this honors
[ADR-0009](../decisions/0009-gamification-computed-from-activity.md)'s
"store only what cannot be derived."

## The loop

```
practice → current item grows → it completes → choose what to grow next → it joins the scene
                     ▲                                                              │
                     └──────────────────────────────────────────────────────────────┘
```

- **Auto-seeded.** Every user starts with a seedling at position 0, so the scene
  always has something growing from day one.
- **One at a time.** Exactly one item is "growing" at any moment; the rest are done
  (placed in the background) or not-yet-chosen.
- **Carry-over.** Practice accrued past a completion is not wasted — it flows into the
  next item once chosen, so returning after a break can find the next plant already
  part-grown ("your practice was waiting for you").

## Data model

The entire persistent footprint is one append-only table.

```
sanctuary_plantings
  id          UUID         pk
  user_id     UUID         fk users ON DELETE CASCADE
  item_key    TEXT         -- references SANCTUARY_CATALOG (in code)
  position    INT          -- order in the growth sequence: 0, 1, 2, …
  created_at  timestamptz  server default now()
  UNIQUE (user_id, position)
  INDEX (user_id)
```

No `user_wallet`, no spend ledger, no `upgrades` table — see
[ADR-0010 alternatives](../decisions/0010-sanctuary-cultivation.md#alternatives-considered).
`item_key` may repeat (an assortment of many trees).

## Catalog (in-code constant)

`SANCTUARY_CATALOG` is the single source of truth for what can be grown — keyed like
`SESSION_TYPES` and the gratitude `CATEGORIES`. Each entry:

| field | meaning |
|-------|---------|
| `key` | stable id stored in `sanctuary_plantings.item_key` |
| `track` | `nature` · `structure` · `ambiance` · `companion` |
| `grow_cost` | practice points to complete (minutes; resonance breathing ×3) |
| `unlock` | condition to be *offered* (e.g. `level ≥ 5`, `streak ≥ 30`), computed from stats |
| `stages` | ASCII art per growth stage (seedling → full), reusing the `lib/tree.ts` tier idea |

Sketch:

The shipped catalog (`grow_cost` in practice points; unlocks by lifetime points and/or
current streak):

| key | track | grow cost | unlock |
|-----|-------|-----------|--------|
| `tree` | nature | 60 | always (starter) |
| `flower` | nature | 30 | always |
| `pond` | nature | 120 | ≥ 100 points |
| `hut` | structure | 90 | ≥ 60 points |
| `barn` | structure | 150 | ≥ 150 points |
| `bird` | companion | 40 | ≥ 50 points |
| `fox` | companion | 80 | a 3-day streak |

`grow_cost` and `unlock` are tunable constants — changing them recomputes everything
with no migration (the property valued in XP). Prefer lowering or holding costs; see
the ADR consequences.

## Computed state

In a `sanctuary_service`, from cumulative practice points `P` (the same activity
`dashboard_service` already reads) and the ordered plantings:

- **Completion** — planting `i` is complete when `P ≥ Σ grow_cost[0..i]` (thresholds
  stack in order).
- **Current item** — the first not-yet-complete planting; its progress = how far `P`
  reaches into its band, `0..1`.
- **Offered next** — catalog items whose `unlock` condition is met, surfaced only when
  the current item is complete.
- **Vitality** — a thriving/dim flag from `current_streak_days`; visual only, never
  destructive.

## API

Layered route → service → model, user-scoped, default-deny (the standard checklist).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/sanctuary` | the scene: ordered plantings (with computed completion + current progress), and the unlocked next-options when ready |
| `POST` | `/api/v1/sanctuary/plantings` | `{ item_key }` — grow the next item |

`POST` validates, in order: (1) `item_key` is in the catalog and **unlocked**; (2) the
**current item is complete** (no queuing ahead). Then it appends at the next
`position` and returns the updated scene. The very first planting (empty sequence) is
the auto-seeded starter. No balance check exists — there is no balance.

## Frontend

- **Where:** a compact scene renders on the **dashboard** (the home you land on), so
  the garden is the first thing you see; a dedicated **`/sanctuary` page** (nav button,
  shipped in Phase 3) gives the full view with the completion celebration.
- **Render:** **ASCII first**, consistent with `lib/tree.ts`. Each catalog item has
  per-stage art; the current item animates through stages as its progress bar fills;
  completed items render full and are arranged into the background scene. Procedural
  **SVG** is a later, separable upgrade — the data model is render-agnostic.
- **Completion moment:** when the current item finishes, surface a "choose what to grow
  next" beat (reusing the `RewardOverlay` feel) listing unlocked options; locked ones
  show their unlock hint ("Barn — reach a 30-day streak").
- **States:** loading / error / empty as usual; the empty scene is the lone seedling.

## Build order

Each step is independently shippable.

1. ✅ **Grow + scene, read-only** — `sanctuary_service` computes the starter plant's
   progress from practice; render it on the dashboard. No table yet (pure computed).
2. ✅ **Plant next** — `sanctuary_plantings` + migration, the `POST` write path, and a
   nature catalog (tree, flower, pond) with milestone unlocks. The full loop end to end,
   with a "choose what to grow next" beat and the assortment rendered on the dashboard.
3. ✅ **Builder UI** — a dedicated `/sanctuary` page (nav button) showing the full
   assortment, the growing plant's bar, a "choose what to grow next" beat with a
   completion celebration, and a just-planted pop animation; linked from the dashboard.
4. ✅ **Depth** — structures (hut, barn) and companions (bird, fox) tracks beyond
   nature; milestone unlocks by lifetime points **and** current streak (locked options
   shown with their hint); a streak-driven **vitality** (dormant / thriving /
   flourishing, visual-only). *Still to come:* procedural **SVG** render.

## Out of scope (here)

Stripe cosmetic packs (a [monetization](../../docs/future-features.md#payments--monetization)
tie-in), procedural SVG, and several-items-growing-at-once — all deferred; see the ADR.
