import { useEffect, useState } from 'react'
import { sanctuaryService } from '../services/sanctuary'
import { itemLabel } from '../lib/sanctuaryArt'
import type { DashboardStats, SanctuaryScene, ShopItem } from '../types'

// The next thing your level will unlock: the locked shop item with the lowest level
// requirement (parsed from its "Reach level N" hint).
function nextUnlock(shop: ShopItem[]): ShopItem | null {
  const locked = shop.filter((s) => !s.unlocked)
  if (locked.length === 0) return null
  const levelOf = (s: ShopItem) => Number(s.hint?.match(/\d+/)?.[0] ?? Infinity)
  return locked.reduce((best, s) => (levelOf(s) < levelOf(best) ? s : best))
}

// Your level is the coin/unlock track — not a thing you grow. It shows the level, the
// coins it has earned you to spend in the sanctuary, and what the next level unlocks.
export default function LevelCard({ stats }: { stats: DashboardStats }) {
  const pct = Math.min(100, Math.round((stats.xp_into_level / stats.xp_for_next_level) * 100))
  const [scene, setScene] = useState<SanctuaryScene | null>(null)

  // Coins + next unlock come from the sanctuary; non-critical to the card, so fail quietly.
  useEffect(() => {
    sanctuaryService
      .getScene()
      .then(setScene)
      .catch(() => {})
  }, [])

  const unlock = scene ? nextUnlock(scene.shop) : null

  return (
    <section className="level-card">
      <div className="level-badge" aria-hidden="true">
        <span className="level-badge-mark">◆</span>
        <span className="level-badge-num">{stats.level}</span>
      </div>
      <div className="level-meta">
        <div className="level-title">
          <span>Level {stats.level}</span>
          {scene && <span className="level-coins">🪙 {scene.coins} coins</span>}
        </div>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="xp-text">
          {stats.xp_into_level} / {stats.xp_for_next_level} XP to level {stats.level + 1} ·{' '}
          {stats.xp} total
        </div>
        {unlock && (
          <div className="level-unlock muted">
            Next unlock: {itemLabel(unlock.item_key)} · {unlock.hint}
          </div>
        )}
      </div>
    </section>
  )
}
