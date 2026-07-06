import { useEffect, useRef, useState, type ComponentType } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Waves, Square, Sun, Wind, type LucideProps } from 'lucide-react'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { BreathAudio, AMBIENT_SOUNDS, type AmbientSound } from '../lib/breathAudio'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import { mmss } from '../lib/format'
import RewardOverlay from '../components/RewardOverlay'
import Spirit from '../components/Spirit'
import BiometricCapture from '../components/BiometricCapture'
import BreathingInfo from '../components/BreathingInfo'
import Modal from '../components/Modal'
import RatingChips from '../components/RatingChips'
import ReflectionMood from '../components/ReflectionMood'
import { ErrorBanner } from '../components/StateViews'
import Stepper, { type StepperOption } from '../components/Stepper'
import SoundscapePicker from '../components/SoundscapePicker'
import { useToast } from '../context/ToastContext'
import { useT } from '../i18n'
import { biometricsService } from '../services/biometrics'
import { moodLogService } from '../services/moodLogs'
import { dailySuggestion } from '../lib/intentionPrompts'
import {
  SoundscapeEngine,
  loadSoundscapePref,
  loadSoundscapeVolPref,
  saveSoundscapeVolPref,
  type SoundscapeName,
} from '../lib/soundscapes'
import {
  MIN_DRAFT_SECONDS,
  beaconSave,
  clearDraft,
  newClientToken,
  readRestorableDraft,
  writeDraft,
  type SessionDraft,
} from '../lib/sessionDraft'
import type { DashboardStats, MeditationType, Mood, SessionCreate } from '../types'
import {
  MAX_SCALE,
  MIN_SCALE,
  PRESETS,
  PRESET_STORAGE_KEY,
  type Pattern,
  type Segment,
  SEGMENT_LABEL,
  breathEventAt,
  cycleLength,
  loadPreset,
  patternForBpm,
  patternSummary,
  scaleAt,
  segmentAt,
} from '../lib/breathPattern'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
// Passing it to buildXpBreakdown yields an all-zero breakdown rather than a crash.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// How far ahead (seconds) the scheduler queues audio on the audio clock. Comfortably
// larger than a throttled background timer tick (~1s), so cues are always queued in time.
const AUDIO_LOOKAHEAD = 2.5

// When reduced-motion is on we don't animate the circle's scale; instead we hold it at a
// calm, settled mid-size (between MIN_SCALE and MAX_SCALE) so it reads as a full circle
// rather than the tiny MIN_SCALE dot it would otherwise freeze at.
const STATIC_SCALE = (MIN_SCALE + MAX_SCALE) / 2

// A distinct lucide line icon + soft tint per pattern, so the cards read apart at a glance.
const PATTERN_STYLE: Record<string, { Icon: ComponentType<LucideProps>; tint: string }> = {
  resonance: { Icon: Waves, tint: '#dbeeef' }, // rolling, longer exhale — soft warm teal
  box: { Icon: Square, tint: '#dde9e3' }, // four equal sides — soft teal-green
  energizing: { Icon: Sun, tint: '#fef3c7' }, // brisk, active inhale
  alternate: { Icon: Wind, tint: '#f0e7f2' }, // soft warm mauve — Nadi Shodhana
}

// Nadi Shodhana nostril guidance: on even rounds you inhale LEFT / exhale RIGHT, and the
// sides flip on odd rounds. Returns the active nostril for the current phase (holds carry
// the inhale's side), or null when the phase has no side (e.g. the brief empty-hold).
const nostrilFor = (cycleIndex: number, phase: Segment): 'left' | 'right' | null => {
  const evenRound = cycleIndex % 2 === 0
  if (phase === 'inhale' || phase === 'hold-full') return evenRound ? 'left' : 'right'
  if (phase === 'exhale') return evenRound ? 'right' : 'left'
  return null // hold-empty — between rounds, no active side
}

// A simple front-on nose for the alternate-nostril cue: the ACTIVE nostril glows open, the
// other reads dimmed/closed (as if held shut by a finger). `active` is the user's own left/right
// (image left = "left"), with text tags below to remove any ambiguity. Decorative (aria-hidden);
// the phase label carries the spoken cue.
function NoseCue({ active }: { active: 'left' | 'right' | null }) {
  return (
    <svg className="breathe-nose" viewBox="0 0 100 88" aria-hidden="true">
      {/* Soft nose silhouette — bridge tapering to a rounded tip + two flaring wings. */}
      <path
        d="M50 6 C46 6 45 20 43 34 C41 46 30 50 30 64 C30 78 40 82 50 82 C60 82 70 78 70 64
           C70 50 59 46 57 34 C55 20 54 6 50 6 Z"
        fill="var(--bg-surface-raised)"
        stroke="var(--border)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Nostrils — the active one glows open; the inactive one is muted (held closed). */}
      <ellipse
        className={`breathe-nostril-hole${active === 'left' ? ' is-open' : ''}`}
        cx="40"
        cy="66"
        rx="6.5"
        ry="5"
      />
      <ellipse
        className={`breathe-nostril-hole${active === 'right' ? ' is-open' : ''}`}
        cx="60"
        cy="66"
        rx="6.5"
        ry="5"
      />
    </svg>
  )
}

// Breaths-per-minute is the user's primary control for the Resonance preset: stepped
// from the fast end (10) down to the deep end (1) in 0.5 increments. Slower is harder
// (see DIFFICULTY). A pace of N gives a total in/out time of round(60/N) seconds, split
// ~2:3 inhale:exhale — the longer exhale is what makes resonance breathing
// parasympathetic. Sessions store integer seconds, so the split rounds to whole seconds.
const BPM_VALUES: number[] = Array.from({ length: 19 }, (_, i) => 10 - i * 0.5) // 10, 9.5, … 1
const DEFAULT_BPM = 4.5 // a moderate resonance pace
const BPM_STORAGE_KEY = 'breathe.bpm'

// Last bpm the user chose (persisted locally), snapped to the 0.5 grid and clamped
// to the offered range so a stale value still lands on a real option.
const loadBpm = (): number => {
  try {
    const n = Number(localStorage.getItem(BPM_STORAGE_KEY))
    if (Number.isFinite(n) && n >= 1 && n <= 10) return Math.round(n * 2) / 2
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to the default.
  }
  return DEFAULT_BPM
}

// Box uses a "seconds per phase" control (3–7s each for in · hold · out · hold) rather
// than breaths/min, since its long holds make bpm meaningless.
const BOX_VALUES: number[] = [3, 4, 5, 6, 7]
const DEFAULT_BOX = 4
const BOX_STORAGE_KEY = 'breathe.box'

const loadBox = (): number => {
  try {
    const n = Number(localStorage.getItem(BOX_STORAGE_KEY))
    if (Number.isInteger(n) && n >= 3 && n <= 7) return n
  } catch {
    // localStorage unavailable — fall back to the default.
  }
  return DEFAULT_BOX
}

// Slower breathing is harder, so a lower bpm is more advanced. Surfaced next to the
// pace so people know what they're choosing — below 3 bpm is genuinely demanding. Returns
// the difficulty key; the display label is resolved from the catalog at the call site.
const DIFFICULTY = (bpm: number): { key: string } => {
  if (bpm < 3) return { key: 'expert' }
  if (bpm < 4) return { key: 'advanced' }
  if (bpm < 6) return { key: 'moderate' }
  return { key: 'gentle' }
}

// Optional session length; 0 = open-ended (finish manually). Stepped left→right. Labels are
// catalog keys resolved at render (re-label on locale switch); 0 → "Untimed".
const DURATION_VALUES: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'practice.duration.untimed' },
  { value: 2, labelKey: 'practice.mins.2' },
  { value: 3, labelKey: 'practice.mins.3' },
  { value: 5, labelKey: 'practice.mins.5' },
  { value: 10, labelKey: 'practice.mins.10' },
  { value: 15, labelKey: 'practice.mins.15' },
  { value: 20, labelKey: 'practice.mins.20' },
  { value: 30, labelKey: 'practice.mins.30' },
  { value: 45, labelKey: 'practice.mins.45' },
  { value: 60, labelKey: 'practice.mins.60' },
  { value: 90, labelKey: 'practice.mins.90' },
]

// Plain-language "what you'll do" copy per pattern, for the beginner-friendly intro shown before
// the breath starts. Keyed by preset key (matches the `?pattern=` deep-link values) → catalog key.
const BREATHE_INTRO_KEY: Record<string, string> = {
  resonance: 'practice.breathe.intro.resonance',
  box: 'practice.breathe.intro.box',
  energizing: 'practice.breathe.intro.energizing',
  alternate: 'practice.breathe.intro.alternate',
}
const BREATHE_INTRO_DEFAULT_KEY = 'practice.breathe.intro.default'

// Remember the last-used sound + duration setup so the next session opens where you
// left off. (Pace/preset/box are persisted separately above.) One blob under a single
// key keeps these related toggles together; `{...defaults, ...parsed}` means a missing
// or stale field falls back safely.
interface BreathePrefs {
  audioOn: boolean
  ambient: AmbientSound
  chimeOn: boolean
  volume: number
  targetMin: number
}
const PREFS_KEY = 'breathe:prefs'
const DEFAULT_PREFS: BreathePrefs = {
  audioOn: true,
  ambient: 'ocean',
  chimeOn: true,
  volume: 0.6,
  targetMin: 0,
}
const loadPrefs = (): BreathePrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<BreathePrefs>) }
  } catch {
    // malformed or unavailable storage — fall back to defaults.
  }
  return DEFAULT_PREFS
}

const DRAFT_PAGE = 'breathe'

// Onboarding hatch flag (set by Onboarding §5): when '1', the first completed sit should route
// to the companion choose page (the "hatch") instead of the usual close. Reads-and-clears in one
// step so it only ever fires once; storage may be unavailable (private mode) — treat as no hatch.
function consumePendingHatch(): boolean {
  try {
    if (localStorage.getItem('onboarding.pendingHatch') !== '1') return false
    localStorage.removeItem('onboarding.pendingHatch')
    return true
  } catch {
    return false
  }
}

export default function BreathePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t } = useT()
  // Stepper option lists with labels resolved from the catalog (re-label on locale change).
  const DURATIONS: StepperOption<number>[] = DURATION_VALUES.map((d) => ({
    value: d.value,
    label: t(d.labelKey),
  }))
  const BPM_OPTIONS: StepperOption<number>[] = BPM_VALUES.map((n) => ({
    value: n,
    label: t('practice.breathe.bpmOption', { n }),
  }))
  const BOX_COUNTS: StepperOption<number>[] = BOX_VALUES.map((n) => ({
    value: n,
    label: t('practice.breathe.boxOption', { n }),
  }))
  // Respect the OS reduced-motion preference: when on, keep the circle static so the
  // JS rAF scale animation doesn't override what the global CSS reset can't catch.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [searchParams] = useSearchParams()
  // Guided first-sit (onboarding §5): `?guided=1` strips the page to a zero-config breath —
  // preset to Resonance, a fixed short duration (`?duration=<seconds>`, default 60s), config
  // hidden, just the orb + one gentle cue + a single Begin. Read once at mount so toggling
  // patterns later (it's still allowed once running) doesn't re-trigger it.
  const [guided] = useState<boolean>(() => searchParams.get('guided') === '1')
  const guidedDurationSec = (() => {
    const n = Number(searchParams.get('duration'))
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 60
  })()
  const [bpm, setBpm] = useState<number>(loadBpm)
  const [boxCount, setBoxCount] = useState<number>(loadBox)
  // Deep-link support: `/breathe?pattern=<key>` pre-selects that preset, overriding the
  // localStorage default on this visit. Read once at mount (useState initializer) so a
  // direct visit without the param behaves exactly as before; manual changes still persist.
  // A guided first sit always opens on Resonance (the calm, paced default) regardless of any
  // stored preset, so the orb is the gentle resonance breath every beginner expects.
  const [presetKey, setPresetKey] = useState<string>(() => {
    if (searchParams.get('guided') === '1') return 'resonance'
    const param = searchParams.get('pattern')
    if (param && PRESETS.some((p) => p.key === param)) return param
    return loadPreset()
  })
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Segment>('inhale')
  const [scale, setScale] = useState(prefersReducedMotion ? STATIC_SCALE : MIN_SCALE)
  const [elapsed, setElapsed] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    breakdown: XpLine[]
  } | null>(null)
  // The id of the just-saved sit, so an optional post-session reading can link to it.
  const savedSessionIdRef = useRef<string | null>(null)
  // After the reward overlay closes, offer a skippable "log a quick reading?".
  const [showReading, setShowReading] = useState(false)

  // Pre-session intention — optional, skippable, max 140 chars (mirrors MeditatePage).
  const [intention, setIntention] = useState('')

  // Optional pre-session HRV reading: captured before the sit (so it has no session
  // yet), then linked to the saved session afterwards so the pre/post delta can pair
  // them. `showPreReading` toggles the capture modal; the ref holds the saved id.
  const [showPreReading, setShowPreReading] = useState(false)
  const preReadingIdRef = useRef<string | null>(null)

  // Post-session reflection — shown after the reward overlay, before the post reading.
  const [showReflection, setShowReflection] = useState(false)
  const [reflectFocus, setReflectFocus] = useState('')
  const [reflectCalm, setReflectCalm] = useState('')
  const [reflectMood, setReflectMood] = useState<Mood | null>(null)
  const [reflectNotes, setReflectNotes] = useState('')
  const [reflectSaving, setReflectSaving] = useState(false)
  const [reflectError, setReflectError] = useState<string | null>(null)
  const [audioOn, setAudioOn] = useState(() => loadPrefs().audioOn) // ambient wash on by default
  const [ambient, setAmbient] = useState<AmbientSound>(() => loadPrefs().ambient)
  const [chimeOn, setChimeOn] = useState(() => loadPrefs().chimeOn) // soft transition bell on by default
  const [volume, setVolume] = useState(() => loadPrefs().volume)
  // A guided first sit auto-finishes at its fixed length (seconds → minutes for the timer).
  // A normal visit keeps the remembered target.
  const [targetMin, setTargetMin] = useState(() =>
    searchParams.get('guided') === '1' ? guidedDurationSec / 60 : loadPrefs().targetMin,
  )
  const [soundscape, setSoundscape] = useState<SoundscapeName>(loadSoundscapePref)
  const [soundscapeVol, setSoundscapeVol] = useState(loadSoundscapeVolPref)
  const soundscapeEngineRef = useRef<SoundscapeEngine | null>(null)
  const soundscapeRef = useRef(soundscape)
  const soundscapeVolRef = useRef(soundscapeVol)
  // Unsaved-sit recovery (see lib/sessionDraft): a leftover draft to offer on load, plus
  // refs the draft/beacon read at tab-close time.
  const [restorable, setRestorable] = useState<SessionDraft | null>(() =>
    readRestorableDraft(DRAFT_PAGE),
  )
  const tokenRef = useRef<string | null>(null)
  const startedAtRef = useRef('')
  const elapsedRef = useRef(0)
  const savedRef = useRef(false)
  const lastPersistRef = useRef(-1)

  // The active pattern: derived from its control value — the bpm pace (Resonance) or the
  // box count (Box). A 'none'-control fixed preset (none ship today) would use `pattern`.
  const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]
  const controlValue = preset.control === 'count' ? boxCount : bpm
  const pattern: Pattern =
    preset.control === 'none'
      ? (preset.pattern as Pattern)
      : (preset.derive ?? patternForBpm)(controlValue)
  const { inhale, exhale } = pattern
  // The energizing preset saves as its own breathwork type; box + resonance + alternate
  // stay resonance_breathing (alternate-nostril is calming breathwork). All are
  // classified as breathwork by the backend.
  const breathType: MeditationType =
    preset.key === 'energizing' ? 'energizing_breathing' : 'resonance_breathing'

  // Alternate-nostril guidance: which side to breathe through this phase, kept in
  // lock-step with the visual via the same `cycles` + `phase` the rAF loop drives.
  const isAlternate = preset.key === 'alternate'
  const nostril = isAlternate ? nostrilFor(cycles, phase) : null

  // Remember the chosen pace + preset for next time.
  useEffect(() => {
    try {
      localStorage.setItem(BPM_STORAGE_KEY, String(bpm))
    } catch {
      // ignore — preference just won't persist
    }
  }, [bpm])
  useEffect(() => {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, presetKey)
    } catch {
      // ignore — preference just won't persist
    }
  }, [presetKey])
  useEffect(() => {
    try {
      localStorage.setItem(BOX_STORAGE_KEY, String(boxCount))
    } catch {
      // ignore — preference just won't persist
    }
  }, [boxCount])
  // Remember the sound + duration setup so it becomes the default next time. Skipped during a
  // guided first sit — its fixed 60s target is an onboarding detail, not a preference to keep.
  useEffect(() => {
    if (guided) return
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ audioOn, ambient, chimeOn, volume, targetMin }),
      )
    } catch {
      // storage unavailable — preferences just won't persist
    }
  }, [guided, audioOn, ambient, chimeOn, volume, targetMin])

  // Timing state in refs so the loops read fresh values without re-subscribing.
  // Two clocks: `cycleStartRef` drives the breath position and is reset to "now"
  // on every start/resume so a breath always begins at the inhale — that keeps the
  // (scheduled, fixed-length) audio tone in lock-step with the (sampled) visual.
  // `baseElapsedRef` accumulates total active time across pauses for the timer/XP.
  const cycleStartRef = useRef(0)
  const baseElapsedRef = useRef(0)
  const phaseRef = useRef<Segment>('inhale')
  const patternRef = useRef<Pattern>(pattern)
  const breathTypeRef = useRef(breathType)
  // Audio look-ahead scheduler: `audioAnchorRef` is the audio-clock time of this run's
  // inhale start, and `nextEventRef` the index of the next cue to schedule. Audio events
  // are queued ahead on the audio clock (see lib/breathAudio.glideAt), so the guide stays
  // in time with the breath even when a background tab throttles JS timers.
  const audioAnchorRef = useRef(0)
  const nextEventRef = useRef(0)
  useEffect(() => {
    patternRef.current = pattern
    breathTypeRef.current = breathType
  }, [pattern.inhale, pattern.holdFull, pattern.exhale, pattern.holdEmpty, breathType])

  // The session payload for the current breathing sit (or null if nothing to save).
  function draftPayload(elapsedSec: number): SessionCreate | null {
    if (!tokenRef.current || elapsedSec < MIN_DRAFT_SECONDS) return null
    const p = patternRef.current
    return {
      type: breathTypeRef.current,
      duration_seconds: Math.floor(elapsedSec),
      occurred_at: startedAtRef.current || new Date().toISOString(),
      inhale_seconds: p.inhale,
      exhale_seconds: p.exhale,
      cycles_completed: Math.floor(elapsedSec / cycleLength(p)),
      client_token: tokenRef.current,
      // Include the intention when set; the beacon path drops it (fine — optional).
      intention: intention.trim() || undefined,
    }
  }

  function persistDraft(elapsedSec: number) {
    const payload = draftPayload(elapsedSec)
    if (!payload) return
    writeDraft(DRAFT_PAGE, {
      clientToken: payload.client_token as string,
      label: t('practice.breathe.recover.label'),
      elapsedSeconds: Math.floor(elapsedSec),
      payload,
      savedAt: Date.now(),
    })
  }

  // Best-effort save when the tab is actually closing.
  useEffect(() => {
    const onHide = () => {
      if (savedRef.current) return
      const payload = draftPayload(elapsedRef.current)
      if (payload) beaconSave(payload)
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Audio guide (lazily created so the AudioContext only opens on a user gesture).
  const audioRef = useRef<BreathAudio | null>(null)
  const audioOnRef = useRef(audioOn)
  const chimeOnRef = useRef(chimeOn)
  const volumeRef = useRef(volume)
  const ambientRef = useRef(ambient)
  useEffect(() => {
    audioOnRef.current = audioOn
    chimeOnRef.current = chimeOn
    volumeRef.current = volume
    ambientRef.current = ambient
  }, [audioOn, chimeOn, volume, ambient])

  useEffect(() => {
    soundscapeRef.current = soundscape
    soundscapeVolRef.current = soundscapeVol
  }, [soundscape, soundscapeVol])

  useEffect(() => {
    soundscapeEngineRef.current?.setVolume(soundscapeVol)
    saveSoundscapeVolPref(soundscapeVol)
  }, [soundscapeVol])

  useEffect(() => {
    return () => { soundscapeEngineRef.current?.stop() }
  }, [])

  const targetRef = useRef(targetMin)
  useEffect(() => {
    targetRef.current = targetMin
  }, [targetMin])

  function audio(): BreathAudio {
    if (!audioRef.current) audioRef.current = new BreathAudio()
    audioRef.current.volume = volumeRef.current
    audioRef.current.ambient = ambientRef.current
    return audioRef.current
  }

  useEffect(() => () => audioRef.current?.close(), [])

  // Visuals (rAF). Position is derived from absolute time, so when the tab is
  // backgrounded — where rAF pauses — the circle simply catches up on return. The
  // phase label + cycle count are derived here too (purely cosmetic; only matters when
  // the page is visible).
  useEffect(() => {
    if (!running) return
    let raf = 0
    const draw = (now: number) => {
      const p = patternRef.current
      const cycle = cycleLength(p)
      const runSec = (now - cycleStartRef.current) / 1000
      const total = baseElapsedRef.current + runSec
      setElapsed(total)
      elapsedRef.current = total
      // Persist the draft at most once per second (rAF runs ~60fps).
      const sec = Math.floor(total)
      if (sec !== lastPersistRef.current) {
        lastPersistRef.current = sec
        persistDraft(total)
      }
      // When reduced-motion is on, hold the circle static at a calm settled size — the
      // CSS global reset can't catch JS inline transform updates, so we set a fixed scale
      // here instead of animating (React bails out of re-render when the value is equal).
      setScale(prefersReducedMotion ? STATIC_SCALE : scaleAt(runSec % cycle, p))
      setCycles(Math.floor(total / cycle))
      const seg = segmentAt(runSec % cycle, p)
      if (seg !== phaseRef.current) {
        phaseRef.current = seg
        setPhase(seg)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [running])

  // Audio scheduler + the timed-finish check. Runs on a coarse timer (which a background
  // tab throttles to ~1s), but it only QUEUES audio ahead on the audio clock — the cues
  // themselves fire on time on the audio thread, so the guide stays in sync when hidden.
  useEffect(() => {
    if (!running) return
    const tick = () => {
      const a = audio() // re-reads volume/ambient from the live refs, so mid-session
      //                    audio tweaks take effect on the next queued cue
      if (!a.isRunning()) {
        a.resume() // suspended (e.g. returning to a mobile tab) — re-anchor handles re-sync
        return
      }
      const ctxNow = a.audioTime()

      // Timed sessions finish + save even while backgrounded (within a throttle tick).
      const total = baseElapsedRef.current + (performance.now() - cycleStartRef.current) / 1000
      if (targetRef.current > 0 && total >= targetRef.current * 60) {
        setRunning(false)
        a.stop()
        stopBreathSoundscape()
        void saveSession(targetRef.current * 60)
        return
      }

      // Queue every cue whose start falls within the look-ahead window.
      const p = patternRef.current
      const horizon = ctxNow + AUDIO_LOOKAHEAD
      for (let guard = 0; guard < 64; guard++) {
        const ev = breathEventAt(p, nextEventRef.current)
        const at = audioAnchorRef.current + ev.time
        if (at >= horizon) break
        const startAt = Math.max(at, ctxNow)
        if (audioOnRef.current) a.glideAt(ev.phase, ev.duration, startAt)
        if (chimeOnRef.current) a.chimeAt(ev.phase, startAt)
        nextEventRef.current += 1
      }
    }
    tick() // queue immediately on start/resume rather than waiting a tick
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [running])

  // Returning to the tab: re-anchor the audio to the breath's real position (the audio
  // clock pauses while suspended; the visual clock doesn't), and re-queue from there.
  useEffect(() => {
    if (!running) return
    function reanchor() {
      if (document.visibilityState !== 'visible') return
      const a = audio()
      a.resume()
      a.stop() // drop stale queued audio; the scheduler rebuilds it on its next tick
      const p = patternRef.current
      const runSec = (performance.now() - cycleStartRef.current) / 1000
      audioAnchorRef.current = a.audioTime() - runSec
      let n = 0
      while (breathEventAt(p, n).time <= runSec && n < 100000) n += 1
      nextEventRef.current = n
    }
    document.addEventListener('visibilitychange', reanchor)
    window.addEventListener('focus', reanchor)
    return () => {
      document.removeEventListener('visibilitychange', reanchor)
      window.removeEventListener('focus', reanchor)
    }
  }, [running])

  // Start (or keep) the soundscape for the given name; defaults to the current selection.
  // An explicit name lets callers act before the ref-syncing effect has run (e.g. the
  // picker's onChange), while reusing the single start/stop + dedupe logic here.
  function startBreathSoundscape(name: SoundscapeName = soundscapeRef.current) {
    if (name === 'silent') {
      // No ambient sound for this session — stop any lingering preview.
      soundscapeEngineRef.current?.stop()
      return
    }
    if (!soundscapeEngineRef.current) soundscapeEngineRef.current = new SoundscapeEngine()
    // Reuse a matching preview without re-starting (shared engine → no double-play).
    if (soundscapeEngineRef.current.active !== name) {
      soundscapeEngineRef.current.start(name, soundscapeVolRef.current)
    }
  }

  function stopBreathSoundscape() {
    soundscapeEngineRef.current?.stop()
  }

  function start() {
    // Restart the breath at the inhale, carrying total elapsed forward. Anchor both
    // clocks (visual = performance.now, audio = the audio clock) to "now" so the cues
    // and the circle begin the inhale together; the scheduler then queues from event 0.
    const a = audio()
    a.resume()
    cycleStartRef.current = performance.now()
    audioAnchorRef.current = a.audioTime()
    nextEventRef.current = 0
    baseElapsedRef.current = elapsed
    phaseRef.current = 'inhale'
    setPhase('inhale')
    setRunning(true)
    startBreathSoundscape()
    if (elapsed < 1) {
      // Fresh sit: new idempotency token + start time; drop any stale restore offer.
      tokenRef.current = newClientToken()
      startedAtRef.current = new Date().toISOString()
      savedRef.current = false
      lastPersistRef.current = -1
      setRestorable(null)
    }
  }

  function pause() {
    setRunning(false)
    audioRef.current?.stop()
    stopBreathSoundscape()
    persistDraft(elapsedRef.current)
  }

  function toggleAudio(on: boolean) {
    setAudioOn(on)
    if (on) audio().resume()
    else audioRef.current?.stop()
  }

  function toggleChime(on: boolean) {
    setChimeOn(on)
    if (on) {
      audio().resume()
      audio().chime('inhale') // preview the bell you just enabled
    }
  }

  function reset() {
    setRunning(false)
    setElapsed(0)
    setCycles(0)
    nextEventRef.current = 0
    baseElapsedRef.current = 0
    elapsedRef.current = 0
    tokenRef.current = null
    clearDraft(DRAFT_PAGE)
    setScale(prefersReducedMotion ? STATIC_SCALE : MIN_SCALE)
    setPhase('inhale')
    // Drop any captured-but-unlinked pre-reading so it can't link to a later sit
    // (matches MeditatePage.reset()).
    preReadingIdRef.current = null
  }

  async function saveSession(durationSec: number) {
    setError(null)
    setSaving(true)

    // Fetch pre-save stats OUTSIDE the save try/catch so a getStats failure before the
    // create can't be mistaken for a save error. If the pre-fetch fails we still save,
    // but the XP reward is suppressed (a confident "0 XP" after a real sit would be a lie).
    let statsFailed = false
    const before = await dashboardService.getStats().catch(() => {
      statsFailed = true
      return ZERO_STATS
    })

    // The save itself — the one step that must succeed for this flow to continue.
    let saved: { id: string }
    try {
      saved = await sessionService.create({
        type: breathType,
        // Floor, never round up — a sub-minute breath must not count as the
        // "breathe a minute" quest (which needs a true ≥60s).
        duration_seconds: Math.floor(durationSec),
        occurred_at: startedAtRef.current || new Date().toISOString(),
        inhale_seconds: inhale,
        exhale_seconds: exhale,
        // Completed breaths = whole cycles in the elapsed time (derived, so it's right
        // even if the tab was backgrounded and the visual counter was frozen).
        cycles_completed: Math.floor(durationSec / cycleLength(pattern)),
        client_token: tokenRef.current ?? undefined,
        // Carry the optional pre-session intention onto the saved sit.
        intention: intention.trim() || null,
      })
    } catch (err) {
      setError(err instanceof ApiError ? t('practice.error.saveSession') : messageForError(err))
      setSaving(false)
      return
    }

    savedSessionIdRef.current = saved.id
    // Saved — drop the recovery draft and stop the tab-close beacon from re-firing.
    savedRef.current = true
    clearDraft(DRAFT_PAGE)
    // If a pre-session reading was captured, link it to the sit now that we have an
    // id — best-effort, so a link failure never blocks the reward/flow.
    if (preReadingIdRef.current) {
      try {
        await biometricsService.linkSession(preReadingIdRef.current, saved.id)
      } catch {
        // Leave the reading unlinked rather than failing the save; it stays in history.
      }
      preReadingIdRef.current = null
    }

    // Post-save stats are best-effort: the session is already saved. The user must NOT
    // see "Couldn't save the session." when only this stats fetch failed.
    const after = await dashboardService.getStats().catch(() => {
      statsFailed = true
      return ZERO_STATS
    })

    // If either stats fetch fell back to zeros, the breakdown would render a confident
    // "0 XP / level 1" after a real sit. Skip the reward overlay and go straight to the
    // next step (hatch / reflection) rather than celebrating fake numbers.
    if (statsFailed) {
      setSaving(false)
      proceedAfterReward()
      return
    }

    // True gain from the server (3× breathing XP + any daily-quest/streak bonus).
    const bd = buildXpBreakdown(before, after, t('practice.breathe.recover.label'), Wind)
    setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
  }

  function finish() {
    setRunning(false)
    audioRef.current?.stop()
    stopBreathSoundscape()
    if (elapsed < 1) {
      reset()
      navigate('/')
      return
    }
    // Save the freshest accumulated seconds from the ref (updated every rAF frame),
    // not the `elapsed` state, which can lag a frame behind — matches the ref-based
    // duration MeditatePage/Trataka save from.
    void saveSession(elapsedRef.current)
  }

  // Save a breathing sit recovered from a previous visit (idempotent on its token).
  async function restoreSave() {
    if (!restorable) return
    setSaving(true)
    setError(null)
    try {
      await sessionService.create(restorable.payload)
      clearDraft(DRAFT_PAGE)
      setRestorable(null)
      showToast(t('practice.recover.savedToast'))
    } catch {
      setError(t('practice.recover.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  function discardRestore() {
    clearDraft(DRAFT_PAGE)
    setRestorable(null)
  }

  // Log the optional post-session mood via the MoodLog path (the same one the standalone
  // check-in uses), so it feeds the identical mood trends on Analytics. Best-effort: a
  // failure here must never block the reflection flow — the sit is already saved.
  async function logReflectionMood() {
    if (!reflectMood) return
    try {
      await moodLogService.create(reflectMood)
    } catch {
      // Swallow — the mood is an optional extra; the session save already succeeded.
    }
  }

  // Patch the already-saved sit with focus/calm/notes and log the optional mood, then move
  // to the post reading. Mood is a separate resource (MoodLog), not a session field, so
  // it's logged even when no session fields changed.
  async function saveReflection() {
    const sid = savedSessionIdRef.current
    if (!sid) {
      await logReflectionMood()
      advanceToReading()
      return
    }
    const payload: Record<string, unknown> = {}
    if (reflectFocus) payload.focus = Number(reflectFocus)
    if (reflectCalm) payload.calm = Number(reflectCalm)
    const trimmedNotes = reflectNotes.trim()
    if (trimmedNotes) payload.notes = trimmedNotes
    // Nothing to patch on the session — still log any chosen mood before moving on.
    if (Object.keys(payload).length === 0) {
      setReflectSaving(true)
      await logReflectionMood()
      advanceToReading()
      return
    }
    setReflectSaving(true)
    setReflectError(null)
    try {
      await sessionService.update(sid, payload)
      await logReflectionMood()
      advanceToReading()
    } catch (err) {
      setReflectError(
        err instanceof ApiError ? t('practice.error.saveReflection') : messageForError(err),
      )
      setReflectSaving(false)
    }
  }

  function advanceToReading() {
    setShowReflection(false)
    if (savedSessionIdRef.current) setShowReading(true)
    else navigate('/')
  }

  // What happens once the sit is saved and the reward step is done (whether the reward
  // overlay was shown, or skipped because the stats fetch failed): the onboarding hatch
  // takes precedence (first sit → companion choose page), otherwise offer the reflection,
  // else return home. Shared so the reward-overlay close and the stats-failed path agree.
  function proceedAfterReward() {
    // Onboarding hatch (§5): the very first sit "hatches" the companion. If a hatch is
    // pending, clear the flag and send the user to the choose page (the celebratory
    // reveal) instead of the usual reflection-modal / home path.
    if (consumePendingHatch()) {
      navigate('/spirit/choose')
      return
    }
    // After XP, offer the optional reflection — never blocks.
    if (savedSessionIdRef.current) setShowReflection(true)
    else navigate('/')
  }

  // Changing the pace restarts the breath so the new rate begins cleanly.
  function selectBpm(next: number) {
    setBpm(next)
    reset()
  }

  function selectBoxCount(next: number) {
    setBoxCount(next)
    reset()
  }

  // Switching patterns also restarts the breath cleanly at the inhale.
  function selectPreset(key: string) {
    setPresetKey(key)
    reset()
  }

  // Stable daily suggestion for the intention placeholder (matches MeditatePage).
  const intentionPlaceholder = dailySuggestion(new Date())

  return (
    <main id="main-content" className="breathe">
      <Link to="/" className="back-link">{t('practice.back.dashboard')}</Link>
      <header className="page-head">
        <h1>{t('practice.breathe.title')}</h1>
      </header>

      {/* Beginner-friendly intro — a plain-language "what you'll do" before the breath starts, so
          nobody is dropped cold into a pacer. Hidden in the zero-config guided first sit (which has
          its own gentle cue) and once the breath is underway. */}
      {!guided && !running && elapsed === 0 && (
        <div className="practice-intro">
          <p className="practice-intro-what">{t(BREATHE_INTRO_KEY[presetKey] ?? BREATHE_INTRO_DEFAULT_KEY)}</p>
          <p className="practice-intro-how">
            {t('practice.breathe.intro.how')}
          </p>
        </div>
      )}

      {restorable && !running && elapsed === 0 && (
        <div className="session-recover">
          <span>
            {t('practice.breathe.recover.unsaved', { min: Math.round(restorable.elapsedSeconds / 60) })}
          </span>
          <div className="session-recover-actions">
            <button type="button" onClick={restoreSave} disabled={saving}>
              {saving ? t('practice.recover.saving') : t('practice.recover.save')}
            </button>
            <button type="button" className="link-neutral" onClick={discardRestore}>
              {t('practice.recover.discard')}
            </button>
          </div>
        </div>
      )}

      {(running || elapsed > 0 || guided) && (
        <div className="breathe-stage">
          <div
            className={`breathe-circle ${running ? phase : 'idle'}`}
            style={{ transform: `scale(${scale})` }}
          />
          {/* The companion breathes with you: while running, it syncs to the SAME `scale`
              (the breathe-circle's `scaleAt` value) so its aura expands on the inhale and
              contracts on the exhale — one rAF clock, no drift. When paused it sits idle, and
              it gives a brief happy swell once the post-session reward appears (`celebrate`).
              Reduced-motion holds it static (handled inside Spirit). */}
          <Spirit
            compact
            paceScale={running ? scale : undefined}
            celebrate={reward !== null}
          />
          {/* aria-live="polite" announces phase changes (inhale / hold / exhale) to SR
              users — the primary cue when audio is off or headphones aren't in use. For
              alternate-nostril, the active side is appended so the announcement carries it
              too (e.g. "Breathe in · left"). */}
          <div className="breathe-phase" aria-live="polite" aria-atomic="true">
            {running ? (
              <>
                {SEGMENT_LABEL[phase]}
                {isAlternate && nostril && (
                  <span className="breathe-nostril-label"> · {t(`practice.breathe.nostril.${nostril}`)}</span>
                )}
              </>
            ) : (
              t('practice.state.ready')
            )}
          </div>
          {/* Distinctive Nadi Shodhana cue: a little nose whose ACTIVE nostril glows open while
              the other reads closed, with left/right tags beneath. Reduced-motion safe — only the
              active class toggles per phase, no animation. Rendered only for the alternate preset. */}
          {isAlternate && running && (
            <div className="breathe-nose-cue" aria-hidden="true">
              <NoseCue active={nostril} />
              <div className="breathe-nose-tags">
                <span className={`breathe-nostril-tag${nostril === 'left' ? ' active' : ''}`}>
                  {t('practice.breathe.nostril.left')}
                </span>
                <span className={`breathe-nostril-tag${nostril === 'right' ? ' active' : ''}`}>
                  {t('practice.breathe.nostril.right')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* aria-live="off" — the numeric countdown updates every second and would be
          extremely noisy for screen readers; phase changes above carry the cue. */}
      {(running || elapsed > 0) && (
      <div className="breathe-stats" aria-live="off">
          <span>
            {mmss(elapsed)}
            {targetMin > 0 && ` / ${mmss(targetMin * 60)}`}
          </span>
          <span>{t('practice.breathe.cycles', { cycles })}</span>
          <span>
            {preset.control === 'bpm' ? t('practice.breathe.bpm', { bpm }) : patternSummary(pattern)}
          </span>
        </div>
      )}

      {/* The setup (pattern / pace / duration / sound) is hidden while the breath runs — say so,
          so its disappearance reads as intentional rather than broken. */}
      {running && !guided && (
        <p className="breathe-running-hint muted">{t('practice.breathe.runningHint')}</p>
      )}

      {/* Show the locked-in intention quietly during the sit. */}
      {(running || elapsed > 0) && intention.trim() && (
        <p className="session-intention-locked" aria-label={t('practice.meditate.intentionAria')}>
          <span className="session-intention-locked-icon" aria-hidden="true">✦</span>{' '}
          {intention.trim()}
        </p>
      )}

      {/* Guided first sit (onboarding §5): a warm, zero-config invitation. No pattern/pace/
          duration/sound controls — just the orb, one gentle cue, and the Begin button below.
          Shown before the breath starts; once it's underway the orb + phase label carry it. */}
      {guided && !running && elapsed === 0 && (
        <p className="breathe-guided-cue">{t('practice.breathe.guidedCue')}</p>
      )}

      {/* Setup (pattern, pace, duration, sound) shows before/while paused; during a
          running session the screen stays calm — just the circle, timer, and controls.
          Hidden entirely for a guided first sit (zero configuration). */}
      {!guided && !running && (
        <>
      <label>{t('practice.breathe.pattern.label')}</label>
      <div className="pattern-cards" role="group" aria-label={t('practice.breathe.pattern.group')}>
        {PRESETS.map((p) => {
          const selected = presetKey === p.key
          return (
            <button
              key={p.key}
              type="button"
              className={`selectable pattern-card${selected ? ' selected' : ''}`}
              disabled={running}
              aria-pressed={selected}
              onClick={() => selectPreset(p.key)}
            >
              <span
                className="pattern-card-icon"
                style={{ background: PATTERN_STYLE[p.key]?.tint }}
                aria-hidden="true"
              >
                {(() => {
                  const Icon = PATTERN_STYLE[p.key]?.Icon
                  return Icon ? <Icon size={20} strokeWidth={1.75} /> : null
                })()}
              </span>
              <span className="pattern-card-body">
                <span className="pattern-card-name">{p.label}</span>
                {selected && <span className="pattern-card-hint">{p.hint}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {isAlternate && (
        <p className="pattern-note">
          {t('practice.breathe.alternateNote')}
        </p>
      )}

      {preset.control === 'bpm' && (
        <>
          <label>{t('practice.breathe.pace.label')}</label>
          <Stepper
            options={BPM_OPTIONS}
            value={bpm}
            disabled={running}
            ariaLabel={t('practice.breathe.pace.aria')}
            prevLabel={t('practice.breathe.pace.gentler')}
            nextLabel={t('practice.breathe.pace.harder')}
            valueSuffix={
              <span className={`pace-difficulty d-${DIFFICULTY(bpm).key}`}>
                {t(`practice.breathe.difficulty.${DIFFICULTY(bpm).key}`)}
              </span>
            }
            onChange={selectBpm}
          />
        </>
      )}

      {preset.control === 'count' && (
        <>
          <label>{t('practice.breathe.eachPhase.label')}</label>
          <Stepper
            options={BOX_COUNTS}
            value={boxCount}
            disabled={running}
            ariaLabel={t('practice.breathe.eachPhase.aria')}
            prevLabel={t('practice.breathe.eachPhase.shorter')}
            nextLabel={t('practice.breathe.eachPhase.longer')}
            onChange={selectBoxCount}
          />
        </>
      )}

      <label>{t('practice.duration.label')}</label>
      <Stepper
        options={DURATIONS}
        value={targetMin}
        disabled={running}
        ariaLabel={t('practice.duration.label')}
        onChange={setTargetMin}
      />

      {/* Session prep — the optional intention + pre-session reading, folded behind ONE quiet
          disclosure (mirrors MeditatePage) so the visible setup stays Pattern → Pace → Duration
          → Start. Hidden once a sit is underway; values persist while collapsed. */}
      {elapsed === 0 && (
        <details className="meditate-disclosure">
          <summary className="meditate-disclosure-summary">
            {t('practice.prep.summary')}
          </summary>
          <div className="meditate-disclosure-body">
            <div className="session-intention">
              <label htmlFor="breathe-intention" className="session-intention-label">
                {t('practice.intention.label')} <span className="session-intention-opt">{t('practice.intention.optional')}</span>
              </label>
              <textarea
                id="breathe-intention"
                className="session-intention-input"
                rows={2}
                maxLength={140}
                placeholder={intentionPlaceholder}
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
              />
            </div>
            <div className="session-prereading">
              {preReadingIdRef.current ? (
                <p className="session-prereading-done" aria-live="polite">
                  <span aria-hidden="true">✓</span> {t('practice.breathe.preReading.done')}
                </p>
              ) : (
                <button
                  type="button"
                  className="link-neutral session-prereading-btn"
                  onClick={() => setShowPreReading(true)}
                >
                  {t('practice.prereading.log')}
                </button>
              )}
            </div>
          </div>
        </details>
      )}
        </>
      )}

      {/* Sound — ALL the audio controls (breath wash, chime, volume, soundscape) live together
          behind ONE quiet disclosure (mirrors MeditatePage's Sound & bells), instead of three
          loose controls plus a separate soundscape collapse. Everything stays live-adjustable
          during a session — open the disclosure to change it. Hidden for a guided first sit,
          which keeps its calm defaults (the ambient wash + chime are on already). */}
      {!guided && (
        <details className="meditate-disclosure">
          <summary className="meditate-disclosure-summary">{t('practice.breathe.audio.summary')}</summary>
          <div className="meditate-disclosure-body">
            <label htmlFor="ambient">{t('practice.breathe.sound.label')}</label>
            <select
              id="ambient"
              value={audioOn ? ambient : 'off'}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'off') {
                  toggleAudio(false)
                } else {
                  setAmbient(v as AmbientSound)
                  if (!audioOn) toggleAudio(true)
                  else if (running) audioRef.current?.stop() // switch the wash live (rebuilds next cue)
                }
              }}
            >
              <option value="off">{t('practice.breathe.sound.off')}</option>
              {AMBIENT_SOUNDS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <label className="breathe-check">
              <input
                type="checkbox"
                checked={chimeOn}
                onChange={(e) => toggleChime(e.target.checked)}
              />
              {t('practice.breathe.chime')}
            </label>

            <label htmlFor="volume">{t('practice.breathe.volume')}</label>
            <input
              id="volume"
              className="breathe-volume"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              disabled={!audioOn && !chimeOn}
              onChange={(e) => setVolume(Number(e.target.value))}
            />

            <label>{t('practice.breathe.soundscape.summary')}</label>
            <SoundscapePicker
              value={soundscape}
              volume={soundscapeVol}
              previewEngineRef={soundscapeEngineRef}
              previewEnabled={!(running || elapsed > 0)}
              onSoundscapeChange={(name) => {
                setSoundscape(name)
                // Switch the live bed during a session, reusing the shared start/stop helper
                // (which dedupes a matching engine) rather than re-implementing it inline.
                if (running) startBreathSoundscape(name)
              }}
              onVolumeChange={setSoundscapeVol}
            />
          </div>
        </details>
      )}

      <ErrorBanner message={error} />

      <div className="breathe-controls">
        {!running ? (
          <button
            type="button"
            className={guided && elapsed === 0 ? 'breathe-begin' : undefined}
            onClick={start}
            disabled={saving}
          >
            {elapsed > 0
              ? t('practice.control.resume')
              : guided
                ? t('practice.control.begin')
                : t('practice.control.start')}
          </button>
        ) : (
          <button type="button" onClick={pause}>
            {t('practice.control.pause')}
          </button>
        )}
        {(running || elapsed > 0) && (
          <button type="button" className="secondary" onClick={finish} disabled={saving}>
            {saving ? t('practice.recover.saving') : t('practice.control.finishSave')}
          </button>
        )}
      </div>

      {!running && !guided && <BreathingInfo />}

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          breakdown={reward.breakdown}
          onClose={() => {
            setReward(null)
            // The hatch / reflection / home routing is shared with the stats-failed
            // path in saveSession (see proceedAfterReward) so both agree.
            proceedAfterReward()
          }}
        />
      )}

      {/* Optional pre-session reading capture — shown before the sit starts. Saved with
          no session id; linked to the sit in saveSession once the session exists. */}
      {showPreReading && (
        <BiometricCapture
          context="pre"
          sessionId={null}
          title={t('practice.prereading.title')}
          intro={t('practice.breathe.preReading.intro')}
          onDone={(reading) => {
            if (reading) preReadingIdRef.current = reading.id
            setShowPreReading(false)
            showToast(t('practice.reading.notedToast'))
          }}
          onSkip={() => setShowPreReading(false)}
        />
      )}

      {/* Post-session reflection — after the reward overlay, before the post reading.
          Patches focus/calm/notes onto the already-saved sit (no double-save). */}
      {showReflection && (
        <Modal ariaLabel={t('practice.breathe.reflect.aria')} cardClassName="biometric-card session-reflect-card">
          <h2>{t('practice.reflect.heading')}</h2>
          {intention.trim() && (
            <p className="session-reflect-intention">
              {t('practice.breathe.reflect.intentionLabel')} <em>{intention.trim()}</em>
            </p>
          )}
          <p className="biometric-intro">
            {t('practice.reflect.intro')}
          </p>

          <div className="session-reflect-ratings">
            <div className="session-reflect-row">
              <span className="session-reflect-label">{t('practice.reflect.focus')}</span>
              <RatingChips
                ariaLabel={t('practice.reflect.focus')}
                notRatedLabel={t('practice.reflect.notRated')}
                value={reflectFocus}
                onChange={setReflectFocus}
              />
            </div>
            <div className="session-reflect-row">
              <span className="session-reflect-label">{t('practice.reflect.calm')}</span>
              <RatingChips
                ariaLabel={t('practice.reflect.calm')}
                notRatedLabel={t('practice.reflect.notRated')}
                value={reflectCalm}
                onChange={setReflectCalm}
              />
            </div>
          </div>

          {/* Optional mood — logged via the MoodLog path so it feeds the mood trends. */}
          <div className="session-reflect-mood">
            <span className="session-reflect-label">{t('practice.reflect.moodLabel')}</span>
            <ReflectionMood value={reflectMood} onChange={setReflectMood} />
          </div>

          <div className="session-reflect-notes">
            <label htmlFor="breathe-reflect-notes" className="session-reflect-notes-label">
              {t('practice.reflect.notesLabel')}
            </label>
            <textarea
              id="breathe-reflect-notes"
              rows={3}
              placeholder={t('practice.reflect.notesPlaceholder')}
              value={reflectNotes}
              onChange={(e) => setReflectNotes(e.target.value)}
            />
          </div>

          <ErrorBanner message={reflectError} />

          <div className="biometric-actions">
            <button type="button" onClick={saveReflection} disabled={reflectSaving}>
              {reflectSaving ? t('practice.recover.saving') : t('practice.reflect.keep')}
            </button>
            <button
              type="button"
              className="link-neutral"
              onClick={advanceToReading}
              disabled={reflectSaving}
            >
              {t('practice.reflect.skip')}
            </button>
          </div>
        </Modal>
      )}

      {showReading && savedSessionIdRef.current && (
        <BiometricCapture
          context="post"
          sessionId={savedSessionIdRef.current}
          title={t('practice.reflect.readingTitle')}
          intro={t('practice.breathe.preReading.intro')}
          onDone={() => {
            showToast(t('practice.reading.notedToast'))
            navigate('/')
          }}
          onSkip={() => navigate('/')}
        />
      )}
    </main>
  )
}
