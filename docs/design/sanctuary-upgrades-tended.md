# Sanctuary Upgrades — "Tended": growth from practice, not coins

[← Back to README](../../README.md) · Related: [sanctuary](sanctuary.md) · [gamification](gamification.md) · [ADR-0020 (growth ladder)](../decisions/0020-sanctuary-growth-ladder-and-accessory-slots.md) · [ADR-0021 (evolution tree)](../decisions/0021-sanctuary-evolution-tree-and-preview-locked.md)

> **Status:** MVP shipped for the **oak only** — a small, reversible proof. Every other
> item is unchanged (coin-bought growth). The phases below are a proposal, not a commitment.

## The problem — upgrades are decoupled from practice

Today the Sanctuary is a single spend economy (see [sanctuary.md](sanctuary.md)). Coins come
from your **level** (computed from earned XP), and *everything* you do to an item is a coin
transaction: buy it, pick a variant, grow it up the `grown` ladder, fork its `form`. Growth —
the most emotionally resonant beat, an oak visibly maturing into an ancient giant — is bought.

So the chain from practice to an item's *look* is laundered:

```
practice → XP → level → coins → buy-a-recolor / buy-a-bigger-tree
```

By the time it reaches the garden, **how** you practiced is invisible. A user who sat every
morning for six months and a user who bought a coin pack (a future monetization tie-in) reach
the same ancient oak the same way — by spending. The garden rewards *acquisition*, not
*tending*. For a data-first wellness app whose whole thesis is "your practice, made visible",
that's a missed beat.

## The thesis — two currencies, split by what they should reward

Don't replace the coin economy — **split it**, so each currency does the one thing it's good at:

- **Coins keep doing acquisition.** Buy the item, pick its variant, buy cosmetic adornment
  slots (foliage, swings, critters, dress-up, the `form` evolution fork). Unchanged: derived
  balance, no wallet, no ledger, the progressive surcharge, all of it. Coins are how you
  *gather* a world.
- **A new "Tending" signal drives growth — for free, by showing up.** Tending is a single
  **monotonic** score `T` **derived from real practice** (distinct practice days, your longest
  streak, breathing and meditation minutes, a little variety). It is **never stored, never
  spent**, computed read-time exactly like XP and streaks. As `T` climbs, an item advances up
  its growth ladder **at no coin cost** — the tree grows because *you* did, not because you
  paid.

This keeps the property the whole gamification layer is built on (see
[gamification.md](gamification.md#why-computed-not-stored)): **everything derived, nothing
stored**. Tending invents no table and no migration — it's one more read-time computation over
the immutable activity log.

It is also **exploit-proof by construction**: you cannot buy past practice. There is no coin
path to a Tending-gated stage, so a coin pack (or any future purchase) can never shortcut it.
Growth is the one thing money can't buy.

## How Tending is computed

`get_tending_basis(db, user_id, *, today, tz)` in `sanctuary_service.py` returns a single
non-negative integer score `T`, blended from existing practice signals — the same signals the
dashboard already computes, reusing the same anti-spam flooring:

| Signal | Why it's in the blend | Weight |
|--------|-----------------------|-------:|
| **Distinct practice days** | Showing up is the core habit; this is the heaviest weight. Reuses the `MIN_PRACTICE_SECONDS` (60s) practice-day floor — a 1-second sit doesn't count a day. | ×3.0 |
| **Longest streak** | Rewards sustained consistency. Uses **longest**, not current, so `T` is **monotonic** — a lapsed streak never lowers it (current streak is deliberately *not* used; it falls back when you miss a day). | ×2.0 |
| **Breathing minutes** | The harder, signature practice — weighted above plain meditation, mirroring its 3× XP. Floored per whole minute and **daily-capped** (anti-spam). | ×1.0 |
| **Meditation minutes** | Core practice; floored per whole minute and daily-capped. | ×0.5 |
| **Variety** | A small bonus for distinct session types tried (mindfulness, body-scan, walking, …), nudging a rounded practice without dominating. | ×4.0 each |

**Why this is monotonic.** Every input only ever grows or holds: distinct days, longest
streak, lifetime floored minutes, and distinct types tried are all non-decreasing over the
immutable log. None of them can fall. So `T` can never decrease — an item never regresses
(the same guarantee coins have via *earned* XP). This is the load-bearing property: it's why
Tending can drive a *displayed* stage safely.

**Anti-spam, reused not reinvented.** Tending leans entirely on the existing defenses:
the 60-second practice-day floor (`MIN_PRACTICE_SECONDS`), per-minute flooring of session time
(sub-minute sits earn nothing), and a **per-day minutes cap** so one marathon session or a
flood of sessions on a single day can't inflate `T`. Genuine daily practice sits far under
these; they only blunt farming.

### T → stage thresholds (front-loaded)

A **front-loaded** threshold table maps `T` to a growth stage: early stages arrive fast (so a
new practitioner sees their oak respond within a week or two), later stages stretch into a long,
calm horizon (so `ancient`/`venerable` remain a months-long aspiration, not a grind). In-code
constants, tunable with no migration:

```
T ≥   0  → (un-grown base)
T ≥  12  → grown
T ≥  40  → flourishing
T ≥ 110  → mature
T ≥ 260  → ancient
T ≥ 560  → venerable
```

These mirror the five `GROWTH_STAGES` (`grown → flourishing → mature → ancient → venerable`).
The gaps widen each step (12 → 28 → 70 → 150 → 300), so the curve is concave: quick early
wins, a long calm tail.

## Backward-compatibility rule

An oak that **purchased** its way up the ladder (legacy `{"grown":"flourishing"}` etc.) must
never *lose* a stage it paid for. So the displayed stage is the **max** of what was bought and
what was earned:

```
displayed_stage = max(purchased_stage, tending_earned_stage(T))
```

A purchase is a **floor**, never a ceiling. Concretely:

- A legacy oak with `{"grown":"grown"}` still **prices identically** (coins/`_spent` untouched)
  and renders at **≥** its purchased stage.
- A high-practice user's oak advances up the ladder with **zero coins spent** — Tending alone
  lifts the *displayed* stage.
- Tending only changes which stage is **rendered**. It never touches coins, `_spent`,
  `customizations_cost`, or the stored `customizations` map. The economy is byte-for-byte
  unchanged.

## The MVP built here (oak only)

Strictly scoped to the `tree` item, as a reversible proof:

1. **`get_tending_basis`** computes `T` and the oak's `tending_earned_stage(T)` from the
   formula above — read-time, no table, no migration.
2. **The oak's displayed growth stage** = `max(stage_from_customizations["grown"],
   tending_earned_stage(T))`. The backend injects the resolved stage into the oak's
   `customizations.grown` *in the response only* (the renderer already draws from
   `customizations.grown`), leaving the stored map — and therefore the spend — untouched.
   Every other item is unchanged.
3. **Frontend (oak's panel only):** a small **path ribbon** (`grown → flourishing → mature →
   ancient → venerable`, current stage lit, next-stage Tending hint, reusing the
   preview-locked pattern from ADR-0021) and a quiet **"Tended by N days of practice"** meter.
   The oak auto-renders at its Tending-or-purchased stage. Non-oak items: UI unchanged.
4. **Schema:** additively exposes the `tending` value and the oak's current stage / next-stage
   hint. No fields removed.

### What stays invariant (the safety contract)

- **Exploit-free:** no coin path to a Tending-gated stage. You can buy a stage (still a coin
  spend, still charged), but you can never buy *past practice* to reach one.
- **Backward-compatible:** legacy purchased stages honored via `max`; legacy `{"grown":"grown"}`
  prices identically.
- **Derived balance / no migration intact:** Tending is pure read-time computation; the stored
  state and the coin economy are unchanged.

## Future phases (proposal, not committed)

Once the oak proves the pattern, Tending can deepen — each phase still read-time, still no new
stored economy state:

- **Affinity palette** — the *kind* of practice tilts an item's look (more breathing → cooler,
  calmer tones; more variety → richer foliage), a second Tending-derived axis beside stage.
- **Day–night living garden** — the scene's ambient light follows the user's local time (the
  `data-daytime` hook already exists on `SanctuaryPage`), so the garden feels alive between
  visits.
- **Branching evolution path** — the late-game `form` fork (ADR-0021) could be *earned* by
  Tending shape (a long breather's oak leans `blossoming`; a streak-keeper's leans `mighty`),
  not only bought — practice choosing the evolution.
- **Synergies** — items that have grown together (a grove of Tended trees) read as a richer
  scene, rewarding a long-tended garden as a whole.

### The pacing risk

The chief risk is **pacing**: too fast and growth feels unearned (the oak maxes in a week);
too slow and it feels inert (months with no visible change). The front-loaded thresholds are
the lever — and because they're in-code constants over a derived score, **re-tuning is a
one-line change with no migration and no backfill** (the same escape hatch the XP curve has).
The oak-only MVP exists precisely to *observe* this pacing on one item before any wider rollout.
