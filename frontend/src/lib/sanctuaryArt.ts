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
  mushroom_ring: 'Toadstool ring',
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
  hedgehog: 'Hedgehog',
  snail: 'Snail',
  dog: 'Dog',
  // Whimsy — the little garden friends and curios.
  garden_gnome: 'Garden gnome',
  wind_chime: 'Wind chime',
  lantern: 'Lantern',
  frog_lily: 'Frog on a lily',
  scarecrow: 'Scarecrow',
  fairy_door: 'Fairy door',
  hammock: 'Hammock',
  tea_cart: 'Tea cart',
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
  // Toadstool ring + companions
  ruby: 'Ruby',
  violet: 'Violet',
  brown: 'Brown',
  salt: 'Salt & pepper',
  minty: 'Minty',
  rosy: 'Rosy',
  golden: 'Golden',
  // Whimsy variants
  classic: 'Classic',
  mossy: 'Mossy',
  sleepy: 'Sleepy',
  brass: 'Brass',
  bamboo: 'Bamboo',
  seaglass: 'Sea glass',
  paper: 'Paper',
  iron: 'Iron',
  patchwork: 'Patchwork',
  pumpkin: 'Pumpkin',
  acorn: 'Acorn',
  toadstool: 'Toadstool',
  rosewood: 'Rosewood',
  striped: 'Striped',
  canvas: 'Canvas',
  rainbow: 'Rainbow',
  mint: 'Mint',
  midnight: 'Midnight',
}

const SLOT_LABELS: Record<string, string> = {
  grown: 'Size',
  // Evolution fork (ADR-0021): a late-game branching choice of final form.
  form: 'Evolution',
  // New additive nature slots (ADR-0021).
  critter: 'Critter',
  pollinator: 'Pollinator',
  firefly: 'Fireflies',
  waterfowl: 'Waterfowl',
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
  // New additive structure slots (ADR-0021, structure-track evolution trees).
  window_box: 'Window box',
  ivy: 'Ivy',
  weathervane: 'Weathervane',
  flag: 'Flag',
  bunting: 'Bunting',
  pennant: 'Pennant',
  accessory: 'Accessory',
  // Additive dress-up slots (ADR-0019) on the companion + whimsy characters.
  headwear: 'Headwear',
  collar: 'Collar',
  attire: 'Attire',
  // New slots (toadstool ring, hedgehog, whimsy)
  glow: 'Glow',
  sprite: 'Sprite',
  lantern: 'Lantern',
  companion: 'Friend',
  ribbon: 'Ribbon',
  bell: 'Bell',
  flame: 'Flame',
  moth: 'Moth',
  crown: 'Crown',
  hat: 'Hat',
  crow: 'Crow',
  path: 'Path',
  occupant: 'Resting',
  cat: 'Cat',
}

const OPTION_LABELS: Record<string, string> = {
  // Growth ladder (the `grown` slot) — sequential size stages (ADR-0019, deepened ADR-0021).
  grown: 'Grown',
  flourishing: 'Flourishing 🌱',
  mature: 'Mature 🌳',
  ancient: 'Ancient 🏔️',
  venerable: 'Venerable 🌌',
  // Evolution-fork forms (the `form` slot) — late-game final forms per nature item (ADR-0021).
  mighty: 'Mighty oak 🌳',
  blossoming: 'Blossoming bower 🌸',
  hollow_ancient: 'Hollow elder 🕳️',
  wildflower: 'Wildflower 🌾',
  cultivated: 'Cultivated 🌹',
  luminous: 'Luminous ✨',
  witchs_circle: "Witch's circle 🔮",
  moonlit: 'Moonlit 🌙',
  mountain_tarn: 'Mountain tarn 🏔️',
  lotus_pool: 'Lotus pool 🪷',
  // Structure-track evolution forms (the `form` slot) — late-game final forms (ADR-0021).
  thatched: 'Thatched cottage 🏡',
  treehouse: 'Treehouse 🌳',
  hermitage: 'Hermitage ⛰️',
  cosy: 'Cosy cottage 🏡',
  grand_manor: 'Grand manor 🏰',
  enchanted: 'Enchanted home 🍄',
  working_farm: 'Working farm 🚜',
  heritage: 'Heritage barn 🌾',
  festival: 'Festival barn 🎪',
  vintage: 'Vintage roadster 🏎️',
  camper: 'Camper van 🚐',
  cabana: 'Beach cabana ⛱️',
  lighthouse_keeper: "Lighthouse keeper's 🗼",
  stilt_house: 'Stilt house 🏖️',
  sailboat: 'Tall sailboat ⛵',
  fishing_boat: 'Fishing trawler 🎣',
  // New additive structure options (ADR-0021).
  flowers: 'Flowers 🌷',
  herbs: 'Herbs 🌿',
  ivy: 'Ivy 🌿',
  rooster: 'Rooster vane 🐓',
  bunting: 'Bunting 🎏',
  pennant: 'Pennant 🚩',
  // New additive nature options (ADR-0021).
  songbird: 'Songbird 🐦',
  squirrel: 'Squirrel 🐿️',
  bee: 'Bee 🐝',
  dragonfly: 'Dragonfly',
  fireflies: 'Fireflies ✨',
  duck: 'Duck 🦆',
  swan: 'Swan 🦢',
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
  // New options
  glow: 'Glow ✨',
  sprite: 'Sprite 🧚',
  lantern: 'Lantern',
  snail: 'Snail 🐌',
  ribbon: 'Ribbon',
  bell: 'Bell 🔔',
  warm: 'Warm flame',
  blue: 'Blue flame',
  moth: 'Moth',
  crown: 'Crown 👑',
  crow: 'Friendly crow',
  path: 'Stone path',
  napper: 'Someone napping',
  cat: 'Curled-up cat',
  scarf: 'Scarf 🧣',
  leaf: 'Leaf hat 🍂',
  // Dress-up options (ADR-0019): headwear, collar, and attire slots.
  flower_crown: 'Flower crown 🌸',
  tiny_crown: 'Tiny crown 👑',
  bowtie: 'Bow tie 🎀',
  sunglasses: 'Sunglasses 🕶️',
}

// Track grouping: label, emoji, and a quiet accent tint for the shop section header.
// Unknown tracks fall back to titleCase + no accent. Keeps the catalog extensible without
// touching the page component.
export const TRACK_META: Record<string, { label: string; emoji: string; accent: string }> = {
  nature:    { label: 'Nature',     emoji: '🌿', accent: '#0d9488' }, // teal
  structure: { label: 'Structure',  emoji: '🏡', accent: '#8b5cf6' }, // violet
  companion: { label: 'Companions', emoji: '🐾', accent: '#d97706' }, // amber
  whimsy:    { label: 'Whimsy',     emoji: '✨', accent: '#db2777' }, // pink
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
