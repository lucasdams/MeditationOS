// ASCII art per Sanctuary item, indexed by growth stage. The backend owns *growth*
// (which stage you're at); the frontend owns *rendering* (this art) — mirroring how
// the level tree's art lives in lib/tree.ts. Stage counts here must match the
// catalog's `stage_count` in backend sanctuary_service.

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

const ART: Record<string, StageArt[]> = {
  tree: TREE_STAGES,
}

const FALLBACK: StageArt = ['', '   ?', '  ( )']

/** Art for an item at a given stage; clamps out-of-range stages and unknown keys. */
export function plantArt(itemKey: string, stage: number): StageArt {
  const stages = ART[itemKey]
  if (!stages || stages.length === 0) return FALLBACK
  const i = Math.max(0, Math.min(stages.length - 1, stage))
  return stages[i]
}

const STAGE_NAMES = ['Seed', 'Sprout', 'Sapling', 'Young tree', 'Elder tree']

export function stageName(itemKey: string, stage: number): string {
  if (itemKey === 'tree') return STAGE_NAMES[Math.max(0, Math.min(STAGE_NAMES.length - 1, stage))]
  return `Stage ${stage + 1}`
}
