// Display labels for Sanctuary items + garden vitality. Rendering itself is the
// procedural SVG in `components/SanctuaryPlant.tsx`; the backend `SANCTUARY_CATALOG`
// is the source of truth for which item_keys exist.

import type { Vitality } from '../types'

export const VITALITY: Record<Vitality, { emoji: string; label: string }> = {
  dormant: { emoji: '🍂', label: 'Dormant — practice to bring it back to life' },
  thriving: { emoji: '🌿', label: 'Thriving' },
  flourishing: { emoji: '🌸', label: 'Flourishing' },
}

const ITEM_LABELS: Record<string, string> = {
  tree: 'Tree',
  flower: 'Flower',
  pond: 'Pond',
  hut: 'Hut',
  barn: 'Barn',
  bird: 'Bird',
  fox: 'Fox',
}

export function itemLabel(itemKey: string): string {
  return ITEM_LABELS[itemKey] ?? itemKey
}
