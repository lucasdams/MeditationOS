# ADR-0016: Sanctuary — shop expansion (whimsy track) + holistic economy retune

> **Superseded by [ADR-0022](0022-spirit-companion-replaces-sanctuary.md)** — the Sanctuary was retired in favour of the Spirit companion. Kept for historical rationale.

**Status:** Accepted · 2026-06-16 · Extends [ADR-0013](0013-sanctuary-progressive-pricing.md) (economy) + [ADR-0012](0012-sanctuary-personalization.md) (variants/customizations) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

Two things had drifted on the same surface, so we fix them together in one pass:

1. **The shop felt thin and a little earnest.** The catalog was a sensible set of plants,
   structures, and pets, but short on *character* — there was little to smile at, and not
   much aspirational long tail. A calm app can still have personality.
2. **Coins accrue slower than the last retune assumed.** [ADR-0013](0013-sanctuary-progressive-pricing.md)
   raised `COINS_PER_LEVEL` 50 → 70 to compensate for the front-loaded per-session XP curve
   ([dashboard XP tiers](../../backend/app/services/dashboard_service.py)). But under that
   curve a 20-min sit is ~40 XP and a long sit much less, so reaching the mid-levels — and
   thus coins — is slower than 70/level priced for. Mid-game purchase cadence stalled.

The hard constraint is **retroactive balance safety**: the coin balance is *derived*
(`earned − spent`) and `spent` is recomputed from the *current* catalog, with no wallet or
ledger ([ADR-0011](0011-sanctuary-spend-economy.md)). So any cost change re-prices every
existing garden. The retune must not drive a pre-owned configuration's balance negative.

## Decision

### 1. Expand the shop (+11 items, a new *whimsy* track)

A delightful, coherent troupe of garden friends and curios, plus a couple of nature/companion
additions, each with sensible variants and a few customization slots — every one with real
SVG art (in [`SanctuaryPlant.tsx`](../../frontend/src/components/SanctuaryPlant.tsx)) for the
item, each variant, and each visible option. Threaded across the level ladder so there's a
small smile to buy at most levels:

| key | track | unlock | personality |
|-----|-------|--------|-------------|
| `snail` | companion | 2 | "The garden's slowest philosopher. Carries home everywhere." |
| `mushroom_ring` | nature | 2 | "A fairy ring of toadstools. Don't step inside after dark — or do." |
| `garden_gnome` | whimsy | 2 | "Stands guard with great seriousness over a patch of nothing in particular." |
| `wind_chime` | whimsy | 3 | "Turns the breeze into something you can hear." |
| `lantern` | whimsy | 3 | "A small, steady glow for the evenings. It waits up for you." |
| `hedgehog` | companion | 3 | "Pointy on the outside, soft about everything on the inside." |
| `frog_lily` | whimsy | 4 | "A contented frog on a lily pad. The world's least urgent creature." |
| `scarecrow` | whimsy | 5 | "Scares precisely no one. The crows bring it gifts." |
| `fairy_door` | whimsy | 6 | "Set into the base of a tree. Knock gently; you might be expected." |
| `hammock` | whimsy | 7 | "For the fine art of doing nothing, beautifully." |
| `tea_cart` | whimsy | 12 | "A wandering little cart of tea and tiny cakes. The garden's quiet luxury." |

### 2. Personality in copy (a quiet smile, not a circus)

A new optional **`blurb`** flavour line on `CatalogItem`, surfaced subtly in the shop (a quiet
italic line under the item name + a hover tooltip). Every catalog item — old and new — got a
calm, characterful blurb. The shop subtitle and empty-state copy were warmed up too. This
honours the saved **calm, low-pressure** preference: personality is welcome, clutter and
shouting are not. `blurb` is cosmetic and never enters the spend computation.

### 3. Holistic economy retune (the two global levers only)

- **`COINS_PER_LEVEL` 70 → 80.** Restores a steady mid-level purchase cadence under the
  front-loaded XP curve without inflating early reward.
- **`PROGRESSIVE_STEP` 8 → 6.** Softens the anti-hoarding surcharge so a growing garden feels
  fair rather than punitive, while still raising the stakes on each new acquisition.
- **Existing items' base/variant/option costs unchanged.** New items are priced into the
  ladder; the long tail (`tea_cart`, 120 @ lvl 12) is aspirational.

**Target pacing** (coins = `level × 80`; cheapest-first, surcharge step 6):

- **First item ~level 1.** A fresh level-1 user has 80 coins — enough for two cheap items
  immediately (e.g. flower 20, goldfish 20 + surcharge 6).
- **A steady mid-game cadence.** New unlocks land at levels 2–7 (gnome, chime, lantern,
  hedgehog, frog, scarecrow, fairy door, hammock), so almost every level-up opens something
  new and affordable. By ~level 10 (800 coins) a varied garden of ~8–12 items is comfortably
  reachable.
- **An aspirational long tail.** Premium items gated to level 12+ (`tea_cart`), so there's
  always something to climb toward.

### 4. Retroactive-balance safety — why this retune cannot go negative

Both global levers move in the **safe (generous) direction**, and base costs are untouched:

- Raising `COINS_PER_LEVEL` (70 → 80) only **raises** `earned = level × CPL` for every user.
- Lowering `PROGRESSIVE_STEP` (8 → 6) only **lowers** `spent` (each item's surcharge shrinks).
- Unchanged base/variant/option costs leave the rest of `spent` identical.

So for any pre-owned configuration at any level, the new balance is **≥** its old balance,
and the existing `max(0, earned − spent)` clamp guarantees it is never negative. New items
can't affect a garden that doesn't own them. No item is re-priced *upward*, so no garden is
re-priced into the red. This is verified by
[`test_retune_never_drives_a_pre_owned_garden_negative`](../../backend/tests/test_sanctuary.py)
(seeds a mixed pre-owned garden, asserts new balance ≥ old ≥ 0) and a clamp property test for
a large garden at level 1.

## Consequences

- **No migration.** The catalog and all costs are in-code constants ([ADR-0011](0011-sanctuary-spend-economy.md)/[ADR-0013](0013-sanctuary-progressive-pricing.md)); retuning and adding items is a code edit. The `blurb` field and the new `whimsy` track value are likewise in-code; `track` is a free TEXT-ish label, not an enum column.
- **Calm by design.** Personality lives in optional blurbs and the art, never in nags or
  noise — consistent with the low-pressure product stance.
- **Tunability preserved.** `COINS_PER_LEVEL`, `PROGRESSIVE_STEP`, and every catalog cost
  remain single-line constants.

## Alternatives considered

- **Lower base costs instead of raising `COINS_PER_LEVEL`.** Also safe retroactively, but a
  blunter lever — it cheapens premium items we want to stay aspirational. Raising the coin
  rate lifts the whole curve evenly.
- **A geometric surcharge.** Rejected (as in ADR-0013) — harder to reason about and risks
  runaway late-game cost; the linear step stays legible.
- **Gating the whimsy track behind a single high level.** Rejected — spreading unlocks across
  levels 2–12 keeps the cadence of small delights steady rather than back-loaded.
