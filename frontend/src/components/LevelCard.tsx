import type { DashboardStats } from '../types'

// Tiers ordered high → low; the tree grows as the level climbs.
const TREE_TIERS: { min: number; name: string; art: string[] }[] = [
  {
    min: 12,
    name: 'Elder tree',
    art: ['      /\\', '     /  \\', '    /    \\', '   /      \\', '  /        \\', ' /__________\\', '     ||||'],
  },
  {
    min: 8,
    name: 'Tree',
    art: ['     /\\', '    /  \\', '   /    \\', '  /      \\', ' /________\\', '    ||||'],
  },
  {
    min: 5,
    name: 'Young tree',
    art: ['    /\\', '   /  \\', '  /    \\', ' /______\\', '   ||'],
  },
  {
    min: 3,
    name: 'Sapling',
    art: ['   /\\', '  /  \\', ' /____\\', '   ||'],
  },
  {
    min: 2,
    name: 'Sprout',
    art: ['  \\|/', '   |', '   |'],
  },
  {
    min: 1,
    name: 'Seedling',
    art: ['   ,', '  (.)', '   |'],
  },
]

const tierFor = (level: number) =>
  TREE_TIERS.find((t) => level >= t.min) ?? TREE_TIERS[TREE_TIERS.length - 1]

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
