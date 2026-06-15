import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { sanctuaryService } from '../services/sanctuary'
import { useToast } from '../context/ToastContext'
import SanctuaryPlant from '../components/SanctuaryPlant'
import { itemLabel, VITALITY } from '../lib/sanctuaryArt'
import type { SanctuaryScene as Scene } from '../types'

const stars = (n: number) => '★'.repeat(n)

export default function SanctuaryPage() {
  const { showToast } = useToast()
  const [scene, setScene] = useState<Scene | null>(null)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setScene)
      .catch(() => setError(true))
  }, [])

  async function buy(key: string) {
    setBusy(`buy:${key}`)
    try {
      setScene(await sanctuaryService.buy(key))
      showToast(`Bought a ${itemLabel(key).toLowerCase()}. 🌱`)
    } catch {
      showToast('Could not buy that — earn more coins by practicing.', 'error')
    } finally {
      setBusy(null)
    }
  }

  async function upgrade(id: string, key: string) {
    setBusy(`up:${id}`)
    try {
      setScene(await sanctuaryService.upgrade(id))
      showToast(`Upgraded your ${itemLabel(key).toLowerCase()}. ✨`)
    } catch {
      showToast('Could not upgrade that yet.', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="dashboard">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>Sanctuary</h1>
        <p className="page-subtitle">
          Earn coins as you level up, then buy and upgrade your garden.
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
            <p className="muted">Empty for now — buy your first item from the shop below.</p>
          ) : (
            <div className="sanctuary-grid">
              {scene.owned.map((o) => (
                <div key={o.id} className="sanctuary-card">
                  <SanctuaryPlant itemKey={o.item_key} tier={o.tier} />
                  <div className="sanctuary-card-name">
                    {itemLabel(o.item_key)}
                    {o.tier > 0 && <span className="sanctuary-tier"> {stars(o.tier)}</span>}
                  </div>
                  {o.next_upgrade_cost != null ? (
                    <button
                      type="button"
                      className="sanctuary-buy"
                      disabled={busy != null || scene.coins < o.next_upgrade_cost}
                      onClick={() => upgrade(o.id, o.item_key)}
                    >
                      ⬆ Upgrade · 🪙 {o.next_upgrade_cost}
                    </button>
                  ) : (
                    <span className="muted sanctuary-maxed">Max tier {stars(o.max_tier)}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          <h2 className="sanctuary-section-title">Shop</h2>
          <div className="sanctuary-grid">
            {scene.shop.map((s) => (
              <div key={s.item_key} className={`sanctuary-card${s.unlocked ? '' : ' locked'}`}>
                <SanctuaryPlant itemKey={s.item_key} tier={0} />
                <div className="sanctuary-card-name">{itemLabel(s.item_key)}</div>
                {s.unlocked ? (
                  <button
                    type="button"
                    className="sanctuary-buy"
                    disabled={busy != null || scene.coins < s.cost}
                    onClick={() => buy(s.item_key)}
                  >
                    Buy · 🪙 {s.cost}
                  </button>
                ) : (
                  <span className="muted sanctuary-locked-hint">🔒 {s.hint}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
