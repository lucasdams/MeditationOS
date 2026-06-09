import { tierFor } from '../lib/tree'
import type { DashboardStats } from '../types'

export default function LevelCard({ stats }: { stats: DashboardStats }) {
  const tier = tierFor(stats.level)
  const pct = Math.min(100, Math.round((stats.xp_into_level / stats.xp_for_next_level) * 100))

  return (
    <section className="level-card">
      <pre className="level-tree" aria-hidden="true">
        {tier.art.join('\n')}
      </pre>
      <div className="level-meta">
        <div className="level-title">
          Level {stats.level} · {tier.name}
        </div>
        <div className="xp-bar">
          <div className="xp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="xp-text">
          {stats.xp_into_level} / {stats.xp_for_next_level} XP to level {stats.level + 1} ·{' '}
          {stats.xp} total
        </div>
      </div>
    </section>
  )
}
