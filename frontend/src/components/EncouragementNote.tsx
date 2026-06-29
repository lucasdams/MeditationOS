import { useRef, useState } from 'react'

// Warm, never-punishing affirmations — the app speaking kindly to a beginner. Kept gentle and
// low-pressure on purpose: showing up is the win, rest is allowed, and there's no wrong way to begin.
const MESSAGES = [
  'You showed up today. That’s enough. 💛',
  'Be gentle with yourself.',
  'Every breath is a fresh start.',
  'Small steps still move you forward.',
  'Rest is part of the practice, too.',
  'You’re doing better than you think.',
  'Your companion is glad you’re here.',
  'There’s no wrong way to begin.',
  'A few quiet breaths is a real win.',
  'Whatever today holds, you’ve got this.',
  'Progress isn’t always loud.',
  'Showing up is the hard part — and you did.',
]

const HEART_GLYPHS = ['💛', '💗', '🤍', '💖', '💞']

/**
 * A little pocket of warmth for the home: a gentle, rotating supportive message and a heart you can
 * tap to "send love" — a few hearts float up, and the message refreshes. Pure delight, no stakes.
 * The hearts are a tap-initiated flourish, so the motion is intentional; reduced-motion just softens
 * it (see index.css). Self-contained — no props, no network.
 */
export default function EncouragementNote() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * MESSAGES.length))
  const heartsHost = useRef<HTMLSpanElement>(null)

  function sendLove() {
    const host = heartsHost.current
    if (host) {
      for (let k = 0; k < 5; k++) {
        const heart = document.createElement('span')
        heart.className = 'floating-heart'
        heart.textContent = HEART_GLYPHS[k % HEART_GLYPHS.length]
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
        {MESSAGES[index]}
      </p>
      <button
        type="button"
        className="encouragement-heart"
        onClick={sendLove}
        aria-label="Send a little love"
      >
        <span className="encouragement-heart-glyph" aria-hidden="true">
          💛
        </span>
        <span ref={heartsHost} className="encouragement-hearts" aria-hidden="true" />
      </button>
    </div>
  )
}
