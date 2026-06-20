import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { itemLabel, variantLabel, VITALITY, timeOfDay } from '../lib/sanctuaryArt'
import SanctuaryPlant from './SanctuaryPlant'
import CoinIcon from './CoinIcon'
import type { OwnedItem, SanctuaryScene as Scene } from '../types'

/**
 * Sanctuary on the dashboard: a preview of the garden linking to the full /sanctuary page
 * to buy and upgrade (the spend economy, ADR-0011).
 *
 * Two shapes:
 *  - default: the full card (coin balance, explainer, garden preview, vitality) — lives in
 *    the dashboard "Show more" drawer / used standalone.
 *  - `preview`: a naturally-expanded, READ-ONLY garden laid out on the calm default home —
 *    the owned plants in their actual grid cells (the same SanctuaryPlant art as the full
 *    page), at a calm size, with NO interactivity: no drag, no pick-up/move, no buy or
 *    customize. A single "Tend it →" link leads to /sanctuary, where the garden is actually
 *    tended. No coin count here — the slim level chip already shows coins, and the app's
 *    stance is not to show coins twice.
 *
 * When `scene` is provided (DashboardPage fetches it once and passes it down) we use that
 * directly. When omitted (standalone usage) we fetch it ourselves as a fallback.
 */
const PREVIEW_LIMIT = 6

// The home preview lays items out on the same row-major grid as the full page (cell = row *
// GRID_COLUMNS + col), so the glance mirrors the user's chosen layout. Mirrors SanctuaryPage's
// GRID_COLUMNS; the read-only preview never moves items, so it only ever reads cells.
const GRID_COLUMNS = 4

export default function SanctuaryScene({
  scene: sceneProp,
  preview = false,
}: {
  scene?: Scene | null
  preview?: boolean
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
  const previewItems = [...owned].sort((a, b) => a.cell - b.cell).slice(0, PREVIEW_LIMIT)

  // Read-only expanded garden for the calm default home: the owned plants laid out in their
  // grid cells, at a calm size — a real little garden to glance at, then tap through to tend.
  // Static: no drag handlers, no grab/move buttons, no buy or customize. Just the art, the
  // names, and one "Tend it →" link to where the garden is actually tended.
  if (preview) {
    return (
      <section
        className="sanctuary-preview-home"
        aria-label="Your garden"
        data-daytime={timeOfDay()}
      >
        <div className="sanctuary-preview-head">
          <h2 className="sanctuary-preview-title">Your garden</h2>
          <Link to="/sanctuary" className="sanctuary-preview-link">
            {owned.length === 0 ? 'Open your garden →' : 'Tend it →'}
          </Link>
        </div>

        {owned.length === 0 ? (
          <p className="muted sanctuary-preview-empty">
            Your garden is empty — <Link to="/sanctuary">start it in the Sanctuary →</Link>
          </p>
        ) : (
          (() => {
            // Lay the previewed items out row-major by `cell`, exactly as the full page does,
            // so the home glance mirrors the user's chosen layout. Read-only: every cell is a
            // static tile (no buttons, no drag), filling empty cells in the spanned rows so the
            // grid reads as a tidy little plot rather than a ragged strip.
            const byCell = new Map<number, OwnedItem>()
            for (const o of previewItems) byCell.set(o.cell, o)
            const maxCell = Math.max(...previewItems.map((o) => o.cell))
            const rows = Math.floor(maxCell / GRID_COLUMNS) + 1
            const cellCount = rows * GRID_COLUMNS
            return (
              // The same calm garden scene as the full page: a soft backdrop + a grass/soil
              // ground band so the home preview reads as a little garden, not a strip of tiles.
              // Read-only — purely decorative wrappers, no controls (keeps the preview button-free).
              <div className="sanctuary-preview-scene">
                <div className="sanctuary-ground" aria-hidden="true" />
                <div
                  className="sanctuary-preview-grid"
                  style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)` }}
                >
                {Array.from({ length: cellCount }, (_, cell) => {
                  const o = byCell.get(cell)
                  if (!o) {
                    return (
                      <div
                        key={`empty-${cell}`}
                        className="sanctuary-preview-cell empty"
                        aria-hidden="true"
                      />
                    )
                  }
                  // A hover/focus title carries the user's plaque name (or the item label);
                  // the plant's own <svg> keeps its existing aria-label for screen readers, so
                  // we don't nest a second img role on the wrapper.
                  const title = o.name
                    ? o.name
                    : o.variant
                      ? `${variantLabel(o.variant)} ${itemLabel(o.item_key).toLowerCase()}`
                      : itemLabel(o.item_key)
                  return (
                    <div key={o.id} className="sanctuary-preview-cell" title={title}>
                      <SanctuaryPlant
                        itemKey={o.item_key}
                        variant={o.variant}
                        customizations={o.customizations}
                      />
                    </div>
                  )
                })}
                </div>
              </div>
            )
          })()
        )}
      </section>
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
        <span className="sanctuary-coins"><CoinIcon /> {coins}</span>
        <span className="muted">coins to spend</span>
      </div>

      {owned.length === 0 ? (
        <p className="muted">
          Your garden is empty — <Link to="/sanctuary">buy your first plant →</Link>
        </p>
      ) : (
        <div className="sanctuary-grown-row">
          {previewItems.map((o) => (
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
