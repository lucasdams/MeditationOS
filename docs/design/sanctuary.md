# Sanctuary Design — a garden you build with coins

[← Back to README](../../README.md) · Related: [ADR-0011 (spend economy)](../decisions/0011-sanctuary-spend-economy.md) · [ADR-0010 (superseded)](../decisions/0010-sanctuary-cultivation.md) · [gamification](gamification.md) · [data-model](data-model.md)

The Sanctuary is the product's retention loop: a small **spend economy**. You earn
**coins** as you level up and spend them to **buy** items (plants, structures, pets) and
**upgrade** them through visual tiers (tree → flowering → old oak). The loop is *earn →
choose → upgrade*.

> Previously this was a *cultivation* model — grow one thing at a time by practicing,
> no currency. That's [ADR-0010](../decisions/0010-sanctuary-cultivation.md), now
> superseded by [ADR-0011](../decisions/0011-sanctuary-spend-economy.md).

## Core principle

Coins come from your **level**, which is computed from **earned XP** — total XP minus
the streak bonus. Excluding the volatile streak bonus keeps coins **monotonic**: a lapsed
streak never takes coins (or bought items) away, so the garden never regresses. Because
level rises with *all* XP-earning activity, meditation, breathing, gratitude, and journal
all contribute to coins.

The only stored state is **what you own and each item's tier**. Spending is *derived from
holdings* — there's no wallet row or transaction log:

```
coins_earned = level × COINS_PER_LEVEL          (level from earned XP)
coins_spent  = Σ owned (buy_cost + Σ upgrade_costs up to its tier)
balance      = coins_earned − coins_spent
```

## The loop

```
level up → coins → buy an item (or upgrade one you own) → it joins / improves the garden
```

## Data model

One table — the holdings; the balance is computed.

```
sanctuary_plantings
  id          UUID         pk
  user_id     UUID         fk users ON DELETE CASCADE
  item_key    TEXT         -- references SANCTUARY_CATALOG (in code)
  position    INT          -- display order: 0, 1, 2, …
  tier        INT          -- 0 = base; each upgrade bumps it (drives cost + art)
  created_at  timestamptz  server default now()
  UNIQUE (user_id, position)
  INDEX (user_id)
```

Still no `user_wallet` and no spend ledger — the holdings *are* the ledger
([ADR-0011](../decisions/0011-sanctuary-spend-economy.md)). `item_key` may repeat.

## Catalog (in-code constant)

`SANCTUARY_CATALOG` is the single source of truth for what can be grown — keyed like
`SESSION_TYPES` and the gratitude `CATEGORIES`. Each entry:

| field | meaning |
|-------|---------|
| `key` | stable id stored in `sanctuary_plantings.item_key` |
| `track` | `nature` · `structure` · `companion` |
| `cost` | coins to **buy** (tier 0) |
| `unlock_level` | level required before it appears in the shop |
| `upgrade_costs` | coins to reach tier 1, 2, … (so `max_tier = len(upgrade_costs)`) |

Each item ships with **2 upgrade tiers**, priced off the buy cost (`×1.5`, then `×3`).
The shipped catalog (coins):

| key | track | buy | unlock | upgrades (t1, t2) |
|-----|-------|-----|--------|-------------------|
| `tree` | nature | 40 | lvl 1 | 60, 120 |
| `flower` | nature | 25 | lvl 1 | 38, 75 |
| `pond` | nature | 80 | lvl 4 | 120, 240 |
| `hut` | structure | 60 | lvl 2 | 90, 180 |
| `cottage` | structure | 90 | lvl 3 | 135, 270 |
| `barn` | structure | 120 | lvl 4 | 180, 360 |
| `car` | structure | 130 | lvl 5 | 195, 390 |
| `beach_house` | structure | 150 | lvl 6 | 225, 450 |
| `boat` | structure | 170 | lvl 8 | 255, 510 |
| `goldfish` | companion | 30 | lvl 1 | 45, 90 |
| `bird` | companion | 35 | lvl 2 | 53, 105 |
| `cat` | companion | 50 | lvl 3 | 75, 150 |
| `snake` | companion | 60 | lvl 4 | 90, 180 |
| `fox` | companion | 70 | lvl 5 | 105, 210 |
| `dog` | companion | 90 | lvl 6 | 135, 270 |

All costs are tunable constants — retuning needs no migration. `COINS_PER_LEVEL = 50`.

## Computed state

In `sanctuary_service`, from the user's level (via `dashboard_service.get_stats`, on
**earned XP**) and the stored holdings:

- **Coins** — `level × COINS_PER_LEVEL − Σ spent`, where spent of an owned item at tier
  `t` is `cost + Σ upgrade_costs[0..t-1]`. Clamped to ≥ 0 (legacy gardens may show 0).
- **Owned** — each holding with its `tier`, `max_tier`, and `next_upgrade_cost`
  (`null` when maxed).
- **Shop** — every catalog item with `unlocked = level ≥ unlock_level` and a hint
  otherwise.
- **Vitality** — a thriving/dim flag from `current_streak_days`; visual only, never
  destructive.

## API

Layered route → service → model, user-scoped, default-deny (the standard checklist).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/sanctuary` | coins, level, owned (with tier + upgrade cost), and the shop |
| `POST` | `/api/v1/sanctuary/buy` | `{ item_key }` → buy a fresh tier-0 item · `404` unknown · `409` locked or too poor |
| `POST` | `/api/v1/sanctuary/items/{id}/upgrade` | upgrade one tier · `404` not yours · `409` maxed or too poor |

Both writes validate the level requirement (buy) and the **balance** before committing.

## Frontend

- **Where:** a compact scene renders on the **dashboard** (the home you land on), so
  the garden is the first thing you see; a dedicated **`/sanctuary` page** (nav button,
  shipped in Phase 3) gives the full view with the completion celebration.
- **Render:** **procedural SVG** (`components/SanctuaryPlant.tsx`) — each catalog item
  is drawn parametrically from its `progress` (0..1), so a plant grows smoothly as you
  practice (vector, scalable). It shipped after an initial ASCII pass; because the data
  model is **render-agnostic** (the backend only sends `item_key` + `progress`), the
  swap was frontend-only with no API change.
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
   flourishing, visual-only).
5. ✅ **Procedural SVG render** — vector plants drawn from `progress`, replacing the
   ASCII (frontend-only, no API change).

## Out of scope (here)

Stripe cosmetic packs (a [monetization](../../docs/future-features.md#payments--monetization)
tie-in), procedural SVG, and several-items-growing-at-once — all deferred; see the ADR.
