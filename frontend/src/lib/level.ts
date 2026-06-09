// Mirror of the backend curve (dashboard_service._level_progress): XP = minutes.
// Cumulative XP to reach level L is 10·L·(L−1).

export interface LevelProgress {
  level: number
  xpIntoLevel: number
  xpForNextLevel: number
}

export function levelProgress(xp: number): LevelProgress {
  let level = 1
  while (10 * (level + 1) * level <= xp) level += 1
  return {
    level,
    xpIntoLevel: xp - 10 * level * (level - 1),
    xpForNextLevel: 20 * level,
  }
}
