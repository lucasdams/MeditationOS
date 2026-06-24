# ADR-0023: Spirit creatures — chosen archetype + per-creature care

**Status:** Proposed · 2026-06-24 · Amends [ADR-0022](0022-spirit-companion-replaces-sanctuary.md) · Detail: [Spirit design](../design/spirit.md)

## Context

[ADR-0022](0022-spirit-companion-replaces-sanctuary.md) shipped the Spirit: one companion
whose evolution **path** (mini-Buddha / wind / bloom) is *auto-detected from how you practice*
and commits at stage 2. That "your practice shapes it" hook is elegant but passive — the user
never *chooses*, and a single `daily_glow` rises with *any* practice, so there's no reason to
favour one practice over another.

We want a stronger, more game-like loop: the user **picks** a companion with a distinct
personality, and **keeps it in good shape by doing that companion's kind of practice**. Three
archetypes drawn from Buddhist iconography fit a meditation app and map cleanly onto the
existing three practice families:

| Creature | Archetype | Its practice (what keeps it in good shape) |
|----------|-----------|--------------------------------------------|
| **Peaceful** (`peaceful`) | *śānta* — the serene Buddha (today's stillness form) | Meditation / stillness |
| **Wrathful** (`wrathful`) | *krodha* — a fierce protector (Mahākāla / Fudō); compassion in fierce form | Resonance breathwork |
| **Loving** (`loving`) | *karuṇā* — a compassionate being (Tārā / Avalokiteśvara) | Gratitude + journaling |

## Decision

Replace ADR-0022's practice-auto-detected path with a **chosen creature** plus a **per-creature
care mechanic**. The user explicitly asked for a demanding, Tamagotchi-style upkeep loop.

- **Choose your creature (the "3 starter choices").** At first awakening — and again after
  *setting free* a radiant spirit — the user picks one of the three creatures. The choice is
  stored in the existing `spirits.path` column (values `peaceful` | `wrathful` | `loving`),
  set **explicitly** rather than computed. The practice-lean / commit-on-read logic from
  ADR-0022 is retired.

- **Per-creature condition (demanding care).** Each creature has a **condition** — a tier of
  `thriving → content → restless → unwell` — computed from **recent practice of its own kind**
  over a rolling window (not *any* practice). Do its practice and it climbs toward thriving;
  neglect it and it declines through the tiers. The decline is **demanding and slow to
  recover**: condition reflects sustained recent practice (e.g. preferred-practice minutes over
  the last ~7 days on a concave curve), so one token session does not instantly restore a
  neglected creature. This replaces the single `daily_glow`.

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

- **Art — three creatures × five stages.** `peaceful` reuses today's stillness/Buddha form.
  `wrathful` and `loving` are **new procedural-SVG forms** across all five stages (spark →
  radiant), reshaping the existing breath/heart renderers into a fierce protector and a
  compassionate being. Condition modulates the render (vibrancy / posture), reusing the glow
  plumbing.

- **Frontend.** A **starter-choice screen** (three creatures, with a line on what each needs)
  at first awakening and after set-free; a **condition read-out + care nudge**; the home and
  `/spirit` art reflect condition.

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
