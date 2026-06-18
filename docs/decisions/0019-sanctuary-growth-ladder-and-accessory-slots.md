# ADR-0019: Sanctuary — multi-stage growth ladder + additive accessory slots

**Status:** Accepted · 2026-06 · Extends [ADR-0012](0012-sanctuary-personalization.md) (variants/customizations) + [ADR-0013](0013-sanctuary-progressive-pricing.md) (derived balance) · Detail: [Sanctuary design](../design/sanctuary.md)

## Context

The Sanctuary personalises items on two axes — a **variant** chosen at purchase and
independent, mix-and-match **customization slots** bought over time ([ADR-0012](0012-sanctuary-personalization.md)).
One of those slots, `grown`, is the size axis: the old linear tier ladder was folded into a
single on/off `"grown"` option (the historical tier-1 upgrade, cost `round(base × 1.5)`).

Two gaps remained:

1. **Growth was a single step.** A plant was either un-grown or grown — there was no sense of
   a thing *maturing* over a long practice arc. A garden you tend for months should visibly
   deepen, not plateau after one upgrade.
2. **Characters had thin dress-up.** Companions had at most one `accessory` slot (a
   collar/bandana/hat). There was little to fuss over and collect for the dogs, cats, and
   whimsy friends.

The hard constraint is the same as every Sanctuary change: the coin balance is **derived**
(`earned − spent`) and `spent` is recomputed from the *current* in-code catalog, with no
wallet or ledger ([ADR-0011](0011-sanctuary-spend-economy.md)). Any cost change re-prices
every existing garden, and **no legacy holding may be re-priced into the red or have its
spend silently shift**.

## Decision

### 1. A four-stage growth ladder in the `grown` slot

The `grown` slot becomes a *sequential ladder* of four mutually-exclusive stages per item:

```
grown → flourishing → mature → ancient
```

each a rung with a **strictly rising cost** and a **non-decreasing unlock_level**:

| rung | cost (× item `base`) | unlock_level |
|------|----------------------|--------------|
| `grown` | 1.5 | 1 |
| `flourishing` | 2.4 | 3 |
| `mature` | 3.6 | 5 |
| `ancient` | 5.0 | 8 |

`_grown(cost)` is generalised into a ladder builder `_growth_ladder(base)` →
`((stage, cost, unlock_level), …)`, fed to a new `_Build.ladder()`. The catalog change is a
one-line edit per item (`.ladder(_growth_ladder(N))`), no migration.

**Backward-compat (critical):** the first rung is keyed **literally `"grown"`** at the
**unchanged** cost `round(base × 1.5)` — byte-for-byte the value the old `_grown` helper and
the old tier-1 upgrade returned. So any legacy row with `customizations = {"grown": "grown"}`
still resolves to a real option, renders, and its `spent()` is **unchanged**. The three new
rungs are pure additions *above* it; they can only ever raise spend if a user *chooses* to
advance a stage.

**Why the spend math is safe.** Slots are mutually-exclusive-within and a swap charges only
the *difference* (the existing `customize` logic). Advancing `grown → flourishing` charges
`flourishing.cost − grown.cost`; the total ever sunk into the slot is always exactly the
*currently-applied* stage's cost (the `customizations_cost` sum has one entry per slot). The
derived balance handles this with no new accounting.

### 2. Progressive SVG art per stage

`SanctuaryPlant.tsx` previously passed a `grown: boolean` to each renderer. It now passes a
`stage: number` (0 = un-grown base; 1–4 = the ladder rungs), derived by `growthStage(cust)`
— which maps the legacy `"grown"` value to stage 1 exactly. Each renderer scales **and adds
detail** by stage, so every step is clearly distinct but on-aesthetic (calm, flat, the
existing style): e.g. a tree gains canopy lobes and a gnarled, rooted trunk; a flower sprouts
extra leaves and a companion bud; a building gains windows and an upper storey; a hedgehog
bristles more quills; the mushroom ring sprouts more toadstools.

### 3. Additive dress-up slots on the characters

New **independent** slots (mix-and-match, mutually-exclusive within each) on the companion +
whimsy characters where they read well:

- **`headwear`** — `hat` · `flower_crown` · `tiny_crown`
- **`collar`** — `bandana` · `bowtie` · `bell`
- **`attire`** — `scarf` · `sunglasses`

Applied judiciously: `cat`, `dog`, `fox` carry all three; `bird` carries `headwear` + `attire`;
`hedgehog` and `snake` carry `headwear`. Each option has real SVG art drawn on the character.
The **legacy `accessory` slot is left untouched** (so existing collar/bandana/hat/scarf/leaf
rows render exactly as before); the new slots are additions alongside it.

## Consequences

- **No migration, no schema change.** The ladder, the new slots, and all costs are in-code
  constants on the catalog ([ADR-0011](0011-sanctuary-spend-economy.md)). Retuning or adding a
  rung/slot is a code edit.
- **Legacy gardens are exactly preserved.** The `"grown"` rung's cost is unchanged and the
  new rungs/slots are opt-in, so no pre-owned configuration's derived balance can move (let
  alone go negative). Verified by a legacy `{"grown":"grown"}` spend-unchanged test.
- **Calm by design.** Growth is slow and visual; the dress-up is a quiet collectible, never a
  nag. The customize panel already iterates slots/options generically, so the new ladder and
  slots surface and are buyable with no bespoke UI.
- **Catalog grows.** The single catalog module is now larger; splitting it out (already
  flagged in [future-features](../../docs/future-features.md)) becomes a touch more pressing.

## Alternatives considered

- **A separate `stage` column / numeric tier.** Rejected — reintroduces stored economy state
  and a migration, the very thing [ADR-0011](0011-sanctuary-spend-economy.md) removed. Folding
  stages into `grown` slot options keeps the balance fully derived.
- **Renaming the first rung away from `"grown"`.** Rejected — it would orphan every legacy
  `{"grown":"grown"}` row (unknown option → spend silently drops, balance jumps). Keeping the
  literal key is the whole backward-compat guarantee.
- **A new `accessory` slot for scarf/sunglasses.** Rejected — the key `accessory` already
  exists with a different meaning on several characters; reusing it would clash. The new
  attire concept lives under a distinct `attire` slot.
