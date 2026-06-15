# Sanctuary Design — a garden you build with coins

[← Back to README](../../README.md) · Related: [ADR-0012 (personalization)](../decisions/0012-sanctuary-personalization.md) · [ADR-0011 (spend economy)](../decisions/0011-sanctuary-spend-economy.md) · [ADR-0010 (superseded)](../decisions/0010-sanctuary-cultivation.md) · [gamification](gamification.md) · [data-model](data-model.md)

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
  position        INT          -- display order: 0, 1, 2, …
  variant         TEXT NULL    -- chosen base form; NULL = the item's default variant
  customizations  JSONB        -- {slot: option} purchased; default '{}'
  created_at      timestamptz  server default now()
  UNIQUE (user_id, position)
  INDEX (user_id)
```

Still no `user_wallet` and no spend ledger — the holdings *are* the ledger
([ADR-0011](../decisions/0011-sanctuary-spend-economy.md)). `item_key` may repeat. The old
`tier` INT column was migrated into `customizations.grown` and dropped.

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
| `tree` | nature | 40 | lvl 1 | oak·pine·cherry·willow | grown·60 · foliage{fruit,blossom,autumn}·30 · swing·25 · birdhouse·20 |
| `flower` | nature | 25 | lvl 1 | rose·tulip·sunflower·daisy | grown·38 · bloom{double}·18 · butterfly·20 |
| `pond` | nature | 80 | lvl 4 | — | grown·120 · lilies·40 · koi·50 · bridge·60 |
| `hut` | structure | 60 | lvl 2 | straw·wood | grown·90 · chimney_smoke·30 · garden·35 · lights·25 |
| `cottage` | structure | 90 | lvl 3 | cream·stone | grown·135 · chimney_smoke·40 · garden·45 · lights·35 |
| `barn` | structure | 120 | lvl 4 | red·gray | grown·180 · chimney_smoke·50 · garden·55 · lights·45 |
| `car` | structure | 130 | lvl 5 | red·blue·yellow | grown·195 · lights·45 |
| `beach_house` | structure | 150 | lvl 6 | white·teal | grown·225 · garden·60 · lights·55 |
| `boat` | structure | 170 | lvl 8 | wood·white | grown·255 · lights·60 |
| `goldfish` | companion | 30 | lvl 1 | orange·white·black | grown·45 |
| `bird` | companion | 35 | lvl 2 | bluebird·robin·canary | grown·53 · accessory{hat}·25 |
| `cat` | companion | 50 | lvl 3 | gray·ginger·black·white | grown·75 · accessory{collar,bandana,hat}·25–30 |
| `snake` | companion | 60 | lvl 4 | green·amber·blue | grown·90 · accessory{hat}·30 |
| `fox` | companion | 70 | lvl 5 | red·arctic | grown·105 · accessory{collar,bandana}·30 |
| `dog` | companion | 90 | lvl 6 | corgi·husky·shiba·dalmatian | grown·135 · accessory{collar,bandana,hat}·30–40 |

Variants are free in the shipped catalog (a per-variant `cost_delta` is supported for
future tuning). All costs are tunable constants — retuning needs no migration.
`COINS_PER_LEVEL = 50`.

## Computed state

In `sanctuary_service`, from the user's level (via `dashboard_service.get_stats`, on
**earned XP**) and the stored holdings:

- **Coins** — `level × COINS_PER_LEVEL − Σ spent`, where spent of an owned item is
  `buy_cost + variant_cost_delta + Σ (cost of each purchased customization option)`.
  Clamped to ≥ 0 (legacy gardens may show 0). Legacy rows (no variant, empty
  customizations) cost exactly the buy price — no retroactive spend.
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

Both writes validate the level requirement and the **balance** before committing, and the
request bodies reject unexpected fields. The old `/upgrade` (tier ladder) route is removed
in favour of `/customize`.

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

## Out of scope (here)

Stripe cosmetic packs (a [monetization](../../docs/future-features.md#payments--monetization)
tie-in), procedural SVG, and several-items-growing-at-once — all deferred; see the ADR.
