// Display labels for Sanctuary items. Rendering itself is the procedural SVG in
// `components/SanctuaryPlant.tsx`; the backend `SANCTUARY_CATALOG` is the source of
// truth for which item_keys exist.

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
