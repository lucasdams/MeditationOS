import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService, type PersonalizePatch } from '../services/sanctuary'
import { useToast } from '../context/ToastContext'
import SanctuaryPlant from '../components/SanctuaryPlant'
import Modal from '../components/Modal'
import { Loading, RetryableError, EmptyState } from '../components/StateViews'
import {
  itemLabel,
  optionLabel,
  slotLabel,
  variantLabel,
  VITALITY,
  TRACK_META,
  timeOfDay,
  gardenGreeting,
} from '../lib/sanctuaryArt'
import { playReward } from '../lib/sfx'
import type { OwnedItem, SanctuaryScene as Scene, ShopItem, TendingStatus } from '../types'

// Grid layout width (must mirror the backend's GRID_COLUMNS). The garden lays items out
// row-major: cell = row * GRID_COLUMNS + col. One tunable constant maps cell ↔ (row, col).
const GRID_COLUMNS = 4

// Length caps, mirroring the backend schema (NAME_MAX_LENGTH / NOTE_MAX_LENGTH). The form
// soft-limits input client-side; the server trims + rejects over-length regardless.
const NAME_MAX = 40
const NOTE_MAX = 140

// Pick a random example name from an item's suggested pool, avoiding `avoid` (the name
// already shown) when there's more than one so the shuffle visibly changes. Returns null
// when the pool is empty. The suggestion is never auto-assigned — the user types/keeps it.
function pickSuggestedName(pool: string[], avoid?: string): string | null {
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]
  const choices = avoid ? pool.filter((n) => n !== avoid) : pool
  const from = choices.length > 0 ? choices : pool
  return from[Math.floor(Math.random() * from.length)]
}

// The flat fee charged to reset an item's upgrades (mirrors the backend SANCTUARY_RESET_FEE,
// ADR-0019). Shown in the confirm copy so the cost is always stated before committing.
// Display-only; the server is the source of truth for what's actually charged.
const RESET_FEE = 10

// A hovered/focused-but-not-yet-bought option the user is exploring in the customize panel
// (which slot + which option). `null` = nothing explored, so the preview falls back to the item
// exactly as it is now. Kept generic over the slot/option system so any future upgrade slot
// previews automatically, with no per-slot special-casing.
type PreviewTarget = { slot: string; option: string } | null

// The ordered growth ladder (mirrors the backend GROWTH_STAGES) — the path a Tended item
// climbs from practice. The oak (the "Tended" MVP) walks this for free as Tending rises.
const TENDING_PATH = ['grown', 'flourishing', 'mature', 'ancient', 'venerable'] as const

// The "Tended" panel for an item whose growth is driven by practice, not coins (the oak, in
// the MVP). A quiet path ribbon (the growth ladder with the current stage lit and the next one
// shown as a goal, reusing the preview-locked look) plus a calm "Tended by N days of practice"
// meter that fills toward the next stage's Tending threshold. Read-only — it never buys; the
// stage advances on its own as the user practices. ADR / docs/design/sanctuary-upgrades-tended.md.
function SanctuaryTendingPath({ tending }: { tending: TendingStatus }) {
  const currentIndex = tending.stage ? TENDING_PATH.indexOf(tending.stage as (typeof TENDING_PATH)[number]) : -1
  const atTop = tending.next_stage == null
  return (
    <div className="sanctuary-tending" aria-label="Tended by your practice">
      <div className="sanctuary-tending-head">
        <span className="sanctuary-tending-title">🌿 Tended by your practice</span>
        <span className="muted sanctuary-tending-days">
          {tending.practice_days} {tending.practice_days === 1 ? 'day' : 'days'} of practice
        </span>
      </div>
      {/* The growth ladder as a ribbon: each stage a pip, the current one lit, the next a goal. */}
      <ol className="sanctuary-tending-ribbon">
        {TENDING_PATH.map((stage, i) => {
          const reached = i <= currentIndex
          const isNext = stage === tending.next_stage
          return (
            <li
              key={stage}
              className={`sanctuary-tending-pip${reached ? ' reached' : ''}${isNext ? ' next' : ''}`}
              aria-current={i === currentIndex ? 'step' : undefined}
              title={optionLabel(stage)}
            >
              <span className="sanctuary-tending-dot" aria-hidden="true" />
              <span className="sanctuary-tending-label">{optionLabel(stage)}</span>
            </li>
          )
        })}
      </ol>
      <p className="muted sanctuary-tending-hint" aria-live="polite">
        {atTop
          ? 'Fully grown — tended all the way. Thank you for showing up. 🌳'
          : tending.next_threshold != null
            ? `Keep practicing — ${optionLabel(tending.next_stage as string)} grows in as your tending reaches ${tending.next_threshold} (now ${tending.tending}).`
            : 'Keep practicing — your oak grows as you do.'}
      </p>
    </div>
  )
}

// The live "try before you buy" preview at the head of the customize panel: a single
// <SanctuaryPlant> that re-renders as the user hovers or keyboard-focuses an unbought option.
// It draws the item's *current* variant + customizations with the explored option merged in
// ({ ...current, [slot]: option }); with nothing explored it shows the item exactly as it is
// today. View-only — it never buys or PATCHes (the real purchase still happens on the option
// buttons below), and the "Preview" badge makes clear the look isn't owned yet.
function SanctuaryUpgradePreview({ item, preview }: { item: OwnedItem; preview: PreviewTarget }) {
  // Merge the explored option into the item's current look. Generic: any slot → its option.
  const customizations = preview
    ? { ...item.customizations, [preview.slot]: preview.option }
    : item.customizations
  const exploring = preview != null
  return (
    <div className="sanctuary-preview">
      <div className={`sanctuary-preview-stage${exploring ? ' exploring' : ''}`}>
        <SanctuaryPlant
          itemKey={item.item_key}
          variant={item.variant}
          customizations={customizations}
        />
        {exploring && <span className="sanctuary-preview-badge">Preview</span>}
      </div>
      <p className="muted sanctuary-preview-caption" aria-live="polite">
        {exploring
          ? `Preview · ${optionLabel(preview!.option)} (not yet owned)`
          : 'Hover or focus an add-on below to preview it here.'}
      </p>
    </div>
  )
}

// A calm name/note/favourite editor inside an owned item's personalize panel (ADR-0015).
// Local input state, committed on blur / explicit save so a rename is one quiet action.
// All optional and default-off — a user who ignores it sees nothing change.
function SanctuaryNameNote({
  item,
  busy,
  suggestions,
  onSave,
}: {
  item: OwnedItem
  busy: boolean
  // The item type's pool of charming example names (ADR-0015): a placeholder hint + a 🎲
  // shuffle to fill the field. Optional suggestion only — never auto-applied.
  suggestions: string[]
  onSave: (item: OwnedItem, patch: PersonalizePatch, okMessage?: string) => void
}) {
  const [name, setName] = useState(item.name ?? '')
  const [note, setNote] = useState(item.note ?? '')

  // Commit a text field only when it actually changed, sending null to clear it.
  const commitName = () => {
    const next = name.trim()
    if (next === (item.name ?? '')) return
    onSave(item, { name: next || null }, next ? 'Name saved.' : 'Name cleared.')
  }
  const commitNote = () => {
    const next = note.trim()
    if (next === (item.note ?? '')) return
    onSave(item, { note: next || null }, next ? 'Note saved.' : 'Note cleared.')
  }

  return (
    <div className="sanctuary-personal">
      <label className="sanctuary-field">
        <span>Name</span>
        <div className="sanctuary-name-input-row">
          <input
            type="text"
            value={name}
            maxLength={NAME_MAX}
            placeholder={
              suggestions[0] ? `e.g. ${suggestions[0]}` : 'Give it a name (optional)'
            }
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          {suggestions.length > 0 && (
            <button
              type="button"
              className="sanctuary-suggest-name"
              disabled={busy}
              title="Suggest a name"
              aria-label="Suggest a name"
              onClick={() => {
                const next = pickSuggestedName(suggestions, name.trim())
                if (next) setName(next)
              }}
            >
              🎲
            </button>
          )}
        </div>
      </label>
      <label className="sanctuary-field">
        <span>Note</span>
        <input
          type="text"
          value={note}
          maxLength={NOTE_MAX}
          placeholder="A short note (optional)"
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      <button
        type="button"
        className={`sanctuary-fav-toggle${item.favorite ? ' on' : ''}`}
        aria-pressed={item.favorite}
        disabled={busy}
        onClick={() =>
          onSave(
            item,
            { favorite: !item.favorite },
            item.favorite ? 'Unfavourited.' : 'Favourited. ★',
          )
        }
      >
        {item.favorite ? '★ Favourite' : '☆ Mark favourite'}
      </button>
    </div>
  )
}

export default function SanctuaryPage() {
  const { showToast } = useToast()
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  // The shop item whose buy modal is open (null = none). For multi-variant items the modal
  // lets the user pick a variant; for single-variant items it's a simple buy confirmation.
  // Naming is no longer offered at purchase — it's an owned-item action (ADR-0015).
  const [picking, setPicking] = useState<ShopItem | null>(null)
  // The owned item whose customization panel is open.
  const [editing, setEditing] = useState<string | null>(null)
  // The unbought option the user is currently hovering/keyboard-focusing in the open panel, so
  // the panel's preview can show what the item would look like with it applied — before any
  // coins are spent. `null` = nothing explored → the preview shows the item as it is now.
  const [preview, setPreview] = useState<PreviewTarget>(null)
  // The owned item whose "reset upgrades" confirmation is showing (null = none). A two-step
  // inline confirm that states the fee, so a reset is deliberate and never a surprise charge.
  const [confirmReset, setConfirmReset] = useState<string | null>(null)
  // The id of the item just bought, so only it pops/glows into the garden (cleared
  // after the brief animation so it doesn't re-fire on later renders).
  const [justBought, setJustBought] = useState<string | null>(null)
  // Drag-to-move (desktop): the id of the item currently being dragged.
  const [dragging, setDragging] = useState<string | null>(null)
  // Tap-to-move (touch/keyboard fallback): the id of the item picked up, awaiting a
  // target cell tap. Desktop dragging works too; this keeps moving usable on touch.
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let ignore = false
    sanctuaryService
      .getScene()
      .then((s) => { if (!ignore) setScene(s) })
      .catch(() => { if (!ignore) setError(true) })
    return () => { ignore = true }
  }, [])

  function retryLoad() {
    setRetrying(true)
    setError(false)
    sanctuaryService
      .getScene()
      .then((s) => setScene(s))
      .catch(() => setError(true))
      .finally(() => setRetrying(false))
  }

  // Clear the just-bought marker once its pop/glow has played, so the animation
  // fires only on the new item and never replays on later renders.
  useEffect(() => {
    if (justBought == null) return
    const t = setTimeout(() => setJustBought(null), 900)
    return () => clearTimeout(t)
  }, [justBought])

  async function buy(key: string, variant: string | null) {
    setBusy(`buy:${key}`)
    // Snapshot before the buy so we can compute what was spent and spot the new item.
    const before = scene
    const beforeIds = new Set(before?.owned.map((o) => o.id) ?? [])
    try {
      // Items are bought unnamed; naming happens once owned (ADR-0015), so no name is sent.
      const next = await sanctuaryService.buy(key, variant, null)
      setScene(next)
      setPicking(null)

      // The newly added item is the one whose id wasn't owned before (fall back to the
      // highest position if ids can't be diffed — e.g. a missing prior scene).
      const added =
        next.owned.find((o) => !beforeIds.has(o.id)) ??
        next.owned.reduce<OwnedItem | null>(
          (best, o) => (best == null || o.position > best.position ? o : best),
          null,
        )
      if (added) setJustBought(added.id)

      // Gentle audio cue (honours the user's sound setting via the shared sfx module).
      playReward()

      // Rich feedback: what it is, what it cost, what's left. Items are bought unnamed
      // (naming is an owned-item action, ADR-0015), so the variant/item label leads.
      const name = variant
        ? `${variantLabel(variant)} ${itemLabel(key).toLowerCase()}`
        : itemLabel(key)
      const spent = before ? before.coins - next.coins : null
      const detail =
        spent != null ? ` · ${spent} 🪙 spent, ${next.coins} left` : ` · ${next.coins} 🪙 left`
      showToast(`${name} added${detail}`)
    } catch {
      showToast('Could not buy that — earn more coins by practicing.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function customize(item: OwnedItem, slot: string, option: string) {
    setBusy(`cust:${item.id}:${slot}`)
    try {
      setScene(await sanctuaryService.customize(item.id, slot, option))
      showToast(
        `Added ${optionLabel(option).toLowerCase()} to your ${itemLabel(item.item_key).toLowerCase()}. ✨`,
      )
    } catch {
      showToast('Could not apply that yet.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Reset an owned item's upgrades for the flat fee. Clears its customizations back to the
  // base form; the sunk cost is refunded (minus the fee). Disabled while in-flight so a
  // double-tap can't double-charge; the inline confirm is dismissed on success or failure.
  async function resetUpgrades(item: OwnedItem) {
    const before = scene
    setBusy(`reset:${item.id}`)
    try {
      const next = await sanctuaryService.resetUpgrades(item.id)
      setScene(next)
      setConfirmReset(null)
      const refunded = before ? next.coins - before.coins : null
      const detail =
        refunded != null && refunded >= 0 ? ` ${refunded} 🪙 back.` : ` ${next.coins} 🪙 left.`
      showToast(`Upgrades cleared from your ${itemLabel(item.item_key).toLowerCase()}.${detail}`)
    } catch {
      showToast('Could not reset that — please try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // Set/clear an owned item's cosmetic personalization (name, note, favourite). Purely
  // cosmetic — never costs coins. Partial: only the given fields change.
  async function personalize(item: OwnedItem, patch: PersonalizePatch, okMessage?: string) {
    setBusy(`personalize:${item.id}`)
    try {
      setScene(await sanctuaryService.personalize(item.id, patch))
      if (okMessage) showToast(okMessage)
    } catch {
      showToast('Could not save that — please try again.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // The pool of example names for an item type (ADR-0015), looked up from the shop entry
  // in the current scene (the shop carries every catalog item's `suggested_names`). Used to
  // offer a naming suggestion when renaming an owned item; [] if the item isn't found.
  function suggestionsFor(itemKey: string): string[] {
    return scene?.shop.find((s) => s.item_key === itemKey)?.suggested_names ?? []
  }

  // Move an owned item to a grid cell. Optimistically reorders locally (swapping with any
  // item already in the target cell), calls the move endpoint, and reverts on failure.
  async function moveItem(id: string, cell: number) {
    setSelected(null)
    setDragging(null)
    if (!scene) return
    const item = scene.owned.find((o) => o.id === id)
    if (!item || item.cell === cell) return

    const prev = scene
    const occupant = scene.owned.find((o) => o.cell === cell && o.id !== id)
    const optimistic: Scene = {
      ...scene,
      owned: scene.owned
        .map((o) => {
          if (o.id === id) return { ...o, cell }
          if (occupant && o.id === occupant.id) return { ...o, cell: item.cell }
          return o
        })
        .sort((a, b) => a.cell - b.cell),
    }
    setScene(optimistic)
    setBusy(`move:${id}`)
    try {
      setScene(await sanctuaryService.move(id, cell))
    } catch {
      setScene(prev) // revert the optimistic reorder
      showToast('Could not move that item.', 'error')
    } finally {
      setBusy(null)
    }
  }

  // A gentle, render-time time-of-day band, used only to tint the garden scene's ambient
  // light (a `data-daytime` hook the CSS reads). Cosmetic — it touches no data or economy.
  const daytime = timeOfDay()

  return (
    <main id="main-content" className="dashboard sanctuary-page">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>Sanctuary</h1>
        <p className="page-subtitle">
          Earn coins as you practice, then gather a quiet little world — plants, friends,
          and a few delightful curios — and make it your own.
        </p>
      </header>

      {!scene && !error && <Loading />}
      <RetryableError
        message={error ? 'Could not load your sanctuary.' : null}
        onRetry={retryLoad}
        retrying={retrying}
      />

      {scene && (
        <>
          <div className="sanctuary-wallet">
            <span className="sanctuary-coins">🪙 {scene.coins}</span>
            <span className="muted">
              Level {scene.level} · {VITALITY[scene.vitality].emoji}{' '}
              {VITALITY[scene.vitality].label}
            </span>
          </div>

          <section
            className="sanctuary-section sanctuary-garden-section"
            data-daytime={daytime}
          >
            <header className="sanctuary-section-head">
              <h2 className="sanctuary-section-title">Your garden</h2>
              {/* A warm, quiet line of place — shifts softly with the time of day, so the
                  garden feels like the user's own little world rather than a grid of cards. */}
              <p className="muted sanctuary-section-subtitle">{gardenGreeting(daytime)}</p>
            </header>
          {scene.owned.length === 0 ? (
            <EmptyState>
              A quiet, empty patch — for now. Pick your first little friend from the shop
              below and watch your garden begin.
            </EmptyState>
          ) : (
            (() => {
              // Lay items out on a row-major grid by `cell`. Show every occupied cell plus a
              // trailing empty row so there's always somewhere to drop into a new spot.
              const byCell = new Map<number, OwnedItem>()
              for (const o of scene.owned) byCell.set(o.cell, o)
              const maxCell = Math.max(...scene.owned.map((o) => o.cell))
              const rows = Math.floor(maxCell / GRID_COLUMNS) + 2 // occupied rows + one spare
              const cellCount = rows * GRID_COLUMNS

              const selectedItem = selected ? scene.owned.find((o) => o.id === selected) : null

              return (
                <>
                  <p className="muted sanctuary-move-hint" aria-live="polite">
                    {selectedItem
                      ? `Picked up ${itemLabel(selectedItem.item_key)}. Now tap a spot to place it (or tap it again to cancel).`
                      : 'Drag an item — or tap to pick it up, then tap a spot — to rearrange your garden.'}
                  </p>
                  {/* The garden scene: a soft sky→earth backdrop with a grass/soil ground
                      band, so the plants sit *in* a calm little garden rather than in a grid
                      of boxes. Purely decorative wrapper — the interactive grid is unchanged. */}
                  <div className="sanctuary-garden-scene">
                    <div className="sanctuary-ground" aria-hidden="true" />
                    <div
                      className="sanctuary-garden-grid"
                      style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)` }}
                    >
                    {Array.from({ length: cellCount }, (_, cell) => {
                      const o = byCell.get(cell)
                      if (!o) {
                        return (
                          <button
                            key={`empty-${cell}`}
                            type="button"
                            className={`sanctuary-cell empty${selected ? ' droppable' : ''}`}
                            aria-label={`Empty spot ${cell + 1}`}
                            disabled={busy != null && busy.startsWith('move')}
                            onClick={() => selected && moveItem(selected, cell)}
                            onDragOver={(e) => {
                              if (dragging) e.preventDefault()
                            }}
                            onDrop={() => dragging && moveItem(dragging, cell)}
                          />
                        )
                      }
                      const customCount = Object.keys(o.customizations).length
                      const open = editing === o.id
                      const fresh = justBought === o.id
                      const picked = selected === o.id
                      // Dragging is disabled while a card's customization panel is open, so
                      // dragging and editing never fight for the same pointer gestures.
                      const canDrag = !open
                      return (
                        <div
                          key={o.id}
                          className={`sanctuary-cell sanctuary-card${fresh ? ' just-bought' : ''}${
                            picked ? ' picked' : ''
                          }${dragging === o.id ? ' dragging' : ''}`}
                          draggable={canDrag}
                          onDragStart={() => canDrag && setDragging(o.id)}
                          onDragEnd={() => setDragging(null)}
                          onDragOver={(e) => {
                            if (dragging && dragging !== o.id) e.preventDefault()
                          }}
                          onDrop={() => dragging && dragging !== o.id && moveItem(dragging, o.cell)}
                        >
                          <button
                            type="button"
                            className="sanctuary-grab"
                            aria-label={
                              picked
                                ? `Cancel moving ${itemLabel(o.item_key)}`
                                : `Move ${itemLabel(o.item_key)}`
                            }
                            aria-pressed={picked}
                            title="Move"
                            onClick={() => {
                              if (selected && selected !== o.id) moveItem(selected, o.cell)
                              else setSelected(picked ? null : o.id)
                            }}
                          >
                            <SanctuaryPlant
                              itemKey={o.item_key}
                              variant={o.variant}
                              customizations={o.customizations}
                            />
                          </button>
                          <div className="sanctuary-card-name">
                            {o.favorite && (
                              <span className="sanctuary-fav-star" aria-label="Favourite" title="Favourite">
                                ★{' '}
                              </span>
                            )}
                            {o.name ? (
                              // The user's own plaque takes the lead; the item/variant is a
                              // quiet subtitle so the personal name reads first.
                              <span className="sanctuary-plaque">{o.name}</span>
                            ) : (
                              <>
                                {itemLabel(o.item_key)}
                                {o.variant && (
                                  <span className="muted sanctuary-variant">
                                    {' '}
                                    · {variantLabel(o.variant)}
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                          {o.name && (
                            <div className="muted sanctuary-card-sub">
                              {itemLabel(o.item_key)}
                              {o.variant && ` · ${variantLabel(o.variant)}`}
                            </div>
                          )}
                          {o.note && <p className="muted sanctuary-card-note">{o.note}</p>}
                          <button
                            type="button"
                            className="sanctuary-buy sanctuary-customize-toggle"
                            aria-expanded={open}
                            onClick={() => {
                              if (open) setConfirmReset(null) // closing → drop any pending confirm
                              setPreview(null) // opening/closing → reset the preview to "as-is"
                              setEditing(open ? null : o.id)
                            }}
                          >
                            {open
                              ? 'Done'
                              : customCount > 0
                                ? `Personalize (${customCount})`
                                : 'Personalize'}
                          </button>
                          {open && (
                            <div className="sanctuary-customize-panel">
                              {/* "Tended" growth-from-practice (oak-only MVP): a path ribbon +
                                  a "Tended by N days" meter. Present only on Tended items; the
                                  stage advances for free as the user practices (no buy here). */}
                              {o.tending && <SanctuaryTendingPath tending={o.tending} />}
                              {/* See-it-before-you-buy preview: shows the item with whatever
                                  unbought option is hovered/focused below merged in. View-only;
                                  the actual purchase still happens on the option buttons. */}
                              {o.available.length > 0 && (
                                <SanctuaryUpgradePreview item={o} preview={preview} />
                              )}
                              <SanctuaryNameNote
                                item={o}
                                busy={busy != null}
                                suggestions={suggestionsFor(o.item_key)}
                                onSave={personalize}
                              />
                              {o.available.length === 0 && (
                                <p className="muted sanctuary-maxed">No add-ons for this one.</p>
                              )}
                              {o.available.map((s) => (
                                <fieldset key={s.slot} className="sanctuary-slot">
                                  <legend>{slotLabel(s.slot)}</legend>
                                  <div className="sanctuary-slot-options">
                                    {s.options.map((opt) => {
                                      // A LOCKED (level-gated) or UNAFFORDABLE option stays
                                      // *gated* — its buy is blocked — but is rendered NOT
                                      // `disabled`, so it still emits hover/focus and can be
                                      // PREVIEWED. The user can see what they're working toward
                                      // (e.g. an evolved form they haven't reached) before
                                      // earning it. Only an already-applied option, or an
                                      // in-flight write, fully disables the button (nothing to
                                      // preview / no double-charge). ADR-0021.
                                      // A `grown` rung REACHED via practice (Tended oak): the
                                      // Tending-earned stage already displays it, so it's not a
                                      // purchase — render it like a done rung (✓ reached), never
                                      // a buy button. Treated like `applied` for disabling and
                                      // styling so a user can't full-price-buy a rung practice
                                      // already grants. See sanctuary-upgrades-tended.md.
                                      const reached = Boolean(opt.reached) && !opt.applied
                                      const done = opt.applied || reached
                                      const gated = !opt.unlocked || !opt.affordable
                                      const hardDisabled = busy != null || done
                                      // Every not-yet-owned/not-yet-reached option previews
                                      // (including gated ones) — on hover AND keyboard focus, so
                                      // the preview shows the goal look without spending a coin. A
                                      // reached rung is already on the item, so nothing to preview.
                                      const canPreview = !done
                                      const showPreview = () =>
                                        canPreview && setPreview({ slot: s.slot, option: opt.option })
                                      const clearPreview = () => setPreview(null)
                                      // The click still buys only when the option is actually
                                      // applicable; a gated/reached click is a no-op (a reached
                                      // rung has no coin path — practice drives it), so it can
                                      // never purchase.
                                      const buyable =
                                        !done && opt.unlocked && opt.affordable
                                      return (
                                        <button
                                          key={opt.option}
                                          type="button"
                                          className={`sanctuary-option${done ? ' applied' : ''}${
                                            reached ? ' reached' : ''
                                          }${gated && !done ? ' gated' : ''}`}
                                          disabled={hardDisabled}
                                          aria-disabled={(gated && !done) || undefined}
                                          title={
                                            reached
                                              ? 'Grown by your practice'
                                              : !opt.unlocked
                                                ? (opt.unlock_hint ?? 'Locked')
                                                : !opt.affordable
                                                  ? 'Earn more coins'
                                                  : undefined
                                          }
                                          onMouseEnter={showPreview}
                                          onMouseLeave={clearPreview}
                                          onFocus={showPreview}
                                          onBlur={clearPreview}
                                          onClick={() => buyable && customize(o, s.slot, opt.option)}
                                        >
                                          {opt.applied
                                            ? `✓ ${optionLabel(opt.option)}`
                                            : reached
                                              ? `✓ ${optionLabel(opt.option)} · grown`
                                              : !opt.unlocked
                                                ? `🔒 ${optionLabel(opt.option)}`
                                                : !opt.affordable
                                                  ? `🪙 ${opt.cost} (earn more)`
                                                  : `${optionLabel(opt.option)} · 🪙 ${opt.cost}`}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </fieldset>
                              ))}
                              {/* Reset upgrades for a flat fee (ADR-0019). Only offered when
                                  there's something to clear; a two-step inline confirm states
                                  the fee and that it clears this item's upgrades. */}
                              {customCount > 0 && (
                                <div className="sanctuary-reset">
                                  {confirmReset === o.id ? (
                                    <div className="sanctuary-reset-confirm" role="group">
                                      <p className="muted sanctuary-reset-note">
                                        Clear this {itemLabel(o.item_key).toLowerCase()}’s
                                        upgrades back to its base form? You’ll get your coins
                                        back, less a {RESET_FEE} 🪙 fee. Its name and form stay.
                                      </p>
                                      <div className="sanctuary-reset-actions">
                                        <button
                                          type="button"
                                          className="sanctuary-reset-do"
                                          disabled={busy != null}
                                          onClick={() => resetUpgrades(o)}
                                        >
                                          {busy === `reset:${o.id}`
                                            ? 'Resetting…'
                                            : `Reset · −${RESET_FEE} 🪙`}
                                        </button>
                                        <button
                                          type="button"
                                          className="sanctuary-reset-cancel"
                                          disabled={busy === `reset:${o.id}`}
                                          onClick={() => setConfirmReset(null)}
                                        >
                                          Keep them
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="sanctuary-reset-toggle"
                                      disabled={busy != null}
                                      onClick={() => setConfirmReset(o.id)}
                                    >
                                      Reset upgrades…
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    </div>
                  </div>
                </>
              )
            })()
          )}
          </section>

          {/* A calm divider band so the garden (above) and the shop (below) read as two
              distinct spaces rather than one long stack. */}
          <div className="sanctuary-section-divider" role="presentation" />

          <section className="sanctuary-section sanctuary-shop-section">
            <header className="sanctuary-section-head">
              <h2 className="sanctuary-section-title">Shop</h2>
              <p className="muted sanctuary-section-subtitle">Spend coins to add more</p>
            </header>
          {/* Group shop items by track, preserving within-track order from the catalog. */}
          {(() => {
            // Collect tracks in the order they first appear (catalog order → stable groups).
            const trackOrder: string[] = []
            const byTrack: Record<string, typeof scene.shop> = {}
            for (const s of scene.shop) {
              if (!byTrack[s.track]) {
                trackOrder.push(s.track)
                byTrack[s.track] = []
              }
              byTrack[s.track].push(s)
            }
            return trackOrder.map((track) => {
              const meta = TRACK_META[track]
              const label = meta ? `${meta.emoji} ${meta.label}` : track
              const accent = meta?.accent ?? '#6b7280'
              return (
                <section key={track} className="sanctuary-track-section">
                  <h3
                    className="sanctuary-track-header"
                    style={{ '--track-accent': accent } as React.CSSProperties}
                  >
                    {label}
                  </h3>
                  <div className="sanctuary-grid">
                    {byTrack[track].map((s) => {
                      const affordable = scene.coins >= s.cost
                      return (
                        <div
                          key={s.item_key}
                          className={`sanctuary-card${s.unlocked ? '' : ' locked'}`}
                          title={s.blurb || undefined}
                        >
                          <SanctuaryPlant itemKey={s.item_key} variant={s.variants[0]?.variant ?? null} />
                          <div className="sanctuary-card-name">{itemLabel(s.item_key)}</div>
                          {/* A quiet line of character (ADR-0016) — a small smile, never shouty. */}
                          {s.blurb && <p className="muted sanctuary-card-blurb">{s.blurb}</p>}
                          {s.unlocked ? (
                            s.variants.length > 1 ? (
                              <button
                                type="button"
                                className="sanctuary-buy"
                                disabled={busy != null || !affordable}
                                onClick={() => setPicking(s)}
                              >
                                Choose · 🪙 {s.cost}
                              </button>
                            ) : (
                              // One-tap buy. Naming happens once owned, in the item's
                              // personalize panel (ADR-0015), so the shop stays uncluttered.
                              <button
                                type="button"
                                className="sanctuary-buy"
                                disabled={busy != null || !affordable}
                                onClick={() => buy(s.item_key, null)}
                              >
                                {busy === `buy:${s.item_key}` ? 'Adding…' : `Buy · 🪙 ${s.cost}`}
                              </button>
                            )
                          ) : (
                            <span className="muted sanctuary-locked-hint">🔒 {s.hint}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })
          })()}
          </section>
        </>
      )}

      {picking && scene && (() => {
        // The modal serves both buy paths: multi-variant items show the variant grid (a pick
        // buys immediately); single-variant items show a simple buy confirmation. Naming is
        // not offered here — it's an owned-item action (the personalize panel), per ADR-0015.
        const hasVariants = picking.variants.length > 1
        const closeModal = () => setPicking(null)
        return (
          <Modal
            ariaLabel={`Buy a ${itemLabel(picking.item_key)}`}
            cardClassName="sanctuary-modal"
            onClose={closeModal}
            closeOnBackdrop
          >
              <h3>
                {hasVariants ? 'Choose a' : 'Add a'}{' '}
                {itemLabel(picking.item_key).toLowerCase()}
                {hasVariants ? '' : '?'}
              </h3>
              {hasVariants ? (
                <div className="sanctuary-variant-grid">
                  {picking.variants.map((v) => {
                    const tooPoor = scene.coins < picking.cost + v.cost_delta
                    return (
                      <button
                        key={v.variant}
                        type="button"
                        className="sanctuary-variant-pick"
                        disabled={busy != null || !v.unlocked || tooPoor}
                        title={!v.unlocked ? (v.unlock_hint ?? 'Locked') : undefined}
                        onClick={() => buy(picking.item_key, v.variant)}
                      >
                        <SanctuaryPlant itemKey={picking.item_key} variant={v.variant} />
                        <span className="sanctuary-variant-name">
                          {!v.unlocked ? '🔒 ' : ''}
                          {variantLabel(v.variant)}
                          {v.cost_delta > 0 && <span className="muted"> +{v.cost_delta}</span>}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <button
                  type="button"
                  className="sanctuary-buy sanctuary-modal-buy"
                  disabled={busy != null || scene.coins < picking.cost}
                  onClick={() => buy(picking.item_key, null)}
                >
                  {busy === `buy:${picking.item_key}` ? 'Adding…' : `Buy · 🪙 ${picking.cost}`}
                </button>
              )}
              <button
                type="button"
                className="sanctuary-modal-cancel"
                onClick={closeModal}
              >
                Cancel
              </button>
          </Modal>
        )
      })()}
    </main>
  )
}
