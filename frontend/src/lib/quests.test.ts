import { describe, expect, it } from 'vitest'
import { newlyCompletedQuests } from './quests'
import type { DailyQuest, DashboardStats } from '../types'

const q = (key: string, label: string, done: boolean): DailyQuest => ({ key, label, xp: 15, done })
const stats = (quests: DailyQuest[]): DashboardStats => ({ daily_quests: quests }) as DashboardStats

describe('newlyCompletedQuests', () => {
  it('returns quests that flipped from not-done to done', () => {
    const before = stats([q('gratitude', 'Write a gratitude', false), q('breathe', 'Breathe', true)])
    const after = stats([q('gratitude', 'Write a gratitude', true), q('breathe', 'Breathe', true)])
    expect(newlyCompletedQuests(before, after)).toEqual(['Write a gratitude'])
  })

  it('returns nothing when no quest newly completed', () => {
    const before = stats([q('gratitude', 'Write a gratitude', true)])
    const after = stats([q('gratitude', 'Write a gratitude', true)])
    expect(newlyCompletedQuests(before, after)).toEqual([])
  })
})
