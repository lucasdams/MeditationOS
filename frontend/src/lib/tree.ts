// ASCII tree tiers — the tree grows as the level climbs. Shared by the dashboard
// LevelCard and the post-session reward overlay.

export type TreeTier = { min: number; name: string; art: string[] }

export const TREE_TIERS: TreeTier[] = [
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

export const tierFor = (level: number): TreeTier =>
  TREE_TIERS.find((t) => level >= t.min) ?? TREE_TIERS[TREE_TIERS.length - 1]
