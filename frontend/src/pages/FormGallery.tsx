// TEMP gallery — renders every creature FORM (shape) per dosha for visual review. Delete after use.
import { SpiritArt } from '../components/Spirit'
import { CONCEPTS, ConceptCard } from './FormConcepts'
import type { SpiritPath } from '../types'

const GROUPS: { path: SpiritPath; dosha: string; forms: { key?: string; label: string }[] }[] = [
  {
    path: 'stillness',
    dosha: 'Kapha (still-life bodies)',
    forms: [
      { label: 'Seated · default' },
      { key: 'cluster', label: 'Cluster' },
      { key: 'cairn', label: 'Cairn' },
      { key: 'orbital', label: 'Orbital' },
      { key: 'lotus', label: 'Lotus' },
      { key: 'enso', label: 'Ensō' },
      { key: 'prism', label: 'Shard' },
      { key: 'sprout', label: 'Sprout' },
      { key: 'wheel', label: 'Dharma wheel' },
    ],
  },
  {
    path: 'breath',
    dosha: 'Pitta (fire objects)',
    forms: [
      { label: 'Blaze · default' },
      { key: 'twin', label: 'Twin flame' },
      { key: 'campfire', label: 'Campfire' },
      { key: 'torch', label: 'Torch' },
      { key: 'fireball', label: 'Comet' },
      { key: 'sun', label: 'Sunny' },
      { key: 'coals', label: 'Coals' },
      { key: 'lantern', label: 'Lantern' },
    ],
  },
  {
    path: 'heart',
    dosha: 'Vata (air / ether objects)',
    forms: [
      { label: 'Wisp · default' },
      { key: 'cloud', label: 'Cloud' },
      { key: 'plume', label: 'Feather' },
      { key: 'leaflet', label: 'Leaf' },
      { key: 'constellation', label: 'Constellation' },
      { key: 'dandelion', label: 'Dandelion' },
      { key: 'whirlwind', label: 'Whirlwind' },
      { key: 'meteor', label: 'Meteor' },
    ],
  },
]

// TEMP — accessory + habitat (background) audit lists, rendered on a creature for review.
const ACCESSORY_KEYS = [
  'halo', 'leaf_crown', 'ribbon', 'flower', 'scarf', 'star', 'dark_star', 'berry_sprig', 'tiny_bell',
  'antlers', 'ember_crown', 'mossy_circlet', 'feather_plume', 'flame_tuft', 'acorn_cap', 'wind_ribbon',
  'star_crown', 'tiara', 'bow', 'heart_clip', // cutesy / nature
  'headphones', 'nerd_glasses', 'gaming_headset', 'beanie', 'party_hat', 'shades', 'spiked_collar',
  'backwards_cap', // personality / cool-edgy
  'wired_earbuds', 'cat_ears', 'bucket_hat', // NEW adored worn darlings (wave 1)
  'beret', 'flower_crown', // NEW adored worn darlings (wave 2)
  'onsen_towel', 'yuzu', // NEW onsen & earth set
]
// TEMP — NEW adored companions (wave 1 + wave 2 + onsen & earth).
const ADORED_COMPANION_KEYS = [
  'duckling', 'axolotl', 'boba', 'capybara', // wave 1
  'mushroom', 'hedgehog', 'penguin', 'shiba', // wave 2
  'otter', 'red_panda', 'tanuki', 'snow_monkey', // onsen & earth
]
const HABITAT_KEYS = [
  'hot_spring', 'campsite', 'bamboo_grove', 'teahouse', // NEW adored cosy scenes
  'storm_peak', 'neon_city', 'volcano', 'cosmic_void', // NEW cool/edgy backdrops
  'dojo', 'zen_garden', 'sakura', 'arcade', 'underwater', // NEW diverse backdrops
  'meadow', 'dusk', 'night', 'garden', 'seaside', 'cottage', 'lily_pond', 'autumn_grove', 'starfall',
  'ember_canyon', 'misty_grove', 'open_sky', 'nebula', 'ember_hollow', 'fern_hollow', 'cloud_terrace',
]
// TEMP — the 5 quirky HOBBY companions (just got art).
const HOBBY_COMPANION_KEYS = ['dumbbell', 'coffee_mug', 'open_book', 'game_controller', 'boombox']
// TEMP — new cool weathers (shown over a night sky for contrast).
const NEW_WEATHER_KEYS = ['bubbles', 'confetti', 'meteor_shower', 'heartfall', 'steam']
// TEMP — new cool grounds.
const NEW_GROUND_KEYS = ['snow_bank', 'lava_rock', 'neon_grid', 'spring_stones']
// TEMP — ALL auras for the quality review: universal tiers 1-4, then the per-path exclusives
// rendered on their own dosha.
const UNIVERSAL_AURA_KEYS = [
  'soft', 'warm', 'ember', 'rose', 'dewlight', // t1
  'starlit', 'frost', 'twilight', 'neon', 'shadow', // t2
  'aurora', // t3
  'prismatic', // t4 legendary
]
const PATH_AURA_KEYS: { key: string; path: SpiritPath }[] = [
  { key: 'cinders', path: 'breath' },
  { key: 'emberflame', path: 'breath' },
  { key: 'dewfall', path: 'stillness' },
  { key: 'grove', path: 'stillness' },
  { key: 'petalwind', path: 'heart' },
  { key: 'zephyr', path: 'heart' },
]

function CosmeticCard({ path, cosmetic, keyName, stage = 'ascendant' }: { path: SpiritPath; cosmetic: Record<string, string>; keyName: string; stage?: string }) {
  return (
    <div style={{ width: 120, textAlign: 'center', background: '#fff', border: '1px solid #eadfce', borderRadius: 10, padding: 5 }}>
      <SpiritArt stage={stage as never} path={path} glow={1} cosmetics={cosmetic} reducedMotion previewing />
      <div style={{ font: '500 11px system-ui', marginTop: 2 }}>{keyName}</div>
    </div>
  )
}

// TEMP — face audit lists: every face-variant cosmetic (kawaii is the drawFaceVariant fallback),
// and the forms whose face anchor is most at risk (small / off-centre / dark / crowded faces).
const FACE_VARIANT_KEYS = ['kawaii', 'wink', 'lashes', 'tongue', 'frogface', 'starry', 'sleepy', 'surprised', 'hearts', 'cool']
const TRICKY_FACE_FORMS: { path: SpiritPath; form?: string; label: string }[] = [
  { path: 'heart', form: 'constellation', label: 'constellation' },
  { path: 'stillness', form: 'cairn', label: 'cairn' },
  { path: 'heart', form: 'whirlwind', label: 'whirlwind' },
  { path: 'breath', form: 'coals', label: 'coals' },
  { path: 'stillness', form: 'cluster', label: 'cluster' },
  { path: 'breath', form: 'sun', label: 'sun' },
]

// TEMP — concept groupings for the exploration section.
const CONCEPT_GROUPS = Array.from(new Set(CONCEPTS.map((c) => c.group)))

export default function FormGallery() {
  return (
    <div style={{ padding: 24, background: '#faf7f2', minHeight: '100vh' }}>
      {/* ── Concept ideas (temp) — sketches to cut / adjust, not yet wired into the real forms. ── */}
      <section style={{ marginBottom: 40 }}>
        <h2 style={{ font: '700 20px system-ui', margin: '0 0 4px' }}>💡 Concept ideas</h2>
        <div style={{ font: '400 13px system-ui', color: '#6b6257', margin: '0 0 16px' }}>
          Rough sketches (static, no colour theming/animation) — tell me which to keep, cut, or tweak.
        </div>
        {CONCEPT_GROUPS.map((grp) => (
          <div key={grp} style={{ marginBottom: 20 }}>
            <h3 style={{ font: '600 14px system-ui', margin: '0 0 8px', color: '#4a4238' }}>{grp}</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {CONCEPTS.filter((c) => c.group === grp).map((c) => (
                <ConceptCard key={c.label} label={c.label} note={c.note} El={c.El} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* ── Accessories (worn items) — on a jade Kapha for consistency. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Accessories (worn)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {ACCESSORY_KEYS.map((k) => (
            <CosmeticCard key={k} path="stillness" cosmetic={{ accessory: k }} keyName={k} />
          ))}
        </div>
      </section>

      {/* ── Hobby companions (just added art) — float beside the creature. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Hobby companions (new art)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {HOBBY_COMPANION_KEYS.map((k) => (
            <CosmeticCard key={k} path="stillness" cosmetic={{ companion: k }} keyName={k} />
          ))}
        </div>
      </section>

      {/* ── NEW adored companions — beloved little darlings. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Adored companions (new)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
          {ADORED_COMPANION_KEYS.map((k) => (
            <CosmeticCard key={k} path="stillness" cosmetic={{ companion: k }} keyName={k} />
          ))}
          {/* Hero pairing: the capybara relaxing in the hot-spring habitat. */}
          <div style={{ width: 160, textAlign: 'center', background: '#fff', border: '2px solid #f4a72c', borderRadius: 12, padding: 6 }}>
            <SpiritArt
              stage="ascendant"
              path="stillness"
              glow={1}
              cosmetics={{ companion: 'capybara', habitat: 'hot_spring' }}
              reducedMotion
              previewing
            />
            <div style={{ font: '600 12px system-ui', marginTop: 2 }}>capybara ♨ hot_spring</div>
          </div>
        </div>
      </section>

      {/* ── New mount. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Mount (new)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <CosmeticCard path="stillness" cosmetic={{ mount: 'hoverboard' }} keyName="hoverboard" />
        </div>
      </section>

      {/* ── ALL auras (quality review): universal tiers, then per-path on their own dosha. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Auras — universal (t1→t4)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {UNIVERSAL_AURA_KEYS.map((k) => (
            <CosmeticCard key={k} path="stillness" cosmetic={{ aura: k }} keyName={k} />
          ))}
        </div>
        <h2 style={{ font: '600 18px system-ui', margin: '12px 0' }}>Auras — path exclusives</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {PATH_AURA_KEYS.map(({ key, path }) => (
            <CosmeticCard key={key} path={path} cosmetic={{ aura: key }} keyName={key} />
          ))}
        </div>
      </section>

      {/* ── New grounds. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Grounds (new)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {NEW_GROUND_KEYS.map((k) => (
            <CosmeticCard key={k} path="stillness" cosmetic={{ ground: k }} keyName={k} />
          ))}
        </div>
      </section>

      {/* ── New weathers — over a night sky for contrast. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Weather (new)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {NEW_WEATHER_KEYS.map((k) => (
            <CosmeticCard key={k} path="stillness" cosmetic={{ weather: k, habitat: 'night' }} keyName={k} />
          ))}
        </div>
      </section>

      {/* ── Backgrounds (habitats) — the full scene. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Backgrounds (habitats)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {HABITAT_KEYS.map((k) => (
            <CosmeticCard key={k} path="stillness" cosmetic={{ habitat: k }} keyName={k} />
          ))}
        </div>
      </section>

      {/* ── TEMP: FACE audit A — the default face on EVERY form, small (wisp) and grown
          (ascendant), so a drifted / oversized / illegible face shows at a glance. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Face audit — default face on every form (wisp → ascendant)</h2>
        {GROUPS.map((group) => (
          <div key={`face-a-${group.path}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {group.forms.flatMap((f) =>
              (['wisp', 'ascendant'] as const).map((st) => (
                <CosmeticCard
                  key={`${group.path}-${f.key ?? 'default'}-${st}`}
                  path={group.path}
                  stage={st}
                  cosmetic={f.key ? { form: f.key } : {}}
                  keyName={`${group.path.slice(0, 2)} · ${f.label} · ${st}`}
                />
              )),
            )}
          </div>
        ))}
      </section>

      {/* ── TEMP: FACE audit B — every face-variant cosmetic on each dosha's default body. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Face audit — variants on each dosha default</h2>
        {(['stillness', 'breath', 'heart'] as SpiritPath[]).map((path) => (
          <div key={`face-b-${path}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {FACE_VARIANT_KEYS.map((v) => (
              <CosmeticCard key={`${path}-${v}`} path={path} cosmetic={{ face: v }} keyName={`${path.slice(0, 2)} · ${v}`} />
            ))}
          </div>
        ))}
      </section>

      {/* ── TEMP: FACE audit C — variants on the trickiest faces (small / off-centre / dark). ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Face audit — variants on tricky forms</h2>
        {TRICKY_FACE_FORMS.map((t) => (
          <div key={`face-c-${t.label}`} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {FACE_VARIANT_KEYS.map((v) => (
              <CosmeticCard
                key={`${t.label}-${v}`}
                path={t.path}
                cosmetic={{ ...(t.form ? { form: t.form } : {}), face: v }}
                keyName={`${t.label} · ${v}`}
              />
            ))}
          </div>
        ))}
      </section>

      {/* ── TEMP: accessory ANCHORING audit — every form wearing head/eye/neck items, so a
          misplaced anchor is visible at a glance (halo=above head, shades=eyes, scarf=neck). ── */}
      {(['halo', 'shades', 'scarf'] as const).map((acc) => (
        <section key={`anchor-${acc}`} style={{ marginBottom: 32 }}>
          <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Anchor audit — {acc} on every form</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {GROUPS.flatMap((group) =>
              group.forms.map((f) => (
                <div key={`${group.path}-${f.key ?? 'default'}-${acc}`} style={{ width: 120, textAlign: 'center', background: '#fff', border: '1px solid #eadfce', borderRadius: 10, padding: 5 }}>
                  <SpiritArt
                    stage="ascendant"
                    path={group.path}
                    glow={1}
                    cosmetics={{ ...(f.key ? { form: f.key } : {}), accessory: acc }}
                    reducedMotion
                    previewing
                  />
                  <div style={{ font: '500 11px system-ui', marginTop: 2 }}>{group.path.slice(0, 2)} · {f.label}</div>
                </div>
              )),
            )}
          </div>
        </section>
      ))}

      {/* ── TEMP: the reported bug close-up — the Vata constellation wearing several items. ── */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>Constellation close-up (reported: scarf off the face)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {['scarf', 'halo', 'party_hat', 'headphones', 'beanie', 'cat_ears', 'nerd_glasses', 'onsen_towel'].map((k) => (
            <div key={`const-${k}`} style={{ width: 160, textAlign: 'center', background: '#fff', border: '1px solid #eadfce', borderRadius: 10, padding: 5 }}>
              <SpiritArt stage="ascendant" path="heart" glow={1} cosmetics={{ form: 'constellation', accessory: k }} reducedMotion previewing />
              <div style={{ font: '500 11px system-ui', marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>
      </section>

      {GROUPS.map((group) => (
        <section key={group.dosha} style={{ marginBottom: 32 }}>
          <h2 style={{ font: '600 18px system-ui', margin: '0 0 12px' }}>{group.dosha}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {group.forms.map((f, i) => (
              <div
                key={i}
                data-form={f.key ?? 'default'}
                data-path={group.path}
                style={{
                  width: 150,
                  textAlign: 'center',
                  background: '#fff',
                  border: '1px solid #eadfce',
                  borderRadius: 12,
                  padding: 6,
                }}
              >
                <SpiritArt
                  stage="ascendant"
                  path={group.path}
                  glow={1}
                  cosmetics={f.key ? { form: f.key } : {}}
                  reducedMotion
                  previewing
                />
                <div style={{ font: '500 13px system-ui', marginTop: 2 }}>{f.label}</div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
