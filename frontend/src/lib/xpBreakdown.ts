import type { ComponentType } from 'react'
import { Sprout, type LucideProps } from 'lucide-react'
import type { DashboardStats } from '../types'

export interface XpLine {
  label: string
  xp: number
  // Optional lucide line icon shown before the label (consistent icons, no emoji). Quest
  // lines (server-labelled) carry none; the activity line's icon is passed by the caller.
  icon?: ComponentType<LucideProps>
}

/**
 * Split the XP gained between two stats snapshots into its sources, so the reward can
 * show *where the XP came from* — the activity itself, each quest that just completed,
 * and any streak bonus — instead of a single opaque total.
 *
 * `activityLabel` names the thing the user just did (e.g. "Gratitude"), and `activityIcon`
 * is its lucide line icon (rendered before the label by RewardOverlay). The activity XP is
 * the remainder after subtracting newly-completed quests and the streak-bonus change, so it
 * stays correct even as XP rules are tuned.
 */
export function buildXpBreakdown(
  before: DashboardStats,
  after: DashboardStats,
  activityLabel: string,
  activityIcon?: ComponentType<LucideProps>,
): { lines: XpLine[]; total: number } {
  const total = Math.max(0, after.xp - before.xp)

  const questLines: XpLine[] = after.daily_quests
    .filter((q) => q.done && !before.daily_quests.find((b) => b.key === q.key)?.done)
    .map((q) => ({ label: `Quest: ${q.label}`, xp: q.xp }))
  const questTotal = questLines.reduce((sum, q) => sum + q.xp, 0)

  const streakDelta = Math.max(0, after.streak_bonus_xp - before.streak_bonus_xp)
  const activityXp = Math.max(0, total - questTotal - streakDelta)

  const lines: XpLine[] = []
  if (activityXp > 0) lines.push({ label: activityLabel, xp: activityXp, icon: activityIcon })
  lines.push(...questLines)
  if (streakDelta > 0) lines.push({ label: 'Streak bonus', xp: streakDelta, icon: Sprout })
  return { lines, total }
}
