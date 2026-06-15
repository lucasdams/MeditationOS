# Sanctuary Design — a garden you build with coins

[← Back to README](../../README.md) · Related: [ADR-0014 (grid layout)](../decisions/0014-sanctuary-grid-layout.md) · [ADR-0013 (progressive pricing)](../decisions/0013-sanctuary-progressive-pricing.md) · [ADR-0012 (personalization)](../decisions/0012-sanctuary-personalization.md) · [ADR-0011 (spend economy)](../decisions/0011-sanctuary-spend-economy.md) · [ADR-0010 (superseded)](../decisions/0010-sanctuary-cultivation.md) · [gamification](gamification.md) · [data-model](data-model.md)

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
coins_spent  = Σ owned (buy_cost + variant_delta + Σ customization_costs + progressive_surcharge(position))
balance      = max(0, coins_earned − coins_spent)
```

The **progressive surcharge** ([ADR-0013](../decisions/0013-sanctuary-progressive-pricing.md))
makes each *additional* item cost more: the k-th item a user acquires (0-indexed by its
stable `position`) pays `round(PROGRESSIVE_STEP × k)` on top of its catalog price — the
first item pays nothing extra, each later one a linearly growing premium. It is a
deterministic function of the holding's ordinal alone, so the balance is still **fully
derived from holdings** — no wallet, no ledger.

## The loop

```
level up → coins → buy an item (or upgrade one you own) → it joins / improves the garden
```

## Personalization (variants + customizations)

A single linear tier ladder per item barely changed the art. The garden now personalizes
on two axes ([ADR-0012](../decisions/0012-sanctuary-personalization.md)), preserving the
derived-balance principle of ADR-0011:

- **Variant** — a base form chosen *at purchase*: a tree species (oak/pine/cherry/willow),
  a dog breed (corgi/husky/shiba/dalmatian), a flower type, a cat colour, a wall colour…
  The variant visibly changes the drawn SVG. `null` = the item's default (first) variant.
- **Customizations** — independent, named **slots**, each with options, bought over time
  and mixed and matched: a tree can have `foliage` ∈ {fruit, blossom, autumn} *and* a
  `swing` *and* a `birdhouse`; a dog can be `grown` *and* wear a `hat`. Slots are
  independent — applying one never replaces another. Within a slot, switching the chosen
  option charges only the difference, so it is never punishing.

The old `tier` is folded into a `grown` customization (the size slot), so existing spend
is preserved exactly with no break.

## Data model

One table — the holdings; the balance is computed.

```
sanctuary_plantings
  id              UUID         pk
  user_id         UUID         fk users ON DELETE CASCADE
  item_key        TEXT         -- references SANCTUARY_CATALOG (in code)
  position        INT          -- immutable acquisition order: 0, 1, 2, … (economy key)
  cell            INT          -- grid layout slot, row-major; rearranged freely (layout)
  variant         TEXT NULL    -- chosen base form; NULL = the item's default variant
  customizations  JSONB        -- {slot: option} purchased; default '{}'
  created_at      timestamptz  server default now()
  UNIQUE (user_id, position)
  UNIQUE (user_id, cell)
  INDEX (user_id)
```

Still no `user_wallet` and no spend ledger — the holdings *are* the ledger
([ADR-0011](../decisions/0011-sanctuary-spend-economy.md)). `item_key` may repeat. The old
`tier` INT column was migrated into `customizations.grown` and dropped.

`position` and `cell` are deliberately separate
([ADR-0014](../decisions/0014-sanctuary-grid-layout.md)). `position` is the **immutable
acquisition order** the progressive surcharge is keyed off (ADR-0013), so it must never be
reordered — moving an item by rewriting `position` would silently re-price the garden and
shift balances. `cell` is a **layout-only** row-major grid index the user rearranges by
dragging; it has no effect on cost. New items are bought into the lowest free cell;
existing gardens backfilled `cell = position`, so they keep their prior order as the
initial layout.

## Catalog (in-code constant)

`SANCTUARY_CATALOG` is the single source of truth for what can be grown — keyed like
`SESSION_TYPES` and the gratitude `CATEGORIES`. Each entry:

| field | meaning |
|-------|---------|
| `key` | stable id stored in `sanctuary_plantings.item_key` |
| `track` | `nature` · `structure` · `companion` |
| `cost` | coins to **buy** (default variant, no customizations) |
| `unlock_level` | level required before it appears in the shop |
| `variants` | selectable base forms (each with an optional `cost_delta` + `unlock_level`) |
| `slots` | customization slots → `{option: cost}` (+ optional per-option `unlock_level`) |

The shipped catalog (buy cost / variants / customization slots):

| key | track | buy | unlock | variants | customization slots (option·cost) |
|-----|-------|-----|--------|----------|-----------------------------------|
| `tree` | nature | 30 | lvl 1 | oak·pine·cherry·willow | grown·45 · foliage{fruit,blossom,autumn}·30 · swing·25 · birdhouse·20 |
| `flower` | nature | 20 | lvl 1 | rose·tulip·sunflower·daisy | grown·30 · bloom{double}·18 · butterfly·20 |
| `pond` | nature | 60 | lvl 4 | — | grown·90 · lilies·40 · koi·50 · bridge·60 |
| `hut` | structure | 45 | lvl 2 | straw·wood | grown·68 · chimney_smoke·30 · garden·35 · lights·25 |
| `cottage` | structure | 70 | lvl 3 | cream·stone | grown·105 · chimney_smoke·40 · garden·45 · lights·35 |
| `barn` | structure | 90 | lvl 4 | red·gray | grown·135 · chimney_smoke·50 · garden·55 · lights·45 |
| `car` | structure | 100 | lvl 5 | red·blue·yellow | grown·150 · lights·45 |
| `beach_house` | structure | 110 | lvl 6 | white·teal | grown·165 · garden·60 · lights·55 |
| `boat` | structure | 130 | lvl 8 | wood·white | grown·195 · lights·60 |
| `goldfish` | companion | 20 | lvl 1 | orange·white·black | grown·30 |
| `bird` | companion | 25 | lvl 2 | bluebird·robin·canary | grown·38 · accessory{hat}·25 |
| `cat` | companion | 40 | lvl 3 | gray·ginger·black·white | grown·60 · accessory{collar,bandana,hat}·25–30 |
| `snake` | companion | 45 | lvl 4 | green·amber·blue | grown·68 · accessory{hat}·30 |
| `fox` | companion | 50 | lvl 5 | red·arctic | grown·75 · accessory{collar,bandana}·30 |
| `dog` | companion | 70 | lvl 6 | corgi·husky·shiba·dalmatian | grown·105 · accessory{collar,bandana,hat}·30–40 |

Variants are free in the shipped catalog (a per-variant `cost_delta` is supported for
future tuning). All costs are tunable constants — retuning needs no migration.
`COINS_PER_LEVEL = 70` and the `grown` size is `round(buy_cost × 1.5)`.

### Progressive pricing (ADR-0013)

Buy costs above were lowered (~25%) and `COINS_PER_LEVEL` raised 50 → 70 to keep early
progress rewarding after practice XP became front-loaded per session (coins now accrue more
slowly for longer sits). On top of the catalog price, each *additional* item carries a
**progressive surcharge** `round(PROGRESSIVE_STEP × position)` with `PROGRESSIVE_STEP = 8`
(position = the item's 0-indexed acquisition order). The first item pays nothing extra; the
second 8; the third 16; and so on. The surcharge is applied identically at read (the spent
computation) and at write (the `buy` affordability check), and a swap of a customization
*within a slot* still charges only the option difference (the surcharge is per-item, not
per-customization).

The cheaper base + higher `COINS_PER_LEVEL` offset the early surcharge so small/typical
gardens are never worse off; only larger gardens pay meaningfully more. Example garden of
N identical trees (old flat buy = 40, new buy = 30 + surcharge):

| items | old `coins_spent` | new `coins_spent` | balance @ lvl 6 (old→new) |
|------:|------------------:|------------------:|---------------------------|
| 1 | 40 | 30 | 260 → 390 |
| 3 | 120 | 114 | 180 → 306 |
| 6 | 240 | 300 | 60 → 120 |
| 10 | 400 | 660 | 0 → 0 |

Small gardens (1–3) are cheaper in raw spend; even where a larger garden's raw spend rises
(6, 10), the balance at a fixed level never drops below the old economy (clamped ≥ 0), so no
existing garden is punished.

## Computed state

In `sanctuary_service`, from the user's level (via `dashboard_service.get_stats`, on
**earned XP**) and the stored holdings:

- **Coins** — `level × COINS_PER_LEVEL − Σ spent`, where spent of an owned item is
  `buy_cost + variant_cost_delta + Σ (cost of each purchased customization option) +
  progressive_surcharge(position)` (the surcharge is keyed to the holding's stable
  position, so the balance stays derived). Clamped to ≥ 0 (legacy gardens may show 0). A
  single legacy row at position 0 carries no surcharge and costs exactly the buy price — no
  retroactive spend.
- **Owned** — each holding with its `variant`, `customizations` (`{slot: option}`), and
  `available` slots (each option with its cost + `unlocked` / `affordable` / `applied`
  hints).
- **Shop** — every catalog item with `unlocked = level ≥ unlock_level`, a hint otherwise,
  and its `variants` (each with `cost_delta` + unlock state).
- **Vitality** — a thriving/dim flag from `current_streak_days`; visual only, never
  destructive.

## API

Layered route → service → model, user-scoped, default-deny (the standard checklist).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/sanctuary` | coins, level, owned (variant + customizations + available slots), and the shop (with variants) |
| `POST` | `/api/v1/sanctuary/buy` | `{ item_key, variant? }` → buy a fresh item · `404` unknown item/variant · `409` locked or too poor · `422` bad shape |
| `POST` | `/api/v1/sanctuary/items/{id}/customize` | `{ slot, option }` → apply a customization · `404` not yours / unknown slot+option · `409` locked, already-applied, or too poor · `422` bad shape |
| `POST` | `/api/v1/sanctuary/items/{id}/move` | `{ cell }` → move to a grid cell (layout only — never touches `position` or pricing); swaps with whatever occupies the cell · `404` not yours · `422` bad shape / out-of-bounds cell |

The `customize` and `buy` writes validate the level requirement and the **balance** before
committing; `move` is layout-only and never changes the balance. All request bodies reject
unexpected fields. The old `/upgrade` (tier ladder) route is removed in favour of
`/customize`. `move` swaps cells atomically in one transaction (the moving row is parked on
a temporary out-of-range sentinel cell to avoid tripping `UNIQUE(user_id, cell)`), and
returns the updated scene.

## Frontend

- **Where:** a compact scene renders on the **dashboard** (the home you land on), so
  the garden is the first thing you see; a dedicated **`/sanctuary` page** (nav button,
  shipped in Phase 3) gives the full view with the completion celebration.
- **Render:** **procedural SVG** (`components/SanctuaryPlant.tsx`) — each catalog item is
  drawn from its `variant` + `customizations`, each of which is a *real* visual change
  (fruit/blossom/autumn leaves, a swing or birdhouse on a tree, lilies/koi/a bridge on a
  pond, smoke from a chimney, garden beds, warm lights, a hat/collar/bandana on a pet, the
  `grown` size). viewBox 0 0 80 80, flat style.
- **Buy:** items with more than one variant open a small **variant picker** modal (each
  form previewed) before purchase; single-form items buy directly.
- **Personalize:** each owned card has a calm "Personalize" panel listing its slots and
  options with cost and `applied` / `locked` / `affordable` state — mix and match over
  time. Validate (affordable + unlocked) before submit; server errors surface as a toast.
- **Arrange:** the garden renders on a row-major **grid** (`GRID_COLUMNS = 4`, mirroring
  the backend) ordered by `cell`, so each user lays their garden out where they want it
  ([ADR-0014](../decisions/0014-sanctuary-grid-layout.md)). Desktop supports **drag-to-move**
  (native HTML5 DnD — no new deps); touch/keyboard use a **tap-to-pick-then-tap-target**
  fallback (HTML5 DnD is unreliable on touch). Moves are optimistic, reverting with an
  error toast on failure. Layout-only — moving never changes coins.
- **States:** loading / error / empty as usual; the empty scene invites a first purchase.

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
6. ✅ **Personalization** — per-item **variants** chosen at purchase and independent,
   mix-and-match **customizations** bought over time, each a real SVG change; the tier
   ladder retired (`/upgrade` → `/customize`), `tier` folded into the `grown` slot. Still
   a derived balance, no wallet/ledger ([ADR-0012](../decisions/0012-sanctuary-personalization.md)).
7. ✅ **Movable grid layout** — a `cell` column (separate from the economy key `position`)
   + the `/move` endpoint let users arrange items on a grid by drag (desktop) or
   tap-to-place (touch). Layout-only; the economy is untouched
   ([ADR-0014](../decisions/0014-sanctuary-grid-layout.md)).

## Out of scope (here)

Stripe cosmetic packs (a [monetization](../../docs/future-features.md#payments--monetization)
tie-in), procedural SVG, and several-items-growing-at-once — all deferred; see the ADR.
