import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { itemLabel, VITALITY } from '../lib/sanctuaryArt'
import SanctuaryPlant from '../components/SanctuaryPlant'
import { useTheme } from '../context/ThemeContext'
import { celestialFraction, SEASONS } from '../lib/theme'
import type { SanctuaryScene } from '../types'

// A small day/night band above the garden: a sun or moon that arcs across the sky
// by the local time, over a season-tinted gradient. Purely ambient.
function SanctuarySky() {
  const { season, dayPhase, now } = useTheme()
  const frac = celestialFraction(now)
  const left = frac * 100
  // Arc: low near midnight, highest at midday.
  const top = 64 - 46 * Math.sin(frac * Math.PI)
  const isNight = dayPhase === 'night'
  const seasonMeta = SEASONS.find((s) => s.value === season)

  return (
    <div className="sanctuary-sky" data-night={isNight}>
      <div className="sanctuary-celestial" style={{ left: `${left}%`, top: `${top}%` }} />
      <div className="sanctuary-sky-label">
        {seasonMeta?.emoji} {seasonMeta?.label} · {dayPhase}
      </div>
    </div>
  )
}

/**
 * Sanctuary (Phase 3): the dedicated builder page. Shows the full garden, the plant
 * currently growing, and — when it's fully grown — a celebratory "choose what to grow
 * next" beat. A just-planted item pops in.
 */
export default function SanctuaryPage() {
  const [scene, setScene] = useState<SanctuaryScene | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [planting, setPlanting] = useState(false)
  const [justPlanted, setJustPlanted] = useState<number | null>(null)
  const flashTimer = useRef<number | null>(null)

  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setScene)
      .catch(() => setError('Could not load your sanctuary.'))
    return () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    }
  }, [])

  async function plant(itemKey: string) {
    setPlanting(true)
    setError(null)
    try {
      const updated = await sanctuaryService.plantNext(itemKey)
      setScene(updated)
      setJustPlanted(updated.plantings.length - 1)
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setJustPlanted(null), 1200)
    } catch {
      setError('Could not plant that. Please try again.')
    } finally {
      setPlanting(false)
    }
  }

  const plantings = scene?.plantings ?? []
  const currentPos = scene?.current_position ?? null
  const current = plantings.find((p) => p.position === currentPos) ?? null
  const readyToPlant = scene != null && currentPos === null && scene.next_options.length > 0

  return (
    <main className="sanctuary-page">
      <header>
        <h1>Sanctuary</h1>
        <Link to="/">← Dashboard</Link>
      </header>
      <p className="muted">A garden you grow by practicing. Finish one, then choose the next.</p>

      <SanctuarySky />

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!scene && !error && <p className="muted">Loading…</p>}

      {scene && (
        <>
          <div className={`sanctuary-garden big vit-${scene.vitality}`}>
            {plantings.map((p) => (
              <div
                key={p.position}
                className={[
                  'sanctuary-plot',
                  p.position === currentPos ? 'growing' : '',
                  p.complete ? 'grown' : '',
                  p.position === justPlanted ? 'just-planted' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <SanctuaryPlant itemKey={p.item_key} progress={p.progress} />
                <div className="sanctuary-caption">{itemLabel(p.item_key)}</div>
              </div>
            ))}
          </div>

          <div className={`sanctuary-vitality vit-${scene.vitality}`}>
            {VITALITY[scene.vitality].emoji} {VITALITY[scene.vitality].label}
            {scene.current_streak > 0 && ` · ${scene.current_streak}-day streak`}
          </div>

          {current && (
            <div className="sanctuary-current">
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
            </div>
          )}

          {readyToPlant && (
            <div className="sanctuary-celebrate">
              <div className="sanctuary-celebrate-title">
                ✨ Fully grown — choose what to grow next
              </div>
              <div className="sanctuary-options">
                {scene.next_options.map((o) => (
                  <button
                    key={o.item_key}
                    type="button"
                    className={`chip${o.unlocked ? '' : ' chip-locked'}`}
                    disabled={planting || !o.unlocked}
                    title={o.hint ?? undefined}
                    onClick={() => o.unlocked && plant(o.item_key)}
                  >
                    {o.unlocked ? '' : '🔒 '}
                    {itemLabel(o.item_key)}
                    {!o.unlocked && o.hint && <span className="chip-hint"> · {o.hint}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="muted sanctuary-summary">
            {plantings.length} {plantings.length === 1 ? 'thing' : 'things'} growing in your garden
          </p>
        </>
      )}
    </main>
  )
}
