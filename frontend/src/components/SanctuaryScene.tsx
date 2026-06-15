import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { itemLabel, VITALITY } from '../lib/sanctuaryArt'
import SanctuaryPlant from './SanctuaryPlant'
import type { SanctuaryScene as Scene } from '../types'

/**
 * Compact sanctuary on the dashboard: your coin balance and a preview of the garden,
 * linking to the full /sanctuary page to buy and upgrade (the spend economy, ADR-0011).
 */
const PREVIEW_LIMIT = 6

export default function SanctuaryScene() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setScene)
      .catch(() => setError(true))
  }, [])

  if (error || !scene) return null // non-critical to the dashboard; fail/await quietly

  const { coins, owned, vitality } = scene
  const preview = owned.slice(-PREVIEW_LIMIT)

  return (
    <section className="sanctuary" aria-label="Your sanctuary">
      <div className="sanctuary-head">
        <h2>Your sanctuary</h2>
        <Link to="/sanctuary" className="sanctuary-link">
          {coins > 0 ? 'Spend coins →' : 'View sanctuary →'}
        </Link>
      </div>
      <p className="sanctuary-explainer muted">
        Earn coins as you level up, then buy &amp; upgrade your garden.
      </p>

      <div className="sanctuary-coins-row">
        <span className="sanctuary-coins">🪙 {coins}</span>
        <span className="muted">coins to spend</span>
      </div>

      {owned.length === 0 ? (
        <p className="muted">
          Your garden is empty — <Link to="/sanctuary">buy your first plant →</Link>
        </p>
      ) : (
        <div className="sanctuary-grown-row">
          {preview.map((o) => (
            <div key={o.id} className="sanctuary-grown-item" title={itemLabel(o.item_key)}>
              <SanctuaryPlant itemKey={o.item_key} tier={o.tier} />
              <div className="sanctuary-grown-name">{itemLabel(o.item_key)}</div>
            </div>
          ))}
        </div>
      )}

      <div className={`sanctuary-vitality vit-${vitality}`}>
        {VITALITY[vitality].emoji} {VITALITY[vitality].label}
      </div>
    </section>
  )
}
