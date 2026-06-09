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

Guided breathing practice that paces the user through inhale and exhale cycles at a target resonance rate. Users set **inhale duration** and **exhale duration** (in seconds); the app derives **breaths per minute** from the cycle length.

**Configuration**

| Field | Description |
|-------|-------------|
| `inhale_seconds` | Length of the in-breath (e.g. `5`, `10`, `20`) |
| `exhale_seconds` | Length of the out-breath (e.g. `5`, `10`, `20`) |
| `breaths_per_minute` | Calculated: `60 ÷ (inhale_seconds + exhale_seconds)` |

**Example patterns**

| In-breath | Out-breath | Cycle | Breaths/min |
|-----------|------------|-------|-------------|
| 5 s | 5 s | 10 s | 6 |
| 4 s | 6 s | 10 s | 6 |
| 10 s | 10 s | 20 s | 3 |
| 15 s | 5 s | 20 s | 3 |
| 20 s | 20 s | 40 s | 1.5 |

**In-session experience**

- Visual breathing guide (expand/contract circle or bar) synced to inhale/exhale phases
- Optional audio cues at phase transitions
- Elapsed time, cycles completed, and current breaths/min displayed
- Save completed practice as a meditation session (`type: resonance_breathing`) with the pattern used

**Presets & custom patterns**

- Built-in presets (e.g. 6 bpm balanced, 3 bpm slow, 1.5 bpm extended)
- User-saved custom patterns (name + inhale/exhale values)
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
