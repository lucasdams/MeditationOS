import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { breathingPatternService } from '../services/breathingPatterns'
import { ApiError } from '../services/api'
import { BreathAudio } from '../lib/breathAudio'
import type { BreathingPattern } from '../types'

const MIN_SCALE = 0.35
const MAX_SCALE = 1

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
  const [phase, setPhase] = useState<Phase>('inhale')
  const [scale, setScale] = useState(MIN_SCALE)
  const [elapsed, setElapsed] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [audioOn, setAudioOn] = useState(true) // guide tone on by default
  const [chimeOn, setChimeOn] = useState(false)
  const [volume, setVolume] = useState(0.2)
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

  // Animation state in refs so the rAF loop reads fresh values without re-subscribing.
  const rafRef = useRef<number | undefined>(undefined)
  const startRef = useRef(0)
  const phaseStartRef = useRef(0)
  const phaseRef = useRef<Phase>('inhale')
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
    if (chimeOnRef.current) audio().chime(p)
    if (!audioOnRef.current) return
    const dur = p === 'inhale' ? phaseSecsRef.current.inhale : phaseSecsRef.current.exhale
    audio().playPhase(p, dur)
  }

  useEffect(() => () => audioRef.current?.close(), [])

  useEffect(() => {
    if (!running) return
    const loop = (now: number) => {
      const durMs =
        (phaseRef.current === 'inhale'
          ? phaseSecsRef.current.inhale
          : phaseSecsRef.current.exhale) * 1000
      const frac = Math.min(1, (now - phaseStartRef.current) / durMs)
      setScale(
        phaseRef.current === 'inhale'
          ? MIN_SCALE + (MAX_SCALE - MIN_SCALE) * frac
          : MAX_SCALE - (MAX_SCALE - MIN_SCALE) * frac,
      )
      const el = (now - startRef.current) / 1000
      setElapsed(el)

      // Auto-finish + save when a duration target is reached.
      if (targetRef.current > 0 && el >= targetRef.current * 60) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        setRunning(false)
        audioRef.current?.stop()
        void saveSession(targetRef.current * 60)
        return
      }

      if (now - phaseStartRef.current >= durMs) {
        if (phaseRef.current === 'exhale') {
          cyclesRef.current += 1
          setCycles(cyclesRef.current)
        }
        phaseRef.current = phaseRef.current === 'inhale' ? 'exhale' : 'inhale'
        setPhase(phaseRef.current)
        phaseStartRef.current = now
        cuePhase(phaseRef.current)
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [running])

  function start() {
    const now = performance.now()
    startRef.current = now - elapsed * 1000
    phaseStartRef.current = now
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
    setScale(MIN_SCALE)
    setPhase('inhale')
  }

  async function saveSession(durationSec: number) {
    setError(null)
    setSaving(true)
    try {
      await sessionService.create({
        type: 'resonance_breathing',
        duration_seconds: Math.round(durationSec),
        occurred_at: new Date().toISOString(),
        inhale_seconds: inhale,
        exhale_seconds: exhale,
        cycles_completed: cyclesRef.current,
      })
      navigate('/sessions')
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
        <div className="breathe-phase">
          {running ? (phase === 'inhale' ? 'Breathe in' : 'Breathe out') : 'Ready'}
        </div>
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
          Guide tone
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
    </main>
  )
}
