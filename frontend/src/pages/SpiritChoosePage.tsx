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
// The name cap, mirroring the backend SPIRIT_NAME_MAX_LENGTH. The form soft-limits input; the
// server trims + rejects blank/over-length regardless.
const NAME_MAX = 40

export default function SpiritChoosePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  // Two-step flow — pick a creature FIRST, then name it. `selected` holds the picked creature
  // (step 2); the name (ADR-0024) is committed at creation and immutable thereafter.
  const [selected, setSelected] = useState<SpiritPath | null>(null)
  const [name, setName] = useState('')

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

  const trimmedName = name.trim()
  const hasName = trimmedName.length > 0

  async function choose(path: SpiritPath) {
    if (!hasName) return // the name is required (ADR-0024)
    setBusy(`choose:${path}`)
    try {
      await spiritService.choose({ path, name: trimmedName })
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
      ) : selected === null ? (
        // Step 1 — pick a creature. Naming comes after, on the next step.
        <ul className="spirit-picker-grid spirit-choose-grid">
          {PATH_ORDER.map((path) => {
            const d = DOSHA[path]
            return (
              <li key={path} className={`spirit-picker-card spirit-picker-card--${path}`}>
                <p className="spirit-picker-glyph" aria-hidden="true">
                  {d.glyph}
                </p>
                <p className="spirit-picker-name">{d.name}</p>
                <p className="muted spirit-picker-element">{d.element}</p>
                <p className="spirit-picker-vibe">{d.vibe}</p>
                <p className="muted spirit-picker-practice">
                  Prefers <strong>{d.practice}</strong> — do more of this to keep it thriving.
                </p>
                <button
                  type="button"
                  className="spirit-picker-choose"
                  onClick={() => setSelected(path)}
                >
                  Choose {d.name}
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        // Step 2 — name the chosen creature (ADR-0024: the name is committed at creation).
        <div className={`spirit-name-step spirit-picker-card--${selected}`}>
          <button
            type="button"
            className="back-link spirit-name-back"
            disabled={busy != null}
            onClick={() => {
              setSelected(null)
              setName('')
            }}
          >
            ← Choose a different creature
          </button>
          <div className={`spirit-picker-card spirit-picker-card--${selected} spirit-name-chosen`}>
            <p className="spirit-picker-glyph" aria-hidden="true">
              {DOSHA[selected].glyph}
            </p>
            <p className="spirit-picker-name">{DOSHA[selected].name}</p>
            <p className="spirit-picker-vibe">{DOSHA[selected].vibe}</p>
            <p className="muted spirit-picker-practice">
              Prefers <strong>{DOSHA[selected].practice}</strong> — do more of this to keep it
              thriving.
            </p>
          </div>
          <label className="spirit-field spirit-choose-name">
            <span>Name your {DOSHA[selected].name} companion</span>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              placeholder="e.g. Ember"
              autoFocus
              disabled={busy != null}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hasName) choose(selected)
              }}
            />
          </label>
          <button
            type="button"
            className="spirit-picker-choose spirit-name-awaken"
            disabled={busy != null || !hasName}
            title={hasName ? undefined : 'Name your companion first'}
            onClick={() => choose(selected)}
          >
            {busy != null ? 'Awakening…' : `Awaken ${DOSHA[selected].name}`}
          </button>
        </div>
      )}

      <details className="dosha-about">
        <summary className="dosha-about-summary">About the doshas</summary>
        <div className="dosha-about-body">
          <p className="muted">
            In Ayurveda, the three <em>doshas</em> are elemental energies, and each stays healthy
            through <strong>balance</strong> — by leaning into the <em>opposite</em> of its nature,
            not more of it (&ldquo;like increases like; opposites bring balance&rdquo;). So each
            companion is kept in good shape by the practice that <em>counterbalances</em> it:
          </p>
          <ul className="dosha-about-list">
            {PATH_ORDER.map((path) => {
              const d = DOSHA[path]
              return (
                <li key={path}>
                  <span className="dosha-about-name">
                    {d.glyph} {d.name}
                  </span>{' '}
                  <span className="muted">
                    ({d.element}) — {d.vibe.toLowerCase().replace(/\.$/, '')}
                  </span>{' '}
                  wants a <strong>{d.balance}</strong> practice → <strong>{d.practice}</strong>.
                </li>
              )
            })}
          </ul>
          <p className="muted dosha-about-note">
            A gentle, simplified take on a deep tradition — not medical advice. (For Kapha&rsquo;s
            invigorating breath, try the <strong>Energizing</strong> pattern on the Breathe page.)
          </p>
        </div>
      </details>
    </main>
  )
}
