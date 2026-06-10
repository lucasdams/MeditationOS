import type { DashboardStats } from '../types'

// Labels of quests that went from not-done to done between two stats snapshots.
export function newlyCompletedQuests(before: DashboardStats, after: DashboardStats): string[] {
  return after.daily_quests
    .filter((q) => q.done && !before.daily_quests.find((b) => b.key === q.key)?.done)
    .map((q) => q.label)
}
