// Display labels for Sanctuary items, variants, and customizations + garden vitality.
// Rendering itself is the procedural SVG in `components/SanctuaryPlant.tsx`; the backend
// `SANCTUARY_CATALOG` is the source of truth for which keys exist.

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
  cottage: 'Cottage',
  barn: 'Barn',
  car: 'Car',
  beach_house: 'Beach house',
  boat: 'Boat',
  bird: 'Bird',
  goldfish: 'Goldfish',
  cat: 'Cat',
  snake: 'Snake',
  fox: 'Fox',
  dog: 'Dog',
}

// Friendly names for variants (base forms) and customization slots/options. Keys that
// aren't listed fall back to a title-cased version of the raw key, so the catalog can
// grow without touching this file.
const VARIANT_LABELS: Record<string, string> = {
  oak: 'Oak',
  pine: 'Pine',
  cherry: 'Cherry',
  willow: 'Willow',
  rose: 'Rose',
  tulip: 'Tulip',
  sunflower: 'Sunflower',
  daisy: 'Daisy',
  straw: 'Straw',
  wood: 'Wood',
  cream: 'Cream',
  stone: 'Stone',
  red: 'Red',
  gray: 'Gray',
  blue: 'Blue',
  yellow: 'Yellow',
  white: 'White',
  teal: 'Teal',
  orange: 'Orange',
  black: 'Black',
  bluebird: 'Bluebird',
  robin: 'Robin',
  canary: 'Canary',
  ginger: 'Ginger',
  green: 'Green',
  amber: 'Amber',
  arctic: 'Arctic',
  corgi: 'Corgi',
  husky: 'Husky',
  shiba: 'Shiba',
  dalmatian: 'Dalmatian',
}

const SLOT_LABELS: Record<string, string> = {
  grown: 'Size',
  foliage: 'Foliage',
  swing: 'Swing',
  birdhouse: 'Birdhouse',
  bloom: 'Bloom',
  butterfly: 'Butterfly',
  lilies: 'Lilies',
  koi: 'Koi',
  bridge: 'Bridge',
  chimney_smoke: 'Chimney',
  garden: 'Garden',
  lights: 'Lights',
  accessory: 'Accessory',
}

const OPTION_LABELS: Record<string, string> = {
  grown: 'Grown',
  fruit: 'Fruit 🍎',
  blossom: 'Blossom 🌸',
  autumn: 'Autumn 🍂',
  swing: 'Swing',
  birdhouse: 'Birdhouse',
  double: 'Double bloom',
  butterfly: 'Butterfly 🦋',
  lilies: 'Lily pads',
  koi: 'Koi',
  bridge: 'Bridge',
  smoke: 'Chimney smoke',
  garden: 'Garden',
  lights: 'Lights',
  collar: 'Collar',
  bandana: 'Bandana',
  hat: 'Hat',
}

function titleCase(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function itemLabel(itemKey: string): string {
  return ITEM_LABELS[itemKey] ?? titleCase(itemKey)
}

export function variantLabel(variant: string): string {
  return VARIANT_LABELS[variant] ?? titleCase(variant)
}

export function slotLabel(slot: string): string {
  return SLOT_LABELS[slot] ?? titleCase(slot)
}

export function optionLabel(option: string): string {
  return OPTION_LABELS[option] ?? titleCase(option)
}
