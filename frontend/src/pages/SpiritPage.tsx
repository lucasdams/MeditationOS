import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { useToast } from '../context/ToastContext'
import {
  SpiritArt,
  STAGE_COPY,
  PATH_COPY,
  formFor,
  prefersReducedMotion,
} from '../components/Spirit'
import CoinIcon from '../components/CoinIcon'
import Modal from '../components/Modal'
import { Loading, RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type { SpiritPath, SpiritState } from '../types'

/**
 * SpiritPage — the full view of your living companion (docs/design/spirit.md, ADR-0022;
 * build-order steps 5 + 6). A page + "Personalize" panel for the single spirit:
 *
 *  - the spirit rendered large with its name / stage / path,
 *  - a quiet Personalize panel — the cosmetics slots (aura / accessory / habitat) with each
 *    option's cost and applied / locked / affordable state, preview-on-hover-and-focus, and
 *    buy via the service (refetch-free: every write returns the fresh state),
 *  - a nickname field (PATCH; clears when emptied),
 *  - the coins shown once (no double-show),
 *  - the collection gallery of retired spirits,
 *  - and, only at `radiant`, a calm "awaken a new spark" action behind a confirmation.
 *
 * Calm, low-pressure UX: the panel is a soft set of options, never a shouty shop.
 */

// Stage labels reuse Spirit's STAGE_COPY (single source of truth) — just the display name here.
const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STAGE_COPY).map(([stage, copy]) => [stage, copy.name]),
)

// The five stages in order (STAGE_COPY is defined spark → radiant), for the journey stepper.
const STAGE_ORDER = Object.keys(STAGE_LABEL)

// Path labels reuse Spirit's PATH_COPY (single source of truth).
const PATH_LABEL = PATH_COPY

// Calm display names for the cosmetic slots and their options (matching the backend catalog
// SPIRIT_COSMETICS_CATALOG: aura/accessory/habitat). Unknown keys fall back to a tidied key.
const SLOT_LABEL: Record<string, string> = {
  aura: 'Aura',
  accessory: 'Accessory',
  habitat: 'Habitat',
}

const OPTION_LABEL: Record<string, string> = {
  soft: 'Soft glow',
  warm: 'Warm glow',
  starlit: 'Starlit',
  halo: 'Halo',
  leaf_crown: 'Leaf crown',
  ribbon: 'Ribbon',
  meadow: 'Meadow',
  dusk: 'Dusk',
  night: 'Night sky',
}

// Tidy an unknown key into a label (e.g. "leaf_crown" → "Leaf crown") as a safe fallback.
function titleize(key: string): string {
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const slotLabel = (slot: string) => SLOT_LABEL[slot] ?? titleize(slot)
const optionLabel = (option: string) => OPTION_LABEL[option] ?? titleize(option)

// The cosmetic option the user is currently exploring (hovering / keyboard-focusing) in the
// panel, so the live preview can show what the spirit would look like with it applied — before
// any coins are spent. `null` = nothing explored → the preview shows the spirit as it is now.
type PreviewTarget = { slot: string; option: string } | null

// The nickname cap, mirroring the backend SPIRIT_NAME_MAX_LENGTH. The form soft-limits input;
// the server trims + rejects over-length regardless.
const NAME_MAX = 40

export default function SpiritPage() {
  const { showToast } = useToast()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // A key (`slot:option` or 'rename' or 'awaken') marking the in-flight write, so the matching
  // control disables and can't double-submit; null = idle.
  const [busy, setBusy] = useState<string | null>(null)
  // The option being previewed (hovered / focused) in the panel — view-only, never buys.
  const [preview, setPreview] = useState<PreviewTarget>(null)
  // The awaken confirmation modal (radiant only).
  const [confirmAwaken, setConfirmAwaken] = useState(false)
  // Read the OS reduced-motion preference once, so the hero art's JS motion matches the CSS
  // media query (and any future celebration is honored) — the single source of truth.
  const reducedMotion = prefersReducedMotion()

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

  // Buy/apply a cosmetic. The write returns the fresh state, so we just swap it in (no refetch).
  // Guarded client-side so a locked / unaffordable / already-applied option never submits — the
  // backend still enforces all of this, this is only a calm UX gate.
  async function buyCosmetic(slot: string, option: string) {
    const key = `${slot}:${option}`
    setBusy(key)
    try {
      const next = await spiritService.buyCosmetic({ slot, option })
      setSpirit(next)
      // Keep the confirmation calm: the hero balance already carries the coin count, so we
      // don't reintroduce a spent/remaining tally here — just a gentle "it's on your spirit".
      showToast(`${optionLabel(option)} added to your spirit ✨`)
    } catch {
      showToast('Could not apply that yet — earn more coins by practicing.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Quiet feedback when a gated (locked / unaffordable) option is activated — so the click
  // isn't a silent no-op. We surface the unlock requirement or the coins shortfall as a calm
  // note, while the preview-on-focus affordance still lets the user see the goal look.
  function notifyGated(opt: { unlocked: boolean; unlock_hint: string | null; affordable: boolean; cost: number }) {
    if (!opt.unlocked) {
      showToast(opt.unlock_hint ?? 'Keep practicing to unlock this.')
      return
    }
    if (!opt.affordable && spirit) {
      const short = Math.max(0, opt.cost - spirit.coins)
      showToast(short > 0 ? `Earn ${short} more coins to add this.` : 'Earn more coins to add this.')
    }
  }

  // Set or clear the nickname (PATCH). Empty/whitespace clears it. The read shape echoes the
  // saved name back, so the field pre-fills from it; the trimmed input is submitted on blur
  // (null when emptied → cleared).
  async function saveName(raw: string) {
    if (!spirit) return
    const next = raw.trim()
    setBusy('rename')
    try {
      setSpirit(await spiritService.rename({ name: next || null }))
      showToast(next ? 'Name saved.' : 'Name cleared.')
    } catch {
      showToast('Could not save that name — please try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Awaken a new spark — retires the current radiant spirit into the collection. Only reachable
  // at radiant (the action is hidden otherwise); the confirmation states what it does first.
  async function awaken() {
    setBusy('awaken')
    try {
      const next = await spiritService.awaken()
      setSpirit(next)
      setConfirmAwaken(false)
      showToast('A new spark awakens. Your radiant spirit joins your collection. 🌟')
    } catch {
      showToast('Your spirit is not radiant yet — keep practicing.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main id="main-content" className="dashboard spirit-page">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>Your spirit</h1>
        {/* The promise copy describes a loaded spirit, so gate it behind one being present: on a
            first-load failure the heading + retry stand alone, not copy about a spirit that
            never arrived. */}
        {spirit && (
          <p className="page-subtitle">
            A living companion you awaken once and grow through practice. Adorn it, name it, and
            watch it brighten as you show up.
          </p>
        )}
      </header>

      {!spirit && !error && <Loading label="Waking your spirit…" />}
      <RetryableError message={error} onRetry={load} retrying={retrying} />

      {spirit && (() => {
        const form = formFor(spirit)
        const stageLabel = STAGE_LABEL[spirit.stage] ?? titleize(spirit.stage)
        const isRadiant = spirit.stage === 'radiant'
        // The live preview merges the explored option into the owned cosmetics ({...current,
        // [slot]: option}); with nothing explored it shows the spirit exactly as it is now.
        const previewCosmetics = preview
          ? { ...spirit.cosmetics, [preview.slot]: preview.option }
          : spirit.cosmetics
        return (
          <>
            {/* The hero: the spirit rendered large, with its name / stage / path read-out and a
                single coin balance (shown once here — never doubled elsewhere on the page). */}
            <section className="spirit-hero" aria-label="Your spirit">
              <div className="spirit-hero-art">
                <SpiritArt
                  stage={spirit.stage}
                  path={form}
                  glow={spirit.daily_glow}
                  cosmetics={previewCosmetics}
                  reducedMotion={reducedMotion}
                  previewing={preview !== null}
                />
                {preview && <span className="spirit-preview-badge">Preview</span>}
              </div>
              {spirit.name && <p className="spirit-hero-name">{spirit.name}</p>}
              <p className="spirit-hero-stage">
                {stageLabel}
                {spirit.path ? (
                  <> · {PATH_LABEL[spirit.path]} spirit</>
                ) : (
                  <span className="muted"> · leaning toward {PATH_LABEL[form]}</span>
                )}
              </p>
              <p className="muted spirit-hero-bond">Bond level {spirit.bond.level}</p>
              <p className="spirit-hero-coins">
                <CoinIcon /> {spirit.coins} <span className="muted">coins to spend</span>
              </p>
            </section>

            {/* How it grows + set free — a calm explainer of the path to radiance. */}
            <section className="spirit-section spirit-journey" aria-label="How your spirit grows">
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Growing to radiance</h2>
              </header>
              <ol className="spirit-journey-stages">
                {STAGE_ORDER.map((s, i) => {
                  const here = STAGE_ORDER.indexOf(spirit.stage)
                  const cls = i === here ? ' is-current' : i < here ? ' is-done' : ''
                  return (
                    <li key={s} className={`spirit-journey-stage${cls}`}>
                      {STAGE_LABEL[s] ?? s}
                    </li>
                  )
                })}
              </ol>
              <p className="muted spirit-journey-note">
                Every practice — meditate, breathe, gratitude, journal — earns XP that levels up
                your bond and carries your spirit from <strong>spark</strong> to{' '}
                <strong>radiant</strong>. Growth never reverses; a quiet day only dims its glow,
                never its stage.
              </p>
              <p className="muted spirit-journey-note">
                {isRadiant ? (
                  <>
                    Your spirit is <strong>radiant</strong> — you can <strong>set it free</strong>{' '}
                    below. It joins your collection forever, and a new spark begins, ready to grow
                    down its own path.
                  </>
                ) : (
                  <>
                    At <strong>radiant</strong> you can <strong>set your spirit free</strong>: it
                    joins your collection forever and a fresh spark begins its own journey.
                  </>
                )}
              </p>
            </section>

            {/* Nickname — a quiet field; type a name (or clear it) and it saves on blur (PATCH).
                Pre-filled from the saved name the read shape echoes back. */}
            <section className="spirit-section spirit-nickname-section" aria-label="Nickname">
              <SpiritNickname name={spirit.name} busy={busy === 'rename'} onSave={saveName} />
            </section>

            {/* Personalize — the cosmetics slots, calm and modest. Preview-on-hover/focus, buy
                on click; locked / unaffordable options preview but never submit. */}
            <section className="spirit-section spirit-personalize" aria-label="Personalize">
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Personalize</h2>
                <p className="muted spirit-section-subtitle">
                  Spend coins to adorn your spirit and its space.
                </p>
              </header>
              {spirit.available.length === 0 ? (
                <p className="muted">
                  Keep practicing — adornments unlock as your spirit grows.
                </p>
              ) : (
                spirit.available.map((s) => (
                  <fieldset key={s.slot} className="spirit-slot">
                    <legend>{slotLabel(s.slot)}</legend>
                    <div className="spirit-slot-options">
                      {s.options.map((opt) => {
                        const applied = opt.applied
                        const gated = !opt.unlocked || !opt.affordable
                        // Buy only when the option is actually applicable; a locked / unaffordable
                        // / already-applied click is a no-op (the server enforces this too).
                        const buyable = !applied && opt.unlocked && opt.affordable
                        // Hard-disable only an already-applied option or an in-flight write —
                        // a gated option stays enabled so it can be PREVIEWED (the goal look)
                        // without spending a coin.
                        const hardDisabled = busy != null || applied
                        const canPreview = !applied
                        const showPreview = () =>
                          canPreview && setPreview({ slot: s.slot, option: opt.option })
                        const clearPreview = () => setPreview(null)
                        // A full spoken state for SR/keyboard: name + state + reason, so the
                        // applied/locked/unaffordable status isn't carried only by emoji/colour
                        // and a hover-only `title`.
                        const ariaLabel = applied
                          ? `${optionLabel(opt.option)} — applied`
                          : !opt.unlocked
                            ? `${optionLabel(opt.option)} — locked, ${(opt.unlock_hint ?? 'keep practicing').toLowerCase()}`
                            : !opt.affordable
                              ? `${optionLabel(opt.option)} — ${opt.cost} coins, earn more`
                              : `${optionLabel(opt.option)} — ${opt.cost} coins`
                        return (
                          <button
                            key={opt.option}
                            type="button"
                            className={`spirit-option${applied ? ' applied' : ''}${
                              gated && !applied ? ' gated' : ''
                            }`}
                            disabled={hardDisabled}
                            aria-disabled={(gated && !applied) || undefined}
                            aria-label={ariaLabel}
                            onMouseEnter={showPreview}
                            onMouseLeave={clearPreview}
                            onFocus={showPreview}
                            onBlur={clearPreview}
                            // Buyable → purchase; gated → quiet feedback (never a silent no-op).
                            onClick={() =>
                              buyable ? buyCosmetic(s.slot, opt.option) : gated && notifyGated(opt)
                            }
                          >
                            {applied ? (
                              `✓ ${optionLabel(opt.option)}`
                            ) : !opt.unlocked ? (
                              `🔒 ${optionLabel(opt.option)}`
                            ) : !opt.affordable ? (
                              <>
                                {optionLabel(opt.option)} · <CoinIcon /> {opt.cost} (earn more)
                              </>
                            ) : (
                              <>
                                {optionLabel(opt.option)} · <CoinIcon /> {opt.cost}
                              </>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </fieldset>
                ))
              )}
            </section>

            {/* Collection — the gallery of retired (past radiant) spirits, kept forever. */}
            <section className="spirit-section spirit-collection" aria-label="Collection">
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Collection</h2>
                <p className="muted spirit-section-subtitle">
                  Past spirits you grew to radiance and set free.
                </p>
              </header>
              {spirit.collection.length === 0 ? (
                <p className="muted">
                  No past spirits yet — grow this one to radiance to begin your collection.
                </p>
              ) : (
                <ul className="spirit-collection-grid">
                  {spirit.collection.map((r) => {
                    const rForm: SpiritPath = r.path ?? 'stillness'
                    return (
                      <li key={r.id} className="spirit-collection-item">
                        <div className="spirit-collection-art">
                          <SpiritArt
                            stage={r.stage}
                            path={rForm}
                            glow={1}
                            reducedMotion
                          />
                        </div>
                        <span className="spirit-collection-name">
                          {r.name ?? `${STAGE_LABEL[r.stage] ?? titleize(r.stage)} spirit`}
                        </span>
                        {r.path && (
                          <span className="muted spirit-collection-path">
                            {PATH_LABEL[r.path]}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            {/* Awaken a new spark — only at radiant. A calm action behind a confirmation that
                states it retires the current spirit into the collection. */}
            {isRadiant && (
              <section className="spirit-section spirit-awaken" aria-label="Awaken a new spark">
                <p className="muted spirit-awaken-note">
                  Your spirit shines fully. When you’re ready, you can awaken a new spark — this
                  one will retire into your collection, kept forever.
                </p>
                <button
                  type="button"
                  className="spirit-awaken-btn"
                  disabled={busy != null}
                  onClick={() => setConfirmAwaken(true)}
                >
                  Awaken a new spark
                </button>
              </section>
            )}

            {confirmAwaken && (
              <Modal
                ariaLabel="Awaken a new spark"
                onClose={() => setConfirmAwaken(false)}
                closeOnBackdrop
              >
                <h3>Awaken a new spark?</h3>
                <p className="muted">
                  Your radiant spirit will retire into your collection, kept forever, and a fresh
                  pathless spark begins. This can’t be undone.
                </p>
                <div className="spirit-awaken-actions">
                  <button
                    type="button"
                    className="spirit-awaken-do"
                    disabled={busy === 'awaken'}
                    onClick={awaken}
                  >
                    {busy === 'awaken' ? 'Awakening…' : 'Awaken a new spark'}
                  </button>
                  <button
                    type="button"
                    className="spirit-awaken-cancel"
                    disabled={busy === 'awaken'}
                    onClick={() => setConfirmAwaken(false)}
                  >
                    Keep this one
                  </button>
                </div>
              </Modal>
            )}
          </>
        )
      })()}
    </main>
  )
}

// A quiet nickname editor — local input state, committed on blur / Enter so a rename is one
// calm action. Empty clears the name. Pre-filled from the saved name the read shape returns;
// the local edit re-syncs whenever that saved value changes (e.g. after a save or refetch).
function SpiritNickname({
  name,
  busy,
  onSave,
}: {
  name: string | null
  busy: boolean
  onSave: (raw: string) => void
}) {
  const [value, setValue] = useState(name ?? '')
  // Re-sync the field when the saved name changes (initial load, after save, refetch).
  useEffect(() => {
    setValue(name ?? '')
  }, [name])
  // Surface the cap as a quiet, near-the-limit counter so a paste over length isn't silently
  // truncated without any feedback — it appears only when the user is close to (or at) the cap.
  const nearCap = value.length >= NAME_MAX - 5
  return (
    <label className="spirit-field">
      <span>Nickname</span>
      <input
        type="text"
        value={value}
        maxLength={NAME_MAX}
        placeholder="Give your spirit a name (optional)"
        disabled={busy}
        aria-describedby="spirit-nickname-hint"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSave(value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span id="spirit-nickname-hint" className="spirit-field-hint muted">
        Up to {NAME_MAX} characters; clear to remove the name.
        {nearCap && (
          <span className="spirit-field-count">
            {' '}
            {value.length}/{NAME_MAX}
          </span>
        )}
      </span>
    </label>
  )
}
