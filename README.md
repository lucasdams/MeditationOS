# MeditationOS

[![CI](https://github.com/lucasdams/MeditationOS/actions/workflows/ci.yml/badge.svg)](https://github.com/lucasdams/MeditationOS/actions/workflows/ci.yml)

A production-style **business application** for meditation and wellness. Portfolio project demonstrating backend development, database design, cloud deployment, AI integration, and professional delivery practices (tickets, review, deployment).

**Status:** Cycles 1–4 complete — auth, session tracking, a stats dashboard, guided HRV breathing, an unguided meditation timer, an AI gratitude tool, and daily quests/XP working locally · 107 backend tests passing · Cycle 5 (AWS deploy) up next

**What's working now (Cycles 1–4):**

- ✅ Register / log in / log out — httpOnly-cookie JWT auth, argon2 password hashing, **Sign in with Google** (OIDC); public usernames + a top banner (name · level)
- ✅ Meditation sessions — full CRUD API (user-scoped), log-session form, and history list in the browser
- ✅ Stats dashboard — total practice time, current/longest streak, a weekly breakdown, and a GitHub-style year-long activity heatmap (bucketed on the user's **local day**, per-user timezone)
- ✅ Levels & XP + **daily quests** — earn XP from practice (breathing counts 3×), level up, grow an ASCII tree; three daily quests + a streak bonus, with a live reset countdown
- ✅ HRV resonance breathing — animated pacer (2:3 difficulty presets) with a 1s hold at each turn, an ocean-breath audio guide + transition bell, optional duration timer; saves as a session
- ✅ Meditation timer — an unguided "sit now" page: pick a style + length (or open-ended), optional start/interval/end bells; background-tab-safe timer; saves as a session and earns XP
- 🌱 Sanctuary (in progress) — a garden you grow by practicing: smoothly-growing **vector (SVG)** plants across **nature, structures & companions** grow from your practice and you **choose what to grow next** (milestone-unlocked by points or a streak), with a streak-driven **vitality**, on a dedicated page with a completion celebration. See [Sanctuary design](docs/design/sanctuary.md)
- ✅ Gratitude tool — pick from 36 themes, get AI-suggested prompts (Claude Haiku, with a ~90-deep curated fallback) or write your own; each moment earns XP
- ✅ PostgreSQL schema + Alembic migrations, auto-applied on startup
- ✅ React + TypeScript frontend — protected routes, loading/empty/error states
- ✅ 107 backend tests (pytest against Postgres), CI on every PR, Dockerized dev stack, security review actioned

> 🧘 _Runs locally in one command — see [Getting Started](#getting-started). Screenshots land with the V1 release._

## Contents

- [Business Overview](#business-overview)
- [Tech Stack & Tools](#tech-stack--tools)
- [Development Process](#development-process)
- [AI-Assisted Development](#ai-assisted-development)
- [Claude Rules](#claude-rules)
- [Architecture](#architecture)
- [Design & Decisions](#design--decisions)
- [Roadmap](#roadmap)
- [Future Features](#future-features)
- [Database Design](#database-design)
- [Infrastructure](#infrastructure)
- [Minimum Viable Goal](#minimum-viable-goal)
- [What Makes It Interview-Worthy](#what-makes-it-interview-worthy)
- [Getting Started](#getting-started)
- [License](#license)

---

## Business Overview

MeditationOS is a **B2C wellness platform** that turns daily meditation into measurable, retainable user engagement. It gives individuals a single place to log practice, build habits, and receive data-driven and AI-assisted guidance, using the same product patterns as subscription wellness and mental-health apps.

### Value Proposition

Help users **establish and sustain a meditation habit** through session tracking, streak mechanics, journaling, progress analytics, and personalized coaching, reducing drop-off and increasing long-term engagement.

### Target Market

- Individuals building a consistent mindfulness practice
- Users who want structure, accountability, and insight, not just a timer

### Core Product Capabilities

| Capability | Business function |
|------------|-------------------|
| **Session logging** | Capture usage data (duration, type, frequency) as the foundation for retention metrics |
| **HRV resonance breathing** | Guided breathing practice with configurable inhale/exhale timing to support calm, focus, and measurable practice sessions |
| **Streaks & milestones** | Habit formation and re-engagement loops that drive daily active use |
| **Journaling** | Deeper user input for qualitative insights and higher perceived value |
| **Analytics dashboard** | Progress visibility that supports goal-setting and continued subscription |
| **AI coaching** (V3) | Differentiated, scalable guidance without linear cost per user |

### Key Business Metrics (planned)

- Daily / weekly active users
- Session frequency and total practice time
- Streak length and retention at 7, 30, and 90 days
- Goal completion rate
- Journal engagement and AI feature adoption

### How MeditationOS Is Different

Most meditation apps and websites (**Headspace**, **Calm**, **Insight Timer**, and similar) are built around **content consumption**: guided audio libraries, courses, and celebrity teachers. They excel at onboarding beginners with polished production, but practice often stays passive: listen, finish, close the app.

**MeditationOS is built around the user's practice data.** It is a **practice operations platform** for people who want to meditate consistently, understand their progress, and improve over time, not just consume another guided session.

| | Typical meditation apps & sites | MeditationOS |
|---|--------------------------------|--------------|
| **Core model** | Content library (guided audio, courses) | Practice tracking and personal analytics |
| **Primary value** | "What should I listen to today?" | "How am I actually practicing, and what's working?" |
| **Breathing tools** | Generic timers or fixed-ratio breathing | **HRV resonance breathing** with precise inhale/exhale control (e.g. 1.5, 3, or 6 breaths/min) |
| **Progress** | Streaks or basic stats, often secondary to content | **Dashboard-first**: total time, streaks, weekly trends, and goal tracking as core product |
| **Reflection** | Optional notes or separate journaling apps | **Integrated journal** tied to sessions for qualitative + quantitative insight |
| **Personalization** | Recommended content packs or generic paths | **AI coaching from your data** (V3): patterns, obstacles, and suggestions based on your history |
| **Best for** | Beginners exploring guided meditation | Self-directed practitioners who want structure, accountability, and measurable improvement |

#### What this means in practice

**vs. content apps (Headspace, Calm)**  
Those products optimize for subscription content and production quality. MeditationOS optimizes for **habit retention and user-owned data** by logging real sessions, hitting breathing targets, journaling after practice, and seeing trends over weeks and months.

**vs. free timers and websites**  
Simple timers and YouTube guides offer no persistence, no streak logic, no journal linkage, and no analysis. MeditationOS provides a **single system of record** for a user's meditation practice.

**vs. wellness trackers (Apple Health, habit apps)**  
Trackers capture minutes but not meditation-specific context: type, breathing pattern, emotional state, or AI-assisted reflection. MeditationOS is **purpose-built for mindfulness practice**, not generic activity logging.

#### Positioning statement

> MeditationOS is not another meditation content app. It is a **business application** that helps users **run their practice like a system**: track sessions, pace resonance breathing, journal insights, measure progress, and receive coaching grounded in their own data.

---

## Tech Stack & Tools

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React, TypeScript, Vite |
| **Backend** | FastAPI, Python, SQLAlchemy, Alembic |
| **Database** | PostgreSQL |
| **Infrastructure** | Docker, Linux, AWS (EC2, RDS, S3, CloudWatch) |
| **Workflow** | Git, GitHub Issues, PRs, milestones, GitHub Actions CI, Claude Code |
| **Product AI** (V3) | Anthropic Claude API for coaching and journal analysis |

---

## Development Process

Work is planned and tracked like a small product team: **tickets**, **two-week cycles**, and a clear outcome per cycle. This keeps scope manageable for a solo project and is easy to walk through in interviews.

### Ticket System (GitHub Issues)

All work starts as a ticket before code is written.

| Element | Practice |
|---------|----------|
| **Tool** | GitHub Issues (linked to PRs and milestones) |
| **Title** | Short, outcome-focused (e.g. "Add POST /api/v1/sessions endpoint") |
| **Description** | Context, acceptance criteria, and out-of-scope notes |
| **Labels** | `feature`, `bug`, `chore`, `spike`, `v1`, `v2`, etc. |
| **Milestone** | Maps to roadmap version (V1 Core, V2 Journal, etc.) |
| **PR link** | Each PR references the issue (`Closes #12`) |

**Good ticket example:**

```
Title: User can log a meditation session

Acceptance criteria:
- POST /api/v1/sessions requires authentication
- Body: date, duration_minutes, type, optional notes
- duration must be > 0
- Returns 201 with session id
- Unit test for validation and happy path

Out of scope: dashboard display, edit/delete
```

### Two-Week Cycles

Development runs in **2-week cycles** (lightweight sprints). Each cycle has one **cycle goal**: a shippable outcome, not a laundry list.

```
Week 1                          Week 2
─────────────────────────────────────────────────
Plan → Pick tickets      →      Polish, test, deploy
Build core slice               Fix bugs, document
Open PRs early                 Demo + retrospective
```

| Cycle | Example goal |
|-------|----------------|
| **Cycle 1** | Auth working locally (register, login, logout) |
| **Cycle 2** | Sessions API + DB schema + basic frontend form |
| **Cycle 3** | Dashboard stats + streak calculation |
| **Cycle 4** | HRV breathing UI + save as session |
| **Cycle 5** | Deploy V1 to AWS (production config) |

**Per cycle guidelines (solo dev):**

- **1 cycle goal** stated in one sentence
- **5-8 tickets** max; if it does not fit, split across cycles
- **No new tickets mid-cycle** unless critical (scope discipline)
- **End of cycle:** working demo, brief retro (what shipped, what slipped, what to adjust)

### How Tickets, Cycles, and AI Fit Together

```
Ticket (acceptance criteria) → Cycle goal (priority) → Claude prompt (scoped) →
PR (linked to issue) → Review → Merge → Demo at cycle end
```

AI implements **one ticket at a time**. The ticket's acceptance criteria become the prompt constraints (see [AI-Assisted Development](#ai-assisted-development) and [Claude Rules](#claude-rules)).

### Process Skills

- Breaking a large product into deliverable increments
- Writing clear requirements and acceptance criteria
- Scope control and predictable delivery
- Professional Git workflow (issues, branches, PRs, milestones)
- Agile familiarity without heavyweight process

---

## AI-Assisted Development

This project uses **Claude Code** the way modern teams adopt linters and CI — to accelerate execution while **engineering judgment** (architecture, security, testing, review) stays human-owned.

### Principles

- **Own the design first** — architecture, schema, and API contracts are decided before AI implements against them.
- **Review every change like a junior's PR** — read the full diff, run the tests, verify behavior. Nothing is committed unexplained.
- **Tests are the source of truth**, not the AI's summary; behavior changes ship with tests.
- **Scope tightly** — one concern per prompt; small diffs are easier to review and reason about.
- **Protect sensitive areas** — auth, migrations, secrets, and infra config get explicit human review (Claude reads [`.claude/rules/security.md`](.claude/rules/security.md) for that work).
- **Document the *why*** in commits and docs, so humans and AI share context.

This is where the real skill shows: technical judgment (catching wrong APIs or logic), prompt engineering, code-review discipline, architecture ownership, security awareness, and accountability for every commit.

### Prompting approach

Good prompts mirror good tickets — specific, contextual, bounded:

```
✅ "Add POST /api/v1/sessions that validates duration > 0, scopes to the
    authenticated user, and returns 201. Follow backend/app/api/routes/auth.py."
❌ "Build the meditation session feature."
```

Reference real files, state constraints, scope one concern, and ask for explanations in unfamiliar areas. The full per-feature gate (migrations, tests, security) lives in [`.claude/rules/new-feature-checklist.md`](.claude/rules/new-feature-checklist.md).

---

## Claude Rules

Development is guided by tiered [Claude Code](https://claude.com/claude-code) rules, so the AI loads only what each task needs instead of one bloated always-on file. The root [`CLAUDE.md`](CLAUDE.md) holds the always-on context and indexes the rest.

| Tier | Mechanism | Files |
|------|-----------|-------|
| **Always-on** | root `CLAUDE.md`, read every session | project context + code standards |
| **Directory-scoped** | nested `CLAUDE.md`, auto-loaded in that folder | [`backend/`](backend/CLAUDE.md) · [`frontend/`](frontend/CLAUDE.md) |
| **Read-on-demand** | `.claude/rules/*.md`, pulled when its trigger applies | [security](.claude/rules/security.md) · [database](.claude/rules/database.md) · [infrastructure](.claude/rules/infrastructure.md) · [ai-product](.claude/rules/ai-product.md) · [new-feature-checklist](.claude/rules/new-feature-checklist.md) |

**Rule-writing principles:** describe patterns, not features (specs live in Issues); say what *not* to do; use real file paths; keep the always-on file minimal.

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  React + TypeScript │────▶│      FastAPI        │────▶│    PostgreSQL       │
│      (Frontend)     │     │     (Backend)       │     │     (Database)      │
└─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                       │
                                       ▼
                            ┌─────────────────────┐
                            │    AI Service       │
                            │  (LLM Integration)  │
                            └─────────────────────┘

Hosted on AWS · Managed with Docker
```

---

## Design & Decisions

The engineering reasoning behind the build — written up as it's decided, so the *why* is visible, not just the *what*.

### Design docs

| Doc | Covers |
|-----|--------|
| [Authentication](docs/design/authentication.md) | httpOnly-cookie JWT, full auth flows, XSS-vs-CSRF tradeoff, hardening checklist |
| [Data Model](docs/design/data-model.md) | Detailed schema: column types, constraints, indexes, and why streaks are computed |
| [API Contract (V1)](docs/design/api-v1.md) | Endpoints, request/response shapes, status codes, and the error envelope |
| [Gamification](docs/design/gamification.md) | XP, levels, daily quests, streaks — all computed from activity (per-user local day) |
| [Sanctuary](docs/design/sanctuary.md) | A garden grown by practicing — one item at a time, choose the next; one append-only table, everything else computed |

### Architecture Decision Records

Numbered, immutable records of significant choices — see [`docs/decisions/`](docs/decisions/README.md).

| # | Decision |
|---|----------|
| [0002](docs/decisions/0002-postgresql.md) | PostgreSQL as the primary datastore |
| [0003](docs/decisions/0003-fastapi-stack.md) | FastAPI + SQLAlchemy + Alembic |
| [0004](docs/decisions/0004-uuid-primary-keys.md) | UUID primary keys (anti-enumeration) |
| [0005](docs/decisions/0005-httponly-cookie-jwt-auth.md) | httpOnly-cookie JWT authentication |
| [0006](docs/decisions/0006-layered-architecture.md) | Layered backend (routes / services / models / schemas) |
| [0007](docs/decisions/0007-google-oauth-id-token.md) | Sign in with Google via ID-token verification |
| [0008](docs/decisions/0008-ai-suggestions-curated-fallback.md) | AI suggestions with a curated fallback |
| [0009](docs/decisions/0009-gamification-computed-from-activity.md) | Gamification computed from activity, not stored |
| [0010](docs/decisions/0010-sanctuary-cultivation.md) | Sanctuary — cultivation sequence, not a spend economy |

---

## Roadmap

Three versions, each shippable on its own. Full details — HRV breathing config, example patterns, and what each feature demonstrates — in **[docs/roadmap.md](docs/roadmap.md)**.

| Version | Theme | Features |
|---------|-------|----------|
| **V1** | Core Product | Authentication · Meditation Sessions · HRV Resonance Breathing · Dashboard |
| **V2** | Journaling & Analytics | Meditation Journal · Analytics · Goal System |
| **V3** | AI Features | AI Reflection Coach · Journal Pattern Analysis · Personalized Recommendations |

---

## Future Features

Planned capabilities beyond the current roadmap, across practice & sessions, HRV & breathing, journaling, goals & gamification, accounts & auth (incl. Sign in with Google), payments & monetization (Stripe), AI, practice environment, social/community, and platform. Priority may shift as V1 ships and user feedback comes in.

See the full checklist in **[docs/future-features.md](docs/future-features.md)**.

---

## Database Design

Core tables (V1–V2): `users`, `sessions`, `breathing_patterns`, `gratitude_entries`, `journals`, `goals`. Streak stats are **computed from `sessions`**, not stored (see the design note in the linked doc). Future tables (V3+): `friendships`, `groups`, `challenges`, `notifications`.

Full schema — column types, constraints, indexes, and design notes — in **[docs/design/data-model.md](docs/design/data-model.md)**.

**Demonstrates:** relational modeling, foreign keys, query design, indexing

---

## Infrastructure

Local dev runs via Docker Compose (`frontend`, `backend`, `database`). Production targets AWS: EC2 for the app, RDS for PostgreSQL, S3 for optional assets, CloudWatch for logs. See [`.claude/rules/infrastructure.md`](.claude/rules/infrastructure.md) for conventions.

**Demonstrates:** environment management, containerized deployment, cloud operations

---

## Minimum Viable Goal

Within the first month (roughly **two 2-week cycles**), ship this end-to-end flow:

```
User signs up
      ↓
User logs meditation
      ↓
Data stored in PostgreSQL
      ↓
Dashboard displays progress
      ↓
Application deployed on AWS
```

A deployed, working Version 1 is already a stronger portfolio piece than most tutorial-based projects. Every feature after that increases the project's value.

---

## What Makes It Interview-Worthy

### Backend

- REST APIs
- Authentication and authorization
- Input validation
- Error handling

### Database

- Schema design
- SQL queries and aggregations
- Performance considerations (indexing, query plans)

### Infrastructure

- Docker containerization
- AWS deployment
- Logging and observability
- Environment configuration

### AI

- LLM integration and prompt design (product features)
- Context management and cost-aware API usage
- AI-assisted development workflow with structured review
- Balancing automation with engineering accountability

### Software Engineering

- Ticket-driven development with two-week delivery cycles (one PR per ticket, each issue-linked)
- Tiered Claude Code rules and structured AI review
- A real test suite (pytest against PostgreSQL) plus a security review that was acted on (fail-fast on an insecure default secret)
- CI on every PR (GitHub Actions: ruff lint + pytest + frontend build) gating a protected `main`
- Architecture tradeoffs documented as ADRs, with meaningful commit history

---

## Getting Started

The whole stack — React frontend, FastAPI backend, and PostgreSQL — runs with Docker Compose.

**Prerequisites:** Docker Desktop (or Docker Engine + Compose v2).

```bash
# 1. Clone
git clone https://github.com/lucasdams/MeditationOS.git
cd MeditationOS

# 2. Create your local env file from the template, then edit values
cp .env.example .env

# 3. Build and start all three services
docker compose up --build
```

Once it's up:

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend (FastAPI) | http://localhost:8000 |
| API docs (OpenAPI) | http://localhost:8000/docs |
| Database (Postgres) | `localhost:5432` |

The backend waits for Postgres to report healthy before starting. Source folders are bind-mounted, so backend (`--reload`) and frontend (Vite HMR) pick up changes live.

```bash
docker compose down        # stop the stack
docker compose down -v      # stop and wipe the database volume
```

> **Port 5432 already in use?** Another Postgres is running locally. Either stop it, or change the database's host port in `docker-compose.yml` (e.g. `"5433:5432"`) — the backend connects internally as `database:5432`, so nothing else needs to change.

---

## License

Released under the [MIT License](LICENSE).
