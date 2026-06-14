import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { itemLabel, VITALITY } from '../lib/sanctuaryArt'
import SanctuaryPlant from './SanctuaryPlant'
import type { SanctuaryScene as Scene } from '../types'

/**
 * Sanctuary (Phase 2): the garden you grow by practicing. Renders the whole
 * assortment — completed plants plus the one currently growing — and, when the
 * current item finishes, lets you choose what to grow next.
 */
export default function SanctuaryScene() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState(false)
  const [planting, setPlanting] = useState(false)

  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setScene)
      .catch(() => setError(true))
  }, [])

  if (error || !scene) return null // non-critical to the dashboard; fail/await quietly

  const { plantings, current_position, next_options, vitality } = scene
  const current = plantings.find((p) => p.position === current_position) ?? null
  // What you've already finished — shown small, apart from the one in progress.
  const grown = plantings.filter((p) => p.complete)
  // The dashboard mini-scene keeps it simple: only unlocked options (the full
  // /sanctuary page shows locked ones with their unlock hints).
  const unlockedOptions = next_options.filter((o) => o.unlocked)
  const readyToPlant = current_position === null && unlockedOptions.length > 0

  async function plant(itemKey: string) {
    setPlanting(true)
    try {
      setScene(await sanctuaryService.plantNext(itemKey))
    } catch {
      // leave the current scene in place; the next load will reconcile
    } finally {
      setPlanting(false)
    }
  }

  return (
    <section className="sanctuary" aria-label="Your sanctuary">
      <div className="sanctuary-head">
        <h2>Your sanctuary</h2>
        <Link to="/sanctuary" className="sanctuary-link">
          View sanctuary →
        </Link>
      </div>

      {current && (
        <div className={`sanctuary-current vit-${vitality}`}>
          <div className="sanctuary-now-label">🌱 Now growing</div>
          <div className="sanctuary-current-plant">
            <SanctuaryPlant itemKey={current.item_key} progress={current.progress} />
          </div>
          <div className="sanctuary-current-name">{itemLabel(current.item_key)}</div>
          <div className="xp-bar">
            <div className="xp-fill" style={{ width: `${Math.round(current.progress * 100)}%` }} />
          </div>
          <div className="sanctuary-hint muted">
            {Math.round(current.progress * 100)}% grown — keep practicing.
          </div>
        </div>
      )}

      {readyToPlant && (
        <div className="sanctuary-next">
          <div className="sanctuary-hint">✨ Fully grown — choose what to grow next:</div>
          <div className="sanctuary-options">
            {unlockedOptions.map((o) => (
              <button
                key={o.item_key}
                type="button"
                className="chip"
                disabled={planting}
                onClick={() => plant(o.item_key)}
              >
                {itemLabel(o.item_key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {grown.length > 0 && (
        <div className="sanctuary-grown">
          <div className="sanctuary-grown-label muted">Grown · {grown.length}</div>
          <div className="sanctuary-grown-row">
            {grown.map((p) => (
              <div key={p.position} className="sanctuary-grown-item" title={itemLabel(p.item_key)}>
                <SanctuaryPlant itemKey={p.item_key} progress={1} />
                <div className="sanctuary-grown-name">{itemLabel(p.item_key)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className={`sanctuary-vitality vit-${vitality}`}>
        {VITALITY[vitality].emoji} {VITALITY[vitality].label}
      </div>
    </section>
  )
}
