// landing domain — the public (logged-out) marketing homepage. Keys: 'landing.*'.
// English is the SOURCE OF TRUTH. Marketing copy, but it lives in the catalog like the
// rest of the UI chrome so the landing page is localized (main's landing was already i18n'd).
export const landing: Record<string, string> = {
  // ── Hero ───────────────────────────────────────────────────────────────────
  'landing.hero.eyebrow': 'Data-first meditation',
  // The h1 is split so the middle phrase can carry the accent style. Rendered as
  // `{titleLead}<span class="landing-hero-accent">{titleAccent}</span>{titleEnd}`.
  'landing.hero.titleLead': 'Meditation that ',
  'landing.hero.titleAccent': 'tracks itself',
  'landing.hero.titleEnd': '.',
  'landing.hero.tagline':
    'Track your practice, build streaks, and breathe with intention, all in one place. MeditationOS is built around your practice data, not another audio library. A few minutes a day, and the habit takes hold.',
  'landing.hero.guestNote': 'No sign-up needed to try it.',
  'landing.hero.breatheCaption': 'Breathe in… and out.',

  // Shared CTAs (hero + closing)
  'landing.cta.getStarted': 'Get started, it’s free',
  'landing.cta.login': 'Log in',

  // ── How it works ───────────────────────────────────────────────────────────
  'landing.how.title': 'How it works',
  'landing.how.lead': 'Three steps, and the app does the tracking for you.',
  'landing.step.sit.title': 'Sit for a few minutes',
  'landing.step.sit.body':
    'Start a timer, follow a breathing pacer, or gaze at a candle. No account or audio download needed to try it.',
  'landing.step.log.title': 'Log it, automatically',
  'landing.step.log.body':
    'Every session, breath, gratitude note, and journal entry lands in one place, building your streak as you go.',
  'landing.step.watch.title': 'Watch the pattern emerge',
  'landing.step.watch.body':
    'Your dashboard turns the raw practice into streaks, trends, and a heatmap, so you can see the habit take hold.',

  // ── Feature highlights ─────────────────────────────────────────────────────
  'landing.features.title': 'Everything in one calm place',
  'landing.features.lead':
    'Nine ways to practice and reflect. Every one of them feeds the same clean picture of your progress.',
  'landing.feature.timer.title': 'Meditation timer',
  'landing.feature.timer.body':
    'Unguided “sit now” sessions with a calm timer, optional start / interval / end bells, and timing that survives a backgrounded tab.',
  'landing.feature.breathing.title': 'HRV resonance breathing',
  'landing.feature.breathing.body':
    'A guided pacer at your chosen slow rate, with an ocean-breath audio guide and a breathing circle to follow.',
  'landing.feature.gratitude.title': 'Gratitude',
  'landing.feature.gratitude.body':
    'Capture small moments of gratitude across 37 themes, with AI-suggested prompts, or write your own.',
  'landing.feature.journal.title': 'Journal',
  'landing.feature.journal.body':
    'Reflect on a sit, tag a mood, and resurface a random past entry to revisit.',
  'landing.feature.trataka.title': 'Candle gazing',
  'landing.feature.trataka.body':
    'An eyes-open focus practice (traditionally called Trataka). Rest your attention on a single, gently moving flame to steady a busy mind.',
  'landing.feature.goals.title': 'Goals',
  'landing.feature.goals.body':
    'Set recurring habits (meditate, breathe, journal) and watch progress fill in automatically from your activity.',
  'landing.feature.spirit.title': 'Spirit',
  'landing.feature.spirit.body':
    'Awaken a living companion you raise through practice. It evolves down a path shaped by how you meditate, and grows as you show up.',
  'landing.feature.dashboard.title': 'Dashboard & analytics',
  'landing.feature.dashboard.body':
    'Streaks, levels, a weekly breakdown, an activity heatmap, and trends across type, day, and time.',
  'landing.feature.xp.title': 'Streaks, XP & missions',
  'landing.feature.xp.body':
    'Rotating daily missions, XP and levels, and a streak with a forgiving rest day. Gentle, not grindy.',

  // ── Trust / privacy ────────────────────────────────────────────────────────
  'landing.trust.title': 'Your practice data stays yours',
  'landing.trust.lead':
    'Privacy-first by design. No selling your reflections, no dark patterns. Just a record of your practice that you fully control.',
  'landing.trust.export.title': 'Export anytime',
  'landing.trust.export.body':
    'Download everything you’ve logged as JSON whenever you want. It’s your data. Take it with you.',
  'landing.trust.delete.title': 'Delete anytime',
  'landing.trust.delete.body':
    'Permanently delete your account and its data from Settings, in a couple of clicks. No “contact support to cancel”.',
  'landing.trust.yours.title': 'Yours by default',
  // Split around the inline <Link> to /privacy.
  'landing.trust.yours.bodyPre':
    'Your sessions and journals are tied to your account and not shared. Read exactly what we store in the ',
  'landing.trust.yours.link': 'Privacy policy',
  'landing.trust.yours.bodyPost': '.',
  'landing.trust.note':
    'Why a few minutes a day? Because a small, repeatable practice is easier to keep than a big one, and keeping it is the whole point. MeditationOS is a practice tracker, not a treatment, and makes no medical claims.',

  // ── Story + value stack ────────────────────────────────────────────────────
  'landing.story.title': 'Why I built this',
  'landing.story.body':
    'I wanted to meditate consistently, but every app I tried was a wall of audio tracks, and none of them showed me whether the habit was actually sticking. So I built the tool I wanted: one that turns your practice into data, celebrates you showing up, and stays out of the way. MeditationOS is that tool, and it’s free to start.',
  'landing.story.signoff': 'The maker of MeditationOS',
  'landing.value.heading': 'What you get',
  'landing.value.1':
    'Nine ways to practice: timer, resonance breathing, gratitude, journal, candle gazing, and more',
  'landing.value.2':
    'One clean dashboard that turns every session into streaks, trends, and an activity heatmap',
  'landing.value.3':
    'A living Spirit companion you raise through practice, plus gentle XP, levels, and daily missions',
  'landing.value.4':
    'Your data stays yours: export everything as JSON or delete your account at any time',
  'landing.value.5':
    'Try it instantly as a guest: no email, no card, no audio library to wade through',
  'landing.testimonials.lead':
    'Building your practice with MeditationOS? We’d love to feature your story here.',

  // ── Closing CTA ────────────────────────────────────────────────────────────
  'landing.final.title': 'Start your practice today',
  'landing.final.lead':
    'Free to begin, no audio library to sift through. Just you, a few quiet minutes, and a record that grows with you.',
}
