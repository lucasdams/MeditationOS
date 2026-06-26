import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { useToast } from '../context/ToastContext'
import {
  DOSHA,
  PATH_ORDER,
  NEED_COPY,
  slotLabel,
  optionLabel,
} from '../components/Spirit'
import { Loading, RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type {
  SpiritOptionPreview,
  SpiritPath,
  SpiritPreview,
  SpiritSlotPreview,
  SpiritState,
} from '../types'

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

// A creature's SIGNATURE set — its path-exclusive tier-3 capstones (one per slot), pulled from
// the per-path preview. These are the "what it grows into" highlights surfaced on each card.
function exclusiveCapstones(slots: SpiritSlotPreview[]): SpiritOptionPreview[] {
  return slots.flatMap((s) => s.options.filter((o) => o.exclusive))
}

// A tiny need tag (icon + label) reusing the shared NEED_COPY so the choose-page preview matches
// the Care read-out and the customize tree exactly.
function PreviewNeed({ need }: { need: SpiritOptionPreview['need'] }) {
  const copy = NEED_COPY[need]
  if (!copy) return null
  return (
    <span className="spirit-choose-preview-need" title={`Favours ${copy.label}`}>
      <span aria-hidden="true">{copy.icon}</span> {copy.label}
    </span>
  )
}

/**
 * GrowsIntoLine — the compact "Grows into" highlights on a creature's pick card (step 1): its
 * signature exclusive capstones (one per slot), each as a label + need tag. Kept small so the
 * three cards stay scannable side by side. Renders nothing if the preview hasn't loaded yet.
 */
function GrowsIntoLine({ slots }: { slots: SpiritSlotPreview[] | undefined }) {
  if (!slots) return null
  const capstones = exclusiveCapstones(slots)
  if (capstones.length === 0) return null
  return (
    <div className="spirit-choose-grows" aria-label="Signature unlocks this creature grows into">
      <p className="spirit-choose-grows-head muted">Grows into</p>
      <ul className="spirit-choose-grows-list">
        {capstones.map((o) => (
          <li key={o.option} className="spirit-choose-grows-item">
            <span className="spirit-choose-grows-name">{optionLabel(o.option)}</span>
            <PreviewNeed need={o.need} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * TreePreview — the fuller, read-only tier preview of a creature's whole tree (step 2): each slot
 * with its options laid out tier by tier, with the path's exclusive capstones highlighted. A
 * tasteful read-out so the choice feels informed — not the interactive shop (that lives on
 * /spirit once the creature is chosen). Renders nothing until the preview has loaded.
 */
function TreePreview({ slots }: { slots: SpiritSlotPreview[] | undefined }) {
  if (!slots) return null
  return (
    <div className="spirit-choose-tree" aria-label="Cosmetic tree preview">
      {slots.map((slot) => (
        <div key={slot.slot} className="spirit-choose-tree-slot">
          <p className="spirit-choose-tree-slot-name">{slotLabel(slot.slot)}</p>
          <ul className="spirit-choose-tree-options">
            {slot.options.map((o) => (
              <li
                key={o.option}
                className={`spirit-choose-tree-option${
                  o.exclusive ? ' spirit-choose-tree-option--capstone' : ''
                }`}
                data-tier={o.tier}
              >
                <span className="spirit-choose-tree-option-name">{optionLabel(o.option)}</span>
                {o.exclusive && (
                  <span className="spirit-choose-tree-capstone-tag">Signature</span>
                )}
                <PreviewNeed need={o.need} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function SpiritChoosePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  // The per-path skill-tree preview (what each creature grows into). Fetched once alongside the
  // spirit; non-blocking — if it fails the page still works, the previews just don't show.
  const [preview, setPreview] = useState<SpiritPreview | null>(null)
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
    // The grows-into preview is a calm enhancement, not load-bearing: fetch it independently and
    // swallow failures so a preview hiccup never blocks the pick → name → awaken flow.
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
      showToast('Could not choose that creature — please try again.', 'error')
    } finally {
      // Clear the awakening state even on success, so the button is never left stuck
      // mid-flight if navigation is interrupted (matches the unlock/equip handlers).
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
          Pick the companion whose nature fits you — keep it thriving with its kind of practice.
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
                <GrowsIntoLine slots={preview?.[path]} />
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
          {preview?.[selected] && (
            <section className="spirit-choose-tree-wrap" aria-label="What this creature grows into">
              <p className="spirit-choose-tree-head">
                What <strong>{DOSHA[selected].name}</strong> grows into
              </p>
              <p className="muted spirit-choose-tree-note">
                Unlock these as your spirit grows — its <strong>Signature</strong> set is unique to
                this creature.
              </p>
              <TreePreview slots={preview[selected]} />
            </section>
          )}
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
