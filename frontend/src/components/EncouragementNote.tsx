import { useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import { useT } from '../i18n'

// A pink heart colour for the tap-heart button + the floating hearts — reads as affection
// (and as the Cool Electric pink pop, not the indigo action accent). Used by the Heart fill below.
const HEART_COLOR = '#ec4899'

// The lucide Heart, as a static SVG string for the imperatively-spawned floating hearts (created
// outside React's tree). Filled + stroked in the heart colour so the flourish matches the
// SVG craft of the rest of the app — no system emoji. Mirrors lucide's 24×24 heart geometry.
const FLOATING_HEART_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ` +
  `fill="${HEART_COLOR}" stroke="${HEART_COLOR}" stroke-width="1.75" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>` +
  `</svg>`

// Warm, never-punishing affirmations — the app speaking kindly to a beginner. Kept gentle and
// low-pressure on purpose: showing up is the win, rest is allowed, and there's no wrong way to begin.
// The array holds i18n catalog keys ('home.encouragement.N'); the copy lives in the locale files
// and is resolved with t() at render time so a language switch re-labels the note live.
const MESSAGES = [
  'home.encouragement.0',
  'home.encouragement.1',
  'home.encouragement.2',
  'home.encouragement.3',
  'home.encouragement.4',
  'home.encouragement.5',
  'home.encouragement.6',
  'home.encouragement.7',
  'home.encouragement.8',
  'home.encouragement.9',
  'home.encouragement.10',
  'home.encouragement.11',
  'home.encouragement.12',
  'home.encouragement.13',
  'home.encouragement.14',
  'home.encouragement.15',
]

/**
 * A little pocket of warmth for the home: a gentle, rotating supportive message and a heart you can
 * tap to "send love" — a few hearts float up, and the message refreshes. Pure delight, no stakes.
 * The hearts are a tap-initiated flourish, so the motion is intentional; reduced-motion just softens
 * it (see index.css). Self-contained — no props, no network.
 */
export default function EncouragementNote() {
  const { t } = useT()
  const [index, setIndex] = useState(() => Math.floor(Math.random() * MESSAGES.length))
  const heartsHost = useRef<HTMLSpanElement>(null)

  function sendLove() {
    const host = heartsHost.current
    if (host) {
      for (let k = 0; k < 5; k++) {
        const heart = document.createElement('span')
        heart.className = 'floating-heart'
        // A filled lucide Heart (warm rose-gold) instead of an emoji, so the flourish matches
        // the app's SVG craft. These hearts live outside React's tree (imperative spawn).
        heart.innerHTML = FLOATING_HEART_SVG
        heart.style.setProperty('--dx', `${Math.round(Math.random() * 56 - 28)}px`)
        heart.style.animationDelay = `${k * 70}ms`
        host.appendChild(heart)
        window.setTimeout(() => heart.remove(), 1700)
      }
    }
    // Advance to a different message (never repeat the current one).
    setIndex((prev) => (prev + 1 + Math.floor(Math.random() * (MESSAGES.length - 1))) % MESSAGES.length)
  }

  return (
    <div className="encouragement-note">
      <p className="encouragement-message" aria-live="polite">
        {t(MESSAGES[index])}
      </p>
      <button
        type="button"
        className="encouragement-heart"
        onClick={sendLove}
        aria-label={t('home.encouragement.sendLove')}
      >
        <span className="encouragement-heart-glyph" aria-hidden="true">
          <Heart size={22} strokeWidth={1.75} fill={HEART_COLOR} color={HEART_COLOR} />
        </span>
        <span ref={heartsHost} className="encouragement-hearts" aria-hidden="true" />
      </button>
    </div>
  )
}
