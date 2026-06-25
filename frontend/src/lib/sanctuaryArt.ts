// Display labels for Sanctuary items, variants, and customizations + garden vitality.
// Rendering itself is the procedural SVG in `components/SanctuaryPlant.tsx`; the backend
// `SANCTUARY_CATALOG` is the source of truth for which keys exist.

import type { OwnedItem, Vitality } from '../types'

// The garden grid width (mirrors the backend's GRID_COLUMNS). Items lay out row-major:
// cell = row * GRID_COLUMNS + col. Shared by the full page and the home preview so the two
// layouts can never silently diverge.
export const GRID_COLUMNS = 4

// Lay owned items out on a row-major grid keyed by `cell`. Returns a cell→item map and the
// total cell count to render: every occupied row plus `spareRows` of trailing empty cells
// (the full page wants a spare row to drop into; the read-only home preview wants none).
// Shared by the page and the preview so the two layouts can never silently diverge.
export function layoutCells(
  items: OwnedItem[],
  columns: number,
  spareRows: number,
): { byCell: Map<number, OwnedItem>; cellCount: number } {
  const byCell = new Map<number, OwnedItem>()
  for (const o of items) byCell.set(o.cell, o)
  const maxCell = items.length > 0 ? Math.max(...items.map((o) => o.cell)) : 0
  const rows = Math.floor(maxCell / columns) + 1 + spareRows
  return { byCell, cellCount: rows * columns }
}

// The ordered growth ladder (mirrors the backend GROWTH_STAGES) — the path a Tended item
// climbs from practice (grown → flourishing → mature → ancient → venerable). Shared by the
// page's tending ribbon and the plant renderer's stage scaling so they stay in lockstep.
export const GROWTH_STAGES = ['grown', 'flourishing', 'mature', 'ancient', 'venerable'] as const

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
  // New additive companion slot (ADR-0021, companion-track evolution trees).
  toy: 'Toy',
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
  // New additive whimsy slots (ADR-0021, whimsy-track evolution trees — rollout complete).
  toadstool: 'Toadstool',
  perched_bird: 'Visitor',
  charm: 'Charm',
  dragonfly_friend: 'Dragonfly',
  pumpkin_patch: 'Pumpkins',
  doorstep: 'Doorstep',
  side_table: 'Side table',
  treats: 'Treats',
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
  // Companion-track evolution forms (the `form` slot) — late-game personality/pose/markings
  // forms per companion (ADR-0021).
  playful: 'Playful pup 🐾',
  regal: 'Regal hound 👑',
  guardian: 'Guardian 🛡️',
  lap_cat: 'Cosy lap-cat 🐱',
  sleek_hunter: 'Sleek hunter 🐈',
  mystic: 'Mystic cat 🔮',
  woodland: 'Woodland fox 🍂',
  arctic_form: 'Arctic fox ❄️',
  fire_kissed: 'Fire-kissed fox 🔥',
  songful: 'Songful 🎵',
  plumed: 'Plumed crest 🪶',
  migratory: 'Migratory 🧭',
  snug: 'Snug ball 🦔',
  forager: 'Woodland forager 🍂',
  coiled: 'Coiled rester 🐍',
  patterned: 'Diamond-patterned 💠',
  fantail: 'Flowing fantail 🐠',
  koi_kissed: 'Koi-kissed 🎏',
  mossy_garden: 'Mossy garden 🌿',
  jeweled: 'Jewelled shell 💎',
  // Whimsy-track evolution forms (the `form` slot) — late-game final forms per whimsy item
  // (ADR-0021, the final track in the rollout). Keys namespaced to avoid clashing with
  // existing variant/option keys (e.g. `dozing` not `sleepy`, the `*_door` / `*_lantern` set).
  wandering: 'Wandering pilgrim 🚶',
  wizardly: 'Wizardly sage 🧙',
  dozing: 'Dozing gnome 😴',
  crystal_chime: 'Crystal chime 🔮',
  pan_pipes: 'Pan pipes 🎶',
  firefly_lantern: 'Firefly lantern 🪰',
  star_lantern: 'Star lantern 🌟',
  spirit_lantern: 'Spirit lamp 👻',
  frog_prince: 'Frog prince 🤴',
  zen_frog: 'Zen frog 🧘',
  harvest_guard: 'Harvest guardian 🌾',
  spooky: 'Spooky 🎃',
  dapper: 'Dapper gent 🎩',
  mossy_door: 'Mossy door 🌿',
  royal_door: 'Royal door 👑',
  starlit_door: 'Starlit door ✨',
  garden_swing: 'Garden swing 🌼',
  canopy_hammock: 'Canopy hammock ⛱️',
  garden_party: 'Garden party 🎉',
  patisserie: 'Patisserie 🧁',
  high_tea: 'High tea 🫖',
  // New additive whimsy `*` options (ADR-0021).
  toadstool_cap: 'Toadstool 🍄',
  chickadee: 'Chickadee 🐦',
  crystal_charm: 'Crystal charm 💎',
  pond_dragonfly: 'Dragonfly 🪲',
  pumpkins: 'Pumpkins 🎃',
  welcome_mat: 'Welcome mat 🚪',
  lemonade: 'Lemonade 🍋',
  macarons: 'Macarons 🧁',
  // New additive companion `toy` options (ADR-0021).
  ball: 'Ball ⚽',
  stick: 'Stick 🦴',
  bone: 'Bone 🦴',
  yarn: 'Ball of yarn 🧶',
  feather: 'Feather toy 🪶',
  apple: 'Apple 🍎',
  leaf_toy: 'Leaf 🍃',
  basking_stone: 'Basking stone 🪨',
  bell_toy: 'Perch bell 🔔',
  mirror: 'Mirror 🪞',
  bubble_ring: 'Bubble ring 🫧',
  treasure: 'Treasure chest 💰',
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
  dragonfly: 'Dragonfly 🪲',
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

// A render-time time-of-day band, used purely for a gentle ambient tint over the garden
// scene (a `data-daytime` hook the CSS reads). Cosmetic only — it never changes the art,
// the economy, or any data; it just makes the garden feel quietly alive across the day.
// The tint itself is kept soft and legible in both light and dark themes.
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night'

export function timeOfDay(date: Date = new Date()): TimeOfDay {
  const h = date.getHours()
  if (h < 6) return 'night'
  if (h < 9) return 'dawn'
  if (h < 17) return 'day'
  if (h < 20) return 'dusk'
  return 'night'
}

// A warm, quiet line for the garden header — a gentle "this is yours" presence that shifts
// softly with the time of day. Personal in tone, never shouty; carries no names or PII.
const GARDEN_GREETINGS: Record<TimeOfDay, string> = {
  dawn: 'A fresh morning in your garden.',
  day: 'Your garden, basking in the daylight.',
  dusk: 'Your garden, settling into the evening.',
  night: 'Your garden, quiet under the night sky.',
}

export function gardenGreeting(when: TimeOfDay = timeOfDay()): string {
  return GARDEN_GREETINGS[when]
}
