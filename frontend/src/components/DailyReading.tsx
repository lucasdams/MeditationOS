import { Link } from 'react-router-dom'
import { BookOpen, ArrowRight } from 'lucide-react'
import { dailyReading, readingAttribution } from '../lib/readings'
import { useT } from '../i18n'

// A calm "Daily reading" card for the home screen — one short passage that rotates each day
// (stable for the calendar day), with attribution and a gentle nudge to reflect in the journal.
// Self-contained: no props, no network; the passage set lives in lib/readings.ts.
export default function DailyReading() {
  const { t } = useT()
  const reading = dailyReading(new Date())
  return (
    <section className="daily-reading" aria-label={t('home.reading.aria')}>
      <p className="daily-reading-eyebrow">
        <BookOpen size={15} strokeWidth={1.9} aria-hidden="true" /> {t('home.reading.eyebrow')}
      </p>
      <blockquote className="daily-reading-text">{reading.text}</blockquote>
      <p className="daily-reading-cite">{t('home.reading.cite', { attribution: readingAttribution(reading) })}</p>
      <Link to="/journal" className="daily-reading-reflect">
        {t('home.reading.reflect')}
        <ArrowRight size={15} strokeWidth={2} aria-hidden="true" />
      </Link>
    </section>
  )
}
