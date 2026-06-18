import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { itemLabel, VITALITY } from '../lib/sanctuaryArt'
import SanctuaryPlant from './SanctuaryPlant'
import type { SanctuaryScene as Scene } from '../types'

/**
 * Sanctuary on the dashboard: a preview of the garden linking to the full /sanctuary page
 * to buy and upgrade (the spend economy, ADR-0011).
 *
 * Two shapes:
 *  - default: the full card (coin balance, explainer, garden preview, vitality) — lives in
 *    the dashboard "Show more" drawer / used standalone.
 *  - `compact`: a slim, low-chrome teaser strip for the calm default home — a few plant
 *    thumbnails plus a "tend it" link, and NO coin count. The slim level chip already shows
 *    coins, and the app's stance is not to show coins twice.
 *
 * When `scene` is provided (DashboardPage fetches it once and passes it down) we use that
 * directly. When omitted (standalone usage) we fetch it ourselves as a fallback.
 */
const PREVIEW_LIMIT = 6
// The compact teaser shows fewer thumbnails so the strip stays slim and uncrowded.
const COMPACT_PREVIEW_LIMIT = 4

export default function SanctuaryScene({
  scene: sceneProp,
  compact = false,
}: {
  scene?: Scene | null
  compact?: boolean
}) {
  const [sceneFetched, setSceneFetched] = useState<Scene | null>(null)
  const [error, setError] = useState(false)

  // Only fetch when the parent hasn't supplied a scene already.
  useEffect(() => {
    if (sceneProp !== undefined) return
    sanctuaryService
      .getScene()
      .then(setSceneFetched)
      .catch(() => setError(true))
  }, [sceneProp])

  const scene = sceneProp !== undefined ? sceneProp : sceneFetched

  if (error || !scene) return null // non-critical to the dashboard; fail/await quietly

  const { coins, owned, vitality } = scene
  // The scene already returns items in grid order (by `cell`); preview the first few so
  // the dashboard reflects the user's chosen layout (top-left of their garden).
  const limit = compact ? COMPACT_PREVIEW_LIMIT : PREVIEW_LIMIT
  const preview = [...owned].sort((a, b) => a.cell - b.cell).slice(0, limit)

  // Compact teaser for the calm default home: a slim strip with a couple of garden
  // thumbnails and a single link to go tend it — no coins, no explainer, no vitality.
  if (compact) {
    return (
      <Link to="/sanctuary" className="sanctuary-teaser" aria-label="Tend your sanctuary">
        <span className="sanctuary-teaser-plants" aria-hidden="true">
          {owned.length === 0 ? (
            <span className="sanctuary-teaser-empty">🌱</span>
          ) : (
            preview.map((o) => (
              <span key={o.id} className="sanctuary-teaser-plant">
                <SanctuaryPlant
                  itemKey={o.item_key}
                  variant={o.variant}
                  customizations={o.customizations}
                />
              </span>
            ))
          )}
        </span>
        <span className="sanctuary-teaser-text">
          {owned.length === 0 ? 'Start your garden' : 'Your garden'}
        </span>
        <span className="sanctuary-teaser-cta">Tend it →</span>
      </Link>
    )
  }

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
              <SanctuaryPlant
                itemKey={o.item_key}
                variant={o.variant}
                customizations={o.customizations}
              />
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
