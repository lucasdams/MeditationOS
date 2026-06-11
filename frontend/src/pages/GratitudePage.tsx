import { useEffect, useState } from 'react'
import { gratitudeService } from '../services/gratitude'
import { dashboardService } from '../services/dashboard'
import { newlyCompletedQuests } from '../lib/quests'
import RewardOverlay from '../components/RewardOverlay'
import type { Gratitude, GratitudeCategory } from '../types'

const CATEGORIES: { key: GratitudeCategory; label: string; emoji: string }[] = [
  { key: 'custom', label: 'Custom', emoji: '✏️' },
  { key: 'people', label: 'People', emoji: '🧡' },
  { key: 'health', label: 'Health', emoji: '🌿' },
  { key: 'nature', label: 'Nature', emoji: '🌅' },
  { key: 'experiences', label: 'Experiences', emoji: '✨' },
  { key: 'growth', label: 'Growth', emoji: '🌱' },
  { key: 'home', label: 'Home', emoji: '🏡' },
  { key: 'self', label: 'Yourself', emoji: '💪' },
  { key: 'simple_pleasures', label: 'Simple pleasures', emoji: '☕' },
  { key: 'small_moments', label: 'Small moments', emoji: '🍃' },
  { key: 'big_moments', label: 'Big moments', emoji: '🎉' },
  { key: 'spiritual', label: 'Spiritual', emoji: '🕊️' },
  { key: 'material', label: 'Things I have', emoji: '🎁' },
  { key: 'work', label: 'Work', emoji: '💼' },
  { key: 'food', label: 'Food', emoji: '🍽️' },
  { key: 'learning', label: 'Learning', emoji: '📚' },
  { key: 'creativity', label: 'Creativity', emoji: '🎨' },
  { key: 'kindness', label: 'Kindness', emoji: '🤝' },
  { key: 'music', label: 'Music', emoji: '🎵' },
  { key: 'animals', label: 'Animals', emoji: '🐾' },
  { key: 'travel', label: 'Travel', emoji: '✈️' },
  { key: 'friendship', label: 'Friendship', emoji: '👯' },
  { key: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { key: 'love', label: 'Love', emoji: '❤️' },
  { key: 'play', label: 'Play & fun', emoji: '🎲' },
  { key: 'memories', label: 'Memories', emoji: '📷' },
  { key: 'hope', label: 'Hope', emoji: '🌈' },
  { key: 'body', label: 'The body', emoji: '🧘' },
  { key: 'mind', label: 'The mind', emoji: '🧠' },
  { key: 'mornings', label: 'Mornings', emoji: '🌄' },
  { key: 'evenings', label: 'Evenings', emoji: '🌙' },
  { key: 'weather', label: 'Weather', emoji: '☀️' },
  { key: 'comfort', label: 'Comfort', emoji: '🛋️' },
  { key: 'freedom', label: 'Freedom', emoji: '🗽' },
  { key: 'abundance', label: 'Abundance', emoji: '🌾' },
  { key: 'community', label: 'Community', emoji: '🏘️' },
  { key: 'beauty', label: 'Beauty', emoji: '🌸' },
]
const LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label]),
)

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function GratitudePage() {
  const [category, setCategory] = useState<GratitudeCategory | null>(null)
  const [options, setOptions] = useState<string[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<Gratitude[] | null>(null)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    quests: string[]
  } | null>(null)

  useEffect(() => {
    gratitudeService
      .list()
      .then(setEntries)
      .catch(() => setError('Could not load your gratitude journal.'))
  }, [])

  async function fetchOptions(cat: GratitudeCategory) {
    setOptions([])
    setLoadingOptions(true)
    try {
      const res = await gratitudeService.suggestions(cat)
      setOptions(res.options)
    } catch {
      setOptions([]) // suggestions are a nicety; manual input still works
    } finally {
      setLoadingOptions(false)
    }
  }

  function pickCategory(cat: GratitudeCategory) {
    setCategory(cat)
    setText('')
    setOptions([])
    // "Custom" is write-your-own — no AI prompt suggestions.
    if (cat !== 'custom') void fetchOptions(cat)
  }

  async function save() {
    if (!category || !text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const before = await dashboardService.getStats()
      const entry = await gratitudeService.create({ category, text: text.trim() })
      setEntries((prev) => [entry, ...(prev ?? [])])
      const after = await dashboardService.getStats()
      // True gain from the server (gratitude XP + any daily-quest/streak bonus).
      setReward({
        afterXp: after.xp,
        xpGained: Math.max(0, after.xp - before.xp),
        quests: newlyCompletedQuests(before, after),
      })
      // Return to the "pick a category" state for next time.
      setCategory(null)
      setText('')
      setOptions([])
    } catch {
      setError('Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    try {
      await gratitudeService.remove(id)
      setEntries((prev) => prev?.filter((e) => e.id !== id) ?? null)
    } catch {
      setError('Could not delete that entry.')
    }
  }

  return (
    <main className="gratitude">
      <h1>Gratitude</h1>
      <p className="muted">
        What are you grateful for right now? Pick a theme for ideas, or write your own.
      </p>

      <div className="grat-categories">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`chip${category === c.key ? ' chip-active' : ''}`}
            onClick={() => pickCategory(c.key)}
          >
            <span aria-hidden="true">{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>

      {category && (
        <section className="grat-compose">
          {category !== 'custom' && (
            <>
              <div className="grat-options-head">
                <span className="muted">
                  {loadingOptions ? 'Finding ideas…' : 'Tap an idea, or write your own'}
                </span>
                <button
                  type="button"
                  className="grat-reload"
                  onClick={() => void fetchOptions(category)}
                  disabled={loadingOptions}
                >
                  ↻ New ideas
                </button>
              </div>
              {!loadingOptions && options.length > 0 && (
                <div className="grat-options">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className="chip chip-soft"
                      onClick={() => setText(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <textarea
            rows={3}
            value={text}
            placeholder={category === 'custom' ? 'Write your own…' : "I'm grateful for…"}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" onClick={save} disabled={saving || !text.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </section>
      )}

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section className="grat-journal">
        <h2>Recent</h2>
        {!entries && !error && <p className="muted">Loading…</p>}
        {entries && entries.length === 0 && (
          <p className="muted">No entries yet — your first grateful moment starts here.</p>
        )}
        {entries && entries.length > 0 && (
          <ul className="session-list">
            {entries.map((e) => (
              <li key={e.id}>
                <div>
                  <div>{e.text}</div>
                  <div className="muted">
                    {LABELS[e.category] ?? e.category} · {fmtDate(e.created_at)}
                  </div>
                </div>
                <button
                  type="button"
                  className="link-danger"
                  onClick={() => remove(e.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          questsCompleted={reward.quests}
          onClose={() => setReward(null)}
        />
      )}
    </main>
  )
}
