// ASCII art per Sanctuary item, indexed by growth stage. The backend owns *growth*
// (which stage you're at); the frontend owns *rendering* (this art) — mirroring how
// the level tree's art lives in lib/tree.ts. Stage counts here must match each item's
// `stage_count` in the backend SANCTUARY_CATALOG.

type StageArt = string[]

const TREE_STAGES: StageArt[] = [
  // 0 — seed in the soil
  ['', '   .', '  (_)', ' ~~~~~'],
  // 1 — sprout
  ['', '  \\|/', '   |', ' ~~|~~'],
  // 2 — sapling
  ['   /\\', '  /__\\', '   ||', ' ~~||~~'],
  // 3 — young tree
  ['   /\\', '  /  \\', ' /____\\', '   ||', ' ~~||~~'],
  // 4 — full tree
  ['    /\\', '   /  \\', '  /    \\', ' /______\\', '    ||', ' ~~~||~~~'],
]

const FLOWER_STAGES: StageArt[] = [
  // 0 — seed
  ['', '', '   .', ' ~~~~~'],
  // 1 — shoot
  ['', '   |', '   |', ' ~~|~~'],
  // 2 — bud
  ['   o', '   |', '   |', ' ~~|~~'],
  // 3 — bloom
  ['  \\o/', '   |', '   |', ' ~~|~~'],
]

const POND_STAGES: StageArt[] = [
  // 0 — dug
  ['', '  _____', ' (     )', ' (_____)'],
  // 1 — filling
  ['', '  _____', ' (~~~~~)', ' (_____)'],
  // 2 — full, with ripples
  ['   ~  ~', ' (~~~~~)', ' (~~~~~)', ' (_____)'],
]

const ART: Record<string, StageArt[]> = {
  tree: TREE_STAGES,
  flower: FLOWER_STAGES,
  pond: POND_STAGES,
}

const FALLBACK: StageArt = ['', '   ?', '  ( )']

/** Art for an item at a given stage; clamps out-of-range stages and unknown keys. */
export function plantArt(itemKey: string, stage: number): StageArt {
  const stages = ART[itemKey]
  if (!stages || stages.length === 0) return FALLBACK
  const i = Math.max(0, Math.min(stages.length - 1, stage))
  return stages[i]
}

const ITEM_LABELS: Record<string, string> = {
  tree: 'Tree',
  flower: 'Flower',
  pond: 'Pond',
}

export function itemLabel(itemKey: string): string {
  return ITEM_LABELS[itemKey] ?? itemKey
}
