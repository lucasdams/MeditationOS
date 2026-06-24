# ADR-0021: Sanctuary — evolution-tree framework (form fork + deeper ladder) + preview locked options

> **Superseded by [ADR-0022](0022-spirit-companion-replaces-sanctuary.md)** — the Sanctuary was retired in favour of the Spirit companion. Kept for historical rationale.

**Status:** Accepted · 2026-06 · Extends [ADR-0020](0020-sanctuary-growth-ladder-and-accessory-slots.md) (growth ladder + accessory slots) · Builds on [ADR-0012](0012-sanctuary-personalization.md) (variants/customizations) + [ADR-0011](0011-sanctuary-spend-economy.md)/[ADR-0013](0013-sanctuary-progressive-pricing.md) (derived balance) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

The Sanctuary personalises each item along independent **slots** — a `grown` size ladder
([ADR-0020](0020-sanctuary-growth-ladder-and-accessory-slots.md)), foliage, dress-up, and so
on. Two things were missing for a sense of a thing *evolving* over a long practice arc, and a
[#269] preview feature only worked for options you could already afford:

1. **No branching identity.** Growth was a straight ladder — every grown item ended the same
   way, just bigger. There was no late-game *choice* of what an item becomes (an oak that turns
   mighty vs. one that turns to a blossoming bower vs. a hollow elder).
2. **The ladder plateaued at four stages.** A garden tended for months still topped out at
   `ancient`.
3. **You couldn't preview what you were working toward.** The see-it-before-you-buy preview
   (#269) fires on hover/focus, but **disabled** buttons emit neither — so locked (level-gated)
   and unaffordable options, exactly the aspirational ones, never previewed.

The hard constraint is unchanged: the coin balance is **derived** (`earned − spent`) and
`spent` is recomputed from the *current* in-code catalog, with no wallet/ledger
([ADR-0011](0011-sanctuary-spend-economy.md)). No legacy holding may be re-priced into the red
or have its spend silently shift — in particular the legacy `{"grown":"grown"}` rows.

This is **part 1 of a per-track rollout**: it builds the framework and applies it to the
**nature** track only. Structure, companion, and whimsy follow in later PRs using the same
helpers, with no further framework churn.

## Decision

### 1. The evolution fork = a new mutually-exclusive `form` slot

A "branching fork" is simply a **new slot** named `form` whose 2–3 options are **named evolved
forms** of the item. Slots are already *mutually-exclusive within* and *additive across*
([ADR-0012](0012-sanctuary-personalization.md)), so the within-`form` exclusivity **is** the
fork: choosing `mighty` excludes `blossoming` and `hollow_ancient`. Every form is gated at or
above the **top of the growth ladder** (`TOP_GROWTH_UNLOCK`), so a fork is a strictly late-game
choice — you only evolve an item you've already grown all the way up.

Because `form` is an ordinary slot, it flows through the existing `customize` (swap charges only
the difference), `spent()`, `_available_slots`, and the UI's generic slot iteration with **no
new machinery**. Declaring a fork is one builder line:

```python
.form(*_form_fork(base, ("mighty", 4.0, 0), ("blossoming", 4.2, 1), ("hollow_ancient", 4.4, 2)))
```

- `_Build.form(*forms)` adds the `form` slot; each form is `(option_key, cost, unlock_level)`.
- `_form_fork(base, *(key, cost_mult, unlock_offset))` keeps fork declarations terse + consistent
  across tracks: `cost = round(base * mult)`, `unlock_level = TOP_GROWTH_UNLOCK + offset`
  (offset `0` = the ladder top, `≥1` = above it).

### 2. The growth ladder deepens to five stages

`GROWTH_STAGES` gains a fifth rung **`venerable`** above `ancient`, built by the same zipped
tuples (`strict=True`), so adding a stage is a one-token edit to each of `GROWTH_STAGES`,
`_GROWTH_COST_MULT` (`… 5.0, 6.6`), and `_GROWTH_UNLOCK` (`… 8, 11`). Cost rises strictly and
the unlock level is non-decreasing, as before.

```
grown → flourishing → mature → ancient → venerable
```

**Backward-compat (critical, unchanged):** the original four keys, order, costs, and unlock
levels are preserved **byte-for-byte**. The first rung is still keyed literally `"grown"` at
`round(base * 1.5)`, so every legacy `{"grown":"grown"}` row resolves to stage 1 and re-prices
identically. The new rung is a pure addition above the others — it can only raise spend if a user
*chooses* to climb to it.

### 3. A nature-appropriate additive slot per nature item

The third axis (`.slot(...)`) already supported additive slots. Each nature item gains one:

| item | `form` fork (evolved forms) | additive slot |
|------|-----------------------------|---------------|
| `tree` | `mighty` · `blossoming` · `hollow_ancient` | `critter` (songbird · squirrel) |
| `flower` | `wildflower` · `cultivated` · `luminous` | `pollinator` (bee · dragonfly) |
| `mushroom_ring` | `witchs_circle` · `moonlit` | `firefly` (fireflies) |
| `pond` | `mountain_tarn` · `lotus_pool` | `waterfowl` (duck · swan) |

Every new form, the `venerable` stage, and every additive option has **distinct SVG art** drawn
in `SanctuaryPlant.tsx`. Forms change the silhouette (a mighty broad crown, a blossom bower, a
knot-hollow trunk; a luminous halo; a moonlit ring; a lotus-strewn pool); `venerable` adds extra
canopy/leaves/toadstools; the additive slots add the little creatures.

**Only the nature track is touched** this PR; structure/companion/whimsy items deliberately have
**no** `form` slot yet (asserted by a test), so the later-track agents can add theirs cleanly.

### 4. Preview locked & unaffordable options (UI)

The see-it-before-you-buy preview (#269) re-renders the item with a hovered/focused option merged
in. A **disabled** button emits no hover/focus, so locked/unaffordable options — the aspirational
ones — never previewed. The fix, in `SanctuaryPage.tsx`:

- A locked (level-gated) or unaffordable option is rendered **not `disabled`** (so it *does* emit
  hover/focus and previews) but stays **functionally gated**: it carries `aria-disabled`, a muted
  `.gated` style, and its lock/level hint; its click handler is a **no-op** (`buyable` is false),
  so a gated option can never purchase. Only an already-applied option or an in-flight write hard-
  disables the button.

This is generic over the slot/option system, so the new `form` fork — and every future track's
fork — previews automatically: a player can hover an evolved form they haven't reached yet and
*see what they're working toward* before earning it.

## Consequences

- **No migration, no schema change.** The fork, the fifth rung, and the additive slots are in-code
  catalog constants ([ADR-0011](0011-sanctuary-spend-economy.md)). The `form` slot stores like any
  other (`customizations.form`).
- **Legacy gardens are exactly preserved.** The original `grown` rungs are untouched and `form` is
  opt-in and high-gated, so no pre-owned configuration's derived balance can move. Verified by a
  legacy `{"grown":"grown"}` spend-unchanged test (re-asserted after the deepening).
- **Tracks 2–4 are a clean follow-up.** A track adds forks with `.form(*_form_fork(...))`, an
  additive `.slot(...)`, and the matching SVG — no framework edits. A test asserts non-nature items
  have no fork yet, so an incomplete rollout can't ship silently.
- **The preview now teaches the ladder.** Locked/unaffordable options preview, so the customize
  panel doubles as a goal board — calmly, never pushily.

## Alternatives considered

- **A dedicated `form`/`evolution` column or a typed enum.** Rejected — reintroduces stored economy
  state + a migration, the very thing [ADR-0011](0011-sanctuary-spend-economy.md) removed. A normal
  mutually-exclusive slot gives the fork for free.
- **Making the fork a *variant* (chosen at purchase).** Rejected — variants are the base form picked
  up front; an evolution is a late-game *earned* choice. Modelling it as a high-gated slot keeps it a
  reward for tending an item, and lets the player re-route (swap forms) for the difference.
- **Letting locked options stay `disabled` and adding a separate "what's next" gallery.** Rejected —
  more UI, more surface. Un-disabling-but-gating reuses the existing preview path and keeps the panel
  the single place to explore an item.
