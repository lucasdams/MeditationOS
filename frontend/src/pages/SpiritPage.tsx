import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { spiritService } from '../services/spirit'
import { useToast } from '../context/ToastContext'
import {
  SpiritArt,
  STAGE_COPY,
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
import { t, useT } from '../i18n'
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
const TEND_ACTIONS: { kind: SpiritTendKind; need: SpiritNeedKey; labelKey: string }[] = [
  { kind: 'feed', need: 'nourished', labelKey: 'spirit.tend.feed' },
  { kind: 'rest', need: 'rested', labelKey: 'spirit.tend.rest' },
  { kind: 'play', need: 'joyful', labelKey: 'spirit.tend.play' },
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

// The five stages in order (STAGE_COPY is defined spark → radiant), for the journey stepper.
const STAGE_ORDER = Object.keys(STAGE_COPY)

// Stage display name, localized at the call site (Spirit.tsx's STAGE_COPY carries the same
// 'spirit.stage.*' keys, so the SVG art label localizes identically). Unknown stages fall back
// to the tidied key.
function stageLabelOf(stage: string): string {
  return STAGE_COPY[stage as keyof typeof STAGE_COPY] ? t(`spirit.stage.${stage}`) : titleize(stage)
}

// Path → dosha catalog key (Kapha / Pitta / Vata), so the path label localizes at the call site.
const PATH_DOSHA_KEY: Record<SpiritPath, string> = {
  stillness: 'kapha',
  breath: 'pitta',
  heart: 'vata',
}
function pathLabelOf(path: SpiritPath): string {
  return t(`spirit.dosha.${PATH_DOSHA_KEY[path]}.name`)
}

// The cosmetic slot/option label maps + helpers (slotLabel / optionLabel / titleize) now live in
// Spirit.tsx (the single source of truth, shared with SpiritChoosePage's grows-into preview).

// A small per-option tag (ADR-0026) showing which need an item favours — reuses the shared
// NEED_COPY (icon + label) so the tree's tag matches the Care read-out exactly.
function NeedTag({ need }: { need: SpiritNeedKey }) {
  const copy = NEED_COPY[need]
  if (!copy) return null
  const NeedIcon = copy.icon
  const label = t(`needs.${need}`)
  return (
    <span className="spirit-option-need" title={t('spirit.needTag.favours', { label })}>
      <NeedIcon size={14} strokeWidth={1.75} aria-hidden="true" /> {label}
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
  // Click PINS the preview so it stays after the pointer leaves — and is the touch/tap path (no
  // hover there). Hover/focus previews transiently. This gives the click a real job instead of a
  // toggle that mouse-leave immediately undoes.
  const [pinned, setPinned] = useState(false)
  // A pathless spark has no signatures (total 0) → nothing to show; the picker leads instead.
  if (setBonus.total === 0) return null
  if (setBonus.active) {
    return (
      <div className="spirit-setbonus spirit-setbonus--active" role="status">
        <span className="spirit-setbonus-badge">{setBonus.label}</span>
        <span className="spirit-setbonus-note">
          {t('spirit.setbonus.activeNote', { total: setBonus.total })}
        </span>
      </div>
    )
  }
  // Not earned yet: explain plainly what radiance IS, and offer a live preview of the shimmer on the
  // stage creature — hover/focus to hold it, or tap to toggle (keyboard + touch friendly).
  return (
    <div className="spirit-setbonus spirit-setbonus--progress">
      {/* A contained card (title + progress + one-line explanation + preview), so the radiance
          status reads as a designed element rather than a loose wall of text under the grid. */}
      <div className="spirit-setbonus-head">
        <strong className="spirit-setbonus-title">{t('spirit.setbonus.radiance')}</strong>
        <span className="spirit-setbonus-count muted">
          {t('spirit.setbonus.progress.count', { count: setBonus.count, total: setBonus.total })}
        </span>
      </div>
      <div
        className="spirit-setbonus-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={setBonus.total}
        aria-valuenow={setBonus.count}
      >
        <span
          className="spirit-setbonus-bar-fill"
          style={{ width: `${setBonus.total ? (setBonus.count / setBonus.total) * 100 : 0}%` }}
        />
      </div>
      <p className="muted spirit-setbonus-explain">
        {t('spirit.setbonus.progress.tagline', { total: setBonus.total })}
      </p>
      <button
        type="button"
        className={`spirit-setbonus-preview${previewOn ? ' is-on' : ''}`}
        aria-pressed={previewOn}
        onMouseEnter={() => onPreview(true)}
        onMouseLeave={() => onPreview(pinned)}
        onFocus={() => onPreview(true)}
        onBlur={() => onPreview(pinned)}
        onClick={() => {
          const next = !pinned
          setPinned(next)
          onPreview(next)
        }}
      >
        {previewOn ? t('spirit.setbonus.previewing') : t('spirit.setbonus.see')}
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
  if (opt.tier > 1) return t('spirit.lock.tier', { prev: opt.tier - 1 })
  return t('spirit.lock.keepPracticing')
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
  // Subscribe to the locale so the whole page (incl. the module-level t() helpers used during this
  // render) re-labels live when the language changes in Settings.
  useT()
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
  // The Customize tab shows ONE cosmetic category at a time (a "dressing room"): this is the
  // selected category's slot key; null falls back to the first renderable slot. Only its option
  // grid renders, so the tab is a pinned creature + a category bar + one short grid, not a long
  // scroll of every slot expanded at once.
  const [activeSlot, setActiveSlot] = useState<string | null>(null)
  // Hover / tap "See the radiance" to PREVIEW the Signature-radiance shimmer on the stage creature
  // before you've earned the full set — so it's clear what the reward actually looks like.
  const [previewRadiance, setPreviewRadiance] = useState(false)
  // Read the OS reduced-motion preference once, so the hero art's JS motion matches the CSS
  // media query — the single source of truth.
  const reducedMotion = prefersReducedMotion()
  // One-time "what is this?" explainer — this is the app's most concept-dense screen (needs,
  // coins, cosmetics), so a newcomer gets three plain lines up front. Dismiss persists; an
  // unavailable localStorage (private mode) errs on the side of not nagging.
  const [introDismissed, setIntroDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('spirit.intro.dismissed') === '1'
    } catch {
      return true
    }
  })
  function dismissIntro() {
    setIntroDismissed(true)
    try {
      localStorage.setItem('spirit.intro.dismissed', '1')
    } catch {
      // fine — it will show again next visit
    }
  }

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
      showToast(t('spirit.toast.unlocked', { label: optionLabel(option) }))
    } catch {
      showToast(t('spirit.toast.unlockFail'), 'error')
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
        option
          ? t('spirit.toast.equipOn', { label: optionLabel(option) })
          : t('spirit.toast.slotCleared', { slot: slotLabel(slot) }),
      )
    } catch {
      showToast(t('spirit.toast.equipFail'), 'error')
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
      showToast(t('spirit.toast.renamed'))
    } catch {
      showToast(t('spirit.toast.renameFail'), 'error')
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
      showToast(t('spirit.toast.awakened'))
    } catch {
      showToast(t('spirit.toast.awakenFail'), 'error')
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
      // Toasts are plain strings (no React icon); the label alone conveys the need.
      showToast(t('spirit.toast.tended', { label: t(`needs.${need}`) }))
    } catch {
      showToast(t('spirit.toast.tendFail'), 'error')
    } finally {
      setBusy(null)
    }
  }

  // A pathless spark picks its creature on a dedicated, focused page (not crammed in here).
  if (spirit && spirit.path === null) return <Navigate to="/spirit/choose" replace />

  return (
    <main id="main-content" className="dashboard spirit-page">
      <Link to="/" className="back-link">
        {t('common.backDashboard')}
      </Link>
      <header className="page-head">
        <h1>{t('spirit.page.title')}</h1>
        {/* The promise copy describes a loaded spirit, so gate it behind one being present: on a
            first-load failure the heading + retry stand alone, not copy about a spirit that
            never arrived. */}
        {spirit && (
          <p className="page-subtitle">
            {t('spirit.page.subtitle')}
          </p>
        )}
      </header>

      {/* First-visit orientation — what the spirit IS and how the pieces fit, in plain words.
          Shown once (dismiss persists) so returning users keep a calm page. */}
      {spirit && !introDismissed && (
        <div className="practice-intro spirit-intro">
          <p className="practice-intro-what">
            {t('spirit.intro.what')}
          </p>
          <p className="practice-intro-how">
            {t('spirit.intro.how')}
          </p>
          <button type="button" className="link-neutral spirit-intro-gotit" onClick={dismissIntro}>
            {t('spirit.intro.gotit')}
          </button>
        </div>
      )}

      {!spirit && !error && <Loading label={t('spirit.loading')} />}
      <RetryableError message={error} onRetry={load} retrying={retrying} />

      {spirit && (() => {
        const form = formFor(spirit)
        const stageLabel = stageLabelOf(spirit.stage)
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

        // Render the ACTIVE cosmetic category as a panel of option nodes (ADR-0027): its available
        // options laid out by tier as a progression, each node showing its label + need tag and its
        // state (equipped / owned / unlockable / unaffordable / locked), with preview-on-hover-and-
        // focus. The options sit in a wrap GRID (not a tall column) so a category needs little
        // vertical space; level-LOCKED future options tuck behind a quiet "+ N more" toggle. Returns
        // null for a category with no available options.
        const renderActivePanel = (s: (typeof spirit.available)[number]) => {
          // Per-path exclusivity: only the options offered to this creature (path filter).
          const visible = s.options.filter((opt) => opt.available)
          if (visible.length === 0) return null
          const ownedCount = visible.filter((opt) => opt.owned).length
          const equippedOption = visible.find((opt) => opt.equipped)?.option
          // CALM by default: show only ACTIONABLE options (owned / unlockable / equipped). The
          // level-LOCKED future ones are hidden behind a quiet "+ N more" toggle so the panel isn't
          // a wall of "Reach level N". Sorted by tier so the climb still reads low → high.
          const locked = visible.filter((opt) => nodeState(opt) === 'locked')
          const showLocked = revealLocked.has(s.slot)
          const shown = (showLocked ? visible : visible.filter((opt) => nodeState(opt) !== 'locked'))
            .slice()
            .sort((a, b) => a.tier - b.tier)
          return (
            // The single open panel for the selected category — no per-slot collapse now (the
            // category bar above is the selector). `data-slot` sets the panel's accent; tests key
            // off `.spirit-slot[data-slot=…]` as the node container.
            <div className="spirit-slot" data-slot={s.slot}>
              <div className="spirit-slot-head">
                <span className="spirit-slot-name">{slotLabel(s.slot)}</span>
                <span className="spirit-slot-equipped muted">
                  {equippedOption ? optionLabel(equippedOption) : t('spirit.slot.noneYet')}
                </span>
                <span className="spirit-tree-progress muted">
                  {ownedCount}/{visible.length}
                </span>
              </div>
              <div className="spirit-option-grid">
                {shown.map((opt) => renderNode(s.slot, opt))}
              </div>
              {locked.length > 0 && (
                <button
                  type="button"
                  className="spirit-locked-toggle"
                  onClick={() => toggleLocked(s.slot)}
                >
                  {showLocked
                    ? t('spirit.slot.showFewer')
                    : t('spirit.slot.moreUnlock', { count: locked.length })}
                </button>
              )}
            </div>
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
                    title={prize === 'legendary' ? t('spirit.capstone.radiant') : t('spirit.capstone.signature')}
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
                    <span aria-hidden="true">✓</span> {t('spirit.node.worn')}
                  </span>
                  <button
                    type="button"
                    className="spirit-node-remove"
                    disabled={busy != null}
                    aria-label={t('spirit.node.removeAria', { label })}
                    onClick={() => equip(slot, null)}
                  >
                    {t('spirit.node.remove')}
                  </button>
                </span>
              )}

              {state === 'owned' && (
                // Owned but not worn — a free Equip.
                <button
                  type="button"
                  className="spirit-node-btn spirit-node-equip"
                  disabled={busy != null}
                  aria-label={t('spirit.node.equipAria', { label })}
                  onClick={() => equip(slot, opt.option)}
                >
                  {t('spirit.node.equip')}
                </button>
              )}

              {state === 'unlockable' && (
                // Affordable + all prereqs met — Unlock for its cost (auto-equips). Opens the
                // before/after confirm; the unlock only happens on Confirm there.
                <button
                  type="button"
                  className="spirit-node-btn spirit-node-unlock"
                  disabled={busy != null}
                  aria-label={t('spirit.node.unlockAria', { label, cost: opt.cost })}
                  onClick={() => setConfirmUnlock({ slot, option: opt.option })}
                >
                  {t('spirit.node.unlock')} <span className="spirit-node-cost"><CoinIcon /> {opt.cost}</span>
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
                    aria-label={t('spirit.node.unlockUnaffordableAria', { label, cost: opt.cost })}
                  >
                    {t('spirit.node.unlock')} <span className="spirit-node-cost"><CoinIcon /> {opt.cost}</span>
                  </button>
                  <span className="spirit-node-hint">
                    {t('spirit.node.needMore', { count: Math.max(0, opt.cost - spirit.coins) })}
                  </span>
                </span>
              )}

              {state === 'locked' && (
                // Not owned and a prereq unmet — greyed, with the reason (reach a level, or unlock
                // a lower tier first). Previewable so the user can still see what they're climbing
                // toward.
                <span className="spirit-node-controls">
                  <span className="spirit-node-locked">
                    <Lock size={14} strokeWidth={1.75} aria-hidden="true" /> {lockReason(opt)}
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
        // The selected category (defaults to the first renderable slot) — only its panel shows at a
        // time, so the Customize tab is a compact dressing room, not a long scroll of every slot.
        const activeSlotKey =
          activeSlot && renderableSlots.some((s) => s.slot === activeSlot)
            ? activeSlot
            : (renderableSlots[0]?.slot ?? null)
        const activeSlotData = renderableSlots.find((s) => s.slot === activeSlotKey) ?? null
        return (
          <>
            {/* The hero: a COMPACT status read-out (name / stage / path / bond) plus the single
                coin balance (shown once here — never doubled elsewhere on the page). The big
                spirit render lives on the centered customization stage below. */}
            <section className="spirit-hero spirit-hero--compact" aria-label={t('spirit.page.title')}>
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
                    // Earned radiance, OR a live "See the radiance" preview from the footer status
                    // (which is now visible on every tab, so the shimmer must show on the portrait too).
                    setRadiant={spirit.set_bonus.active || previewRadiance}
                  />
                </div>
              )}
              {spirit.name && <p className="spirit-hero-name">{spirit.name}</p>}
              <p className="spirit-hero-stage">
                {stageLabel}
                {spirit.path ? (
                  <> · {t('spirit.hero.pathSpirit', { name: pathLabelOf(spirit.path) })}</>
                ) : (
                  <span className="muted">{t('spirit.hero.pathless')}</span>
                )}
              </p>
              <p className="muted spirit-hero-bond">{t('spirit.hero.bond', { level: spirit.bond.level })}</p>
              <p className="spirit-hero-coins">
                <CoinIcon /> {spirit.coins} <span className="muted">{t('spirit.hero.coins')}</span>
              </p>
              {/* A warm word by the companion (Care / Collection tabs; the Customize tab is the
                  editing view). */}
              {spirit.path && tab !== 'customize' && <EncouragementNote />}
            </section>

            {/* Tabs — show Care / Customize / Collection one at a time so the page stays calm. */}
            {spirit.path && (
              <nav className="spirit-tabs" aria-label={t('spirit.tabs.aria')}>
                {(['care', 'customize', 'collection'] as const).map((tabKey) => (
                  <button
                    key={tabKey}
                    type="button"
                    className={`spirit-tab${tab === tabKey ? ' spirit-tab--active' : ''}`}
                    aria-current={tab === tabKey ? 'page' : undefined}
                    onClick={() => setTab(tabKey)}
                  >
                    {t(`spirit.tabs.${tabKey}`)}
                  </button>
                ))}
              </nav>
            )}

            {/* Care (ADR-0032) — leads with VITALITY (the headline "cared-for" signal, fed by any
                practice), then shows the three facets as an informational BALANCE of your recent
                practice mix (not debts), a single optional round-out suggestion, and the Feed / Rest
                / Play tend actions as gentle, optional care. Only for a chosen creature. */}
            {spirit.path && tab === 'care' && (
              <section className="spirit-section spirit-care" aria-label={t('spirit.care.title')}>
                <header className="spirit-section-head">
                  <h2 className="spirit-section-title">{t('spirit.care.title')}</h2>
                  {/* Vitality first — any practice keeps them content; this is the overall read. */}
                  <p className="spirit-vitality" role="status">
                    <strong>{spirit.name ?? t('spirit.care.fallbackName')}</strong>
                    {t('spirit.care.vitalityIs')}
                    <strong className="spirit-vitality-tier">
                      {(spirit.condition.tier
                        ? t(`spirit.tier.${spirit.condition.tier}`)
                        : t('spirit.tier.content')
                      ).toLowerCase()}
                    </strong>
                    {t('spirit.care.vitalityAny')}
                  </p>
                  <p className="muted spirit-section-subtitle">
                    {t('spirit.care.subtitle.p1')}
                    <strong>{t('needs.rested')}</strong>
                    {t('spirit.care.subtitle.p2')}
                    <strong>{t('needs.joyful')}</strong>
                    {t('spirit.care.subtitle.p3')}
                    <strong>{t('needs.nourished')}</strong>
                    {t('spirit.care.subtitle.p4')}
                  </p>
                </header>

                <NeedsReadout needs={spirit.needs} />
                <CareNudge needs={spirit.needs} path={spirit.path} />

                {/* The tend actions — Feed → nourished, Rest → rested, Play → joyful. Each tops its
                    need to ~60%; only practice fills it fully (the subtitle + toast convey this).
                    Gentle, optional care; disabled only while a tend is in flight. */}
                <div className="spirit-tend" role="group" aria-label={t('spirit.tend.aria')}>
                  {TEND_ACTIONS.map(({ kind, need, labelKey }) => {
                    const copy = NEED_COPY[need]
                    const TendIcon = copy.icon
                    const label = t(labelKey)
                    const needLabel = t(`needs.${need}`)
                    return (
                      <button
                        key={kind}
                        type="button"
                        className="spirit-tend-btn"
                        disabled={busy != null}
                        aria-label={t('spirit.tend.btnAria', { label, need: needLabel })}
                        onClick={() => tend(kind, need)}
                      >
                        <span className="spirit-tend-icon" aria-hidden="true">
                          <TendIcon size={22} strokeWidth={1.75} />
                        </span>
                        <span className="spirit-tend-label">{label}</span>
                        <span className="spirit-tend-need muted">{needLabel}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="muted spirit-tend-hint">{t('spirit.tend.hint')}</p>
              </section>
            )}

            {/* Customize — the cosmetics as a per-slot SKILL TREE (ADR-0027). Unlock owned-forever
                nodes along prerequisite tiers, then equip what you've earned for free. Preview on
                hover/focus; unlock opens a before/after confirm. */}
            {tab === 'customize' && (
            <section
              className="spirit-section spirit-personalize"
              aria-label={t('spirit.customize.title')}
              // The creature's element (dosha) — drives the SIGNATURE capstones' thematic glow
              // (Pitta fire / Kapha earth / Vata air) so a fire spirit's signature reads as fire.
              data-path={spirit.path ?? undefined}
            >
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">{t('spirit.customize.title')}</h2>
                {/* Beginner-first (Phase 3): a warm one-line teaser, not the full skill-tree pitch.
                    The deeper "unlock along each tree" framing lives below the reveal. */}
                <p className="muted spirit-section-subtitle">
                  {t('spirit.customize.subtitle')}
                </p>
              </header>
              {renderableSlots.length === 0 ? (
                <p className="muted">
                  {t('spirit.customize.empty')}
                </p>
              ) : (
                <div className="spirit-dressing">
                  {/* The pinned "viewer": the creature + the category selector stay in view while the
                      option grid below scrolls, so hovering an option always previews on a visible
                      spirit and switching category never means scrolling back up. */}
                  <div className="spirit-dressing-head">
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
                        {preview && <span className="spirit-preview-badge">{t('spirit.customize.preview')}</span>}
                      </div>
                      <p className="spirit-stage-caption">{stageCaption}</p>
                    </div>

                    {/* The category selector — one chip per cosmetic slot; picking one shows ONLY
                        that category's options below. A worn dot marks categories that already have
                        something equipped. */}
                    <div
                      className="spirit-cat-bar"
                      role="group"
                      aria-label={t('spirit.customize.slotsAria')}
                    >
                      {renderableSlots.map((s) => {
                        const isActive = s.slot === activeSlotKey
                        const worn = s.options.some((opt) => opt.equipped)
                        return (
                          <button
                            key={s.slot}
                            type="button"
                            className={`spirit-cat${isActive ? ' spirit-cat--active' : ''}`}
                            data-slot={s.slot}
                            aria-pressed={isActive}
                            onClick={() => {
                              setActiveSlot(s.slot)
                              setPreview(null)
                            }}
                          >
                            <span className="spirit-cat-name">{slotLabel(s.slot)}</span>
                            {worn && <span className="spirit-cat-dot" aria-hidden="true" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* The selected category's options — a wrap grid, so one category stays short.
                      (The Signature-radiance status now lives in the page footer, grouped with the
                      name reset, rather than trailing the option grid.) */}
                  {activeSlotData && renderActivePanel(activeSlotData)}
                </div>
              )}
            </section>
            )}

            {/* Collection — the gallery of retired spirits, kept forever: radiant graduates you
                grew to radiance and set free (ADR-0031 removed the death path, so every entry is a
                graduate). */}
            {tab === 'collection' && (
            <section className="spirit-section spirit-collection" aria-label={t('spirit.collection.title')}>
              <header className="spirit-section-head">
                <h2 className="spirit-section-title">{t('spirit.collection.title')}</h2>
                <p className="muted spirit-section-subtitle">
                  {t('spirit.collection.subtitle')}
                </p>
              </header>
              {spirit.collection.length === 0 ? (
                <p className="muted">{t('spirit.collection.empty')}</p>
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
                          {r.name ?? t('spirit.collection.retiredName', { stage: stageLabelOf(r.stage) })}
                        </span>
                        {r.path && (
                          <span className="muted spirit-collection-path">
                            {pathLabelOf(r.path)}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
            )}

            {/* Quiet footer under the tabs — the Signature-radiance status and the paid name reset
                (ADR-0024), the two minor "spend / prestige" bits, tucked below the main content. The
                name is committed at creation and immutable, so its reset is just a small button (the
                cost + explanation live in its confirm modal), never a prominent section. */}
            <div className="spirit-footer">
              <SetBonusStatus
                setBonus={spirit.set_bonus}
                previewOn={previewRadiance}
                onPreview={setPreviewRadiance}
              />
              <button
                type="button"
                className="spirit-reset-quiet"
                disabled={busy != null || spirit.coins < RESET_COST}
                title={
                  spirit.coins < RESET_COST
                    ? t('spirit.resetName.needsCoins', { cost: RESET_COST })
                    : t('spirit.resetName.line', { cost: RESET_COST })
                }
                onClick={() => {
                  setResetNameDraft(spirit.name ?? '')
                  setResetNameOpen(true)
                }}
              >
                {t('spirit.resetName.button')}
              </button>
            </div>

            {/* How it grows — the progress ladder + set-free explainer, folded behind a quiet
                disclosure low on the page (the hero already shows the current stage, so this is
                reference material, not another stacked section). */}
            <details className="meditate-disclosure spirit-journey" aria-label={t('spirit.journey.aria')}>
              <summary className="meditate-disclosure-summary">{t('spirit.journey.title')}</summary>
              <div className="meditate-disclosure-body">
                <ol className="spirit-journey-stages">
                  {STAGE_ORDER.map((s, i) => {
                    const here = STAGE_ORDER.indexOf(spirit.stage)
                    const cls = i === here ? ' is-current' : i < here ? ' is-done' : ''
                    return (
                      <li key={s} className={`spirit-journey-stage${cls}`}>
                        {stageLabelOf(s)}
                      </li>
                    )
                  })}
                </ol>
                <p className="muted spirit-journey-note">
                  {t('spirit.journey.note.lead')}
                  <strong>{t('spirit.journey.note.radiantWord')}</strong>
                  {t('spirit.journey.note.tail')}
                  {isRadiant && (
                    <>
                      {t('spirit.journey.note.radiantNow.lead')}
                      <strong>{t('spirit.journey.note.radiantNow.setFree')}</strong>
                      {t('spirit.journey.note.radiantNow.tail')}
                    </>
                  )}
                </p>
              </div>
            </details>

            {/* Awaken a new spark — only at radiant. A calm action behind a confirmation that
                states it retires the current spirit into the collection. */}
            {isRadiant && (
              <section className="spirit-section spirit-awaken" aria-label={t('spirit.awaken.aria')}>
                <p className="muted spirit-awaken-note">
                  {t('spirit.awaken.note')}
                </p>
                <button
                  type="button"
                  className="settings-danger spirit-awaken-btn"
                  disabled={busy != null}
                  onClick={() => setConfirmAwaken(true)}
                >
                  {t('spirit.awaken.button')}
                </button>
              </section>
            )}

            {confirmAwaken && (
              <Modal
                ariaLabel={t('spirit.awaken.modal.aria')}
                onClose={() => setConfirmAwaken(false)}
                closeOnBackdrop
              >
                <h3>{t('spirit.awaken.modal.title')}</h3>
                <p className="muted">
                  {t('spirit.awaken.modal.body')}
                </p>
                <div className="spirit-awaken-actions">
                  <button
                    type="button"
                    className="settings-danger spirit-awaken-do"
                    disabled={busy === 'awaken'}
                    onClick={awaken}
                  >
                    {busy === 'awaken' ? t('spirit.awaken.modal.doing') : t('spirit.awaken.button')}
                  </button>
                  <button
                    type="button"
                    className="spirit-awaken-cancel"
                    disabled={busy === 'awaken'}
                    onClick={() => setConfirmAwaken(false)}
                  >
                    {t('spirit.awaken.modal.keep')}
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
                  ariaLabel={t('spirit.unlock.modal.aria', { label: optionLabel(option) })}
                  onClose={() => setConfirmUnlock(null)}
                  closeOnBackdrop
                >
                  <h3>{t('spirit.unlock.modal.title', { label: optionLabel(option) })}</h3>
                  <p className="muted">
                    {t('spirit.unlock.modal.body', {
                      slot: slotLabel(slot).toLowerCase(),
                      label: optionLabel(option),
                    })}
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
                      <span className="spirit-buy-caption">{t('spirit.unlock.modal.now')}</span>
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
                      <span className="spirit-buy-caption">{t('spirit.unlock.modal.with', { label: optionLabel(option) })}</span>
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
                      {unlocking ? t('spirit.unlock.modal.doing') : t('spirit.unlock.modal.confirm')}
                    </button>
                    <button
                      type="button"
                      className="spirit-awaken-cancel"
                      disabled={busy != null}
                      onClick={() => setConfirmUnlock(null)}
                    >
                      {t('spirit.unlock.modal.cancel')}
                    </button>
                  </div>
                </Modal>
              )
            })()}

            {/* Reset name (ADR-0024) — a paid change to the otherwise-immutable name. */}
            {resetNameOpen && (
              <Modal
                ariaLabel={t('spirit.resetName.modal.aria')}
                onClose={() => setResetNameOpen(false)}
                closeOnBackdrop
              >
                <h3>{t('spirit.resetName.modal.title')}</h3>
                <p className="muted">
                  {t('spirit.resetName.modal.body', { cost: RESET_COST })}
                </p>
                <label className="spirit-field">
                  <span>{t('spirit.resetName.modal.newName')}</span>
                  <input
                    type="text"
                    value={resetNameDraft}
                    maxLength={NAME_MAX}
                    placeholder={t('spirit.resetName.modal.placeholder')}
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
                    {busy === 'reset-name'
                      ? t('spirit.resetName.modal.doing')
                      : t('spirit.resetName.modal.confirm', { cost: RESET_COST })}
                  </button>
                  <button
                    type="button"
                    className="spirit-awaken-cancel"
                    disabled={busy === 'reset-name'}
                    onClick={() => setResetNameOpen(false)}
                  >
                    {t('spirit.resetName.modal.cancel')}
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
