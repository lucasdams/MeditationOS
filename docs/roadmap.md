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

> **Distinct from high-rate breathwork** (e.g. Wim Hof–style), which is a *separate* feature — fast breathing + breath holds, stimulating rather than calming. See [future-features](../future-features.md#hrv--breathing).

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

- Visual breathing guide (expand/contract circle) synced to inhale/exhale phases
- **Audio guide — the primary guidance, since users practice eyes-closed.** Each phase has a **continuous tone that glides and fades across its full duration**, not just a beep at the start. The inhale tone **rises/swells** toward the top of the breath; the exhale tone **descends and fades to silence** as the out-breath finishes. Because the sound changes the whole way through, you can *hear where you are within the phase* — so, eyes-closed, you sense whether to **breathe out harder to finish in time** or **slow down because there's more left**, and land exactly on the transition. Distinct timbres for in vs out; volume + on/off; an **audio-only mode** that needs no visual.
- Elapsed time, cycles completed, and current breaths/min displayed
- Save completed practice as a meditation session (`type: resonance_breathing`) with the pattern used

> **Audio implementation notes:** Web Audio API oscillator(s) with **frequency/gain
> ramps scheduled across each phase** (`linearRampToValueAtTime`), so the tone glides
> and fades exactly over the inhale (e.g. 4 s) and exhale (e.g. 6 s) durations.
> Recompute the ramps when the rate changes; respect the device's mute/volume; keep
> timbres gentle and non-jarring.

**Presets & custom**

- Built-in presets: **6 bpm balanced** (default), **3 bpm slow**, **1.5 bpm extended**, **1 bpm advanced**
- Rate slider across the slow range (~1–6 bpm); 2:3 ratio fixed by default
- *(Later)* custom in:out ratio for advanced users with a known resonance frequency
- Validation: sensible min/max bounds on phase length and total cycle duration

**Demonstrates:** real-time UI state, timer logic, user preferences, session metadata storage

### Dashboard

Display total meditation time, current streak, longest streak, and weekly statistics.

**Demonstrates:** data aggregation, backend calculations

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
