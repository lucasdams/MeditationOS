# Future Features

[← Back to README](../README.md)

Planned capabilities beyond the current roadmap, grouped by theme. Priority may shift as V1 ships and user feedback comes in.

## Practice & Sessions

- [x] **Daily practice reminders** — opt-in email nudge at the user's local hour (timezone-aware, idempotent, skipped on days already practiced) — see [notifications design](design/notifications.md)
- [x] **Streak-save nudge** — a gentle late-evening email (local 20:00+) *only* when an active streak is at risk and the user hasn't practiced yet; uses a separate idempotency timestamp so it never conflicts with the morning reminder (nudge, not shame)
- [x] **Multiple meditation types** (mindfulness, body scan, walking, loving-kindness, resonance breathing, other)
- [ ] Pre-session intention setting and post-session quick rating (focus, calm, mood)
- [ ] Session templates (duration + type + breathing pattern presets)
- [ ] **Structured programs / practice plans** — curated multi-day plans (7 Days to Calm, Focus Foundations, 21-Day Habit Builder) that prescribe one short practice a day; data-first (a *sequence*, not audio). _Built once, then removed (2026-06): progress was a manual "day complete" counter, unverified and ungated by date — gameable and inconsistent with the app's computed-from-activity model. If revived, derive a day's completion from real logged activity (and pace it one day per calendar day) instead of a stored counter._
- [x] **Timer-only mode for unguided practice** — a `/meditate` page: pick a style + length, optional start/interval/end bells, saves as a session and earns XP
- [x] **Edit & delete logged sessions** — inline edit (type, duration, time, notes) and delete from the history list
- [x] **Export session history** — one-click CSV download from the history page (JSON is also available via the full account export in Settings)
- [x] **Schedule practice** — plan future sessions (type + date/time + optional length/note) on a `/schedule` page, with an "add to calendar" (.ics) export per session; new `scheduled_sessions` table, user-scoped — see `app/services/scheduled_session_service.py`
- [ ] Session visibility — public/private per session (default private); public sessions are shareable to friends (needs the social layer). Planned `sessions.visibility` column.

## HRV & Breathing

- [x] **Breaths-per-minute selector** (1–10, stepped) with the last pace remembered locally; inhale/exhale derived from the rate
- [x] **Selectable ambient soundscape** (synthesized ocean / rain / stream) + a transition chime on the breathing pacer; the meditation timer rings a soft singing-bowl bell at start / interval / end
- [x] **Named breathing presets** — Resonance (bpm-driven longer-exhale, the default), Coherence (5·5), Box (4·4·4·4), and 4·7·8, selectable on the breathe page; the pacer was generalized to per-phase holds (`frontend/src/lib/breathPattern.ts`, unit-tested). Last preset remembered locally
- [ ] Breathing pattern library shared across devices
- [ ] Session stats per pattern (which rates users practice most, time of day)
- [x] **Optional breath holds between inhale and exhale** — supported via the preset patterns (box/4·7·8 carry their own holds); a fully custom hold editor remains open
- [ ] Haptic or audio-only breathing modes
- [ ] Custom in:out ratio for resonance breathing (the bpm selector ships a **~2:3 longer-exhale** ratio by default; a user-adjustable ratio for advanced users with a known resonance frequency is the open item)

### HRV measurement — close the resonance loop

The product is branded on *HRV resonance breathing* but never **measures** HRV, so the user breathes without seeing the effect. Closing "breathe → measure → see your resonance improve" would make the core thesis tangible (and is a real differentiator). Privacy-first; biometric data stays the user's.

> **In progress (2026-06):** the **data + capture loop** has shipped — a source-agnostic
> `biometric_readings` table (heart rate + optional HRV, `context` pre/post/resting,
> `source` manual/estimated/camera/wearable), a user-scoped API, a **skippable
> post-session capture** on the Meditate/Breathe pages, a **standalone manual entry**
> (`/biometrics/new`), and a **heart-rate/HRV trend + pre/post delta** on Analytics.
> Manual/estimated entry only for now; camera and wearable are already valid `source`
> values, so they plug in without a schema change. See
> [ADR-0017](decisions/0017-biometric-readings-data-model.md).

- [ ] **Wearable / health-platform import** — pull HRV (and resting HR, sleep) from **Apple Health / Google Fit / Oura / Whoop / Fitbit**; show HRV trend alongside practice (does consistent breathing raise it over weeks?) — *writes `source='wearable'` into the shipped model*
- [ ] **Camera PPG** — estimate heart rate / a coarse HRV from the phone camera (fingertip), as a no-wearable option; clearly labelled an estimate, not a medical device — *writes `source='camera'`/`'estimated'` into the shipped model*
- [x] **Pre/post-session HRV delta** — optional quick reading after a sit (linked to it); the average post-vs-pre change is computed on read and shown gently on Analytics with its sample basis (a dedicated *pre*-reading prompt before a sit is a small UI follow-up on the same model)
- [x] **Manual / estimated entry to start** — source-agnostic readings, skippable post-session capture, standalone resting entry, and a trend view ([ADR-0017](decisions/0017-biometric-readings-data-model.md))
- [ ] Personal **resonance-frequency finder** — sweep breathing rates while reading HRV to estimate the user's individual resonance rate (ties into the custom in:out ratio above)
- [x] Strictly non-clinical framing throughout (no diagnosis / medical claims), per `.claude/rules/ai-product.md` tone — capture form and trend both label readings a *personal wellness signal, not a medical measurement*

### High-rate breathwork (Wim Hof–style) — separate mode

A **different practice** from slow resonance breathing: stimulating (sympathetic), not calming. Its own screen and flow, not a ratio/rate slider.

- [ ] Rounds of fast deep breaths (e.g. 30–40), then an **exhale breath-hold** (retention) timer, then a short **recovery inhale-hold**, repeated for N rounds
- [ ] Round + breath counter, hold timers, and gentle audio cues
- [ ] Save as a session with a distinct type (e.g. `breathwork`) — needs a new value in the session-type CHECK constraint
- [ ] Safety note in-app: never practice in/near water or while driving; stop if lightheaded (controlled hyperventilation)

## Journaling & Insights

- [x] **Gratitude tool** — category → AI-suggested prompts (Claude Haiku, curated fallback) or free text; earns XP — see [ADR-0008](decisions/0008-ai-suggestions-curated-fallback.md)
- [x] **Meditation journal** — written reflections, optionally linked to a session, with a fixed **mood** palette; full CRUD (incl. **inline edit** of body + mood), filterable; **earns XP** (parity with gratitude) — see [journaling design](design/journaling.md)
- [x] **Journaling prompts** — a gentle daily rotating prompt shown above the compose box to reduce blank-page friction; dismissible, shuffleable, never intrusive
- [ ] Journal prompts tied to session type or streak milestones (contextual prompts, beyond the current daily pool)
- [x] **Analytics page** — SQL-aggregated insights: minutes-per-week, by type / weekday / time-of-day, and a **journal-mood distribution** — see [analytics design](design/analytics.md)
- [x] **Honest pattern observations** — time-of-day calm scores, breathing-vs-meditation calm comparison, calm trend, and consistency observations, each guarded by a minimum sample threshold so nothing surfaces prematurely — see [analytics design](design/analytics.md)
- [x] **Standalone mood check-in** — a one-tap "how do you feel?" on the dashboard (no written body required), stored in `mood_logs`, reusing the journal mood palette so it feeds the same analytics
- [ ] Mood **over time** (moods plotted across weeks) and month-vs-month comparisons — beyond the current distribution
- [x] **Search past journal entries by text** (case-insensitive substring; mood filter also available) — ranked full-text search is the open item
- [x] **In-app weekly review** — a reflective "this week" card on the dashboard: minutes (vs last week), days practiced, streak, longest sit, and the mood logged most — computed from sessions + mood check-ins + journals (`GET /dashboard/weekly-review`, `weekly_review_service.py`)
- [x] **Weekly summary email** (opt-in) — the same review delivered weekly via email on a chosen local day, idempotent per ISO week; reuses the reminder job pattern (`weekly_review_service.send_due_weekly_summaries`, `app/jobs/send_weekly_summaries.py`); toggle in Settings
- [ ] Monthly reports / month-vs-month comparisons

## Goals & Gamification

- [x] **Daily quests** — now **personalized and rotating**: each user picks ≥3 of meditate · breathe · gratitude · journal (first-run picker + editable in Settings; stored in `users.quest_features`), and within each category the specific quest **rotates by the date** from a pool with **varied XP** (e.g. "Sit 10+ minutes" `+30`, "Breathe slow, ≤5 bpm" `+35`); daily reset at local midnight — see [gamification design](design/gamification.md)
- [x] **Streak bonus XP** (scaled to your current streak)
- [x] **Streak insurance / rest day** — the current streak survives one skipped day (two-in-a-row still resets); computed, nothing stored; surfaced as a 🛡️ badge via `rest_day_used` on `/dashboard/stats`
- [x] **XP rebalance toward time-based practice** — meditation 2 XP/min, breathing 3 XP/min, gratitude & journal 5 each, plus the day's rotating-quest bonus (`+10`…`+35` by variant); rewards are **itemized** on the post-session overlay so you see exactly what you earned and why
- [x] **Front-loaded per-session XP curve** — longer sits earn more per minute via a concave curve that rewards meaningful practice; short sits still earn something but the biggest gains come from sustained sessions
- [x] **Goals** — recurring habits: an activity (meditate / breathe / gratitude / journal) done a count of times per day/week, with this-period progress computed on read; active/archived lifecycle — see [goals design](design/goals.md)
- [x] **Custom-habit goals** — track anything the app doesn't record ("Gym", "Read") with a daily **check-in**; the one stored-progress path (a deliberate exception to ADR-0009)
- [ ] More cadences (custom counts, calendar-aligned weeks, monthly)
- [ ] Multiple check-ins per day for a custom habit (today: one per day)
- [x] **Achievement badges** for session, hour, and streak milestones — derived from stats (no stored state), shown on the dashboard with earned/locked states
- [ ] Long-term cumulative targets (e.g. 100 total hours) — distinct from the recurring-habit goals

### Sanctuary — a spend economy you build with coins

A persistent space the user grows by practicing — a calm **sanctuary** (garden /
farm / home / retreat) that becomes a long-term reason to keep levelling up.
The strongest retention loop in the product.

> **Shipped in V1 and expanded through V2** — see **[Sanctuary design](design/sanctuary.md)**
> and [ADR-0011](decisions/0011-sanctuary-spend-economy.md) through
> [ADR-0016](decisions/0016-sanctuary-shop-expansion-and-retune.md). The original
> cultivation model ([ADR-0010](decisions/0010-sanctuary-cultivation.md)) was superseded
> by a **spend economy**: earn **coins** as you level up, **buy** items from the shop, and
> personalize them over time. Plants, structures, companions, and a **whimsy** track render
> as **procedural SVG**. *(Remaining: the ambiance track and Stripe cosmetic packs.)*

- [x] **Spend economy** — earn coins from levels, buy items from a shop, coin balance computed from holdings (no wallet row); [ADR-0011](decisions/0011-sanctuary-spend-economy.md)
- [x] **Four tracks** of items:
  - *Nature* ✅ — trees, flowers, mushroom ring, pond
  - *Structures* ✅ — hut, cottage, barn, car, beach house, boat
  - *Companions* ✅ — goldfish, snail, bird, cat, hedgehog, snake, fox, dog
  - *Whimsy* ✅ — garden gnome, wind chime, lantern, frog on a lily, scarecrow, fairy door, hammock, tea cart; [ADR-0016](decisions/0016-sanctuary-shop-expansion-and-retune.md)
- [x] **Variants + mix-and-match customizations** — choose a base form at purchase (e.g. oak/pine/cherry/willow tree, corgi/husky/shiba/dalmatian dog) and buy independent customization slots over time (swing, birdhouse, foliage type on a tree; collar/bandana/hat on a pet); [ADR-0012](decisions/0012-sanctuary-personalization.md)
- [x] **Progressive pricing** — each additional item carries a small surcharge (keyed to immutable acquisition order), a gentle anti-hoarding nudge; [ADR-0013](decisions/0013-sanctuary-progressive-pricing.md)
- [x] **Movable grid layout** — items sit on a row-major grid the user rearranges by drag (desktop) or tap-to-place (touch); moving is layout-only and never changes the coin balance; [ADR-0014](decisions/0014-sanctuary-grid-layout.md)
- [x] **Item naming + note + favourite** — optional name plaque, a one-line note, and a favourite star per item; all cosmetic and default-off; [ADR-0015](decisions/0015-sanctuary-personalization-touches.md)
- [x] **Streak drives vitality.** An active streak keeps the space thriving; a long gap lets it go gently dormant — **never punishing** (no destroyed progress; it recovers when you return). Wellness app: nudge, not shame.
- [x] **Level-gated shop** — higher-level items are locked until the user reaches the required level; the shop groups items by track with per-track headers.
- [ ] **Ambiance track** — time-of-day, weather, soundscape, lighting *(not yet)*
- [ ] **A sanctuary item unique to each person** *(later flavour)* — generate each plant from the user's data (meditation type → character, streak → fullness, level → size, per-user seed), likely via an **L-system**. Procedural SVG rendering shipped; per-user generative variation is still ahead.

**Monetization tie-in:** premium cosmetic packs via Stripe — purely cosmetic, never
pay-to-skip-practice (see [Payments & Monetization](#payments--monetization)).

## AI (Post-V3)

- [ ] Proactive check-ins based on missed sessions or journal sentiment
- [ ] Compare practice patterns across time periods ("this month vs last month")
- [ ] Suggested journal prompts based on recent obstacles
- [ ] Cost-capped and privacy-aware LLM usage per user

## Practice Environment

- [ ] Ambient sound loops (rain, bells, nature) with CC0 / properly licensed assets
- [ ] Optional background audio during breathing and unguided sessions
- [ ] Licensed classical or instrumental playlist player (curated, attribution UI)
- [ ] Volume mixing (voice cues vs background audio)

## Social & Community

- [ ] **Friends** — send/accept friend requests; see friends' level, streak, and recent activity (privacy-respecting, opt-in). The **username** added in V1 is the groundwork; closely tied to Clubs below. Data: a `friendships` table (requester/addressee/status).
- [ ] Optional accountability partners

### Clubs (communities)

Named communities users join around a theme or goal — e.g. "Morning Meditators",
"Beginners", "Breathwork", "Anxiety Support". A reason to keep coming back that's
*social*, not just personal — and a strong retention loop.

- [ ] Create / join clubs; **public** (discoverable) or **invite-only**
- [ ] Roles: owner / admin / member; light moderation (remove member, edit club, transfer ownership)
- [ ] Club page: members, combined stats (total minutes, how many are on a streak), and an **opt-in leaderboard** (by streak or minutes)
- [ ] **Club challenges** — a collective goal (e.g. "10,000 minutes this month") with shared progress (subsumes the earlier group-challenge idea)
- [ ] **Activity feed** of members' shared milestones / sessions — respects each session's public/private [visibility](#practice--sessions)
- [ ] Discovery: browse / search clubs by theme; recommended clubs

**Data model sketch:** `clubs` (name, description, visibility, owner_id) ·
`club_members` (club_id, user_id, role, joined_at) · `club_challenges`
(club_id, goal, period).

**Ties to:** session visibility (what shows in the feed), streaks (leaderboards),
avatars (identity in a club), goals/badges. **Depends on** the friends/social layer
and **careful privacy defaults** — clubs surface activity, so sharing is opt-in and
sessions stay private unless a member chooses otherwise.

### Profiles & Avatars

- [ ] User profiles with an avatar, visible to friends
- [ ] Avatar shop — unlock or purchase new avatars to customize your profile
- [ ] Cosmetic-only avatars (no pay-to-win on practice stats); a way to show off to friends
- [ ] Avatars earned through milestones (streaks, hours practiced) alongside purchasable ones
- [ ] Avatar showcase on profile, friend lists, and group/challenge leaderboards

## Accounts & Auth

- [x] **Sign in with Google** (OIDC ID-token verification); links by verified email — see [auth design](design/authentication.md#sign-in-with-google--implemented)
- [x] **Forgot-password reset** via an emailed single-use link — see [auth design](design/authentication.md#password-reset--implemented)
- [x] **Email verification** (emailed link; Google sign-in arrives verified) — see [auth design](design/authentication.md#email-verification--implemented)
- [x] **Guest accounts** — "use without signing up"; an anonymous account you can later **claim** (add email + password) without losing data — see [auth design](design/authentication.md#guest-accounts--implemented)
- [x] **Change account email** — from Settings, re-authenticated with the current password; the new address is reset to unverified and a confirmation link is emailed
- [x] **Email-verification gate** (`REQUIRE_EMAIL_VERIFICATION` env var, off by default) — when enabled, data routes return `403` for unverified users; the frontend catches the `403` and shows a "confirm your email" screen with a resend button. Google sign-in always arrives verified. Off by default so the app works without an email provider configured.
- [ ] Other social providers (Apple, GitHub)
- [ ] Multi-factor authentication (TOTP)

## Payments & Monetization

Powered by **Stripe** (Checkout + Billing + webhooks). API keys stay server-side; no card data touches our servers (PCI scope stays minimal).

- [ ] Subscription tiers / freemium model via Stripe Billing (if productized beyond portfolio)
- [ ] One-off avatar purchases via Stripe Checkout (cosmetic — see [Profiles & Avatars](#profiles--avatars))
- [ ] Stripe webhooks → entitlement updates (subscription active, payment failed, refund)
- [ ] Customer billing portal for plan changes and cancellations

## Platform & Product

- [x] **Onboarding / activation flow** — a first-run wizard (goal → experience → preferred time → quests) shown to new users in place of the bare quest picker; personalizes quests from the goal, sets a reminder from the preferred time, tunes the starting breathing pace from experience, and drops the user into a first session (`frontend/src/pages/Onboarding.tsx`)
- [x] **PWA + Web Push** — installable app with an offline app-shell (`manifest.webmanifest` + `public/sw.js`, service worker registered in production only so it never breaks Vite HMR). Opt-in **Web Push** practice nudges: `push_subscriptions` table + `push_service` (provider-optional — subscriptions store, sends no-op without VAPID keys; lazy `pywebpush`), `/api/v1/push` endpoints, a Settings toggle, and push integrated into the daily reminder job. *(Remaining polish: PNG app icons; client-side offline session queue.)*
- [x] **Seasonal + day/night ambient theme** — a subtle background that shifts by season (auto by date, or picked in Settings → Appearance) and by day phase (dawn/day/dusk/night from the local clock); the Sanctuary gains a sun/moon sky band
- [x] **Dark mode** — Light / Dark / System toggle in Settings → Appearance, built on the CSS custom-properties theme system; `System` follows the OS `prefers-color-scheme`. Broader accessibility improvements remain open.
- [ ] **Internationalization (i18n)** — start with a **Japanese (JP) version** of the site (UI strings + AI prompts/suggestions in Japanese)
- [ ] Staging environment separate from production
- [x] **User data export and account deletion** (privacy) — `GET /auth/export` (full JSON) and `DELETE /auth/me` (cascade delete), surfaced in Settings
- [x] **Admin metrics dashboard** — aggregate-only product health metrics (`/admin`), gated on `ADMIN_EMAILS` env-var allowlist + verified email; never exposes individual user content
- [x] **Sentry error monitoring** — provider-optional (`SENTRY_DSN` env var); PII-scrubbed before events leave the process; performance tracing at low sample rate; no-op when DSN is absent
