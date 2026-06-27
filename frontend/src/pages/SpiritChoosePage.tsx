import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { useToast } from '../context/ToastContext'
import {
  DOSHA,
  PATH_ORDER,
  SpiritArt,
  optionLabel,
  prefersReducedMotion,
} from '../components/Spirit'
import { Loading, RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type {
  SpiritPath,
  SpiritPreview,
  SpiritSlotPreview,
  SpiritState,
} from '../types'

/**
 * SpiritChoosePage — the "3 starter choices" (ADR-0023) on a calm page of its own. Shown while the
 * spirit is pathless. Each creature is shown as its actual (rendered) self with a one-line reason
 * its favoured practice suits it; hovering a creature's "looks" morphs its art so you can see what
 * it can wear. Picking a dosha sets the creature and returns to /spirit.
 */
// The name cap, mirroring the backend SPIRIT_NAME_MAX_LENGTH. The form soft-limits input; the
// server trims + rejects blank/over-length regardless.
const NAME_MAX = 40

// A fixed, developed stage for the choose-page previews so each creature reads as a clear, finished
// form (the real spirit starts a spark and grows — here we just want a good likeness to choose by).
const PREVIEW_STAGE = 'fledgling'

// A creature's distinctive "looks" — its path-exclusive capstones (one per slot), flattened from
// the per-path preview to {slot, option}. These drive the hover-to-try-on chips. (We surface the
// signature pieces rather than the whole catalog so the chips stay scannable.)
function signatureLooks(slots: SpiritSlotPreview[]): { slot: string; option: string }[] {
  return slots.flatMap((s) =>
    s.options.filter((o) => o.exclusive).map((o) => ({ slot: s.slot, option: o.option })),
  )
}

export default function SpiritChoosePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const reducedMotion = prefersReducedMotion()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  // The per-path catalog preview — drives the hoverable "try a look" chips on each card. Fetched
  // alongside the spirit; non-blocking, so a preview hiccup never blocks the pick → name → awaken.
  const [preview, setPreview] = useState<SpiritPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  // Two-step flow — pick a creature FIRST, then name it. `selected` holds the picked creature.
  const [selected, setSelected] = useState<SpiritPath | null>(null)
  const [name, setName] = useState('')
  // The look being tried on a specific creature (hover/focus a chip). Per-card: only the matching
  // card's art reflects it. null = every creature shows its bare base look.
  const [tryOn, setTryOn] = useState<{ path: SpiritPath; slot: string; option: string } | null>(
    null,
  )

  function load() {
    setRetrying(true)
    spiritService
      .get()
      .then((s) => {
        setSpirit(s)
        setError(null)
      })
      .catch((err) => setError(messageForError(err, "Couldn't reach your spirit.")))
      .finally(() => setRetrying(false))
    spiritService
      .preview()
      .then(setPreview)
      .catch(() => setPreview(null))
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
      showToast("Couldn't choose that creature — please try again.", 'error')
    } finally {
      // Clear the awakening state even on success, so the button is never left stuck mid-flight.
      setBusy(null)
    }
  }

  // The live art for a creature — its bare base look, or whatever look is being tried on (only when
  // the hovered chip belongs to THIS creature). Bright + a fixed developed stage.
  function creatureArt(path: SpiritPath) {
    const looking = tryOn?.path === path
    return (
      <SpiritArt
        stage={PREVIEW_STAGE}
        path={path}
        glow={1}
        cosmetics={looking && tryOn ? { [tryOn.slot]: tryOn.option } : {}}
        previewing={looking}
        reducedMotion={reducedMotion}
      />
    )
  }

  // Per-creature: favoured practice + the plain-language reason it balances this element. The real
  // basis for the choice (which the cosmetic preview is not).
  function favoursCopy(path: SpiritPath) {
    const d = DOSHA[path]
    return (
      <>
        <p className="spirit-choose-favours">
          Favours <strong>{d.practice}</strong>
        </p>
        <p className="muted spirit-choose-why">{d.why}</p>
      </>
    )
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
          Each creature thrives on the practice that balances its nature — pick the one whose rhythm
          fits yours.
        </p>
      </header>

      {error && !spirit ? (
        <RetryableError message={error} onRetry={load} retrying={retrying} />
      ) : !spirit ? (
        <Loading label="Waking your spirit…" />
      ) : selected === null ? (
        // Step 1 — pick a creature. Each card shows the live creature, why its practice suits it,
        // and hoverable "looks" that morph the art.
        <ul className="spirit-picker-grid spirit-choose-grid">
          {PATH_ORDER.map((path) => {
            const d = DOSHA[path]
            const looks = preview?.[path] ? signatureLooks(preview[path]) : []
            return (
              <li key={path} className={`spirit-picker-card spirit-picker-card--${path}`}>
                <div className="spirit-choose-art" aria-hidden="true">
                  {creatureArt(path)}
                </div>
                <p className="spirit-picker-name">{d.name}</p>
                <p className="muted spirit-picker-element">
                  {d.element} · {d.vibe.replace(/\.$/, '')}
                </p>
                {favoursCopy(path)}
                {looks.length > 0 && (
                  <div className="spirit-choose-tryons" aria-label={`Preview ${d.name}'s looks`}>
                    <span className="spirit-choose-tryons-head muted">Hover to try a look</span>
                    <div className="spirit-choose-tryons-chips">
                      {looks.map((l) => (
                        <button
                          key={l.option}
                          type="button"
                          className="spirit-choose-tryon"
                          onMouseEnter={() => setTryOn({ path, ...l })}
                          onMouseLeave={() => setTryOn(null)}
                          onFocus={() => setTryOn({ path, ...l })}
                          onBlur={() => setTryOn(null)}
                        >
                          {optionLabel(l.option)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
              setTryOn(null)
            }}
          >
            ← Choose a different creature
          </button>
          <div className={`spirit-picker-card spirit-picker-card--${selected} spirit-name-chosen`}>
            <div className="spirit-choose-art" aria-hidden="true">
              {creatureArt(selected)}
            </div>
            <p className="spirit-picker-name">{DOSHA[selected].name}</p>
            <p className="muted spirit-picker-element">{DOSHA[selected].element}</p>
            {favoursCopy(selected)}
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
            In Ayurveda, the three <em>doshas</em> are elemental energies, each kept healthy through{' '}
            <strong>balance</strong> — by leaning into the <em>opposite</em> of its nature. So each
            companion thrives on the practice that <em>counterbalances</em> it:
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
