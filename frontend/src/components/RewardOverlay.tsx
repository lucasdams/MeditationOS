import { useEffect, useRef, useState } from 'react'
import { levelProgress } from '../lib/level'
import { playLevelUp, playReward } from '../lib/sfx'
import CoinIcon from './CoinIcon'
import type { XpLine } from '../lib/xpBreakdown'

/**
 * Post-session reward — a *quiet, non-blocking* inline card (not a modal). It animates
 * the XP bar from (afterXp − xpGained) up to afterXp, playing a fanfare each time a level
 * is crossed. A level earns coins to spend in the sanctuary (the level is the coin/unlock
 * track, not a thing you grow). When the XP comes from more than one source (the activity
 * + a quest + a streak bonus), `breakdown` itemizes how much came from each.
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
  const startXp = Math.max(0, afterXp - xpGained)
  const [shownXp, setShownXp] = useState(startXp)
  const lastLevelRef = useRef(levelProgress(startXp).level)
  const leveledUp = levelProgress(afterXp).level > levelProgress(startXp).level

  // A chime when the reward appears (earned XP / completed a quest). A level
  // crossing gets the bigger fanfare below instead, so we don't stack them.
  useEffect(() => {
    if (xpGained > 0 && !leveledUp) playReward()
  }, [xpGained, leveledUp])

  useEffect(() => {
    const duration = 1400
    const t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - p) ** 2 // ease-out
      const cur = startXp + (afterXp - startXp) * eased
      setShownXp(cur)
      const lvl = levelProgress(Math.floor(cur)).level
      if (lvl > lastLevelRef.current) {
        lastLevelRef.current = lvl
        playLevelUp()
      }
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [startXp, afterXp])

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
      <div className="reward-inline-card reward-card">
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
        <div className="reward-level">
          Level {prog.level}
          {leveledUp && <span className="reward-up"> · Level up! 🎉</span>}
        </div>
        {leveledUp && (
          <div className="reward-coins">
            You've earned coins to spend in your sanctuary <CoinIcon />
          </div>
        )}
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="xp-text">
          +{xpGained} XP · {prog.xpIntoLevel} / {prog.xpForNextLevel} to next
        </div>
        {breakdown.length > 1 && (
          <ul className="reward-breakdown">
            {breakdown.map((line) => (
              <li key={line.label}>
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
