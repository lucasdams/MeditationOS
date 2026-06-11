import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { plantArt, itemLabel } from '../lib/sanctuaryArt'
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

  const { plantings, current_position, next_options } = scene
  const current = plantings.find((p) => p.position === current_position) ?? null
  const readyToPlant = current_position === null && next_options.length > 0

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

      <div className="sanctuary-garden">
        {plantings.map((p) => (
          <div
            key={p.position}
            className={`sanctuary-plot${p.position === current_position ? ' growing' : ''}`}
          >
            <pre className="sanctuary-plant" aria-hidden="true">
              {plantArt(p.item_key, p.stage).join('\n')}
            </pre>
            <div className="sanctuary-caption">{itemLabel(p.item_key)}</div>
          </div>
        ))}
      </div>

      {current && (
        <>
          <div className="xp-bar">
            <div
              className="xp-fill"
              style={{ width: `${Math.round(current.progress * 100)}%` }}
            />
          </div>
          <div className="sanctuary-hint muted">
            Growing your {itemLabel(current.item_key).toLowerCase()} —{' '}
            {Math.round(current.progress * 100)}% there. Keep practicing.
          </div>
        </>
      )}

      {readyToPlant && (
        <div className="sanctuary-next">
          <div className="sanctuary-hint">🌱 Choose what to grow next:</div>
          <div className="sanctuary-options">
            {next_options.map((o) => (
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
    </section>
  )
}
