# Roadmap

[← Back to README](../README.md)

## Version 1: Core Product

### Authentication

Users can register, log in, log out, and reset their password.

**Demonstrates:** security, authentication, user management

### Meditation Sessions

Store session date, duration, meditation type, and notes.

**Demonstrates:** CRUD operations, API design, database relationships

### HRV Resonance Breathing

Guided **slow** breathing that paces the user at a target resonance rate (~1–6 breaths/min) — parasympathetic, for calm and focus. The user picks a **rate** (breaths per minute); the app derives the inhale/exhale seconds at a **2:3 in:out ratio** (a longer exhale, which adds vagal/parasympathetic activation). The `sessions` table stores `inhale_seconds`/`exhale_seconds` separately, so a custom ratio is possible later — but 2:3 is the default.

> **Distinct from high-rate breathwork** (e.g. Wim Hof–style), which is a *separate* feature — fast breathing + breath holds, stimulating rather than calming. See [future-features](future-features.md#hrv--breathing).

**Configuration**

| Field | Description |
|-------|-------------|
| `breaths_per_minute` | The control the user sets (e.g. `6`, `3`, `1.5`, `1`) |
| `inhale_seconds` | Derived: `(60 ÷ bpm) × 2/5` |
| `exhale_seconds` | Derived: `(60 ÷ bpm) × 3/5` |

**Example rates (2:3 ratio)**

| Rate (bpm) | Cycle | In (2) | Out (3) |
|-----------|-------|--------|---------|
| 6 | 10 s | 4 s | 6 s |
| 3 | 20 s | 8 s | 12 s |
| 1.5 | 40 s | 16 s | 24 s |
| 1 | 60 s | 24 s | 36 s |

**In-session experience**

- **Visual guide — the eyes-open counterpart to the audio.** A circle that **continuously expands over the inhale and contracts over the exhale**, so its size at any moment shows *where you are in the breath* (fully expanded = top of the inhale; fully shrunk = end of the exhale). The growth/shrink is eased over each phase's exact duration (e.g. expand over a 4 s inhale, contract over a 6 s exhale) — the same envelope as the audio ramps. Optional "Breathe in / Breathe out" label and a subtle colour shift per phase.
- **Audio guide — the primary guidance, since users practice eyes-closed.** Each phase has a **continuous tone that glides and fades across its full duration**, not just a beep at the start. The inhale tone **rises/swells** toward the top of the breath; the exhale tone **descends and fades to silence** as the out-breath finishes. Because the sound changes the whole way through, you can *hear where you are within the phase* — so, eyes-closed, you sense whether to **breathe out harder to finish in time** or **slow down because there's more left**, and land exactly on the transition. Distinct timbres for in vs out; volume + on/off; an **audio-only mode** that needs no visual.
- Elapsed time, cycles completed, and current breaths/min displayed
- Save completed practice as a meditation session (`type: resonance_breathing`) with the pattern used

> **Audio implementation notes:** Web Audio API oscillator(s) with **frequency/gain
> ramps scheduled across each phase** (`linearRampToValueAtTime`), so the tone glides
> and fades exactly over the inhale (e.g. 4 s) and exhale (e.g. 6 s) durations.
> Recompute the ramps when the rate changes; respect the device's mute/volume; keep
> timbres gentle and non-jarring.

**Presets & custom**

- Built-in presets by difficulty (slower = harder), chosen from a dropdown: **Easy** (6 bpm, default), **Medium** (3 bpm), **Advanced** (1.5 bpm), **Extreme** (1 bpm)
- *(Later)* a free rate slider + custom in:out ratios for advanced users with a known resonance frequency. The API already supports saved patterns (`breathing_patterns`); the V1 UI exposes the presets only.
- Validation: sensible min/max bounds on phase length and total cycle duration

**Demonstrates:** real-time UI state, timer logic, user preferences, session metadata storage

### Dashboard

Display total meditation time, current streak, longest streak, and weekly statistics,
plus a GitHub-style year activity heatmap. All date bucketing is on the user's **local
day** (per-user timezone).

**Demonstrates:** data aggregation, backend calculations, timezone-aware SQL

### Gamification (added during V1)

XP, levels, and a growing ASCII tree; three **daily quests** (write a gratitude ·
breathe a minute · log a session) with a streak bonus and a local-midnight reset.
All **computed from activity**, nothing stored — see
[gamification design](design/gamification.md) and
[ADR-0009](decisions/0009-gamification-computed-from-activity.md).

**Demonstrates:** derived state, engagement mechanics without write-path drift

### Gratitude tool (an early taste of V3 AI)

Pick from 36 themes and get **AI-suggested prompts** (Claude Haiku) or write your own;
each moment earns XP. Ships with a deep curated fallback so it works with no API key —
see [ADR-0008](decisions/0008-ai-suggestions-curated-fallback.md). A first, safe step
toward the V3 AI features below.

**Demonstrates:** LLM integration with untrusted-output validation + graceful fallback

---

## Version 2: Journaling & Analytics

### Meditation Journal

Users write reflections after sessions: challenges, insights, emotional state.

**Demonstrates:** rich data models, text storage

### Analytics

Visualizations for practice consistency, time trends, mood trends, and goal progress.

**Demonstrates:** SQL queries, reporting, data processing

### Goal System

Examples: 10 minutes daily, 30-day streak, 100-hour milestone.

**Demonstrates:** business logic, progress tracking

---

## Version 3: AI Features

### AI Reflection Coach

User writes: *"I was distracted today."*

AI provides reflection, follow-up questions, and suggestions.

**Demonstrates:** LLM integration, prompt engineering, API integration

### Journal Pattern Analysis

AI identifies recurring themes, common obstacles, and improvements over time.

Example: *"Restlessness appears most often during evening sessions."*

**Demonstrates:** data retrieval, AI-assisted analysis

### Personalized Recommendations

Suggest session lengths, meditation styles, practice schedules, and resonance breathing patterns based on goals and history.

**Demonstrates:** recommendation logic, user personalization
