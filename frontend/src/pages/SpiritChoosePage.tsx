import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { useToast } from '../context/ToastContext'
import { DOSHA, PATH_ORDER } from '../components/Spirit'
import { Loading, RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type { SpiritPath, SpiritState } from '../types'

/**
 * SpiritChoosePage — the "3 starter choices" (ADR-0023) on a calm page of its own, so the choice
 * is a focused moment rather than one busy section crammed onto the full /spirit panel. Shown
 * while the spirit is pathless (first awakening, or again after set-free). Picking a dosha sets
 * the creature and returns to /spirit. If the spirit already has a creature, this redirects to
 * /spirit (nothing to choose).
 */
export default function SpiritChoosePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  function load() {
    setRetrying(true)
    spiritService
      .get()
      .then((s) => {
        setSpirit(s)
        setError(null)
      })
      .catch((err) => setError(messageForError(err, 'Could not reach your spirit.')))
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function choose(path: SpiritPath) {
    setBusy(`choose:${path}`)
    try {
      await spiritService.choose({ path })
      showToast(`Your ${DOSHA[path].name} spirit awakens. ${DOSHA[path].glyph}`)
      navigate('/spirit')
    } catch {
      showToast('Could not choose that creature — please try again.', 'error')
      setBusy(null)
    }
  }

  // Already chose a creature — there's nothing to pick here.
  if (spirit && spirit.path !== null) return <Navigate to="/spirit" replace />

  return (
    <main id="main-content" className="dashboard spirit-page spirit-choose-page">
      <Link to="/spirit" className="back-link">
        ← Spirit
      </Link>
      <header className="page-head">
        <h1>Choose your creature</h1>
        <p className="page-subtitle">
          Pick the companion whose nature fits you — you’ll keep it in good shape by doing its kind
          of practice. You can choose a new one if you ever set this spirit free.
        </p>
      </header>

      {error && !spirit ? (
        <RetryableError message={error} onRetry={load} retrying={retrying} />
      ) : !spirit ? (
        <Loading label="Waking your spirit…" />
      ) : (
        <ul className="spirit-picker-grid spirit-choose-grid">
          {PATH_ORDER.map((path) => {
            const d = DOSHA[path]
            const busyHere = busy === `choose:${path}`
            return (
              <li key={path} className={`spirit-picker-card spirit-picker-card--${path}`}>
                <p className="spirit-picker-glyph" aria-hidden="true">
                  {d.glyph}
                </p>
                <p className="spirit-picker-name">{d.name}</p>
                <p className="muted spirit-picker-element">{d.element}</p>
                <p className="spirit-picker-vibe">{d.vibe}</p>
                <p className="muted spirit-picker-practice">
                  Kept in shape by <strong>{d.practice}</strong>.
                </p>
                <button
                  type="button"
                  className="spirit-picker-choose"
                  disabled={busy != null}
                  onClick={() => choose(path)}
                >
                  {busyHere ? 'Awakening…' : `Choose ${d.name}`}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
