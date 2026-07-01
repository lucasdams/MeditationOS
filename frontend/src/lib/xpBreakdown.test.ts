import { describe, it, expect } from 'vitest'
import { Sprout } from 'lucide-react'
import { buildXpBreakdown } from './xpBreakdown'
import type { DailyQuest, DashboardStats } from '../types'

const stats = (
  xp: number,
  streak_bonus_xp: number,
  daily_quests: DailyQuest[],
): DashboardStats => ({
  total_seconds: 0,
  session_count: 0,
  current_streak_days: 0,
  longest_streak_days: 0,
  rest_day_used: false,
  xp,
  level: 1,
  xp_into_level: 0,
  xp_for_next_level: 20,
  this_week: [],
  gratitude_count: 0,
  streak_bonus_xp,
  daily_quests,
})

const q = (key: string, label: string, xp: number, done: boolean): DailyQuest => ({
  key,
  label,
  xp,
  done,
  progress: 0,
  target: 1,
})

describe('buildXpBreakdown', () => {
  // Compare on label/xp only — the optional lucide `icon` is asserted separately where it matters.
  const labels = (lines: { label: string; xp: number }[]) =>
    lines.map(({ label, xp }) => ({ label, xp }))

  it('reports only the activity when no quest completes', () => {
    const before = stats(0, 0, [q('gratitude', 'Write a gratitude', 10, false)])
    const after = stats(5, 0, [q('gratitude', 'Write a gratitude', 10, false)])
    const { lines, total } = buildXpBreakdown(before, after, 'Gratitude')
    expect(total).toBe(5)
    expect(labels(lines)).toEqual([{ label: 'Gratitude', xp: 5 }])
  })

  it('splits the activity and a newly completed quest', () => {
    const before = stats(0, 0, [q('gratitude', 'Write a gratitude', 10, false)])
    const after = stats(15, 0, [q('gratitude', 'Write a gratitude', 10, true)])
    const { lines, total } = buildXpBreakdown(before, after, 'Gratitude')
    expect(total).toBe(15)
    expect(labels(lines)).toEqual([
      { label: 'Gratitude', xp: 5 },
      { label: 'Quest: Write a gratitude', xp: 10 },
    ])
  })

  it('threads the activity icon onto the activity line', () => {
    const before = stats(0, 0, [])
    const after = stats(5, 0, [])
    const { lines } = buildXpBreakdown(before, after, 'Gratitude', Sprout)
    expect(lines[0].icon).toBe(Sprout)
  })

  it('includes a streak-bonus delta as its own line, with the Sprout icon', () => {
    const before = stats(0, 0, [])
    const after = stats(22, 10, []) // 12 activity + 10 streak
    const { lines } = buildXpBreakdown(before, after, 'Meditation')
    expect(labels(lines)).toEqual([
      { label: 'Meditation', xp: 12 },
      { label: 'Streak bonus', xp: 10 },
    ])
    expect(lines[1].icon).toBe(Sprout)
  })

  it('does not count a quest that was already done before', () => {
    const before = stats(0, 0, [q('journal', 'Write a journal entry', 20, true)])
    const after = stats(5, 0, [q('journal', 'Write a journal entry', 20, true)])
    const { lines, total } = buildXpBreakdown(before, after, 'Journal entry')
    expect(total).toBe(5)
    expect(labels(lines)).toEqual([{ label: 'Journal entry', xp: 5 }])
  })
})
