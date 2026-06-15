import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { useToast } from '../context/ToastContext'
import SanctuaryPlant from '../components/SanctuaryPlant'
import { itemLabel, optionLabel, slotLabel, variantLabel, VITALITY } from '../lib/sanctuaryArt'
import { playReward } from '../lib/sfx'
import type { OwnedItem, SanctuaryScene as Scene, ShopItem } from '../types'

// Grid layout width (must mirror the backend's GRID_COLUMNS). The garden lays items out
// row-major: cell = row * GRID_COLUMNS + col. One tunable constant maps cell ↔ (row, col).
const GRID_COLUMNS = 4

export default function SanctuaryPage() {
  const { showToast } = useToast()
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  // The shop item whose variant picker is open (null = none).
  const [picking, setPicking] = useState<ShopItem | null>(null)
  // The owned item whose customization panel is open.
  const [editing, setEditing] = useState<string | null>(null)
  // The id of the item just bought, so only it pops/glows into the garden (cleared
  // after the brief animation so it doesn't re-fire on later renders).
  const [justBought, setJustBought] = useState<string | null>(null)
  // Drag-to-move (desktop): the id of the item currently being dragged.
  const [dragging, setDragging] = useState<string | null>(null)
  // Tap-to-move (touch/keyboard fallback): the id of the item picked up, awaiting a
  // target cell tap. Desktop dragging works too; this keeps moving usable on touch.
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setScene)
      .catch(() => setError(true))
  }, [])

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
      const next = await sanctuaryService.buy(key, variant)
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

      // Rich feedback: what it's called, what it cost, what's left. Keep the variant
      // name in the label when one was chosen (e.g. "Oak tree added · …").
      const name = variant ? `${variantLabel(variant)} ${itemLabel(key).toLowerCase()}` : itemLabel(key)
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
    <main className="dashboard sanctuary-page">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>Sanctuary</h1>
        <p className="page-subtitle">
          Earn coins as you level up, then choose and personalize your garden.
        </p>
      </header>

      {!scene && !error && <p>Loading…</p>}
      {error && (
        <p role="alert" className="error">
          Could not load your sanctuary.
        </p>
      )}

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
            <p className="muted">Empty for now — choose your first item from the shop below.</p>
          ) : (
            (() => {
              // Lay items out on a row-major grid by `cell`. Show every occupied cell plus a
              // trailing empty row so there's always somewhere to drop into a new spot.
              const byCell = new Map<number, OwnedItem>()
              for (const o of scene.owned) byCell.set(o.cell, o)
              const maxCell = Math.max(...scene.owned.map((o) => o.cell))
              const rows = Math.floor(maxCell / GRID_COLUMNS) + 2 // occupied rows + one spare
              const cellCount = rows * GRID_COLUMNS

              return (
                <>
                  <p className="muted sanctuary-move-hint">
                    {selected
                      ? 'Now tap a spot to place it (or tap it again to cancel).'
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
                            {itemLabel(o.item_key)}
                            {o.variant && (
                              <span className="muted sanctuary-variant">
                                {' '}
                                · {variantLabel(o.variant)}
                              </span>
                            )}
                          </div>
                          {o.available.length > 0 ? (
                            <button
                              type="button"
                              className="sanctuary-buy sanctuary-customize-toggle"
                              aria-expanded={open}
                              onClick={() => setEditing(open ? null : o.id)}
                            >
                              {open
                                ? 'Done'
                                : customCount > 0
                                  ? `Personalize (${customCount})`
                                  : 'Personalize'}
                            </button>
                          ) : (
                            <span className="muted sanctuary-maxed">No add-ons</span>
                          )}
                          {open && (
                            <div className="sanctuary-customize-panel">
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
          <div className="sanctuary-grid">
            {scene.shop.map((s) => {
              const affordable = scene.coins >= s.cost
              return (
                <div key={s.item_key} className={`sanctuary-card${s.unlocked ? '' : ' locked'}`}>
                  <SanctuaryPlant itemKey={s.item_key} variant={s.variants[0]?.variant ?? null} />
                  <div className="sanctuary-card-name">{itemLabel(s.item_key)}</div>
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
        </>
      )}

      {picking && scene && (
        <div
          className="sanctuary-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Choose a ${itemLabel(picking.item_key)}`}
          onClick={() => setPicking(null)}
        >
          <div className="sanctuary-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Choose a {itemLabel(picking.item_key).toLowerCase()}</h3>
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
            <button
              type="button"
              className="sanctuary-modal-cancel"
              onClick={() => setPicking(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
