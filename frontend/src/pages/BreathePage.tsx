import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { BreathAudio, AMBIENT_SOUNDS, type AmbientSound } from '../lib/breathAudio'
import { newlyCompletedQuests } from '../lib/quests'
import RewardOverlay from '../components/RewardOverlay'
import BreathingInfo from '../components/BreathingInfo'
import Stepper, { type StepperOption } from '../components/Stepper'
import {
  MIN_SCALE,
  PRESETS,
  PRESET_STORAGE_KEY,
  type Pattern,
  type Segment,
  SEGMENT_LABEL,
  cycleLength,
  loadPreset,
  patternForBpm,
  patternSummary,
  scaleAt,
  segmentAt,
} from '../lib/breathPattern'

// Breaths-per-minute is the user's primary control for the Resonance preset: stepped
// from the fast end (10) down to the deep end (1) in 0.5 increments. Slower is harder
// (see DIFFICULTY). A pace of N gives a total in/out time of round(60/N) seconds, split
// ~2:3 inhale:exhale — the longer exhale is what makes resonance breathing
// parasympathetic. Sessions store integer seconds, so the split rounds to whole seconds.
const BPM_OPTIONS: StepperOption<number>[] = Array.from({ length: 19 }, (_, i) => {
  const n = 10 - i * 0.5 // 10, 9.5, … 1
  return { value: n, label: `${n} breaths/min` }
})
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

// Slower breathing is harder, so a lower bpm is more advanced. Surfaced next to the
// pace so people know what they're choosing — below 3 bpm is genuinely demanding.
const DIFFICULTY = (bpm: number): { label: string; key: string } => {
  if (bpm < 3) return { label: 'Very advanced', key: 'expert' }
  if (bpm < 4) return { label: 'Advanced', key: 'advanced' }
  if (bpm < 6) return { label: 'Moderate', key: 'moderate' }
  return { label: 'Gentle', key: 'gentle' }
}

// Optional session length; 0 = open-ended (finish manually). Stepped left→right.
const DURATIONS: StepperOption<number>[] = [
  { value: 0, label: 'Open' },
  { value: 2, label: '2 min' },
  { value: 3, label: '3 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90 min' },
]

const mmss = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

type Phase = 'inhale' | 'exhale'

export default function BreathePage() {
  const navigate = useNavigate()
  const [bpm, setBpm] = useState<number>(loadBpm)
  const [presetKey, setPresetKey] = useState<string>(loadPreset)
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
  const [audioOn, setAudioOn] = useState(true) // ambient wash on by default
  const [ambient, setAmbient] = useState<AmbientSound>('ocean')
  const [chimeOn, setChimeOn] = useState(true) // soft transition bell on by default
  const [volume, setVolume] = useState(0.6)
  const [targetMin, setTargetMin] = useState(0)

  // The active pattern: a fixed preset, or — for Resonance — derived from the bpm pace.
  const preset = PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0]
  const pattern: Pattern = preset.pattern ?? patternForBpm(bpm)
  const { inhale, exhale } = pattern

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

  // Timing state in refs so the loops read fresh values without re-subscribing.
  // Two clocks: `cycleStartRef` drives the breath position and is reset to "now"
  // on every start/resume so a breath always begins at the inhale — that keeps the
  // (scheduled, fixed-length) audio tone in lock-step with the (sampled) visual.
  // `baseElapsedRef` accumulates total active time across pauses for the timer/XP.
  const cycleStartRef = useRef(0)
  const baseElapsedRef = useRef(0)
  const phaseRef = useRef<Segment>('inhale')
  const cyclesRef = useRef(0)
  const patternRef = useRef<Pattern>(pattern)
  useEffect(() => {
    patternRef.current = pattern
  }, [pattern.inhale, pattern.holdFull, pattern.exhale, pattern.holdEmpty])

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

  function cuePhase(p: Phase) {
    const a = audio()
    // Each guarded independently so a failure in one never silences the other.
    if (audioOnRef.current) {
      const dur = p === 'inhale' ? patternRef.current.inhale : patternRef.current.exhale
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
      const p = patternRef.current
      const runSec = (now - cycleStartRef.current) / 1000
      setElapsed(baseElapsedRef.current + runSec)
      setScale(scaleAt(runSec % cycleLength(p), p))
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
      const p = patternRef.current
      const cycle = cycleLength(p)
      const runSec = (performance.now() - cycleStartRef.current) / 1000
      const elapsed = baseElapsedRef.current + runSec

      if (targetRef.current > 0 && elapsed >= targetRef.current * 60) {
        clearInterval(id)
        setRunning(false)
        audioRef.current?.stop()
        void saveSession(targetRef.current * 60)
        return
      }

      const seg = segmentAt(runSec % cycle, p)
      if (seg !== phaseRef.current) {
        // A full breath completes whenever we roll back into an inhale from a later
        // phase — robust to presets with no empty-hold (e.g. 4·7·8, coherence).
        if (seg === 'inhale' && phaseRef.current !== 'inhale') {
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
        // Floor, never round up — a sub-minute breath must not count as the
        // "breathe a minute" quest (which needs a true ≥60s).
        duration_seconds: Math.floor(durationSec),
        occurred_at: new Date().toISOString(),
        inhale_seconds: inhale,
        exhale_seconds: exhale,
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

  // Changing the pace restarts the breath so the new rate begins cleanly.
  function selectBpm(next: number) {
    setBpm(next)
    reset()
  }

  // Switching patterns also restarts the breath cleanly at the inhale.
  function selectPreset(key: string) {
    setPresetKey(key)
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
        <span>{preset.pattern === null ? `${bpm} breaths per minute` : patternSummary(pattern)}</span>
      </div>

      <label>Pattern</label>
      <div className="breathe-presets" role="group" aria-label="Breathing pattern">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`breathe-preset${presetKey === p.key ? ' selected' : ''}`}
            disabled={running}
            aria-pressed={presetKey === p.key}
            title={p.hint}
            onClick={() => selectPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="muted breathe-preset-hint">{preset.hint}</p>

      {preset.pattern === null && (
        <>
          <label>Pace</label>
          <Stepper
            options={BPM_OPTIONS}
            value={bpm}
            disabled={running}
            ariaLabel="Breaths per minute"
            prevLabel="Gentler"
            nextLabel="Harder"
            valueSuffix={
              <span className={`pace-difficulty d-${DIFFICULTY(bpm).key}`}>
                {DIFFICULTY(bpm).label}
              </span>
            }
            onChange={selectBpm}
          />
        </>
      )}

      <label>Duration</label>
      <Stepper
        options={DURATIONS}
        value={targetMin}
        disabled={running}
        ariaLabel="Duration"
        onChange={setTargetMin}
      />

      <label htmlFor="ambient">Sound</label>
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
          }
        }}
      >
        <option value="off">Off</option>
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
        Chime
      </label>

      <label htmlFor="volume">Volume</label>
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
        {(running || elapsed > 0) && (
          <button type="button" className="secondary" onClick={finish} disabled={saving}>
            {saving ? 'Saving…' : 'Finish & save'}
          </button>
        )}
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
