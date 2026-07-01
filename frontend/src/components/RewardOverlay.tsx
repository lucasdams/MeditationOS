import { useEffect, useRef, useState } from 'react'
import { levelProgress } from '../lib/level'
import { playLevelUp, playReward } from '../lib/sfx'
import CoinIcon from './CoinIcon'
import type { XpLine } from '../lib/xpBreakdown'

// Honor the OS "reduce motion" setting: when set we skip the count-up, the entrance
// pop, and the celebratory flourish, and just show the calm static card. Mirrors the
// gating used elsewhere (BreathePage, TratakaPage, Spirit).
const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Filled lucide Hearts (a few cool-leaning tints) for the gentle drift of hearts that lands with the
// reward — SVG, not emoji, so the flourish matches the app's craft (mirrors EncouragementNote's heart).
const HEART_TINTS = ['#ec4899', '#6a5cff', '#06b6d4', '#f59e0b']
const heartSvg = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ` +
  `fill="${fill}" stroke="${fill}" stroke-width="1.75" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>` +
  `</svg>`

// A warm word for finishing a sit — the session deserves love, not just XP. Gentle + never about
// performance: showing up is the whole win.
const REWARD_PRAISES = [
  'Beautifully done.',
  'You showed up — that’s what matters.',
  'That’s time well spent.',
  'A quiet gift to yourself.',
  'Every sit counts.',
  'Proud of you for this.',
  'That’s another rep for your brain.',
  'One more sit — the habit’s taking root.',
  'You just strengthened the pathway.',
]

/**
 * Post-session reward — a *quiet, non-blocking* inline card (not a modal). It animates
 * the XP bar from (afterXp − xpGained) up to afterXp, playing a fanfare each time a level
 * is crossed. A level earns coins to spend in the sanctuary (the level is the coin/unlock
 * track, not a thing you grow). When the XP comes from more than one source (the activity
 * + a quest + a streak bonus), `breakdown` itemizes how much came from each.
 *
 * Game-feel (phase 3): the gained-XP number counts up from 0 with an ease-out, the card
 * pops in with a gentle spring, a soft accent ring + a few sparkles radiate behind the
 * total as it lands, and the breakdown lines stagger in. It stays calm — a wellness
 * flourish, not a slot machine — and `prefers-reduced-motion` strips all of it back to a
 * static card with the final numbers shown immediately.
 *
 * Presentation (calm/low-pressure): this renders as a fixed card anchored bottom-center —
 * it never covers the screen, never traps focus, and announces itself politely via
 * `role="status" aria-live="polite"`. The card is dismissible (a quiet "Continue" button),
 * and pages that only need a confirmation can pass `autoDismissMs` to have it fade on its
 * own after the XP settles. Pages that sequence a follow-up step (reflection / biometric
 * capture) omit `autoDismissMs` so the user advances on their own tap — `onClose` is the
 * single hook those pages use to open the next step, so the contract is unchanged.
 */
export default function RewardOverlay({
  afterXp,
  xpGained,
  breakdown = [],
  onClose,
  autoDismissMs,
}: {
  afterXp: number
  xpGained: number
  breakdown?: XpLine[]
  onClose: () => void
  // When set, the card fades and calls onClose on its own after this delay (ms). Used by
  // pages where the reward is just a confirmation. Omit it when a follow-up step depends
  // on the user dismissing the reward themselves.
  autoDismissMs?: number
}) {
  const reduceMotion = prefersReducedMotion()
  const startXp = Math.max(0, afterXp - xpGained)
  const [shownXp, setShownXp] = useState(reduceMotion ? afterXp : startXp)
  // The gained-XP counter ticks up independently of the bar so the headline number reads
  // as the "score" landing. With reduced motion it's the final value from frame one.
  const [shownGained, setShownGained] = useState(reduceMotion ? xpGained : 0)
  // Drives the brief glow/pulse on the total as the count-up settles.
  const [landed, setLanded] = useState(reduceMotion)
  const lastLevelRef = useRef(levelProgress(startXp).level)
  const leveledUp = levelProgress(afterXp).level > levelProgress(startXp).level
  // A warm word of praise, picked once on mount, plus a host for a gentle drift of hearts.
  const [praise] = useState(() => REWARD_PRAISES[Math.floor(Math.random() * REWARD_PRAISES.length)])
  const heartsHost = useRef<HTMLSpanElement>(null)

  // A chime when the reward appears (earned XP / completed a quest). A level
  // crossing gets the bigger fanfare below instead, so we don't stack them.
  useEffect(() => {
    if (xpGained > 0 && !leveledUp) playReward()
  }, [xpGained, leveledUp])

  // A gentle flurry of hearts drifts up as the reward lands — a little love for showing up. Skipped
  // under reduced motion (the calm static card stands on its own).
  useEffect(() => {
    if (reduceMotion) return
    const host = heartsHost.current
    if (!host) return
    for (let k = 0; k < 4; k++) {
      const heart = document.createElement('span')
      heart.className = 'floating-heart'
      heart.innerHTML = heartSvg(HEART_TINTS[k % HEART_TINTS.length])
      heart.style.setProperty('--dx', `${Math.round(Math.random() * 72 - 36)}px`)
      heart.style.animationDelay = `${180 + k * 130}ms`
      host.appendChild(heart)
      window.setTimeout(() => heart.remove(), 2200)
    }
  }, [reduceMotion])

  useEffect(() => {
    // Reduced motion: numbers are already final, level-up chime still fires once. No rAF.
    if (reduceMotion) {
      if (leveledUp) playLevelUp()
      return
    }
    const duration = 1400
    // The headline count-up is snappier than the bar so it "lands" first, then the bar
    // glides the rest of the way and any level crossing fanfares as it passes.
    const gainDuration = 800
    const t0 = performance.now()
    let raf = 0
    let settledGained = false
    const tick = (now: number) => {
      const elapsed = now - t0
      const p = Math.min(1, elapsed / duration)
      const eased = 1 - (1 - p) ** 2 // ease-out
      const cur = startXp + (afterXp - startXp) * eased
      setShownXp(cur)

      const gp = Math.min(1, elapsed / gainDuration)
      const gEased = 1 - (1 - gp) ** 2
      setShownGained(Math.round(xpGained * gEased))
      if (!settledGained && gp >= 1) {
        settledGained = true
        setLanded(true)
      }

      const lvl = levelProgress(Math.floor(cur)).level
      if (lvl > lastLevelRef.current) {
        lastLevelRef.current = lvl
        playLevelUp()
      }
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reduceMotion, startXp, afterXp, xpGained, leveledUp])

  // Optional self-dismiss: let the XP bar settle, then hand control back via onClose.
  // Only armed when a page opts in (the confirmation-only pages).
  useEffect(() => {
    if (!autoDismissMs) return
    const id = window.setTimeout(onClose, autoDismissMs)
    return () => window.clearTimeout(id)
    // onClose is stable per render for these callers; re-arming on its identity change is
    // harmless and keeps the timer pointed at the current handler.
  }, [autoDismissMs, onClose])

  const prog = levelProgress(Math.floor(shownXp))
  // Use the unrounded fraction for the fill width so the bar glides continuously over the
  // ease-out rather than stepping in 1% integer jumps on each frame.
  const pct = Math.min(100, (prog.xpIntoLevel / prog.xpForNextLevel) * 100)

  return (
    // Non-blocking: a polite live region — no backdrop, no focus trap. Sits in the
    // bottom-center "toast lane" but is its own richer card.
    <div className="reward-inline" role="status" aria-live="polite">
      <div
        className={`reward-inline-card reward-card${reduceMotion ? '' : ' reward-card--pop'}`}
      >
        <button
          type="button"
          className="reward-inline-dismiss"
          aria-label="Dismiss reward"
          onClick={onClose}
        >
          ✕
        </button>
        <div className="level-badge level-badge--reward" aria-hidden="true">
          <span className="level-badge-mark">◆</span>
          <span className="level-badge-num">{prog.level}</span>
        </div>

        {/* A warm word of praise + a gentle drift of hearts — love for showing up, above the XP. */}
        <p className="reward-praise">{praise}</p>
        <span ref={heartsHost} className="reward-hearts" aria-hidden="true" />

        {/* Celebratory flourish: a soft radiating ring + a few sparkles behind the
            gained-XP headline. Decorative only, and skipped under reduced motion. */}
        <div className="reward-headline">
          {!reduceMotion && (
            <span className="reward-flourish" aria-hidden="true">
              <span className="reward-ring" />
              <span className="reward-spark reward-spark--1" />
              <span className="reward-spark reward-spark--2" />
              <span className="reward-spark reward-spark--3" />
              <span className="reward-spark reward-spark--4" />
              <span className="reward-spark reward-spark--5" />
            </span>
          )}
          <span
            className={`reward-gained${landed ? ' reward-gained--landed' : ''}`}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            +{shownGained} XP
          </span>
        </div>

        <div className="reward-level">
          Level {prog.level}
          {leveledUp && <span className="reward-up"> · Level up!</span>}
        </div>
        {leveledUp && (
          <div className={`reward-coins${reduceMotion ? '' : ' reward-coins--pop'}`}>
            You've earned coins to spend on your spirit <CoinIcon />
          </div>
        )}
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="xp-text">
          {prog.xpIntoLevel} / {prog.xpForNextLevel} to next level
        </div>
        {breakdown.length > 1 && (
          <ul className={`reward-breakdown${reduceMotion ? '' : ' reward-breakdown--stagger'}`}>
            {breakdown.map((line, i) => (
              <li key={line.label} style={reduceMotion ? undefined : { '--reward-stagger-i': i } as React.CSSProperties}>
                <span>{line.label}</span>
                <span className="reward-breakdown-xp">+{line.xp}</span>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="reward-inline-continue" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  )
}
