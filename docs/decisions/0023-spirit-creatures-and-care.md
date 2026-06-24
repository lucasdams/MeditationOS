# ADR-0023: Spirit creatures — chosen archetype + per-creature care

**Status:** Proposed · 2026-06-24 · Amends [ADR-0022](0022-spirit-companion-replaces-sanctuary.md) · Detail: [Spirit design](../design/spirit.md)

## Context

[ADR-0022](0022-spirit-companion-replaces-sanctuary.md) shipped the Spirit: one companion
whose evolution **path** (mini-Buddha / wind / bloom) is *auto-detected from how you practice*
and commits at stage 2. That "your practice shapes it" hook is elegant but passive — the user
never *chooses*, and a single `daily_glow` rises with *any* practice, so there's no reason to
favour one practice over another.

We want a stronger, more game-like loop: the user **picks** a companion with a distinct
personality, and **keeps it in good shape by doing that companion's kind of practice**. We theme
the three on the **Ayurvedic doshas** — a natural fit, because a dosha is precisely something you
keep *in balance* through the right practices. The three doshas map cleanly onto the existing
three practice families:

| Creature | Dosha (elements) | Signature practice (its main need) |
|----------|------------------|------------------------------------|
| **Kapha** (`stillness`) | earth + water — grounded, calm, steady | Meditation / stillness |
| **Pitta** (`breath`) | fire + water — sharp, intense, energetic | Resonance breathwork |
| **Vata** (`heart`) | air + ether — light, mobile, expressive | Gratitude + journaling |

(Internal `path` values stay `stillness | breath | heart` — the dosha is the *label*; no rename.)

## Decision

Replace ADR-0022's practice-auto-detected path with a **chosen creature** plus a **per-creature
care mechanic**. The user explicitly asked for a demanding, Tamagotchi-style upkeep loop.

- **Choose your creature (the "3 starter choices").** At first awakening — and again after
  *setting free* a radiant spirit — the user picks one of the three doshas (Kapha / Pitta /
  Vata). The choice is stored in the existing `spirits.path` column (`stillness` | `breath` |
  `heart`, labelled as the dosha in the UI), set **explicitly** rather than computed. The
  practice-lean / commit-on-read logic from ADR-0022 is retired.

- **A few named needs (demanding care).** Each creature has **three tended needs**, each a tier
  `thriving → content → restless → unwell` (plus a 0..1 factor), all computed from the activity
  log over a rolling window and all **demanding / slow to recover** (they reflect *sustained*
  recent activity on a concave curve — one token session does not refill a depleted need):
  - **Nourished** — its *signature* practice (Kapha ← meditation, Pitta ← breathwork, Vata ←
    gratitude + journal). The identity need; this is what "different activities for different
    creatures" means.
  - **Rested** — practice *rhythm / consistency* (recent active days, the streak) — Ayurvedic
    *dinacharya*, a steady daily routine.
  - **Joyful** — *variety* / breadth (distinct practice types practised recently) — not overdoing
    one thing.

  These replace the single `daily_glow`. The creature's overall look reads from the lowest /
  composite need, so a neglected need visibly shows.

- **Computed, not stored (unchanged philosophy).** Condition is a pure function of the activity
  log and the chosen creature — no stored decay counter, consistent with
  [ADR-0009](0009-gamification-computed-from-activity.md). The only stored state remains the
  chosen `path`, `name`, `cosmetics`, and retired spirits.

- **THE GUARDRAIL — demanding, never catastrophic.** Even at `unwell`, condition only affects
  **appearance** (a dim, restless, drooping look) and a gentle **care nudge** ("your wrathful
  spirit is restless — a few minutes of breathwork would revive it"). It **never** removes
  evolution **stage**, **level**, **coins**, **cosmetics**, or the **collection**, and the
  creature **never dies**. `unwell` is the floor; its preferred practice always recovers it.
  This preserves the monotonic-progress invariant the coin economy depends on (coins/stage from
  earned XP, which only grows) and keeps neglect from being genuinely punishing — the pressure
  is "tend to it", not "lose it".

- **Art — three creatures × five stages.** `stillness` (Kapha) reuses today's grounded Buddha
  form. `breath` (Pitta) and `heart` (Vata) become **new procedural-SVG forms** across all five
  stages (spark → radiant) — a fiery Pitta and an airy Vata. The needs modulate the render
  (vibrancy / posture), reusing the glow plumbing. The render is split into a **static background
  layer** and a **floating creature layer**, so only the creature moves (the background does not
  drift with it), and the **aura glows on its own independent up/down keyframe** (separate from
  the float). No new dependency required — layered SVG + CSS.

- **Frontend.** A **starter-choice screen** (three doshas, each with what it needs) at first
  awakening and after set-free; a **needs read-out + per-need care nudges** ("Pitta is restless —
  a few minutes of breathwork would revive it"); the home and `/spirit` art reflect the needs.
  Plus a **coin fee** to rename and to reset cosmetics, reviving the Sanctuary reset-fee pattern
  ([ADR-0019](0019-sanctuary-reset-upgrades-for-a-fee.md)).

## Consequences

- **Amends ADR-0022.** The path is now *chosen*, not practice-detected; `path_lean` and
  commit-on-read are removed; `daily_glow` becomes the per-creature `condition`. The
  "practice shapes your evolution" hook becomes "choose your companion, then keep it thriving
  with its practice" — a deliberate, demanding care loop.
- **More art is the main cost** — two new creature forms across five stages each (the bulk of
  the work), plus condition-driven appearance states.
- **The economy is untouched.** Coins/stage/collection stay derived from earned XP and remain
  monotonic; condition is a separate, non-destructive signal. No migration (reuses `path`).
- **Care nudges must stay kind.** Even "demanding", the copy nudges, never shames (the app's
  standing UX rule) — the consequence is a sad-looking creature you can always revive, not lost
  progress.

## Alternatives considered

- **Keep the practice-auto path (ADR-0022).** Rejected: the user wants to *choose* and wants a
  per-creature upkeep loop, which auto-detection doesn't provide.
- **Gentle (non-declining) condition.** Considered; the user explicitly chose a demanding loop
  with consequences. We take that, bounded by the no-catastrophic-loss guardrail above.
- **Let condition remove stage/levels (full Tamagotchi).** Rejected — it would break the
  monotonic coin/stage invariant and is genuinely punishing; out of bounds even in demanding
  mode.

## Build order (each independently shippable)

1. **Backend — choose + condition.** Store the chosen creature (explicit `path`); replace
   `daily_glow` with a computed per-creature `condition` (tier + factor) keyed to the creature's
   preferred practice over a rolling window; retire `path_lean`/commit-on-read. API + tests.
2. **Frontend — starter choice + condition.** A pick-your-creature screen at awakening / after
   set-free; a condition read-out + care nudge; existing art modulated by condition.
3. **Art — wrathful creature** across five stages, with condition states.
4. **Art — loving creature** across five stages, with condition states.
5. **Polish** — care-nudge copy, condition tier visuals, balancing the decline/recovery curve.
</content>
