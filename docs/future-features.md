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

## Journaling & Insights

- [ ] Journal prompts tied to session type or streak milestones
- [ ] Mood tagging and trend charts over time
- [ ] Search and filter past journal entries
- [ ] Weekly/monthly practice summary emails or in-app reports

## Goals & Gamification

- [ ] Custom goals (daily minutes, weekly session count, breathing milestones)
- [ ] Two-week practice goals (user-facing sprints, e.g. "meditate 10 min/day for 14 days")
- [ ] Achievement badges for streaks and hour milestones
- [ ] Progress toward long-term targets (e.g. 100-hour practice)

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

- [ ] Friend connections and shared streak visibility
- [ ] Practice groups with shared goals
- [ ] Group challenges (e.g. collective minutes in a week)
- [ ] Optional accountability partners

### Profiles & Avatars

- [ ] User profiles with an avatar, visible to friends
- [ ] Avatar shop — unlock or purchase new avatars to customize your profile
- [ ] Cosmetic-only avatars (no pay-to-win on practice stats); a way to show off to friends
- [ ] Avatars earned through milestones (streaks, hours practiced) alongside purchasable ones
- [ ] Avatar showcase on profile, friend lists, and group/challenge leaderboards

## Accounts & Auth

- [ ] **Sign in with Google** (OAuth 2.0 / OIDC); link by verified email — see [auth design](design/authentication.md#deliberately-deferred-post-v1)
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
