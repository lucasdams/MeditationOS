import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { BreathAudio } from '../lib/breathAudio'
import { newlyCompletedQuests } from '../lib/quests'
import RewardOverlay from '../components/RewardOverlay'
import BreathingInfo from '../components/BreathingInfo'

const MIN_SCALE = 0.35
const MAX_SCALE = 1
// A longer pause at the top of the breath (held full, after the inhale) and none at
// the bottom — so the exhale flows straight back into the next inhale.
const HOLD_TOP = 2
const HOLD_BOTTOM = 0

// Breathing pace, in breaths per minute. Higher = shorter breaths = easier.
const MIN_BPM = 1
const MAX_BPM = 6
const BPM_STEP = 0.5
const DEFAULT_BPM = 6
// The slider is mirrored so the easy end (high bpm) sits on the LEFT and the hard
// end (low bpm) on the right. Slider position and bpm are mirror images about this sum.
const PACE_SUM = MIN_BPM + MAX_BPM
// Resonance breathing keeps the exhale a little longer than the inhale (calming):
// 40% in / 60% out — which gives the classic 4s-in / 6s-out at 6 breaths a minute.
const breathSeconds = (bpm: number) => {
  const period = 60 / bpm
  return { inhale: period * 0.4, exhale: period * 0.6 }
}

const BPM_NOTCHES = Array.from(
  { length: Math.round((MAX_BPM - MIN_BPM) / BPM_STEP) + 1 },
  (_, i) => MIN_BPM + i * BPM_STEP,
)

// A cycle is inhale → hold-full → exhale → hold-empty.
type Segment = 'inhale' | 'hold-full' | 'exhale' | 'hold-empty'

const cycleLength = (inhale: number, exhale: number) =>
  inhale + HOLD_TOP + exhale + HOLD_BOTTOM

const segmentAt = (pos: number, inhale: number, exhale: number): Segment => {
  if (pos < inhale) return 'inhale'
  if (pos < inhale + HOLD_TOP) return 'hold-full'
  if (pos < inhale + HOLD_TOP + exhale) return 'exhale'
  return 'hold-empty'
}

const scaleAt = (pos: number, inhale: number, exhale: number): number => {
  if (pos < inhale) return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * (pos / inhale)
  if (pos < inhale + HOLD_TOP) return MAX_SCALE
  if (pos < inhale + HOLD_TOP + exhale) {
    return MAX_SCALE - (MAX_SCALE - MIN_SCALE) * ((pos - inhale - HOLD_TOP) / exhale)
  }
  return MIN_SCALE
}

const SEGMENT_LABEL: Record<Segment, string> = {
  inhale: 'Breathe in',
  'hold-full': 'Hold',
  exhale: 'Breathe out',
  'hold-empty': 'Hold',
}

// Optional session length; 0 = open-ended (finish manually).
const DURATIONS = [
  { label: 'Open', min: 0 },
  { label: '5 min', min: 5 },
  { label: '10 min', min: 10 },
  { label: '20 min', min: 20 },
  { label: '45 min', min: 45 },
  { label: '1h', min: 60 },
  { label: '1h 30m', min: 90 },
  { label: '2h', min: 120 },
]
const DEFAULT_TARGET_MIN = 20

const mmss = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

// Soundscape options — each toggles the ocean wash and/or the transition chime.
type SoundId = 'ocean-chime' | 'ocean' | 'chime' | 'none'
const SOUND_OPTIONS: { value: SoundId; label: string; ocean: boolean; chime: boolean }[] = [
  { value: 'ocean-chime', label: 'Ocean + chime', ocean: true, chime: true },
  { value: 'ocean', label: 'Ocean only', ocean: true, chime: false },
  { value: 'chime', label: 'Chime only', ocean: false, chime: true },
  { value: 'none', label: 'Silent', ocean: false, chime: false },
]

// Remember the last-used setup so the next session opens where you left off.
interface BreathePrefs {
  bpm: number
  targetMin: number
  sound: SoundId
  volume: number
}
const PREFS_KEY = 'breathe:prefs'
const DEFAULT_PREFS: BreathePrefs = {
  bpm: DEFAULT_BPM,
  targetMin: DEFAULT_TARGET_MIN,
  sound: 'ocean-chime',
  volume: 0.6,
}
function readPrefs(): BreathePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<BreathePrefs>) }
  } catch {
    // malformed or unavailable storage — fall back to defaults
  }
  return DEFAULT_PREFS
}

type Phase = 'inhale' | 'exhale'

export default function BreathePage() {
  const navigate = useNavigate()
  const [bpm, setBpm] = useState(() => readPrefs().bpm)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Segment>('inhale')
  const [scale, setScale] = useState(MIN_SCALE)
  const [elapsed, setElapsed] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    quests: string[]
  } | null>(null)
  const [sound, setSound] = useState<SoundId>(() => readPrefs().sound)
  const [volume, setVolume] = useState(() => readPrefs().volume)
  const [targetMin, setTargetMin] = useState(() => readPrefs().targetMin)

  const soundOption = SOUND_OPTIONS.find((o) => o.value === sound) ?? SOUND_OPTIONS[0]
  const audioOn = soundOption.ocean
  const chimeOn = soundOption.chime
  const { inhale, exhale } = breathSeconds(bpm)

  // Persist the setup so it becomes the default next time.
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ bpm, targetMin, sound, volume }))
    } catch {
      // storage unavailable — preferences just won't persist
    }
  }, [bpm, targetMin, sound, volume])

  // Timing state in refs so the loops read fresh values without re-subscribing.
  // Two clocks: `cycleStartRef` drives the breath position and is reset to "now"
  // on every start/resume so a breath always begins at the inhale — that keeps the
  // (scheduled, fixed-length) audio tone in lock-step with the (sampled) visual.
  // `baseElapsedRef` accumulates total active time across pauses for the timer/XP.
  const cycleStartRef = useRef(0)
  const baseElapsedRef = useRef(0)
  const phaseRef = useRef<Segment>('inhale')
  const cyclesRef = useRef(0)
  const phaseSecsRef = useRef({ inhale, exhale })
  useEffect(() => {
    phaseSecsRef.current = { inhale, exhale }
  }, [inhale, exhale])

  // Audio guide (lazily created so the AudioContext only opens on a user gesture).
  const audioRef = useRef<BreathAudio | null>(null)
  const audioOnRef = useRef(audioOn)
  const chimeOnRef = useRef(chimeOn)
  const volumeRef = useRef(volume)
  useEffect(() => {
    audioOnRef.current = audioOn
    chimeOnRef.current = chimeOn
    volumeRef.current = volume
  }, [audioOn, chimeOn, volume])

  const targetRef = useRef(targetMin)
  useEffect(() => {
    targetRef.current = targetMin
  }, [targetMin])

  function audio(): BreathAudio {
    if (!audioRef.current) audioRef.current = new BreathAudio()
    audioRef.current.volume = volumeRef.current
    return audioRef.current
  }

  function cuePhase(p: Phase) {
    const a = audio()
    // Each guarded independently so a failure in one never silences the other.
    if (audioOnRef.current) {
      const dur = p === 'inhale' ? phaseSecsRef.current.inhale : phaseSecsRef.current.exhale
      try {
        a.glide(p, dur)
      } catch (err) {
        console.warn('ocean sound failed', err)
      }
    }
    if (chimeOnRef.current) {
      try {
        a.chime(p)
      } catch (err) {
        console.warn('chime failed', err)
      }
    }
  }

  useEffect(() => () => audioRef.current?.close(), [])

  // Visuals (rAF). Position is derived from absolute time, so when the tab is
  // backgrounded — where rAF pauses — the heart simply catches up on return.
  useEffect(() => {
    if (!running) return
    let raf = 0
    const draw = (now: number) => {
      const { inhale: inh, exhale: exh } = phaseSecsRef.current
      const runSec = (now - cycleStartRef.current) / 1000
      setElapsed(baseElapsedRef.current + runSec)
      setScale(scaleAt(runSec % cycleLength(inh, exh), inh, exh))
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [running])

  // Phase transitions + audio cues run on setInterval, which keeps firing in a
  // background tab (unlike rAF) — so the sound keeps playing when you switch away.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const { inhale: inh, exhale: exh } = phaseSecsRef.current
      const cycle = cycleLength(inh, exh)
      const runSec = (performance.now() - cycleStartRef.current) / 1000
      const elapsed = baseElapsedRef.current + runSec

      if (targetRef.current > 0 && elapsed >= targetRef.current * 60) {
        clearInterval(id)
        setRunning(false)
        audioRef.current?.stop()
        void saveSession(targetRef.current * 60)
        return
      }

      const seg = segmentAt(runSec % cycle, inh, exh)
      if (seg !== phaseRef.current) {
        // A full breath completes when we roll back into an inhale — from the
        // empty-hold, or straight from the exhale when there's no bottom hold.
        if (
          seg === 'inhale' &&
          (phaseRef.current === 'hold-empty' || phaseRef.current === 'exhale')
        ) {
          cyclesRef.current += 1
          setCycles(cyclesRef.current)
        }
        phaseRef.current = seg
        setPhase(seg)
        // Sound only at the start of an actual breath, not during the holds.
        if (seg === 'inhale' || seg === 'exhale') cuePhase(seg)
      }
    }, 60)
    return () => clearInterval(id)
  }, [running])

  function start() {
    // Restart the breath at the inhale, carrying total elapsed forward. The cue
    // below and the visual both begin the inhale together, so they can't drift.
    cycleStartRef.current = performance.now()
    baseElapsedRef.current = elapsed
    phaseRef.current = 'inhale'
    setPhase('inhale')
    setRunning(true)
    if (audioOnRef.current || chimeOnRef.current) audio().resume()
    cuePhase('inhale')
  }

  function pause() {
    setRunning(false)
    audioRef.current?.stop()
  }

  function selectSound(value: SoundId) {
    setSound(value)
    const next = SOUND_OPTIONS.find((o) => o.value === value) ?? SOUND_OPTIONS[0]
    if (next.ocean || next.chime) audio().resume()
    if (!next.ocean) audioRef.current?.stop() // silence the wash if ocean is off
  }

  function reset() {
    setRunning(false)
    setElapsed(0)
    setCycles(0)
    cyclesRef.current = 0
    baseElapsedRef.current = 0
    setScale(MIN_SCALE)
    setPhase('inhale')
  }

  async function saveSession(durationSec: number) {
    setError(null)
    setSaving(true)
    try {
      const before = await dashboardService.getStats()
      await sessionService.create({
        type: 'resonance_breathing',
        duration_seconds: Math.round(durationSec),
        occurred_at: new Date().toISOString(),
        // The pacer runs on fractional seconds; the API stores whole seconds.
        inhale_seconds: Math.max(1, Math.round(inhale)),
        exhale_seconds: Math.max(1, Math.round(exhale)),
        cycles_completed: cyclesRef.current,
      })
      const after = await dashboardService.getStats()
      // True gain from the server (3× breathing XP + any daily-quest/streak bonus).
      setReward({
        afterXp: after.xp,
        xpGained: Math.max(0, after.xp - before.xp),
        quests: newlyCompletedQuests(before, after),
      })
    } catch (err) {
      setError(err instanceof ApiError ? 'Could not save the session.' : 'Something went wrong.')
      setSaving(false)
    }
  }

  function finish() {
    setRunning(false)
    audioRef.current?.stop()
    if (elapsed < 1) {
      reset()
      navigate('/')
      return
    }
    void saveSession(elapsed)
  }

  // Changing the pace starts a fresh session — a saved session is one pace.
  function selectBpm(value: number) {
    setBpm(value)
    reset()
  }

  return (
    <main className="breathe">
      <header>
        <h1>Breathe</h1>
        <Link to="/">← Dashboard</Link>
      </header>

      <div className="breathe-stage">
        <div
          className={`breathe-circle ${running ? phase : 'idle'}`}
          style={{ transform: `scale(${scale})` }}
        />
        <div className="breathe-phase">{running ? SEGMENT_LABEL[phase] : 'Ready'}</div>
      </div>

      <div className="breathe-stats">
        <span>
          {mmss(elapsed)}
          {targetMin > 0 && ` / ${mmss(targetMin * 60)}`}
        </span>
        <span>{cycles} cycles</span>
        <span>{bpm} breaths per minute</span>
      </div>

      <label htmlFor="bpm">Pace · {bpm} breaths per minute</label>
      <input
        id="bpm"
        className="breathe-pace"
        type="range"
        min={MIN_BPM}
        max={MAX_BPM}
        step={BPM_STEP}
        value={PACE_SUM - bpm}
        list="bpm-notches"
        disabled={running}
        aria-label="Breaths per minute"
        onChange={(e) => selectBpm(PACE_SUM - Number(e.target.value))}
      />
      <datalist id="bpm-notches">
        {BPM_NOTCHES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div className="breathe-pace-hints">
        <span>← faster · easier</span>
        <span>deeper · harder →</span>
      </div>

      <label htmlFor="duration">Duration</label>
      <select
        id="duration"
        value={targetMin}
        disabled={running}
        onChange={(e) => setTargetMin(Number(e.target.value))}
      >
        {DURATIONS.map((d) => (
          <option key={d.min} value={d.min}>
            {d.label}
          </option>
        ))}
      </select>

      <label htmlFor="sound">Sound</label>
      <select
        id="sound"
        value={sound}
        onChange={(e) => selectSound(e.target.value as SoundId)}
      >
        {SOUND_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <div className="breathe-audio">
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          disabled={sound === 'none'}
          aria-label="Volume"
          onChange={(e) => setVolume(Number(e.target.value))}
        />
      </div>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <div className="breathe-controls">
        {!running ? (
          <button type="button" onClick={start} disabled={saving}>
            {elapsed > 0 ? 'Resume' : 'Start'}
          </button>
        ) : (
          <button type="button" onClick={pause}>
            Pause
          </button>
        )}
        <button type="button" className="secondary" onClick={finish} disabled={saving}>
          {saving ? 'Saving…' : 'Finish & save'}
        </button>
      </div>

      <BreathingInfo />

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          questsCompleted={reward.quests}
          onClose={() => navigate('/sessions')}
        />
      )}
    </main>
  )
}
