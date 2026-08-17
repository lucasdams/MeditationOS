import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { philosopherService } from '../services/philosophers'
import { philosopherMeta } from '../lib/philosopherMeta'
import { dailyOf } from '../lib/zen'
import { useT } from '../i18n'
import type { PhilosopherSummary } from '../types'

// A quiet "reflect with a guide" card for the home page: a guide-of-the-day (stable per calendar
// day) with one reflective prompt, deep-linking straight into that guide's chat via
// /philosophers?guide=<id>. This is the philosopher feature's home-page presence — a visible way
// in, rather than living only in the nav.
//
// It's an OPTIONAL enhancement: the roster fetch is non-blocking, and an empty roster or any
// failure simply renders nothing, so the dashboard is never gated on it (matching the
// non-blocking today-minutes fetch on the philosophers page).
export default function ReflectWithGuide() {
  const { t } = useT()
  const [roster, setRoster] = useState<PhilosopherSummary[] | null>(null)

  useEffect(() => {
    let ignore = false
    philosopherService
      .list()
      .then((rows) => {
        if (!ignore) setRoster(rows)
      })
      .catch(() => {})
    return () => {
      ignore = true
    }
  }, [])

  if (!roster || roster.length === 0) return null

  // A guide-of-the-day and one of its prompts, both stable through the calendar day.
  const today = new Date()
  const guide = dailyOf(roster, today)
  const meta = philosopherMeta(guide.id)
  const Icon = meta.icon
  const prompt = guide.openers && guide.openers.length > 0 ? dailyOf(guide.openers, today) : null

  return (
    <section
      className="dashboard-guide"
      style={{
        ['--card-fill' as string]: meta.light,
        ['--card-fill-dark' as string]: meta.dark,
      }}
      aria-labelledby="dashboard-guide-heading"
    >
      <div className="dashboard-guide-head">
        <span className="dashboard-guide-icon" aria-hidden="true">
          <Icon size={18} strokeWidth={1.9} />
        </span>
        <div>
          <h2 id="dashboard-guide-heading" className="dashboard-guide-heading">
            {t('home.guide.heading')}
          </h2>
          <p className="dashboard-guide-who">
            {guide.name}
            <span className="dashboard-guide-tradition"> · {guide.tradition}</span>
          </p>
        </div>
      </div>
      {prompt && <p className="dashboard-guide-prompt">“{prompt}”</p>}
      <Link to={`/philosophers?guide=${guide.id}`} className="dashboard-guide-cta">
        {t('home.guide.cta', { name: guide.name })}
        <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
      </Link>
    </section>
  )
}
