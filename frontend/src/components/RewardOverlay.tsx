import { useEffect, useRef, useState } from 'react'
import { levelProgress } from '../lib/level'
import { playLevelUp, playReward } from '../lib/sfx'
import Modal from './Modal'
import type { XpLine } from '../lib/xpBreakdown'

/**
 * Post-session reward: animates the XP bar from (afterXp − xpGained) up to afterXp,
 * playing a fanfare each time a level is crossed. A level earns coins to spend in the
 * sanctuary (the level is the coin/unlock track, not a thing you grow). When the XP comes
 * from more than one source (the activity + a quest + a streak bonus), `breakdown`
 * itemizes how much came from each.
 */
export default function RewardOverlay({
  afterXp,
  xpGained,
  breakdown = [],
  onClose,
}: {
  afterXp: number
  xpGained: number
  breakdown?: XpLine[]
  onClose: () => void
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

  const prog = levelProgress(Math.floor(shownXp))
  const pct = Math.min(100, Math.round((prog.xpIntoLevel / prog.xpForNextLevel) * 100))

  return (
    <Modal ariaLabel="Session reward" cardClassName="reward-card">
      <div className="level-badge level-badge--reward" aria-hidden="true">
          <span className="level-badge-mark">◆</span>
          <span className="level-badge-num">{prog.level}</span>
        </div>
        <div className="reward-level">
          Level {prog.level}
          {leveledUp && <span className="reward-up"> · Level up! 🎉</span>}
        </div>
        {leveledUp && (
          <div className="reward-coins">You've earned coins to spend in your sanctuary 🪙</div>
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
      <button type="button" onClick={onClose}>
        Continue
      </button>
    </Modal>
  )
}
