# Future Features

[← Back to README](../README.md)

Planned capabilities beyond the current roadmap, grouped by theme. Priority may shift as V1 ships and user feedback comes in.

## Practice & Sessions

- [ ] Session reminders and practice notifications
- [ ] Multiple meditation types (mindfulness, body scan, walking, etc.)
- [ ] Pre-session intention setting and post-session quick rating (focus, calm, mood)
- [ ] Session templates (duration + type + breathing pattern presets)
- [ ] Timer-only mode for unguided practice
- [ ] Export session history (CSV / JSON)
- [ ] Session visibility — public/private per session (default private); public sessions are shareable to friends (needs the social layer). Planned `sessions.visibility` column.

## HRV & Breathing

- [ ] Breathing pattern library shared across devices
- [ ] Session stats per pattern (which rates users practice most, time of day)
- [ ] Optional breath holds between inhale and exhale
- [ ] Haptic or audio-only breathing modes
- [ ] Custom in:out ratio for resonance breathing (default is 2:3; advanced users with a known resonance frequency)

### High-rate breathwork (Wim Hof–style) — separate mode

A **different practice** from slow resonance breathing: stimulating (sympathetic), not calming. Its own screen and flow, not a ratio/rate slider.

- [ ] Rounds of fast deep breaths (e.g. 30–40), then an **exhale breath-hold** (retention) timer, then a short **recovery inhale-hold**, repeated for N rounds
- [ ] Round + breath counter, hold timers, and gentle audio cues
- [ ] Save as a session with a distinct type (e.g. `breathwork`) — needs a new value in the session-type CHECK constraint
- [ ] Safety note in-app: never practice in/near water or while driving; stop if lightheaded (controlled hyperventilation)

## Journaling & Insights

- [x] **Gratitude tool** — category → AI-suggested prompts (Claude Haiku, curated fallback) or free text; earns XP — see [ADR-0008](decisions/0008-ai-suggestions-curated-fallback.md)
- [ ] Journal prompts tied to session type or streak milestones
- [ ] Mood tagging and trend charts over time
- [ ] Search and filter past journal entries
- [ ] Weekly/monthly practice summary emails or in-app reports

## Goals & Gamification

- [ ] Custom goals (daily minutes, weekly session count, breathing milestones)
- [ ] Two-week practice goals (user-facing sprints, e.g. "meditate 10 min/day for 14 days")
- [ ] Achievement badges for streaks and hour milestones
- [ ] Progress toward long-term targets (e.g. 100-hour practice)

### Sanctuary — build & upgrade your space (streak rewards)

A persistent space the user grows by practicing — a calm **sanctuary** (garden /
farm / home / retreat) that becomes a long-term reason to keep the streak alive.
The strongest retention loop in the product.

> A **first step shipped in V1**: XP (= minutes practiced) drives a level, and a `<pre>` ASCII tree on the dashboard grows through tiers as you level up. The Sanctuary below is the fuller version (currency you *spend*, multiple upgrade tracks).

- [ ] **A tree unique to each person** — instead of fixed tiers, *generate* the tree from the user's data so it reflects how they practice: dominant meditation type → the tree's character (e.g. resonance breathing → tall/slender, body scan → bushy, loving-kindness → blossoms), streak → fullness (leafy vs sparse), level → size, plus a per-user seed for a distinct base shape. Deterministic (same data → same tree). Likely via an **L-system**. Two flavours to choose from: **procedural ASCII** (keeps the retro look, low-risk) or **procedural SVG** (vector, more beautiful, bigger swing).

**Core loop:** `practice → earn currency → spend → upgrade → see your space change`

- [ ] **Earn currency** ("calm points" / seeds) from each session, with **bonuses for streak milestones** — a longer daily streak earns faster, so consistency is rewarded over bingeing.
- [ ] **Spend on upgrades** across a few tracks, so there's always a next thing to work toward:
  - *Nature* — garden beds, trees, a pond, wildlife
  - *Structures* — meditation hut → cabin → temple
  - *Ambiance* — time-of-day, weather, soundscape, lighting
  - *Companions* — animals/creatures that appear in the space
- [ ] **Streak drives growth.** An active streak keeps the space thriving; a long gap lets it go gently dormant — **never punishing** (no destroyed progress; it recovers when you return). Wellness app: nudge, not shame.
- [ ] **Milestone unlocks** — streak/hour milestones unlock new upgrade tiers and one-off cosmetics (pairs with achievement badges and avatars).

**Monetization tie-in:** premium cosmetic upgrade packs or a currency boost via
Stripe — purely cosmetic, never pay-to-skip-practice (see [Payments & Monetization](#payments--monetization)).

**Data model sketch (when built):**
- `user_wallet` — `balance`, `lifetime_earned`
- `upgrades` — catalog: `key`, `category`, `tier`, `cost`
- `user_upgrades` — which upgrades a user owns + level
- earning rules derive from `sessions` + the streak engine

**Depends on:** the **streak engine (Cycle 3)** for "current streak", and a
small **rewards/economy** service to grant + spend currency. Build order:
streaks → earn/spend wallet → upgrade catalog → the builder UI.

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
- [ ] Other social providers (Apple, GitHub)
- [ ] Email verification and password reset
- [ ] Multi-factor authentication (TOTP)

## Payments & Monetization

Powered by **Stripe** (Checkout + Billing + webhooks). API keys stay server-side; no card data touches our servers (PCI scope stays minimal).

- [ ] Subscription tiers / freemium model via Stripe Billing (if productized beyond portfolio)
- [ ] One-off avatar purchases via Stripe Checkout (cosmetic — see [Profiles & Avatars](#profiles--avatars))
- [ ] Stripe webhooks → entitlement updates (subscription active, payment failed, refund)
- [ ] Customer billing portal for plan changes and cancellations

## Platform & Product

- [ ] Mobile-responsive layout and PWA support
- [ ] Dark mode and accessibility improvements
- [ ] Staging environment separate from production
- [ ] User data export and account deletion (privacy compliance)
