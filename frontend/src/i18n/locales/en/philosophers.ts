// philosophers domain — the "chat with a philosopher" feature (picker + chat view).
// Keys: 'philosophers.*'. English is the SOURCE OF TRUTH. Persona names, traditions,
// and blurbs come from the backend (content, English) and are not in this catalog.
export const philosophers: Record<string, string> = {
  // ── Page chrome ──────────────────────────────────────────────────────────
  'philosophers.title': 'Chat with a philosopher',
  'philosophers.subtitle': 'Pick a guide and reflect together, in the spirit of their tradition.',
  'philosophers.disclaimer': 'A reflective companion. Not a therapist, and not medical advice.',

  // ── Picker ───────────────────────────────────────────────────────────────
  'philosophers.pickerHeading': 'Choose a guide',
  'philosophers.loading': 'Loading guides…',
  'philosophers.loadError': 'Could not load the guides.',
  'philosophers.empty': 'No guides are available right now.',
  'philosophers.choose': 'Chat with {name}',

  // ── Chat view ────────────────────────────────────────────────────────────
  // Saved conversations (picker) — resume or delete past reflections.
  'philosophers.savedHeading': 'Your conversations',
  'philosophers.deleteConvo': 'Delete conversation: {title}',

  'philosophers.change': 'Choose another guide',
  'philosophers.intro': 'A quiet space to reflect. Share whatever is on your mind, and {name} will respond in the spirit of {tradition}.',
  'philosophers.youLabel': 'You',
  // The guide-suggested practice chip — a practice in this guide's spirit, deep-linking back
  // into the app. The practice name itself comes from the shared practice.card.*.name keys.
  'philosophers.practiceSuggestion': 'A practice in {name}’s spirit',
  // Openers — the tappable conversation starters shown when a chat is empty. The opener
  // text itself is English content (persona starters from the backend, or a line about
  // today's practice); these keys are only the surrounding chrome.
  'philosophers.startersHeading': 'A place to begin',
  'philosophers.openerAria': 'Start with: {text}',
  'philosophers.composerAria': 'Your message',
  'philosophers.composerPlaceholder': 'Share what’s on your mind…',
  'philosophers.send': 'Send',
  'philosophers.sending': 'Sending…',
  'philosophers.thinking': '{name} is reflecting…',

  // ── Notices ──────────────────────────────────────────────────────────────
  'philosophers.error': 'That didn’t go through. Try again.',
  'philosophers.capReached': 'That’s enough reflection for today. Come back tomorrow.',
  'philosophers.guestBlocked': 'Save your account to chat with a guide.',
}
