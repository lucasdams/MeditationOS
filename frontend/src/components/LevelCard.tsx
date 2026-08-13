import type { DashboardStats } from '../types'
import { useT } from '../i18n'

// Your level is the coin/unlock track — not a thing you grow. It shows the level and the XP
// progress to the next one. The spendable coin balance lives on the home top line (sourced
// from the spirit), so it isn't restated here.
export default function LevelCard({ stats }: { stats: DashboardStats }) {
  const { t } = useT()
  const pct = Math.min(100, Math.round((stats.xp_into_level / stats.xp_for_next_level) * 100))

  return (
    <section className="level-card">
      <div className="level-badge" aria-hidden="true">
        <span className="level-badge-mark">◆</span>
        <span className="level-badge-num">{stats.level}</span>
      </div>
      <div className="level-meta">
        <div className="level-title">
          <span>{t('home.level.title', { level: stats.level })}</span>
        </div>
        <div
          className="xp-bar"
          role="progressbar"
          aria-label={t('home.level.xpProgress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="xp-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="xp-text">
          {t('home.level.xpText', {
            into: stats.xp_into_level,
            forNext: stats.xp_for_next_level,
            next: stats.level + 1,
            total: stats.xp,
          })}
        </div>
      </div>
    </section>
  )
}
