import { useEffect, useState } from 'react'
import { sanctuaryService } from '../services/sanctuary'
import { plantArt, stageName } from '../lib/sanctuaryArt'
import type { SanctuaryScene as Scene } from '../types'

/**
 * Sanctuary (Phase 1): the single starter plant, growing from practice. The backend
 * computes the stage + progress; this renders the matching ASCII art and a grow bar.
 */
export default function SanctuaryScene() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setScene)
      .catch(() => setError(true))
  }, [])

  if (error) return null // non-critical to the dashboard; fail quietly
  if (!scene) return null // brief load; the rest of the dashboard renders meanwhile

  const { current } = scene
  const pct = Math.round(current.progress * 100)
  const fullyGrown = current.progress >= 1

  return (
    <section className="sanctuary" aria-label="Your sanctuary">
      <h2>Your sanctuary</h2>
      <pre className="sanctuary-plant" aria-hidden="true">
        {plantArt(current.item_key, current.stage).join('\n')}
      </pre>
      <div className="sanctuary-caption">{stageName(current.item_key, current.stage)}</div>
      <div className="xp-bar">
        <div className="xp-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="sanctuary-hint muted">
        {fullyGrown
          ? '🌳 Fully grown — choosing what to grow next is coming soon.'
          : `${pct}% grown — keep practicing to help it grow.`}
      </div>
    </section>
  )
}
