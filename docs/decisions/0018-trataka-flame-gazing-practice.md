# ADR-0018: Trataka flame-gazing focus practice (reuse over new schema)

**Status:** Accepted · 2026-06

## Context

The app has eyes-closed practice surfaces — the meditation timer (`/meditate`) and the
resonance breathing pacer (`/breathe`). It has no **eyes-open concentration** practice.
Trataka is a traditional yogic *dharana* (concentration) technique: steady, soft gazing
at a single point — classically a candle flame — to train sustained attention. Here the
**screen is the practice**: a calm, gently moving flame to rest the gaze on, plus a timer.

We want this to be the *smallest coherent* feature: a real practice screen and an
explanatory About section, without dragging in new backend surface area.

## Decision

A single front-end page, `frontend/src/pages/TratakaPage.tsx`, that:

- **Renders a procedural flame** on a `<canvas>` (`components/Flame.tsx`), sampling a
  pure motion function (`lib/flame.ts`, unit-tested). No image/video assets — consistent
  with the app's procedural-visuals approach (`lib/soundscapes.ts`, `SanctuaryPlant.tsx`).
  The sway is a sum of incommensurate sines, so it wanders organically rather than looping.
- **Respects `prefers-reduced-motion`** by passing `intensity = 0` to the flame, which
  draws a single still frame and runs *no* animation loop at all — mirroring how
  `BreathePage` gates its rAF scale animation. (Idle uses a calmer half-intensity sway.)
- **Reuses the existing session infrastructure** wholesale: the background-tab-safe
  `setInterval` clock, the idempotent `client_token` save, the `sessionDraft`
  beacon/restore machinery, `RewardOverlay` + `buildXpBreakdown`, and the post-session
  focus/calm/notes reflection — all lifted from the `MeditatePage` pattern.

**Logged under the existing `mindfulness` session type — no migration.** Trataka is a
form of concentration meditation, so it writes a normal session row (like the meditation
timer already does, per the roadmap's "reuse over new schema" note). It therefore earns
XP, completes the *meditate* daily quest, and feeds streaks/heatmap/analytics with **zero
backend change** — no new model, schema, migration, or `sessions.type` CHECK value.

**Navigation:** surfaced in the **"More" menu** (`AppHeader.tsx`), not the primary nav,
to keep the calm top bar uncrowded — the same place secondary practices live.

**About copy is strictly non-clinical** (per [`ai-product.md`](../../.claude/rules/ai-product.md)):
it frames Trataka as a *traditional* practice that builds focus, presents the
visual-focus → global-focus idea and the reading analogy as intuitive framing (not proven
outcomes), notes that some people with attention difficulties find single-point focus
grounding **while explicitly stating it is not a treatment for ADHD or any condition** and
directing medical concerns to a professional. No fabricated citations, statistics, or study
names; a short non-clinical disclaimer closes the section.

## Consequences

- **No data-model footprint.** Trataka rows are ordinary `mindfulness` sessions; every
  downstream surface (streaks, XP, timeline, analytics) works for free.
- **One small, testable motion module.** The flame geometry is a pure function, so the
  reduced-motion fallback and the gentle-bounds invariant are unit-tested without a DOM.
- **Trade-off:** because it reuses `mindfulness`, Trataka sits are not *separable* from
  other mindfulness sessions in analytics. If per-practice breakdown is wanted later, a
  dedicated `sessions.type` value (a CHECK-constraint migration) is the clean extension —
  deliberately deferred to keep this feature self-contained.
