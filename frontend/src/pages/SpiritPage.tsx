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
  NEED_COPY,
  slotLabel,
  optionLabel,
  titleize,
  formFor,
  prefersReducedMotion,
} from '../components/Spirit'
import CoinIcon from '../components/CoinIcon'
import Modal from '../components/Modal'
import { Loading, RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type {
  SpiritNeedKey,
  SpiritPath,
  SpiritSlotOption,
  SpiritState,
} from '../types'

/**
 * SpiritPage — the full view of your living companion (docs/design/spirit.md, ADR-0022,
 * ADR-0027). A page + a "Customize" skill-tree panel for the single spirit:
 *
 *  - the spirit rendered large with its name / stage / path,
 *  - a Customize panel — the cosmetics laid out as a per-slot SKILL TREE (ADR-0027): each
 *    option is a node placed by `tier` (1 → 2 → 3), so the climb to the tier-3 capstone reads
 *    as a tree. Each node shows its label + need tag and its state — equipped (worn), owned
 *    (Equip, free), unlockable+affordable (Unlock · cost, auto-equips), unlockable but too few
 *    coins (disabled + a hint), or locked (greyed, with the reason: reach a level, or unlock a
 *    lower tier first). A live preview reflects whatever node is hovered/focused,
 *  - a paid name reset (ADR-0024 — the name is committed at creation, otherwise immutable),
 *  - the coins shown once (no double-show),
 *  - the collection gallery of retired spirits,
 *  - and, only at `radiant`, a calm "awaken a new spark" action behind a confirmation.
 *
 * Calm, low-pressure UX: the tree is a soft progression, never a shouty shop.
 */

// Stage labels reuse Spirit's STAGE_COPY (single source of truth) — just the display name here.
const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(STAGE_COPY).map(([stage, copy]) => [stage, copy.name]),
)

// The five stages in order (STAGE_COPY is defined spark → radiant), for the journey stepper.
const STAGE_ORDER = Object.keys(STAGE_LABEL)

// Path labels reuse Spirit's PATH_COPY (single source of truth).
const PATH_LABEL = PATH_COPY

// The cosmetic slot/option label maps + helpers (slotLabel / optionLabel / titleize) now live in
// Spirit.tsx (the single source of truth, shared with SpiritChoosePage's grows-into preview).

// A small per-option tag (ADR-0026) showing which need an item favours — reuses the shared
// NEED_COPY (icon + label) so the tree's tag matches the Care read-out exactly.
function NeedTag({ need }: { need: SpiritNeedKey }) {
  const copy = NEED_COPY[need]
  if (!copy) return null
  return (
    <span className="spirit-option-need" title={`Favours ${copy.label}`}>
      <span aria-hidden="true">{copy.icon}</span> {copy.label}
    </span>
  )
}

// The SIGNATURE SET status (ADR-0028) shown near the customize tree. When active, a calm badge
// announcing "Signature radiance" (all 7 path-exclusive capstones equipped); when not, a quiet
// progress line nudging the climb to the full set. Pathless sparks (total 0) show nothing — they
// have no signature set yet. Calm + on-token; no shouting. Reads straight from `set_bonus`.
function SetBonusStatus({ setBonus }: { setBonus: SpiritState['set_bonus'] }) {
  // A pathless spark has no signatures (total 0) → nothing to show; the picker leads instead.
  if (setBonus.total === 0) return null
  if (setBonus.active) {
    return (
      <div className="spirit-setbonus spirit-setbonus--active" role="status">
        <span className="spirit-setbonus-badge">
          <span aria-hidden="true">✦ </span>
          {setBonus.label}
        </span>
        <span className="spirit-setbonus-note">all {setBonus.total} signature pieces equipped</span>
      </div>
    )
  }
  return (
    <p className="spirit-setbonus spirit-setbonus--progress muted">
      {setBonus.count}/{setBonus.total} signature pieces equipped — equip your creature's exclusive
      capstones
    </p>
  )
}

// The five visible states of a tree node (ADR-0027), derived purely from the option flags:
//   equipped     — worn right now (the one shown in its slot)
//   owned        — unlocked but not equipped → a free Equip
//   unlockable   — not owned, all prereqs met, coins cover it → Unlock · cost (auto-equips)
//   unaffordable — unlockable but the balance is short → Unlock disabled + a coin hint
//   locked       — not owned, a prereq unmet → greyed, with the reason (level or lower tier)
type NodeState = 'equipped' | 'owned' | 'unlockable' | 'unaffordable' | 'locked'

function nodeState(opt: SpiritSlotOption): NodeState {
  if (opt.equipped) return 'equipped'
  if (opt.owned) return 'owned'
  if (opt.unlockable) return opt.affordable ? 'unlockable' : 'unaffordable'
  return 'locked'
}

// The reason a locked node can't be unlocked yet (ADR-0027). The backend's `unlock_hint` carries
// the LEVEL gate ("Reach level N") when the level isn't met; otherwise the block is the tier
// prerequisite — owning a lower-tier option in the same slot first. Kept calm and concrete.
function lockReason(opt: SpiritSlotOption): string {
  if (opt.unlock_hint) return opt.unlock_hint
  if (opt.tier > 1) return `Unlock a tier-${opt.tier - 1} option first`
  return 'Keep practicing to unlock this'
}

// The cosmetic option the user is currently exploring (hovering / keyboard-focusing), so the live
// preview shows what the spirit would look like with it equipped. `null` = nothing explored.
type PreviewTarget = { slot: string; option: string } | null

// The name cap, mirroring the backend SPIRIT_NAME_MAX_LENGTH. The form soft-limits input; the
// server trims + rejects blank/over-length regardless.
const NAME_MAX = 40

// The flat fee for a paid NAME reset (ADR-0024), mirroring the backend RESET_COST. The server
// enforces it; this gates the UI calmly. (The paid upgrades-reset is gone — ADR-0027.)
const RESET_COST = 250

export default function SpiritPage() {
  const { showToast } = useToast()
  const [spirit, setSpirit] = useState<SpiritState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  // A key (`slot:option`, or 'reset-name' / 'awaken') marking the in-flight write, so the
  // matching control disables and can't double-submit; null = idle.
  const [busy, setBusy] = useState<string | null>(null)
  // The option being previewed (hovered / focused) in the tree — view-only, never writes.
  const [preview, setPreview] = useState<PreviewTarget>(null)
  // The awaken confirmation modal (radiant only).
  const [confirmAwaken, setConfirmAwaken] = useState(false)
  // The paid name-reset modal (ADR-0024) + its draft input; null = closed.
  const [resetNameOpen, setResetNameOpen] = useState(false)
  const [resetNameDraft, setResetNameDraft] = useState('')
  // The unlock confirmation modal — set to the {slot, option} the user wants to unlock so a
  // before/after preview can be shown before any coins are spent; null = closed.
  const [confirmUnlock, setConfirmUnlock] = useState<{ slot: string; option: string } | null>(
    null,
  )
  // Read the OS reduced-motion preference once, so the hero art's JS motion matches the CSS
  // media query — the single source of truth.
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

  // Unlock a cosmetic into the owned collection (ADR-0027) — charges coins and auto-equips it.
  // The write returns the fresh state, so we just swap it in (no refetch). Guarded client-side so
  // a locked / unaffordable / already-owned option never submits; the backend still enforces all
  // of this — this is only a calm UX gate.
  async function unlock(slot: string, option: string) {
    const key = `${slot}:${option}`
    setBusy(key)
    try {
      const next = await spiritService.unlock({ slot, option })
      setSpirit(next)
      setConfirmUnlock(null)
      showToast(`${optionLabel(option)} unlocked — your spirit is delighted ✨`)
    } catch {
      showToast('Could not unlock that yet — earn more coins by practicing.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Equip an OWNED option into its slot (or clear the slot with a null option) — FREE (ADR-0027).
  // The write returns the fresh state, so we swap it in. The backend enforces ownership.
  async function equip(slot: string, option: string | null) {
    const key = `${slot}:${option ?? '∅'}`
    setBusy(key)
    try {
      const next = await spiritService.equip({ slot, option })
      setSpirit(next)
      showToast(
        option ? `${optionLabel(option)} equipped.` : `${slotLabel(slot)} cleared.`,
      )
    } catch {
      showToast('Could not change that right now.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Change the name via a PAID reset (ADR-0024). The name is otherwise immutable. The new name is
  // required; the server charges the fee and returns the fresh state.
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
            A companion you grow through practice.
          </p>
        )}
      </header>

      {!spirit && !error && <Loading label="Waking your spirit…" />}
      <RetryableError message={error} onRetry={load} retrying={retrying} />

      {spirit && (() => {
        const form = formFor(spirit)
        const stageLabel = STAGE_LABEL[spirit.stage] ?? titleize(spirit.stage)
        const isRadiant = spirit.stage === 'radiant'
        // The live preview merges the explored option into the EQUIPPED cosmetics ({...current,
        // [slot]: option}); with nothing explored it shows the spirit exactly as it is now.
        const previewCosmetics = preview
          ? { ...spirit.cosmetics, [preview.slot]: preview.option }
          : spirit.cosmetics
        // The caption under the centered stage: the previewed option's label while exploring,
        // otherwise the spirit's name (or its stage when unnamed).
        const stageCaption = preview
          ? optionLabel(preview.option)
          : spirit.name ?? stageLabel

        // Render one cosmetic slot as a small SKILL TREE (ADR-0027): its available options laid
        // out by tier (1 → 2 → 3) as a progression, so the climb to the tier-3 capstone reads as
        // a tree. Each node shows its label + need tag and its state (equipped / owned /
        // unlockable / unaffordable / locked), with preview-on-hover-and-focus. Returns null for a
        // slot with no available options so the rail split below stays resilient.
        const renderSlot = (s: (typeof spirit.available)[number]) => {
          // Per-path exclusivity: only the options offered to this creature (path filter).
          const visible = s.options.filter((opt) => opt.available)
          if (visible.length === 0) return null
          // Group by tier so each tier is its own row in the tree (low → high). The catalog's
          // tiers are 1|2|3; sort the keys ascending so the progression reads upward.
          const tiers = Array.from(new Set(visible.map((o) => o.tier))).sort((a, b) => a - b)
          // How many of THIS slot's options the user already owns — a tiny "3/6 unlocked" read so
          // each tree shows progress at a glance without shouting. Pure display; derived from flags.
          const ownedCount = visible.filter((opt) => opt.owned).length
          return (
            <fieldset key={s.slot} className="spirit-slot spirit-tree">
              <legend>{slotLabel(s.slot)}</legend>
              <p className="spirit-tree-progress muted" aria-hidden="true">
                {ownedCount}/{visible.length} unlocked
              </p>
              {/* The tiers stack low → high as a climb; a continuous spine threads them so the
                  progression reads as one tree rather than separate rows. */}
              <div className="spirit-tree-tiers">
                {tiers.map((tier, i) => (
                  <div
                    key={tier}
                    className="spirit-tier"
                    data-tier={tier}
                    data-tier-pos={i === 0 ? 'first' : i === tiers.length - 1 ? 'last' : 'mid'}
                  >
                    <span className="spirit-tier-label" aria-hidden="true">
                      <span className="spirit-tier-rank">{tier}</span>
                      <span className="spirit-tier-rank-text">
                        {tier === tiers[tiers.length - 1] && tiers.length > 1
                          ? 'Tier ' + tier + ' · capstone'
                          : 'Tier ' + tier}
                      </span>
                    </span>
                    <div className="spirit-tier-nodes">
                      {visible
                        .filter((opt) => opt.tier === tier)
                        .map((opt) => renderNode(s.slot, opt))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          )
        }

        // Render a single tree node (an option) with its state-driven control. Equipped reads as
        // worn (not a button); owned offers a free Equip; an unlockable+affordable node offers
        // Unlock · cost (opens a before/after confirm); unaffordable shows Unlock disabled + a
        // coin hint; a locked node is greyed with its reason. Every node can be PREVIEWED on
        // hover/focus (except an equipped one, which is already shown), so the spirit reflects it.
        const renderNode = (slot: string, opt: SpiritSlotOption) => {
          const state = nodeState(opt)
          const label = optionLabel(opt.option)
          const canPreview = state !== 'equipped'
          const showPreview = () =>
            canPreview && setPreview({ slot, option: opt.option })
          const clearPreview = () => setPreview(null)
          const previewHandlers = canPreview
            ? {
                onMouseEnter: showPreview,
                onMouseLeave: clearPreview,
                onFocus: showPreview,
                onBlur: clearPreview,
              }
            : {}

          return (
            <div
              key={opt.option}
              className={`spirit-node spirit-node--${state}`}
              data-state={state}
            >
              <span className="spirit-node-head">
                <span className="spirit-node-label">{label}</span>
                <NeedTag need={opt.need} />
              </span>

              {state === 'equipped' && (
                // Worn now — not a button. A clear badge, plus a free "remove" so a slot can be
                // cleared (calls equip(slot, null)).
                <span className="spirit-node-controls">
                  <span className="spirit-node-worn">
                    <span aria-hidden="true">✓</span> Worn
                  </span>
                  <button
                    type="button"
                    className="spirit-node-remove"
                    disabled={busy != null}
                    aria-label={`Remove ${label}`}
                    onClick={() => equip(slot, null)}
                  >
                    Remove
                  </button>
                </span>
              )}

              {state === 'owned' && (
                // Owned but not worn — a free Equip.
                <button
                  type="button"
                  className="spirit-node-btn spirit-node-equip"
                  disabled={busy != null}
                  aria-label={`Equip ${label}`}
                  {...previewHandlers}
                  onClick={() => equip(slot, opt.option)}
                >
                  Equip
                </button>
              )}

              {state === 'unlockable' && (
                // Affordable + all prereqs met — Unlock for its cost (auto-equips). Opens the
                // before/after confirm; the unlock only happens on Confirm there.
                <button
                  type="button"
                  className="spirit-node-btn spirit-node-unlock"
                  disabled={busy != null}
                  aria-label={`Unlock ${label} for ${opt.cost} coins`}
                  {...previewHandlers}
                  onClick={() => setConfirmUnlock({ slot, option: opt.option })}
                >
                  Unlock <span className="spirit-node-cost"><CoinIcon /> {opt.cost}</span>
                </button>
              )}

              {state === 'unaffordable' && (
                // Unlockable but the balance is short — Unlock disabled + a calm coin hint. Still
                // previewable so the user can see the goal look.
                <span className="spirit-node-controls" {...previewHandlers}>
                  <button
                    type="button"
                    className="spirit-node-btn spirit-node-unlock"
                    disabled
                    aria-label={`Unlock ${label} for ${opt.cost} coins — need more coins`}
                  >
                    Unlock <span className="spirit-node-cost"><CoinIcon /> {opt.cost}</span>
                  </button>
                  <span className="spirit-node-hint">
                    need {Math.max(0, opt.cost - spirit.coins)} more coins
                  </span>
                </span>
              )}

              {state === 'locked' && (
                // Not owned and a prereq unmet — greyed, with the reason (reach a level, or unlock
                // a lower tier first). Previewable so the user can still see what they're climbing
                // toward.
                <span className="spirit-node-controls" {...previewHandlers}>
                  <span className="spirit-node-locked">
                    <span aria-hidden="true">🔒</span> {lockReason(opt)}
                  </span>
                </span>
              )}
            </div>
          )
        }

        // Split the slots across the two side rails so the spirit sits centered between them.
        // This is COUNT-DRIVEN, not name-driven, so the layout stays balanced for ANY catalog: we
        // only render slots that actually have visible options, then deal the first half to the
        // left rail and the rest to the right. With an odd total the left rail takes the extra one
        // (ceil), so e.g. 5 slots → 3 | 2 and 7 slots → 4 | 3 — never a lopsided or dropped slot.
        const renderableSlots = spirit.available.filter(
          (s) => s.options.some((opt) => opt.available),
        )
        const splitAt = Math.ceil(renderableSlots.length / 2)
        const leftRail = renderableSlots.slice(0, splitAt)
        const rightRail = renderableSlots.slice(splitAt)
        return (
          <>
            {/* The hero: a COMPACT status read-out (name / stage / path / bond) plus the single
                coin balance (shown once here — never doubled elsewhere on the page). The big
                spirit render lives on the centered customization stage below. */}
            <section className="spirit-hero spirit-hero--compact" aria-label="Your spirit">
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
                    Keep your {PATH_LABEL[spirit.path]} thriving with its kind of practice.
                  </p>
                </header>
                <NeedsReadout needs={spirit.needs} />
                <CareNudge needs={spirit.needs} path={spirit.path} />
              </section>
            )}

            {/* Customize — the cosmetics as a per-slot SKILL TREE (ADR-0027). Unlock owned-forever
                nodes along prerequisite tiers, then equip what you've earned for free. Preview on
                hover/focus; unlock opens a before/after confirm. */}
            <section className="spirit-section spirit-personalize" aria-label="Customize">
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Customize</h2>
                <p className="muted spirit-section-subtitle">
                  Unlock adornments along each tree, then equip your favourites.
                </p>
                {/* Signature set status (ADR-0028) — the active "Signature radiance" badge, or a
                    quiet progress nudge toward equipping all 7 path-exclusive capstones. */}
                <SetBonusStatus setBonus={spirit.set_bonus} />
              </header>
              {renderableSlots.length === 0 ? (
                <p className="muted">
                  Keep practicing — adornments unlock as your spirit grows.
                </p>
              ) : (
                // The customization stage: the spirit pinned in the CENTRE (large, sticky, live-
                // previewing whatever side node is hovered/focused), with the cosmetic trees
                // arranged on the LEFT and RIGHT rails around it — a calm, game-like dressing room.
                <div className="spirit-customize">
                  <div className="spirit-customize-rail" aria-label="Customization slots">
                    {leftRail.map(renderSlot)}
                  </div>

                  {/* The centred stage — decorative; the interactive controls are the rails. The
                      live render reflects `previewCosmetics`, so hovering/focusing any side node
                      updates THIS spirit. Sticky so it stays in view as the rails scroll. */}
                  <div className="spirit-customize-stage" aria-hidden="true">
                    <div className="spirit-stage-frame">
                      <div className="spirit-stage-art">
                        <SpiritArt
                          stage={spirit.stage}
                          path={form}
                          glow={spirit.condition.factor}
                          cosmetics={previewCosmetics}
                          reducedMotion={reducedMotion}
                          previewing={preview !== null}
                          // ADR-0028: the "Signature radiance" flourish, driven by the committed
                          // set status (an achievement read-out), not the transient hover preview.
                          setRadiant={spirit.set_bonus.active}
                        />
                      </div>
                      {preview && <span className="spirit-preview-badge">Preview</span>}
                    </div>
                    <p className="spirit-stage-caption">{stageCaption}</p>
                  </div>

                  <div className="spirit-customize-rail" aria-label="More customization slots">
                    {rightRail.map(renderSlot)}
                  </div>
                </div>
              )}
            </section>

            {/* Collection — the gallery of retired (past radiant) spirits, kept forever. */}
            <section className="spirit-section spirit-collection" aria-label="Collection">
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Collection</h2>
                <p className="muted spirit-section-subtitle">
                  Spirits you grew to radiance and set free.
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

            {/* Name reset — a minor, quiet line near the foot of the page (ADR-0024). The name
                is committed at creation and immutable; changing it is a rare, paid action, so it
                reads as a muted sentence with a small text-button — never a prominent section. */}
            <p className="muted spirit-reset-name-line">
              <span>
                Reset your companion's name for {RESET_COST} coins.
              </span>
              <button
                type="button"
                className="spirit-reset-quiet"
                disabled={busy != null || spirit.coins < RESET_COST}
                title={spirit.coins < RESET_COST ? `Needs ${RESET_COST} coins` : undefined}
                onClick={() => {
                  setResetNameDraft(spirit.name ?? '')
                  setResetNameOpen(true)
                }}
              >
                Reset name
              </button>
            </p>

            {/* How it grows — a quiet progress ladder + set-free explainer, low on the page
                (the hero already shows the current stage, so this needn't lead). */}
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
                Practice grows your spirit from spark to <strong>radiant</strong>.
                {isRadiant && (
                  <> Radiant now — you can <strong>set it free</strong> below.</>
                )}
              </p>
            </section>

            {/* Awaken a new spark — only at radiant. A calm action behind a confirmation that
                states it retires the current spirit into the collection. */}
            {isRadiant && (
              <section className="spirit-section spirit-awaken" aria-label="Awaken a new spark">
                <p className="muted spirit-awaken-note">
                  Awaken a new spark when you’re ready — this one retires into your collection,
                  kept forever.
                </p>
                <button
                  type="button"
                  className="settings-danger spirit-awaken-btn"
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
                    className="settings-danger spirit-awaken-do"
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

            {/* Unlock a cosmetic — a calm before/after confirmation. Clicking an unlockable node
                opens this; the unlock (which charges coins + auto-equips) only happens on Confirm.
                "Now" shows the spirit with its CURRENT cosmetics; "With X" merges the chosen option
                in — same stage / form / glow / motion, so the only difference is the adornment. */}
            {confirmUnlock && (() => {
              const slot = confirmUnlock.slot
              const option = confirmUnlock.option
              // The cost of the option being considered, looked up from the live catalog (the same
              // source the nodes render from). Falls back gracefully if not found.
              const cost = spirit.available
                .find((s) => s.slot === slot)
                ?.options.find((o) => o.option === option)?.cost
              const afterCosmetics = { ...spirit.cosmetics, [slot]: option }
              const unlocking = busy === `${slot}:${option}`
              return (
                <Modal
                  ariaLabel={`Unlock ${optionLabel(option)} for your spirit`}
                  onClose={() => setConfirmUnlock(null)}
                  closeOnBackdrop
                >
                  <h3>Unlock {optionLabel(option)}?</h3>
                  <p className="muted">
                    See how your spirit looks now and with {slotLabel(slot).toLowerCase()}{' '}
                    {optionLabel(option)} equipped. Unlocking owns it forever and equips it now.
                  </p>
                  <div className="spirit-buy-preview">
                    <div className="spirit-buy-art">
                      <SpiritArt
                        stage={spirit.stage}
                        path={form}
                        glow={spirit.condition.factor}
                        cosmetics={spirit.cosmetics}
                        reducedMotion={reducedMotion}
                      />
                      <span className="spirit-buy-caption">Now</span>
                    </div>
                    <span className="spirit-buy-arrow" aria-hidden="true">
                      →
                    </span>
                    <div className="spirit-buy-art">
                      <SpiritArt
                        stage={spirit.stage}
                        path={form}
                        glow={spirit.condition.factor}
                        cosmetics={afterCosmetics}
                        reducedMotion={reducedMotion}
                      />
                      <span className="spirit-buy-caption">With {optionLabel(option)}</span>
                    </div>
                  </div>
                  {cost != null && (
                    <p className="spirit-buy-cost">
                      <CoinIcon /> {cost}
                    </p>
                  )}
                  <div className="spirit-awaken-actions">
                    <button
                      type="button"
                      className="spirit-buy-confirm"
                      disabled={busy != null}
                      onClick={() => unlock(slot, option)}
                    >
                      {unlocking ? 'Unlocking…' : 'Unlock'}
                    </button>
                    <button
                      type="button"
                      className="spirit-awaken-cancel"
                      disabled={busy != null}
                      onClick={() => setConfirmUnlock(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </Modal>
              )
            })()}

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
                    className="settings-danger spirit-awaken-do"
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
          </>
        )
      })()}
    </main>
  )
}
