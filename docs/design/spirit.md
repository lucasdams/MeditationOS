# Spirit Design — a living companion that evolves down the path you practice

[← Back to README](../../README.md) · Related: [ADR-0022 (spirit replaces sanctuary)](../decisions/0022-spirit-companion-replaces-sanctuary.md) · [gamification](gamification.md) · [ADR-0009 (computed-from-activity)](../decisions/0009-gamification-computed-from-activity.md) · Supersedes the [Sanctuary design](sanctuary.md)

> **Status: proposed (not built).** This document and [ADR-0022](../decisions/0022-spirit-companion-replaces-sanctuary.md)
> describe a planned replacement for the Sanctuary. The Sanctuary ([design](sanctuary.md),
> ADR-0010–0021) is the shipped retention loop today; nothing here is live yet.

The Spirit is the product's next retention loop: a single **living companion** you awaken
once and grow through practice. Unlike the Sanctuary — a collection of static items you buy
and arrange — the Spirit is **one subject** with **state that changes between visits** and
that **reacts to you**. The loop is *practice → your spirit grows and brightens → it evolves*.

## Why replace the Sanctuary

The Sanctuary is well-built but emotionally flat. It is a **collection-and-decoration**
model: earn coins, buy a static SVG, arrange it on a grid. Three things it lacks are exactly
what makes a virtual companion bond:

1. **No single subject.** Attention is spread across many items; you bond with *one* creature.
2. **No state that lives between visits.** Items are inert. A companion has a mood/glow that
   *changed since you last looked* — the reason to open the app.
3. **No reciprocity.** Nothing reacts to you. A spirit that brightens when you practice and
   breathes with the pacer creates a relationship; a tree does not.

See [ADR-0022](../decisions/0022-spirit-companion-replaces-sanctuary.md) for the decision and
the alternatives (reframe / add-alongside) that were rejected in favour of a full replacement.

## Core principle — gamified, never punishing

The classic Tamagotchi engine is *neglect → decay → death*. That is a guilt loop and is the
opposite of this app's stance ([calm, low-pressure UX](gamification.md)). The Spirit keeps the
**bond and aliveness** of a virtual pet and throws away the **punishment**:

- **Progress is permanent and monotonic.** Evolution stage, bond level, and your collection of
  past spirits can **never be lost** — the same guarantee coins already have, by computing them
  from **earned XP** (total XP minus the volatile streak bonus). A lapse never resets anything.
- **Lapsing dims, it never harms.** When you are away, only the *surface daily glow* settles
  toward a calm "resting" state — never below a floor, never sick, never dying. Your next session
  brightens it instantly. The pull is a **happy reunion**, not fear of loss.

This "engaging *and* kind" tension is itself a differentiator.

## The standout hook — your practice shapes the evolution

You do not pick a companion from a menu. Everyone awakens the **same spark**, and *how you
practice* decides what it becomes:

| Dominant practice | Path | Final form (illustrative) |
|-------------------|------|---------------------------|
| Meditation / stillness | `stillness` | a serene **mini Buddha** |
| Resonance breathing | `breath` | an airy **wind spirit** |
| Gratitude + journaling | `heart` | a blooming **heart spirit** |

The dominant practice is **computed** from the same lifetime activity aggregates
`dashboard_service` already produces (meditation minutes, breathing minutes ×weight, gratitude
and journal counts). It is shown as a gentle *lean* on the early spark, then **commits** at
stage 2 (see below) — that single commitment is the only path state stored. After committing,
growth continues along that path. Three paths from four categories to start (gratitude and
journaling combine into `heart`); the model is extensible to more paths and forms.

This makes the "which companion?" question into **discovery and replay** — a breath-heavy and a
gratitude-heavy practitioner end up with visibly different creatures — rather than a one-time
dropdown choice.

## Growth — five stages, driven by level

Each path has a **five-stage** evolution ladder, **derived from the user's level** (which comes
from earned XP, so it is monotonic and shared with the coin wallet):

```
spark → wisp → fledgling → ascendant → radiant
```

Stage thresholds are **level bands** (tunable constants, no migration to retune). Stage is a
pure function of level — never stored, never lost. Reaching `radiant` is the long-horizon goal;
it unlocks the **collection / new-spark** loop below.

| Stage | Gate (illustrative) | What changes |
|-------|---------------------|--------------|
| spark | level 1 | pathless mote of light; leans toward your dominant practice |
| wisp | level 3 — **path commits here** | takes on its path's colour and silhouette |
| fledgling | level 7 | grows, gains its first defining feature |
| ascendant | level 14 | larger, fuller, path-specific flourishes |
| radiant | level 24 | final form; unlocks awakening a new spark |

## Reciprocity — it reacts to you

The Spirit lives on the **home screen** (replacing the dashboard Sanctuary scene) and reacts:

- **Idle:** a gentle floating / breathing animation, pose and aura by stage and path.
- **Daily glow (computed):** brightness/saturation rises with recent practice and settles toward
  a calm resting glow when you are away — never dark, never distressed.
- **On session complete:** a celebratory animation and a glow bump, integrated with the existing
  post-session `RewardOverlay`.
- **Breathing sync (signature moment):** during the resonance-breathing pacer (`BreathePage`),
  the spirit's aura/scale **expands on the inhale and contracts on the exhale**, in time with the
  pacer. Meditating *with* your companion is the emotional centrepiece.

## Coins — the economy survives, repurposed

The derived-balance economy is kept verbatim and repointed from "buy garden items" to "adorn
your spirit and its space":

```
coins_earned = level × COINS_PER_LEVEL          (level from earned XP — unchanged)
coins_spent  = Σ cosmetics owned (option cost)   (cosmetics on the active spirit)
balance      = max(0, coins_earned − coins_spent)
```

- No wallet row, no ledger — the **owned cosmetics are the ledger**, exactly as the Sanctuary's
  holdings were (see [ADR-0011](../decisions/0011-sanctuary-spend-economy.md)).
- Cosmetics reuse the Sanctuary's proven **slot/option** shape (`{slot: option}` in JSONB):
  auras, accessories, and a small **habitat / backdrop** the spirit sits in.
- The progressive-surcharge anti-hoarding tax is **dropped** — there is one subject now, so the
  hoarding problem it solved no longer exists.

## Data model

Maximally computed, in keeping with [ADR-0009](../decisions/0009-gamification-computed-from-activity.md)
and [ADR-0011](../decisions/0011-sanctuary-spend-economy.md): **store only the irreducible
decisions** (which path the spirit committed to, its name, its cosmetics, and the collection of
retired spirits). Stage, bond, daily glow, and coins are all derived.

```
spirits
  id            UUID            pk
  user_id       UUID            fk users ON DELETE CASCADE
  path          TEXT NULL       -- committed path: stillness | breath | heart; NULL = pathless spark (pre-commit)
  name          VARCHAR(40) NULL    -- optional nickname (cosmetic); trimmed, length-capped server-side
  cosmetics     JSONB           -- {slot: option} owned; default '{}'; the spend ledger
  awakened_at   timestamptz     server default now()
  retired_at    timestamptz NULL    -- set when radiant + user awakens a new spirit; NULL = the active one
  created_at    timestamptz     server default now()
  updated_at    timestamptz
  INDEX (user_id)
  partial UNIQUE (user_id) WHERE retired_at IS NULL   -- at most one active spirit per user
```

- **Active spirit** = the row with `retired_at IS NULL` (enforced by the partial unique index).
- **Collection** = the user's `retired_at IS NOT NULL` rows — past radiant spirits, kept forever.
- `path` is `NULL` until the spirit reaches the commit stage, then set **once** from the user's
  dominant practice (a crystallized decision, like a Sanctuary purchase — not derivable after the
  fact because hysteresis must prevent it flip-flopping). `name` and `cosmetics` are the only
  other stored state.

## Computed state

In a new `spirit_service`, from the user's level/streak (via the existing
`dashboard_service.get_wallet_basis`, on **earned XP**) and the stored spirit row:

- **Stage** — the level band the user's level falls into (`spark`…`radiant`). Monotonic.
- **Path lean / commit** — before commit, the *suggested* path from lifetime practice mix (a
  visual lean only); at the commit stage, written to `spirits.path` once.
- **Bond** — a friendly level read-out (reuses level + XP-into-level from `get_wallet_basis`).
- **Daily glow** — a brightness factor from recent activity (e.g. sessions in the last day or
  two), floored so it never goes dark. Visual only, never destructive.
- **Coins** — `level × COINS_PER_LEVEL − Σ cosmetics spent`, clamped ≥ 0 (unchanged formula).
- **Cosmetics** — owned `{slot: option}` plus the catalog of buyable options with
  `unlocked` / `affordable` / `applied` hints (same shape the Sanctuary customize panel uses).

## API

Layered route → service → model, user-scoped, default-deny (the standard
[security checklist](../../.claude/rules/security.md)).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/v1/spirit` | the active spirit: stage, path (or lean), bond, daily glow, coins, owned cosmetics + the catalog with state; plus the retired collection |
| `POST` | `/api/v1/spirit/cosmetics` | `{ slot, option }` → buy/apply a cosmetic · `404` unknown slot+option · `409` locked / already-applied / too poor · `422` bad shape |
| `PATCH` | `/api/v1/spirit` | `{ name? }` → set/clear the nickname (cosmetic; never changes coins) · `422` bad shape / over-length |
| `POST` | `/api/v1/spirit/awaken` | (no body) → retire the current `radiant` spirit and awaken a new pathless spark · `409` if the active spirit is not yet radiant |

The `awaken` write requires the active spirit to be at `radiant`; it stamps `retired_at` on the
current row and inserts a fresh pathless spark in one transaction. All request bodies reject
unexpected fields.

## Frontend

- **Where:** the spirit renders as the **home-screen centrepiece** (the dashboard scene slot the
  Sanctuary occupies today), with a dedicated **`/spirit` page** for the full view, the cosmetics
  shop, and the collection of retired spirits.
- **Render:** **procedural SVG**, reusing and extending the companion renderers in
  `SanctuaryPlant.tsx` (dog/cat/fox/bird are already drawn). Each path × stage is a distinct
  drawn form; the mini Buddha is a new renderer.
- **Reactivity:** an animation layer (CSS/SVG transforms — no new deps) for idle float, the
  session-complete celebration, the daily-glow brightness, and the **breathing-pacer sync** on
  `BreathePage`. This is where "stand out" is won; it is the bulk of the frontend effort.
- **Cosmetics:** the existing calm "personalize" panel pattern (preview-on-hover, affordable /
  locked / applied state) repointed at the spirit's slots.
- **States:** loading / error / empty as usual; the empty state is the **awakening** of the first
  spark.

## Migration from the Sanctuary

No existing user resets to zero:

- **Stage from level.** A user's current level maps straight onto a starting stage, so a
  long-time practitioner awakens an already-grown spirit rather than a bare spark.
- **Path from history.** Their dominant lifetime practice seeds a suggested (and, past the commit
  stage, committed) path.
- **Coins are generous.** Coins are still `level × COINS_PER_LEVEL` minus *cosmetic* spend; past
  garden spend is no longer subtracted, so balances only rise (monotonic-safe — no one loses
  coins).
- **`sanctuary_plantings` is retained, not dropped,** by the first migration (read-nothing), so
  the cutover is reversible; a later migration removes it once the Spirit is established.

## Build order

Each step is independently shippable.

1. **Spirit state + read API** — `spirits` table + migration, `spirit_service` computing stage /
   bond / glow / coins, and `GET /spirit`. Seed every user an active spark (or a stage from their
   level on migration). No reactivity yet.
2. **Static spirit on home** — render the spark/stage on the dashboard, procedural SVG per stage,
   replacing the Sanctuary scene. Loading / error / empty (awakening) states.
3. **Path branching** — compute the lifetime practice-mix lean; commit `path` at stage 2; draw
   the three path forms across the five stages.
4. **Reactivity layer** — idle float, daily glow, session-complete celebration (via
   `RewardOverlay`), and the breathing-pacer aura sync on `BreathePage`. The signature work.
5. **Cosmetics economy** — repoint the derived wallet at spirit cosmetic slots; `POST
   /spirit/cosmetics`, `PATCH /spirit` (name), the personalize panel, and a small habitat/backdrop.
6. **Collection / new spark** — `POST /spirit/awaken` at `radiant`, the `/spirit` page, and the
   gallery of retired spirits (long-term replay).
7. **Retire the Sanctuary** — remove the Sanctuary routes/UI; a later migration drops
   `sanctuary_plantings`; supersede ADR-0010–0021.

## Out of scope (here)

Multiple simultaneous spirits, trading/sharing, Stripe cosmetic packs (a
[monetization](../future-features.md#payments--monetization) tie-in), and audio reactions —
all deferred. The first cut is one spirit, three paths, computed state, and a strong reactivity
layer.
</content>
</invoke>
