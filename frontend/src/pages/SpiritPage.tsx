import { useEffect, useState, type ReactNode } from 'react'
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
import EncouragementNote from '../components/EncouragementNote'
import Modal from '../components/Modal'
import { Loading, RetryableError } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type {
  SpiritNeedKey,
  SpiritPath,
  SpiritSlotOption,
  SpiritState,
  SpiritTendKind,
} from '../types'

// The three calm tend actions (ADR-0031) — each tops up one gentle need, a purely optional touch
// of care (no survival stakes). Labelled with the matching NEED_COPY icon + need name so it's clear
// which meter it fills. Order mirrors the needs read-out (Nourishment / Rest / Joy).
const TEND_ACTIONS: { kind: SpiritTendKind; need: SpiritNeedKey; label: string }[] = [
  { kind: 'feed', need: 'nourished', label: 'Feed' },
  { kind: 'rest', need: 'rested', label: 'Rest' },
  { kind: 'play', need: 'joyful', label: 'Play' },
]

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
  const NeedIcon = copy.icon
  return (
    <span className="spirit-option-need" title={`Favours ${copy.label}`}>
      <NeedIcon size={14} strokeWidth={1.75} aria-hidden="true" /> {copy.label}
    </span>
  )
}

// The SIGNATURE SET status (ADR-0028) shown near the customize tree. When active, a calm badge
// announcing "Signature radiance" (all 7 path-exclusive capstones equipped); when not, a quiet
// progress line nudging the climb to the full set. Pathless sparks (total 0) show nothing — they
// have no signature set yet. Calm + on-token; no shouting. Reads straight from `set_bonus`.
function SetBonusStatus({
  setBonus,
  previewOn,
  onPreview,
}: {
  setBonus: SpiritState['set_bonus']
  previewOn: boolean
  onPreview: (on: boolean) => void
}) {
  // A pathless spark has no signatures (total 0) → nothing to show; the picker leads instead.
  if (setBonus.total === 0) return null
  if (setBonus.active) {
    return (
      <div className="spirit-setbonus spirit-setbonus--active" role="status">
        <span className="spirit-setbonus-badge">
          <span aria-hidden="true">✦ </span>
          {setBonus.label}
        </span>
        <span className="spirit-setbonus-note">
          Your companion shimmers with a special glow for wearing all {setBonus.total} of its
          signature pieces. ✨
        </span>
      </div>
    )
  }
  // Not earned yet: explain plainly what radiance IS, and offer a live preview of the shimmer on the
  // stage creature — hover/focus to hold it, or tap to toggle (keyboard + touch friendly).
  return (
    <div className="spirit-setbonus spirit-setbonus--progress">
      <p className="muted spirit-setbonus-explain">
        <strong>Signature radiance</strong> is a gentle glowing shimmer your companion earns once you
        equip all {setBonus.total} of its <em>signature pieces</em> — its own path-exclusive capstone
        cosmetics. You have {setBonus.count} of {setBonus.total} so far.
      </p>
      <button
        type="button"
        className={`spirit-setbonus-preview${previewOn ? ' is-on' : ''}`}
        aria-pressed={previewOn}
        onMouseEnter={() => onPreview(true)}
        onMouseLeave={() => onPreview(false)}
        onFocus={() => onPreview(true)}
        onBlur={() => onPreview(false)}
        onClick={() => onPreview(!previewOn)}
      >
        ✨ {previewOn ? 'Previewing the radiance…' : 'See the radiance'}
      </button>
    </div>
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

// ── Capstone relic (ornate frame + engraved elemental sigil) ───────────────────────────────
// The prize pieces get an illuminated-relic treatment instead of a glowing box: ornamental corner
// flourishes around the node + a hand-drawn alchemical SIGIL for its element. A SIGNATURE capstone
// shows its creature's element (Pitta fire / Kapha earth / Vata air); a universal LEGENDARY shows
// a radiant sun. All line-art (stroke = the prize accent via currentColor), aria-hidden.
type SigilKind = 'fire' | 'earth' | 'air' | 'radiant'

function prizeSigilKind(prize: 'signature' | 'legendary', path: SpiritPath | null): SigilKind {
  if (prize === 'legendary') return 'radiant'
  if (path === 'breath') return 'fire' // Pitta
  if (path === 'stillness') return 'earth' // Kapha
  return 'air' // Vata (heart) — and the pathless fallback
}

// Alchemical-style elemental marks, drawn as fine line-art (the engraved sigil on the relic).
const SIGILS: Record<SigilKind, ReactNode> = {
  // Fire — upward triangle with an inner flame.
  fire: (
    <>
      <path d="M12 3 L21 20 H3 Z" />
      <path d="M12 10 c2.4 2.6 2.4 5.4 0 7.4 c-2.4 -2 -2.4 -4.8 0 -7.4 Z" fill="currentColor" stroke="none" opacity="0.9" />
    </>
  ),
  // Earth — downward triangle crossed by a bar.
  earth: (
    <>
      <path d="M3 6 H21 L12 21 Z" />
      <line x1="7.5" y1="11.5" x2="16.5" y2="11.5" />
    </>
  ),
  // Air — upward triangle crossed by a bar.
  air: (
    <>
      <path d="M12 3 L21 20 H3 Z" />
      <line x1="7.5" y1="14.5" x2="16.5" y2="14.5" />
    </>
  ),
  // Radiant — a sun: a centre disc with eight rays.
  radiant: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1.5 V4.5 M12 19.5 V22.5 M1.5 12 H4.5 M19.5 12 H22.5 M4.4 4.4 l2.1 2.1 M17.5 17.5 l2.1 2.1 M19.6 4.4 l-2.1 2.1 M6.5 17.5 l-2.1 2.1" />
    </>
  ),
}

// One ornamental corner flourish; placed at all four corners (rotated via CSS).
const RELIC_CORNER = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
    <path d="M3 13 V6 Q3 3 6 3 H13" />
    <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
    <path d="M3.5 12.5 Q6 11 6 6.5" strokeWidth="0.9" opacity="0.55" />
  </svg>
)

// The ornamental corner flourishes that frame a capstone node (an absolute overlay).
function CapstoneFrame(): ReactNode {
  return (
    <span className="capstone-frame" aria-hidden="true">
      <span className="capstone-corner capstone-corner--tl">{RELIC_CORNER}</span>
      <span className="capstone-corner capstone-corner--tr">{RELIC_CORNER}</span>
      <span className="capstone-corner capstone-corner--bl">{RELIC_CORNER}</span>
      <span className="capstone-corner capstone-corner--br">{RELIC_CORNER}</span>
    </span>
  )
}

// The engraved elemental sigil — the node's seal/mark.
function CapstoneSigil({ kind }: { kind: SigilKind }): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true">
      {SIGILS[kind]}
    </svg>
  )
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
  // Slots whose level-LOCKED future options the user has chosen to reveal. By default a slot shows
  // only its ACTIONABLE options (owned / unlockable) so the panel stays calm; locked ones are
  // tucked behind a quiet "+ N more" toggle (keyed by slot name).
  const [revealLocked, setRevealLocked] = useState<Set<string>>(() => new Set())
  function toggleLocked(slot: string) {
    setRevealLocked((prev) => {
      const next = new Set(prev)
      if (next.has(slot)) next.delete(slot)
      else next.add(slot)
      return next
    })
  }
  // Which area is showing — Care / Customize / Collection — so the page reads one thing at a time
  // instead of one long scroll (the hero stays on top always).
  const [tab, setTab] = useState<'care' | 'customize' | 'collection'>('care')
  // Hover / tap "See the radiance" to PREVIEW the Signature-radiance shimmer on the stage creature
  // before you've earned the full set — so it's clear what the reward actually looks like.
  const [previewRadiance, setPreviewRadiance] = useState(false)
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
      .catch((err) => setError(messageForError(err, "Couldn't reach your spirit.")))
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
      showToast('Not unlocked yet — practice earns the coins for it.', 'error')
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
        option ? `${optionLabel(option)} on.` : `${slotLabel(slot)} set aside.`,
      )
    } catch {
      showToast("Couldn't change that right now.", 'error')
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
      showToast('Renamed. It answers to that now.')
    } catch {
      showToast("Couldn't change the name — you may need more coins.", 'error')
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

  // Tend a gentle need (ADR-0031) — feed / rest / play tops one meter to the tend cap, a purely
  // optional touch of care (no survival stakes). The write returns the fresh state, so we just swap
  // it in. Disabled only while in flight (busy key `tend:kind`).
  async function tend(kind: SpiritTendKind, need: SpiritNeedKey) {
    setBusy(`tend:${kind}`)
    try {
      const next = await spiritService.tend(kind)
      setSpirit(next)
      const copy = NEED_COPY[need]
      // Toasts are plain strings (no React icon); the label alone conveys the need.
      showToast(`${copy.label} topped up — practice fills it fully.`)
    } catch {
      showToast("Couldn't tend it just now — try once more.", 'error')
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
          const ownedCount = visible.filter((opt) => opt.owned).length
          const equippedOption = visible.find((opt) => opt.equipped)?.option
          // CALM by default: show only ACTIONABLE options (owned / unlockable / equipped). The
          // level-LOCKED future ones are hidden behind a quiet "+ N more" toggle so the panel isn't
          // a wall of "Reach level N". Sorted by tier so the climb still reads top → bottom.
          const locked = visible.filter((opt) => nodeState(opt) === 'locked')
          const showLocked = revealLocked.has(s.slot)
          const shown = (showLocked ? visible : visible.filter((opt) => nodeState(opt) !== 'locked'))
            .slice()
            .sort((a, b) => a.tier - b.tier)
          return (
            // Each slot is a collapsible disclosure — COLLAPSED by default so the panel reads as a
            // tidy list of sections you expand on demand. `data-slot` sets each section's accent.
            <details key={s.slot} className="spirit-slot" data-slot={s.slot}>
              <summary className="spirit-slot-summary">
                <span className="spirit-slot-name">{slotLabel(s.slot)}</span>
                <span className="spirit-slot-equipped muted">
                  {equippedOption ? optionLabel(equippedOption) : 'none yet'}
                </span>
                <span className="spirit-tree-progress muted">
                  {ownedCount}/{visible.length}
                </span>
                <span className="spirit-slot-chevron" aria-hidden="true">▾</span>
              </summary>
              <div className="spirit-slot-options">
                {shown.map((opt) => renderNode(s.slot, opt))}
                {locked.length > 0 && (
                  <button
                    type="button"
                    className="spirit-locked-toggle"
                    onClick={() => toggleLocked(s.slot)}
                  >
                    {showLocked ? 'Show fewer' : `+ ${locked.length} more unlock as you grow`}
                  </button>
                )}
              </div>
            </details>
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
          // A PRIZE piece — the path's own SIGNATURE capstone, or a universal LEGENDARY (tier 4).
          // These get a flashier, animated treatment so the top of the climb feels significant.
          const prize: 'signature' | 'legendary' | null = opt.exclusive
            ? 'signature'
            : opt.tier >= 4
              ? 'legendary'
              : null
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
            // Preview on the WHOLE cell: hovering/focusing anywhere on the node (label, need tag,
            // or control) shows what the spirit would look like with this option — not just the
            // button. `previewHandlers` is {} for the equipped node, so the worn cell never previews.
            <div
              key={opt.option}
              className={`spirit-node spirit-node--${state}${prize ? ` spirit-node--${prize}` : ''}`}
              data-state={state}
              {...previewHandlers}
            >
              {/* Ornate corner flourishes that frame the relic. */}
              {prize && <CapstoneFrame />}
              <span className="spirit-node-head">
                <span className="spirit-node-label">{label}</span>
                {prize && (
                  <span
                    className={`spirit-node-seal spirit-node-seal--${prize}`}
                    title={prize === 'legendary' ? 'Radiant capstone' : 'Signature capstone'}
                  >
                    <CapstoneSigil kind={prizeSigilKind(prize, spirit.path)} />
                  </span>
                )}
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
                  onClick={() => setConfirmUnlock({ slot, option: opt.option })}
                >
                  Unlock <span className="spirit-node-cost"><CoinIcon /> {opt.cost}</span>
                </button>
              )}

              {state === 'unaffordable' && (
                // Unlockable but the balance is short — Unlock disabled + a calm coin hint. Still
                // previewable so the user can see the goal look.
                <span className="spirit-node-controls">
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
                <span className="spirit-node-controls">
                  <span className="spirit-node-locked">
                    <span aria-hidden="true">🔒</span> {lockReason(opt)}
                  </span>
                </span>
              )}
            </div>
          )
        }

        // The slots worth showing at all — those with at least one available option. The redesign
        // shows EVERY one as a collapsed card in a grid below the creature (no curated subset, no
        // "show all" gate), so the whole catalog is one level deep.
        const renderableSlots = spirit.available.filter(
          (s) => s.options.some((opt) => opt.available),
        )
        return (
          <>
            {/* The hero: a COMPACT status read-out (name / stage / path / bond) plus the single
                coin balance (shown once here — never doubled elsewhere on the page). The big
                spirit render lives on the centered customization stage below. */}
            <section className="spirit-hero spirit-hero--compact" aria-label="Your spirit">
              {/* A prominent portrait of the equipped companion, so the page LEADS with your spirit
                  rather than a text read-out. Hidden on the Customize tab, which has its own live,
                  editable stage below (no need to show the creature twice there). */}
              {spirit.path && tab !== 'customize' && (
                <div className="spirit-portrait" aria-hidden="true">
                  <SpiritArt
                    stage={spirit.stage}
                    path={form}
                    glow={spirit.condition.factor}
                    cosmetics={spirit.cosmetics}
                    reducedMotion={reducedMotion}
                    setRadiant={spirit.set_bonus.active}
                  />
                </div>
              )}
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
              {/* A warm word by the companion (Care / Collection tabs; the Customize tab is the
                  editing view). */}
              {spirit.path && tab !== 'customize' && <EncouragementNote />}
            </section>

            {/* Tabs — show Care / Customize / Collection one at a time so the page stays calm. */}
            {spirit.path && (
              <nav className="spirit-tabs" aria-label="Spirit sections">
                {(['care', 'customize', 'collection'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`spirit-tab${tab === t ? ' spirit-tab--active' : ''}`}
                    aria-current={tab === t ? 'page' : undefined}
                    onClick={() => setTab(t)}
                  >
                    {t === 'care' ? 'Care' : t === 'customize' ? 'Customize' : 'Collection'}
                  </button>
                ))}
              </nav>
            )}

            {/* Care (ADR-0023 / ADR-0031) — the three gentle needs ease down over time but never
                empty or punish; a kind, optional nudge when one is a touch low, plus the Feed /
                Rest / Play tend actions as gentle, optional care. Only for a chosen creature; a
                pathless spark has no needs yet (the picker leads). */}
            {spirit.path && tab === 'care' && (
              <section className="spirit-section spirit-care" aria-label="Care">
                <header className="spirit-section-head">
                  <h2 className="spirit-section-title">Care</h2>
                  <p className="muted spirit-section-subtitle">
                    These meters ease down over time — tend them whenever you like, or practice to
                    fill them fully.
                  </p>
                </header>

                <NeedsReadout needs={spirit.needs} />
                <CareNudge needs={spirit.needs} path={spirit.path} />

                {/* The tend actions — Feed → nourished, Rest → rested, Play → joyful. Each tops its
                    need to ~60%; only practice fills it fully (the subtitle + toast convey this).
                    Gentle, optional care; disabled only while a tend is in flight. */}
                <div className="spirit-tend" role="group" aria-label="Tend your spirit">
                  {TEND_ACTIONS.map(({ kind, need, label }) => {
                    const copy = NEED_COPY[need]
                    const TendIcon = copy.icon
                    return (
                      <button
                        key={kind}
                        type="button"
                        className="spirit-tend-btn"
                        disabled={busy != null}
                        aria-label={`${label} — top up ${copy.label}`}
                        onClick={() => tend(kind, need)}
                      >
                        <span className="spirit-tend-icon" aria-hidden="true">
                          <TendIcon size={22} strokeWidth={1.75} />
                        </span>
                        <span className="spirit-tend-label">{label}</span>
                        <span className="spirit-tend-need muted">{copy.label}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="muted spirit-tend-hint">Practice fills a need fully; tending tops it up.</p>
              </section>
            )}

            {/* Customize — the cosmetics as a per-slot SKILL TREE (ADR-0027). Unlock owned-forever
                nodes along prerequisite tiers, then equip what you've earned for free. Preview on
                hover/focus; unlock opens a before/after confirm. */}
            {tab === 'customize' && (
            <section
              className="spirit-section spirit-personalize"
              aria-label="Customize"
              // The creature's element (dosha) — drives the SIGNATURE capstones' thematic glow
              // (Pitta fire / Kapha earth / Vata air) so a fire spirit's signature reads as fire.
              data-path={spirit.path ?? undefined}
            >
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Customize</h2>
                {/* Beginner-first (Phase 3): a warm one-line teaser, not the full skill-tree pitch.
                    The deeper "unlock along each tree" framing lives below the reveal. */}
                <p className="muted spirit-section-subtitle">
                  Spend coins you earn through practice to give your companion a look.
                </p>
              </header>
              {renderableSlots.length === 0 ? (
                <p className="muted">
                  Keep practicing — adornments unlock as your spirit grows.
                </p>
              ) : (
                <>
                  {/* The live preview — the spirit shown LARGE at the TOP, reflecting whatever node
                      you hover/focus below. Kept separate from the controls so nothing covers it. */}
                  <div className="spirit-customize-preview">
                    <div className="spirit-stage-frame">
                      <div className="spirit-stage-art">
                        <SpiritArt
                          stage={spirit.stage}
                          path={form}
                          glow={spirit.condition.factor}
                          cosmetics={previewCosmetics}
                          reducedMotion={reducedMotion}
                          previewing={preview !== null}
                          // ADR-0028: the "Signature radiance" flourish — on when earned, OR while
                          // previewing it from the set-bonus status below.
                          setRadiant={spirit.set_bonus.active || previewRadiance}
                        />
                      </div>
                      {preview && <span className="spirit-preview-badge">Preview</span>}
                    </div>
                    <p className="spirit-stage-caption">{stageCaption}</p>
                  </div>

                  {/* Every cosmetic slot as a clean grid of collapsible cards BELOW the creature —
                      all visible at once (no "show all" gate), one tap to open each. */}
                  <div className="spirit-slots-grid" aria-label="Customization slots">
                    {renderableSlots.map(renderSlot)}
                  </div>

                  {/* The signature set-bonus status + its live "See the radiance" preview. */}
                  <SetBonusStatus
                    setBonus={spirit.set_bonus}
                    previewOn={previewRadiance}
                    onPreview={setPreviewRadiance}
                  />
                </>
              )}
            </section>
            )}

            {/* Collection — the gallery of retired spirits, kept forever: radiant graduates you
                grew to radiance and set free (ADR-0031 removed the death path, so every entry is a
                graduate). */}
            {tab === 'collection' && (
            <section className="spirit-section spirit-collection" aria-label="Collection">
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">Collection</h2>
                <p className="muted spirit-section-subtitle">
                  Spirits you grew to radiance and set free.
                </p>
              </header>
              {spirit.collection.length === 0 ? (
                <p className="muted">Empty for now — past companions rest here.</p>
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
            )}

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
