import { useEffect, useRef, useState } from 'react'
import { levelProgress } from '../lib/level'
import { tierFor } from '../lib/tree'
import { playLevelUp, playReward } from '../lib/sfx'

/**
 * Post-session reward: animates the XP bar from (afterXp − xpGained) up to afterXp,
 * growing the tree and playing a fanfare each time a level is crossed.
 */
export default function RewardOverlay({
  afterXp,
  xpGained,
  questsCompleted = [],
  onClose,
}: {
  afterXp: number
  xpGained: number
  questsCompleted?: string[]
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
  const tier = tierFor(prog.level)
  const pct = Math.min(100, Math.round((prog.xpIntoLevel / prog.xpForNextLevel) * 100))

  return (
    <div className="reward-overlay" role="dialog" aria-modal="true">
      <div className="reward-card">
        <pre className="level-tree" aria-hidden="true">
          {tier.art.join('\n')}
        </pre>
        <div className="reward-level">
          Level {prog.level}
          {leveledUp && <span className="reward-up"> · Level up! 🎉</span>}
        </div>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="xp-text">
          +{xpGained} XP · {prog.xpIntoLevel} / {prog.xpForNextLevel} to next
        </div>
        {questsCompleted.length > 0 && (
          <ul className="reward-quests">
            {questsCompleted.map((q) => (
              <li key={q}>✓ Quest complete: {q}</li>
            ))}
          </ul>
        )}
        <button type="button" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  )
}
