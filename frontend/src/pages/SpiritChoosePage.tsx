import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { useToast } from '../context/ToastContext'
import {
  DOSHA,
  PATH_ORDER,
  SpiritArt,
  prefersReducedMotion,
} from '../components/Spirit'
import { Loading, RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { t, useT } from '../i18n'
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

// Path → dosha catalog key (Kapha / Pitta / Vata), so the dosha copy localizes at the call site.
const PATH_DOSHA_KEY: Record<SpiritPath, string> = {
  stillness: 'kapha',
  breath: 'pitta',
  heart: 'vata',
}

// Localized dosha display copy for a path — the name / element / vibe / practice / balance / why
// come from the i18n catalog (spirit.dosha.*); the decorative `glyph` stays from Spirit.tsx's DOSHA
// map (an emoji, not translated). Mirrors the shape SpiritChoosePage reads.
function dosha(path: SpiritPath): {
  name: string
  element: string
  vibe: string
  practice: string
  balance: string
  glyph: string
  why: string
} {
  const key = PATH_DOSHA_KEY[path]
  return {
    name: t(`spirit.dosha.${key}.name`),
    element: t(`spirit.dosha.${key}.element`),
    vibe: t(`spirit.dosha.${key}.vibe`),
    practice: t(`spirit.dosha.${key}.practice`),
    balance: t(`spirit.dosha.${key}.balance`),
    glyph: DOSHA[path].glyph,
    why: t(`spirit.dosha.${key}.why`),
  }
}

// Onboarding hatch (§5): when the user arrives here straight from their first guided breath, the
// `onboarding.intent` flag holds the warm question's answer. We use it to (a) reframe this page
// as a celebratory "hatch" and (b) gently SUGGEST a matching companion — never forced; all three
// stay pickable. Maps each intent to the dosha whose nature best fits it (reusing the DOSHA
// paths). Calm & sleep want grounding stillness; focus a steady breath; curious an airy heart.
const INTENT_SUGGESTION: Record<string, SpiritPath> = {
  calm: 'stillness',
  focus: 'breath',
  sleep: 'stillness',
  curious: 'heart',
}

// Read the stored onboarding intent (set by Onboarding §5), or null when not arriving from the
// flow. Storage may be unavailable (private mode) — treat as a normal (non-hatch) visit.
function readOnboardingIntent(): string | null {
  try {
    return localStorage.getItem('onboarding.intent')
  } catch {
    return null
  }
}

// Clear the onboarding flags once the companion is chosen, so a later visit to this page behaves
// normally. Best-effort; failures are harmless (the flags only steer copy + a suggestion).
function clearOnboardingHatch(): void {
  try {
    localStorage.removeItem('onboarding.intent')
    localStorage.removeItem('onboarding.pendingHatch')
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

// A fixed, developed stage for the choose-page previews so each creature reads as a clear, finished
// form (the real spirit starts a spark and grows — here we just want a good likeness to choose by).
const PREVIEW_STAGE = 'fledgling'

// Roll a RANDOM full look for a creature: one random option per slot that has any (aura, accessory,
// habitat, companion, …), flattened to a {slot: option} cosmetics map. Each roll is a fresh, varied
// decorated look — the choose-page preview shows the whole combination at once.
function randomLook(slots: SpiritSlotPreview[]): Record<string, string> {
  const look: Record<string, string> = {}
  for (const s of slots) {
    if (s.options.length === 0) continue
    const opt = s.options[Math.floor(Math.random() * s.options.length)]
    look[s.slot] = opt.option
  }
  return look
}

export default function SpiritChoosePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  // Subscribe to the locale so the page (incl. the module-level dosha() / t() helpers used during
  // this render) re-labels live when the language changes in Settings.
  useT()
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
  // A randomly-rolled look per creature (keyed by path) — the "Try a random look" button rolls a
  // full combination of cosmetics onto that card's art. Absent for a path = its bare base look.
  const [randomLooks, setRandomLooks] = useState<
    Partial<Record<SpiritPath, Record<string, string>>>
  >({})

  function rollLook(path: SpiritPath) {
    const slots = preview?.[path]
    if (!slots) return
    setRandomLooks((prev) => ({ ...prev, [path]: randomLook(slots) }))
  }
  function clearLook(path: SpiritPath) {
    setRandomLooks((prev) => {
      const next = { ...prev }
      delete next[path]
      return next
    })
  }
  // The onboarding intent (read once at mount), present only when arriving straight from the
  // first guided breath. When set, this page reads as a celebratory "hatch" and suggests a
  // matching companion. null = a normal, later visit (behaves exactly as before).
  const [onboardingIntent] = useState<string | null>(readOnboardingIntent)
  const fromOnboarding = onboardingIntent !== null
  const suggestedPath = onboardingIntent ? INTENT_SUGGESTION[onboardingIntent] ?? null : null

  function load() {
    setRetrying(true)
    spiritService
      .get()
      .then((s) => {
        setSpirit(s)
        setError(null)
      })
      .catch((err) => setError(messageForError(err, t('spirit.error'))))
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
      // The hatch is complete — clear the onboarding flags so a later visit behaves normally.
      clearOnboardingHatch()
      showToast(t('spirit.choose.toast.awakens', { name: dosha(path).name, glyph: DOSHA[path].glyph }))
      navigate('/spirit')
    } catch {
      showToast(t('spirit.choose.toast.chooseFail'), 'error')
    } finally {
      // Clear the awakening state even on success, so the button is never left stuck mid-flight.
      setBusy(null)
    }
  }

  // The live art for a creature — its bare base look, or a randomly-rolled look when one's active
  // for THIS creature. Bright + a fixed developed stage.
  function creatureArt(path: SpiritPath) {
    const look = randomLooks[path]
    return (
      <SpiritArt
        stage={PREVIEW_STAGE}
        path={path}
        glow={1}
        cosmetics={look ?? {}}
        previewing={!!look}
        reducedMotion={reducedMotion}
      />
    )
  }

  // Per-creature: favoured practice + the plain-language reason it balances this element. The real
  // basis for the choice (which the cosmetic preview is not).
  function favoursCopy(path: SpiritPath) {
    const d = dosha(path)
    return (
      <>
        <p className="spirit-choose-favours">
          {t('spirit.choose.favours')} <strong>{d.practice}</strong>
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
        {t('spirit.choose.back')}
      </Link>
      <header className="page-head">
        {fromOnboarding ? (
          <>
            <h1>{t('spirit.choose.hatch.title')}</h1>
            <p className="page-subtitle">
              {suggestedPath
                ? t('spirit.choose.hatch.suggested', { name: dosha(suggestedPath).name })
                : t('spirit.choose.hatch.any')}
            </p>
          </>
        ) : (
          <>
            <h1>{t('spirit.choose.title')}</h1>
            <p className="page-subtitle">
              {t('spirit.choose.subtitle')}
            </p>
          </>
        )}
      </header>

      {error && !spirit ? (
        <RetryableError message={error} onRetry={load} retrying={retrying} />
      ) : !spirit ? (
        <Loading label={t('spirit.loading')} />
      ) : selected === null ? (
        // Step 1 — pick a creature. Each card shows the live creature, why its practice suits it,
        // and hoverable "looks" that morph the art.
        <ul className="spirit-picker-grid spirit-choose-grid">
          {PATH_ORDER.map((path) => {
            const d = dosha(path)
            const canRoll = (preview?.[path] ?? []).some((s) => s.options.length > 0)
            return (
              <li key={path} className={`spirit-picker-card spirit-picker-card--${path}`}>
                {/* A gentle, never-forced suggestion when arriving from onboarding — the dosha
                    that matches the warm question's answer. All three stay equally pickable. */}
                {suggestedPath === path && (
                  <p className="spirit-choose-suggested">{t('spirit.choose.suggestedForYou')}</p>
                )}
                <div className="spirit-choose-art" aria-hidden="true">
                  {creatureArt(path)}
                </div>
                <p className="spirit-picker-name">{d.name}</p>
                <p className="muted spirit-picker-element">
                  {d.element} · {d.vibe.replace(/\.$/, '')}
                </p>
                {favoursCopy(path)}
                {canRoll && (
                  <div className="spirit-choose-tryons" aria-label={t('spirit.choose.tryonsAria', { name: d.name })}>
                    {/* The wrap is sized by the pill alone (Clear hangs off it absolutely), so the
                        pill stays DEAD-CENTRE in the row and never moves when Clear mounts. */}
                    <span className="spirit-choose-roll-wrap">
                      <button
                        type="button"
                        className="spirit-choose-roll"
                        onClick={() => rollLook(path)}
                      >
                        {/* Both labels are always in the pill, stacked in one grid cell with the
                            inactive one invisible — so flipping the label never resizes the pill
                            (its edges would otherwise breathe around centre on the first roll). */}
                        <span
                          className={`spirit-choose-roll-label${randomLooks[path] ? ' spirit-choose-roll-label--ghost' : ''}`}
                          aria-hidden={!!randomLooks[path]}
                        >
                          {t('spirit.choose.tryRandom')}
                        </span>
                        <span
                          className={`spirit-choose-roll-label${randomLooks[path] ? '' : ' spirit-choose-roll-label--ghost'}`}
                          aria-hidden={!randomLooks[path]}
                        >
                          {t('spirit.choose.rollNew')}
                        </span>
                      </button>
                      {randomLooks[path] && (
                        <button
                          type="button"
                          className="spirit-choose-roll-clear"
                          onClick={() => clearLook(path)}
                        >
                          {t('spirit.choose.clear')}
                        </button>
                      )}
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  className="spirit-picker-choose"
                  onClick={() => setSelected(path)}
                >
                  {t('spirit.choose.choose', { name: d.name })}
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
            {t('spirit.choose.chooseDifferent')}
          </button>
          <div className={`spirit-picker-card spirit-picker-card--${selected} spirit-name-chosen`}>
            <div className="spirit-choose-art" aria-hidden="true">
              {creatureArt(selected)}
            </div>
            <p className="spirit-picker-name">{dosha(selected).name}</p>
            <p className="muted spirit-picker-element">{dosha(selected).element}</p>
            {favoursCopy(selected)}
          </div>
          <label className="spirit-field spirit-choose-name">
            <span>{t('spirit.choose.nameLabel', { name: dosha(selected).name })}</span>
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              placeholder={t('spirit.choose.namePlaceholder')}
              autoFocus
              disabled={busy != null}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hasName) choose(selected)
              }}
            />
            {/* The name commits at creation (ADR-0024) — say so BEFORE the user finds out via
                the paid reset. */}
            <span className="muted spirit-field-hint">
              {t('spirit.choose.nameHint')}
            </span>
          </label>
          <button
            type="button"
            className="spirit-picker-choose spirit-name-awaken"
            disabled={busy != null || !hasName}
            title={hasName ? undefined : t('spirit.choose.nameFirst')}
            onClick={() => choose(selected)}
          >
            {busy != null ? t('spirit.choose.awakening') : t('spirit.choose.awaken', { name: dosha(selected).name })}
          </button>
        </div>
      )}

      <details className="dosha-about">
        <summary className="dosha-about-summary">{t('spirit.dosha.about.summary')}</summary>
        <div className="dosha-about-body">
          <p className="muted">
            {t('spirit.dosha.about.intro.p1')}<em>{t('spirit.dosha.about.intro.doshas')}</em>
            {t('spirit.dosha.about.intro.p2')}<strong>{t('spirit.dosha.about.intro.balance')}</strong>
            {t('spirit.dosha.about.intro.p3')}<em>{t('spirit.dosha.about.intro.opposite')}</em>
            {t('spirit.dosha.about.intro.p4')}<em>{t('spirit.dosha.about.intro.counterbalances')}</em>
            {t('spirit.dosha.about.intro.p5')}
          </p>
          <ul className="dosha-about-list">
            {PATH_ORDER.map((path) => {
              const d = dosha(path)
              return (
                <li key={path}>
                  <span className="dosha-about-name">
                    {d.glyph} {d.name}
                  </span>{' '}
                  <span className="muted">
                    {t('spirit.dosha.about.item.elementVibe', {
                      element: d.element,
                      vibe: d.vibe.toLowerCase().replace(/\.$/, ''),
                    })}
                  </span>
                  {t('spirit.dosha.about.item.wants')}<strong>{d.balance}</strong>
                  {t('spirit.dosha.about.item.practiceArrow')}<strong>{d.practice}</strong>
                  {t('spirit.dosha.about.item.end')}
                </li>
              )
            })}
          </ul>
          <p className="muted dosha-about-note">
            {t('spirit.dosha.about.note.p1')}<strong>{t('spirit.dosha.about.note.energizing')}</strong>
            {t('spirit.dosha.about.note.p2')}
          </p>
        </div>
      </details>
    </main>
  )
}
