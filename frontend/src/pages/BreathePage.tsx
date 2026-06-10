import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { breathingPatternService } from '../services/breathingPatterns'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { BreathAudio } from '../lib/breathAudio'
import RewardOverlay from '../components/RewardOverlay'
import BreathingInfo from '../components/BreathingInfo'
import type { BreathingPattern } from '../types'

const MIN_SCALE = 0.35
const MAX_SCALE = 1
const HOLD = 1 // 1s pause at the top (full) and bottom (empty) of each breath

// A cycle is inhale → hold-full → exhale → hold-empty.
type Segment = 'inhale' | 'hold-full' | 'exhale' | 'hold-empty'

const cycleLength = (inhale: number, exhale: number) => inhale + exhale + 2 * HOLD

const segmentAt = (pos: number, inhale: number, exhale: number): Segment => {
  if (pos < inhale) return 'inhale'
  if (pos < inhale + HOLD) return 'hold-full'
  if (pos < inhale + HOLD + exhale) return 'exhale'
  return 'hold-empty'
}

const scaleAt = (pos: number, inhale: number, exhale: number): number => {
  if (pos < inhale) return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * (pos / inhale)
  if (pos < inhale + HOLD) return MAX_SCALE
  if (pos < inhale + HOLD + exhale) {
    return MAX_SCALE - (MAX_SCALE - MIN_SCALE) * ((pos - inhale - HOLD) / exhale)
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
  { label: '60 min', min: 60 },
]

const mmss = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

type Phase = 'inhale' | 'exhale'

export default function BreathePage() {
  const navigate = useNavigate()
  const [patterns, setPatterns] = useState<BreathingPattern[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Segment>('inhale')
  const [scale, setScale] = useState(MIN_SCALE)
  const [elapsed, setElapsed] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reward, setReward] = useState<{ afterXp: number; xpGained: number } | null>(null)
  const [audioOn, setAudioOn] = useState(true) // ocean sound on by default
  const [chimeOn, setChimeOn] = useState(true) // soft transition bell on by default
  const [volume, setVolume] = useState(0.4)
  const [targetMin, setTargetMin] = useState(0)

  const selected = patterns?.find((p) => p.id === selectedId) ?? null
  const inhale = selected?.inhale_seconds ?? 4
  const exhale = selected?.exhale_seconds ?? 6

  // Load patterns; default to the first preset.
  useEffect(() => {
    breathingPatternService
      .list()
      .then((list) => {
        setPatterns(list)
        const def = list.find((p) => p.is_preset) ?? list[0]
        if (def) setSelectedId(def.id)
      })
      .catch(() => setError('Could not load breathing patterns.'))
  }, [])

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
        // A full breath completes when we roll from the empty-hold back into an inhale.
        if (seg === 'inhale' && phaseRef.current === 'hold-empty') {
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
    if (on) audio().resume()
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
        inhale_seconds: inhale,
        exhale_seconds: exhale,
        cycles_completed: cyclesRef.current,
      })
      const after = await dashboardService.getStats()
      // True gain from the server (3× breathing XP + any daily-quest/streak bonus).
      setReward({ afterXp: after.xp, xpGained: Math.max(0, after.xp - before.xp) })
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

  // Switching pattern starts a fresh session — a saved session is one pattern.
  function selectPattern(id: string) {
    setSelectedId(id)
    reset()
  }

  const bpm = selected?.breaths_per_minute ?? 0

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
        <span>{bpm} bpm</span>
      </div>

      <label htmlFor="pattern">Pattern</label>
      <select
        id="pattern"
        value={selectedId}
        disabled={running || !patterns}
        onChange={(e) => selectPattern(e.target.value)}
      >
        {(patterns ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {p.breaths_per_minute} bpm
          </option>
        ))}
      </select>

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

      <div className="breathe-audio">
        <label>
          <input
            type="checkbox"
            checked={audioOn}
            onChange={(e) => toggleAudio(e.target.checked)}
          />{' '}
          Ocean sound
        </label>
        <label>
          <input
            type="checkbox"
            checked={chimeOn}
            onChange={(e) => toggleChime(e.target.checked)}
          />{' '}
          Chime
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          disabled={!audioOn && !chimeOn}
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
          <button type="button" onClick={start} disabled={saving || !selected}>
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
          onClose={() => navigate('/sessions')}
        />
      )}
    </main>
  )
}
