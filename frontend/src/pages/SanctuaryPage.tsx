import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService, type PersonalizePatch } from '../services/sanctuary'
import { useToast } from '../context/ToastContext'
import SanctuaryPlant from '../components/SanctuaryPlant'
import Modal from '../components/Modal'
import { Loading, RetryableError, EmptyState } from '../components/StateViews'
import { itemLabel, optionLabel, slotLabel, variantLabel, VITALITY, TRACK_META } from '../lib/sanctuaryArt'
import { playReward } from '../lib/sfx'
import type { OwnedItem, SanctuaryScene as Scene, ShopItem } from '../types'

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
  // The shop item whose buy modal is open (null = none). The modal lets the user pick a
  // variant (multi-variant items) and/or type an optional name before buying.
  const [picking, setPicking] = useState<ShopItem | null>(null)
  // The optional name typed in the open buy modal (carried into the purchase).
  const [buyName, setBuyName] = useState('')
  // The owned item whose customization panel is open.
  const [editing, setEditing] = useState<string | null>(null)
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
    // An optional name the user typed in the buy modal (trimmed; blank → no name).
    const chosenName = buyName.trim() || null
    try {
      const next = await sanctuaryService.buy(key, variant, chosenName)
      setScene(next)
      setPicking(null)
      setBuyName('')

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

      // Rich feedback: what it's called, what it cost, what's left. Prefer the user's own
      // name when they gave one ("“Grandpa's Oak” added · …"); else the variant label.
      const name = chosenName
        ? `“${chosenName}”`
        : variant
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

          <h2 className="sanctuary-section-title">Your garden</h2>
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
                                      const cantApply =
                                        busy != null ||
                                        opt.applied ||
                                        !opt.unlocked ||
                                        !opt.affordable
                                      return (
                                        <button
                                          key={opt.option}
                                          type="button"
                                          className={`sanctuary-option${opt.applied ? ' applied' : ''}`}
                                          disabled={cantApply}
                                          title={
                                            !opt.unlocked
                                              ? (opt.unlock_hint ?? 'Locked')
                                              : !opt.affordable
                                                ? 'Earn more coins'
                                                : undefined
                                          }
                                          onClick={() => customize(o, s.slot, opt.option)}
                                        >
                                          {opt.applied
                                            ? `✓ ${optionLabel(opt.option)}`
                                            : !opt.unlocked
                                              ? `🔒 ${optionLabel(opt.option)}`
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
                </>
              )
            })()
          )}

          <h2 className="sanctuary-section-title">Shop</h2>
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
                                onClick={() => {
                                  setBuyName('')
                                  setPicking(s)
                                }}
                              >
                                Choose · 🪙 {s.cost}
                              </button>
                            ) : (
                              <div className="sanctuary-buy-row">
                                <button
                                  type="button"
                                  className="sanctuary-buy"
                                  disabled={busy != null || !affordable}
                                  onClick={() => buy(s.item_key, null)}
                                >
                                  {busy === `buy:${s.item_key}` ? 'Adding…' : `Buy · 🪙 ${s.cost}`}
                                </button>
                                {/* Quiet, optional: name it at purchase. The one-tap Buy stays the
                                    default so naming never nags. */}
                                <button
                                  type="button"
                                  className="sanctuary-name-it"
                                  disabled={busy != null || !affordable}
                                  onClick={() => {
                                    setBuyName('')
                                    setPicking(s)
                                  }}
                                >
                                  name it…
                                </button>
                              </div>
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
        </>
      )}

      {picking && scene && (() => {
        // The modal serves both buy paths: multi-variant items show the variant grid (a
        // pick buys immediately, carrying the typed name); single-variant items opened via
        // "name it…" show just the name field + a Buy button. Naming is always optional.
        const hasVariants = picking.variants.length > 1
        const closeModal = () => {
          setPicking(null)
          setBuyName('')
        }
        // The item's pool of charming example names (ADR-0015). The first is a quiet
        // placeholder hint; the 🎲 button shuffles a random one into the field. Always an
        // optional suggestion — nothing is auto-assigned, and the field starts blank.
        const suggestions = picking.suggested_names
        const placeholder = suggestions[0] ? `e.g. ${suggestions[0]}` : "e.g. Grandpa's Oak"
        return (
          <Modal
            ariaLabel={`Buy a ${itemLabel(picking.item_key)}`}
            cardClassName="sanctuary-modal"
            onClose={closeModal}
            closeOnBackdrop
          >
              <h3>
                {hasVariants ? 'Choose a' : 'Name your'}{' '}
                {itemLabel(picking.item_key).toLowerCase()}
              </h3>
              {/* Optional name (a quiet personal touch). Empty = unnamed. The placeholder
                  hints an on-character example, and 🎲 shuffles one in to try on. */}
              <label className="sanctuary-field sanctuary-modal-name">
                <span>Name (optional)</span>
                <div className="sanctuary-name-input-row">
                  <input
                    type="text"
                    value={buyName}
                    maxLength={NAME_MAX}
                    placeholder={placeholder}
                    disabled={busy != null}
                    autoFocus={!hasVariants}
                    onChange={(e) => setBuyName(e.target.value)}
                  />
                  {suggestions.length > 0 && (
                    <button
                      type="button"
                      className="sanctuary-suggest-name"
                      disabled={busy != null}
                      title="Suggest a name"
                      aria-label="Suggest a name"
                      onClick={() => {
                        const next = pickSuggestedName(suggestions, buyName.trim())
                        if (next) setBuyName(next)
                      }}
                    >
                      🎲
                    </button>
                  )}
                </div>
              </label>
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
