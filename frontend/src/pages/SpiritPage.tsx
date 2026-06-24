import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { spiritService } from '../services/spirit'
import { useToast } from '../context/ToastContext'
import {
  SpiritArt,
  STAGE_COPY,
  PATH_COPY,
  NeedsReadout,
  CareNudge,
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

// The name cap, mirroring the backend SPIRIT_NAME_MAX_LENGTH. The form soft-limits input; the
// server trims + rejects blank/over-length regardless.
const NAME_MAX = 40

// The flat fee for a paid reset (ADR-0024), mirroring the backend RESET_COST — used for both
// the name reset and the upgrades reset. The server enforces it; this gates the UI calmly.
const RESET_COST = 250

export default function SpiritPage() {
  const { showToast } = useToast()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // A key (`slot:option` or 'reset-name' or 'reset-upgrades' or 'awaken') marking the in-flight
  // write, so the matching control disables and can't double-submit; null = idle.
  const [busy, setBusy] = useState<string | null>(null)
  // The option being previewed (hovered / focused) in the panel — view-only, never buys.
  const [preview, setPreview] = useState<PreviewTarget>(null)
  // The awaken confirmation modal (radiant only).
  const [confirmAwaken, setConfirmAwaken] = useState(false)
  // The paid name-reset modal (ADR-0024) + its draft input; null = closed.
  const [resetNameOpen, setResetNameOpen] = useState(false)
  const [resetNameDraft, setResetNameDraft] = useState('')
  // The paid upgrades-reset confirmation modal (ADR-0024).
  const [confirmResetUpgrades, setConfirmResetUpgrades] = useState(false)
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

  // Change the name via a PAID reset (ADR-0024). The name is otherwise immutable. The new
  // name is required; the server charges the fee and returns the fresh state.
  async function resetName() {
    if (!spirit) return
    const next = resetNameDraft.trim()
    if (!next) return // required
    setBusy('reset-name')
    try {
      setSpirit(await spiritService.resetName({ name: next }))
      setResetNameOpen(false)
      showToast('Name changed.')
    } catch {
      showToast('Could not change the name — you may need more coins.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Clear ALL applied upgrades via a PAID reset (ADR-0024) — no refund. The server charges the
  // fee and returns the fresh state with every slot unlocked again.
  async function resetUpgrades() {
    if (!spirit) return
    setBusy('reset-upgrades')
    try {
      setSpirit(await spiritService.resetCosmetics())
      setConfirmResetUpgrades(false)
      showToast('Upgrades reset — your slots are open again.')
    } catch {
      showToast('Could not reset upgrades — you may need more coins.', 'error')
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

  // A pathless spark picks its creature on a dedicated, focused page (not crammed in here).
  if (spirit && spirit.path === null) return <Navigate to="/spirit/choose" replace />

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
                  glow={spirit.condition.factor}
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
                  <span className="muted"> · a pathless spark</span>
                )}
              </p>
              <p className="muted spirit-hero-bond">Bond level {spirit.bond.level}</p>
              <p className="spirit-hero-coins">
                <CoinIcon /> {spirit.coins} <span className="muted">coins to spend</span>
              </p>
            </section>

            {/* Care (ADR-0023) — the three tended needs + a single kind nudge when one is low.
                Only for a chosen creature; a pathless spark has no needs yet (the picker leads). */}
            {spirit.path && (
              <section className="spirit-section spirit-care" aria-label="Care">
                <header className="spirit-section-head">
                  <h2 className="spirit-section-title">Care</h2>
                  <p className="muted spirit-section-subtitle">
                    Keep your {PATH_LABEL[spirit.path]} in good shape by doing its kind of practice.
                  </p>
                </header>
                <NeedsReadout needs={spirit.needs} />
                <CareNudge needs={spirit.needs} path={spirit.path} />
              </section>
            )}


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

            {/* Name — read-only on the hero (above). The name is committed at creation and
                immutable; changing it is a quiet, paid reset (ADR-0024). */}
            <section className="spirit-section spirit-name-section" aria-label="Name">
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Name</h2>
                <p className="muted spirit-section-subtitle">
                  Your companion's name was set when you chose it. Changing it costs{' '}
                  {RESET_COST} coins.
                </p>
              </header>
              <button
                type="button"
                className="spirit-reset-name-btn"
                disabled={busy != null || spirit.coins < RESET_COST}
                title={
                  spirit.coins < RESET_COST
                    ? `Needs ${RESET_COST} coins`
                    : undefined
                }
                onClick={() => {
                  setResetNameDraft(spirit.name ?? '')
                  setResetNameOpen(true)
                }}
              >
                Reset name (<CoinIcon /> {RESET_COST})
              </button>
            </section>

            {/* Personalize — the cosmetics slots, calm and modest. Preview-on-hover/focus, buy
                on click; an applied slot is LOCKED (ADR-0024); locked/unaffordable options
                preview but never submit. */}
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
                  <fieldset
                    key={s.slot}
                    className={`spirit-slot${s.slot && s.locked ? ' is-locked' : ''}`}
                  >
                    <legend>
                      {slotLabel(s.slot)}
                      {s.locked && (
                        <span className="spirit-slot-locked muted">
                          {' '}
                          <span aria-hidden="true">🔒</span> locked
                        </span>
                      )}
                    </legend>
                    <div className="spirit-slot-options">
                      {s.options.map((opt) => {
                        const applied = opt.applied
                        // ADR-0024: once any option in the slot is applied, the slot LOCKS —
                        // no other option in it can be bought until upgrades are reset.
                        const slotLocked = s.locked
                        const gated = slotLocked || !opt.unlocked || !opt.affordable
                        // Buy only when the slot is open AND the option is unlocked/affordable;
                        // any other click is a no-op (the server enforces this too).
                        const buyable =
                          !applied && !slotLocked && opt.unlocked && opt.affordable
                        // Hard-disable an already-applied option, an option in a locked slot, or
                        // an in-flight write. A merely-gated (level/coin) option in an OPEN slot
                        // stays enabled so it can be PREVIEWED without spending a coin.
                        const hardDisabled = busy != null || applied || (slotLocked && !applied)
                        const canPreview = !applied && !slotLocked
                        const showPreview = () =>
                          canPreview && setPreview({ slot: s.slot, option: opt.option })
                        const clearPreview = () => setPreview(null)
                        // A full spoken state for SR/keyboard: name + state + reason, so the
                        // applied/locked/unaffordable status isn't carried only by emoji/colour
                        // and a hover-only `title`.
                        const ariaLabel = applied
                          ? `${optionLabel(opt.option)} — applied`
                          : slotLocked
                            ? `${optionLabel(opt.option)} — locked, reset upgrades to change`
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
                            }${slotLocked || !opt.unlocked ? ' locked' : ''}`}
                            disabled={hardDisabled}
                            aria-disabled={(gated && !applied) || undefined}
                            aria-label={ariaLabel}
                            onMouseEnter={showPreview}
                            onMouseLeave={clearPreview}
                            onFocus={showPreview}
                            onBlur={clearPreview}
                            // Buyable → purchase; otherwise a no-op in a locked slot, or quiet
                            // feedback for a level/coin gate (never a silent no-op).
                            onClick={() =>
                              buyable
                                ? buyCosmetic(s.slot, opt.option)
                                : !slotLocked && gated && notifyGated(opt)
                            }
                          >
                            {applied ? (
                              `✓ ${optionLabel(opt.option)}`
                            ) : slotLocked ? (
                              // A locked slot (ADR-0024): the unapplied options are shown but not
                              // buyable, with a small lock hint pointing at the reset.
                              <>
                                <span aria-hidden="true">🔒</span> {optionLabel(opt.option)}
                                <span className="spirit-option-lock">Reset to change</span>
                              </>
                            ) : !opt.unlocked ? (
                              // Level-gated upgrades are shown, NOT hidden (ADR-0023 / task #4):
                              // a lock badge + the unlock requirement, so the user sees what
                              // they're working toward. Non-buyable until reached.
                              <>
                                <span aria-hidden="true">🔒</span> {optionLabel(opt.option)}
                                <span className="spirit-option-lock">
                                  {opt.unlock_hint ?? 'Keep practicing'}
                                </span>
                              </>
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
              {/* Reset upgrades — a quiet, paid action (ADR-0024). Clears every applied slot
                  (no refund) so they can be chosen afresh. Disabled with nothing applied or
                  too few coins. */}
              {Object.keys(spirit.cosmetics).length > 0 && (
                <button
                  type="button"
                  className="spirit-reset-upgrades-btn"
                  disabled={busy != null || spirit.coins < RESET_COST}
                  title={spirit.coins < RESET_COST ? `Needs ${RESET_COST} coins` : undefined}
                  onClick={() => setConfirmResetUpgrades(true)}
                >
                  Reset upgrades (<CoinIcon /> {RESET_COST})
                </button>
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
                <p className="muted">None yet.</p>
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

            {/* Reset name (ADR-0024) — a paid change to the otherwise-immutable name. */}
            {resetNameOpen && (
              <Modal
                ariaLabel="Reset your spirit's name"
                onClose={() => setResetNameOpen(false)}
                closeOnBackdrop
              >
                <h3>Reset your spirit's name?</h3>
                <p className="muted">
                  Your companion's name was set when you chose it. Changing it costs{' '}
                  {RESET_COST} coins.
                </p>
                <label className="spirit-field">
                  <span>New name</span>
                  <input
                    type="text"
                    value={resetNameDraft}
                    maxLength={NAME_MAX}
                    placeholder="A new name"
                    disabled={busy === 'reset-name'}
                    onChange={(e) => setResetNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && resetName()}
                  />
                </label>
                <div className="spirit-awaken-actions">
                  <button
                    type="button"
                    className="spirit-awaken-do"
                    disabled={busy === 'reset-name' || !resetNameDraft.trim()}
                    onClick={resetName}
                  >
                    {busy === 'reset-name' ? 'Changing…' : `Change name (${RESET_COST} coins)`}
                  </button>
                  <button
                    type="button"
                    className="spirit-awaken-cancel"
                    disabled={busy === 'reset-name'}
                    onClick={() => setResetNameOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </Modal>
            )}

            {/* Reset upgrades (ADR-0024) — clears every applied slot, no refund. */}
            {confirmResetUpgrades && (
              <Modal
                ariaLabel="Reset upgrades"
                onClose={() => setConfirmResetUpgrades(false)}
                closeOnBackdrop
              >
                <h3>Reset all upgrades?</h3>
                <p className="muted">
                  This clears every adornment on your spirit so you can choose afresh. It costs{' '}
                  {RESET_COST} coins and the upgrades you already bought are not refunded.
                </p>
                <div className="spirit-awaken-actions">
                  <button
                    type="button"
                    className="spirit-awaken-do"
                    disabled={busy === 'reset-upgrades'}
                    onClick={resetUpgrades}
                  >
                    {busy === 'reset-upgrades'
                      ? 'Resetting…'
                      : `Reset upgrades (${RESET_COST} coins)`}
                  </button>
                  <button
                    type="button"
                    className="spirit-awaken-cancel"
                    disabled={busy === 'reset-upgrades'}
                    onClick={() => setConfirmResetUpgrades(false)}
                  >
                    Keep them
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
