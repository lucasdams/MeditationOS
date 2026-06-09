# MeditationOS

A production-style **business application** for meditation and wellness. Portfolio project demonstrating backend development, database design, cloud deployment, AI integration, and professional delivery practices (tickets, review, deployment).

**Status:** Cycle 1 complete — register / login / logout working locally · 14 backend tests passing · Cycle 2 (Sessions API) up next

**What's working now (Cycle 1):**

- ✅ Register / log in / log out — httpOnly-cookie JWT auth, argon2 password hashing
- ✅ PostgreSQL schema + Alembic migrations, auto-applied on startup
- ✅ React + TypeScript frontend — protected routes, loading and error states
- ✅ 14 backend tests (pytest against Postgres), Dockerized dev stack, security review actioned

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
| **Workflow** | Git, GitHub Issues, PRs, milestones, Claude Code |
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
| **Cycle 5** | Deploy V1 to AWS (CI + production config) |

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

This project uses **Claude Code** as part of a deliberate, professional development workflow, the same way modern teams adopt linters, CI pipelines, and code review to ship reliable software faster.

AI accelerates execution. **Engineering judgment** (architecture, security, testing, and review) remains human-owned. That combination is increasingly standard in industry and is a skill worth demonstrating on its own.

### AI Philosophy

- Use AI to accelerate implementation, not replace engineering judgment.
- Requirements, architecture, and tests are more important than generated code.
- Write clear specifications before asking AI to implement features.
- Treat tests as the source of truth and use them to validate all AI-generated work.
- Verify AI output against system architecture, security, and business requirements.
- Document decisions, edge cases, and operational knowledge so both humans and AI share context.
- Challenge AI assumptions and actively look for failure modes.
- Maintain understanding of the codebase; developers are responsible for systems they ship.
- Optimize for architectural thinking, verification, and supervision rather than raw coding speed.

### What This Demonstrates

| Skill | How it shows up in this project |
|-------|----------------------------------|
| **Technical judgment** | Evaluating AI output, catching incorrect APIs or logic, and choosing what to accept, edit, or rewrite |
| **Prompt engineering** | Writing precise, constrained prompts that produce maintainable, reviewable code |
| **Code review discipline** | Treating every AI-generated change like a PR from a junior contributor: read the diff, run tests, verify behavior |
| **Architecture ownership** | Defining system design, data models, and API contracts before delegating implementation details |
| **Security awareness** | Personally reviewing auth, validation, secrets handling, and production configuration |
| **Accountability** | Standing behind every commit: able to explain, debug, and extend any code in the repository |

### Workflow

```
Ticket + acceptance criteria → Prompt with context & constraints → Review diff →
Test locally → PR linked to issue → Merge
```

The goal is not speed alone; it is **shipping production-quality code** with a shorter iteration loop.

### Engineering Standards

| Standard | Practice |
|----------|----------|
| **Own the design** | Architecture, schema, and API contracts are decided first; AI helps implement against them |
| **Review every change** | No commit without reading the full diff and understanding the behavior |
| **Verify with tests** | Automated tests and manual runs confirm correctness, not the AI's summary |
| **Keep diffs focused** | Small, scoped prompts produce changes that are easier to review and reason about |
| **Protect sensitive areas** | Auth, database migrations, secrets, and infrastructure config get explicit human review |
| **Document decisions** | Commit messages and README updates reflect *why* a change was made |

### Where AI Adds the Most Value

- Bootstrapping project structure, Docker configs, and repetitive CRUD patterns
- Exploring tradeoffs ("JWT vs session auth for this use case")
- Generating test cases from specifications
- Accelerating debugging with full codebase context
- Refactoring within explicit constraints ("extract this service without changing the public API")
- Drafting documentation that is then verified for accuracy

### Where I Retain Direct Ownership

Authentication, database schema, security, architecture, secrets, and production config require personal design and review. Claude reads [`.claude/rules/security.md`](.claude/rules/security.md) for auth and data-access work.

### Quality Gate (Before Every Commit)

See [`.claude/rules/new-feature-checklist.md`](.claude/rules/new-feature-checklist.md) for the full list. Minimum bar:

- [ ] Full diff reviewed and understood
- [ ] Feature verified locally; tests and linters passing
- [ ] No scope creep, invented dependencies, or secrets in code
- [ ] Commit message describes intent

### Prompting Approach

Effective prompts mirror good ticket writing: specific, contextual, and bounded:

```
✅ "Add a POST /api/v1/sessions endpoint that validates duration > 0,
    associates the session with the authenticated user, and returns 201.
    Follow the pattern in backend/app/api/routes/users.py."

❌ "Build the meditation session feature."
```

- Reference **existing files and patterns** to follow
- State **constraints**: stack, libraries, and what must not change
- Scope **one concern at a time** for non-trivial work
- Ask for **explanations** when working in an unfamiliar area

The same rigor applies to development AI and product AI: clear prompts, bounded context, cost awareness, and human review before anything ships.

---

## Claude Rules

Rules are split into **tiers** so Claude Code loads only what the current task needs. Large always-on rule files waste context and get ignored. Each tier maps to a native Claude Code mechanism:

- **Root `CLAUDE.md`** is read automatically at the start of every session.
- **Nested `CLAUDE.md`** files load automatically when Claude reads or edits files in that directory.
- **`.claude/rules/*.md`** files are read on demand, when the trigger in the root file's index applies.

**Design question per rule:** *What does Claude need to know right now for this task?*

### The 2-2-5 Setup (adapted for this project)

Based on the tiered rules approach: **always-on context**, **directory-scoped zones**, and **read-on-demand specialist rules**. Exact file count grows with the project; the **tiering principle** matters more than the number.

```
┌─────────────────────────────────────────────────────────┐
│  TIER 1: Always-on — root CLAUDE.md                     │
│  project context · code standards (naming, errors, etc.)│
├─────────────────────────────────────────────────────────┤
│  TIER 2: Directory-scoped — nested CLAUDE.md            │
│  backend/CLAUDE.md · frontend/CLAUDE.md                 │
├─────────────────────────────────────────────────────────┤
│  TIER 3: Read-on-demand — .claude/rules/*.md            │
│  security · database · infrastructure · ai-product      │
│  · new-feature-checklist                                │
└─────────────────────────────────────────────────────────┘
```

### Tier 1: Always-On

Loaded every conversation. Keep it lean.

| File | Purpose |
|------|---------|
| [`CLAUDE.md`](CLAUDE.md) | Project context (stack, folder layout, non-negotiable rules) plus code standards: naming, errors, working style, libraries not to add. Also indexes the on-demand rules below. |

### Tier 2: Directory-Scoped

Nested `CLAUDE.md` files load automatically when Claude works on files in that directory. They can be longer since they are not always in context.

| File | Zone | Covers |
|------|------|--------|
| [`backend/CLAUDE.md`](backend/CLAUDE.md) | `backend/**/*.py` | FastAPI routes, services, Pydantic, pytest |
| [`frontend/CLAUDE.md`](frontend/CLAUDE.md) | `frontend/**/*.{ts,tsx}` | Components, services layer, loading states, UX |

### Tier 3: Read-On-Demand

Claude Code has no glob auto-attach or `description`-based requesting, so these stay out of context until needed. The root `CLAUDE.md` lists each with a **when to read** trigger; `backend/CLAUDE.md` cross-links the backend ones. The trigger must say **when** to use the rule.

| File | Read when… |
|------|------------|
| [`security.md`](.claude/rules/security.md) | Adding auth, routes, user data access, env secrets, CORS |
| [`database.md`](.claude/rules/database.md) | Editing models, queries, or Alembic migrations |
| [`infrastructure.md`](.claude/rules/infrastructure.md) | Editing Docker, Compose, CI, or AWS deployment config |
| [`ai-product.md`](.claude/rules/ai-product.md) | Working on V3 LLM integration, prompts, or AI features |
| [`new-feature-checklist.md`](.claude/rules/new-feature-checklist.md) | Building a feature end to end from ticket to PR |

Write triggers like you are telling a coworker when to grab a binder: specific and actionable.

### Rule-Writing Principles

| Principle | Practice |
|-----------|----------|
| **Patterns, not features** | Specs live in GitHub Issues; rules describe how to implement. |
| **Say what NOT to do** | Do not add axios (use `fetch`); do not commit secrets. |
| **Use real file paths** | `backend/app/api/routes/sessions.py`, not "follow the established pattern." |
| **Keep always-on minimal** | Database rules belong in `.claude/rules/database.md`, not the root `CLAUDE.md`. |
| **Review every few weeks** | Stale rules are worse than none. |

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

### Architecture Decision Records

Numbered, immutable records of significant choices — see [`docs/decisions/`](docs/decisions/README.md).

| # | Decision |
|---|----------|
| [0002](docs/decisions/0002-postgresql.md) | PostgreSQL as the primary datastore |
| [0003](docs/decisions/0003-fastapi-stack.md) | FastAPI + SQLAlchemy + Alembic |
| [0004](docs/decisions/0004-uuid-primary-keys.md) | UUID primary keys (anti-enumeration) |
| [0005](docs/decisions/0005-httponly-cookie-jwt-auth.md) | httpOnly-cookie JWT authentication |
| [0006](docs/decisions/0006-layered-architecture.md) | Layered backend (routes / services / models / schemas) |

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

Core tables (V1–V2): `users`, `sessions`, `breathing_patterns`, `journals`, `goals`. Streak stats are **computed from `sessions`**, not stored (see the design note in the linked doc). Future tables (V3+): `friendships`, `groups`, `challenges`, `notifications`.

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
