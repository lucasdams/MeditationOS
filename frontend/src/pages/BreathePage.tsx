import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { ApiError } from '../services/api'
import { BreathAudio } from '../lib/breathAudio'

const PRESETS = [
  { label: '6 bpm · balanced', bpm: 6 },
  { label: '3 bpm · slow', bpm: 3 },
  { label: '1.5 bpm · extended', bpm: 1.5 },
  { label: '1 bpm · advanced', bpm: 1 },
]

// 2:3 in:out ratio: inhale = 40% of the cycle, exhale = 60%.
const phaseSeconds = (bpm: number) => {
  const cycle = 60 / bpm
  return { inhale: (cycle * 2) / 5, exhale: (cycle * 3) / 5 }
}

const MIN_SCALE = 0.35
const MAX_SCALE = 1

type Phase = 'inhale' | 'exhale'

export default function BreathePage() {
  const navigate = useNavigate()
  const [bpm, setBpm] = useState(6)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState<Phase>('inhale')
  const [scale, setScale] = useState(MIN_SCALE)
  const [elapsed, setElapsed] = useState(0)
  const [cycles, setCycles] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [audioOn, setAudioOn] = useState(false)
  const [volume, setVolume] = useState(0.2)

  // Animation state in refs so the rAF loop reads fresh values without re-subscribing.
  const rafRef = useRef<number | undefined>(undefined)
  const startRef = useRef(0)
  const phaseStartRef = useRef(0)
  const phaseRef = useRef<Phase>('inhale')
  const cyclesRef = useRef(0)
  const phaseSecsRef = useRef(phaseSeconds(bpm))
  useEffect(() => {
    phaseSecsRef.current = phaseSeconds(bpm)
  }, [bpm])

  // Audio guide (lazily created so the AudioContext only opens on a user gesture).
  const audioRef = useRef<BreathAudio | null>(null)
  const audioOnRef = useRef(audioOn)
  const volumeRef = useRef(volume)
  useEffect(() => {
    audioOnRef.current = audioOn
    volumeRef.current = volume
  }, [audioOn, volume])

  function audio(): BreathAudio {
    if (!audioRef.current) audioRef.current = new BreathAudio()
    audioRef.current.volume = volumeRef.current
    return audioRef.current
  }

  function cuePhase(p: Phase) {
    if (!audioOnRef.current) return
    const dur = p === 'inhale' ? phaseSecsRef.current.inhale : phaseSecsRef.current.exhale
    audio().playPhase(p, dur)
  }

  // Stop the tone on unmount.
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
      setElapsed((now - startRef.current) / 1000)

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
    startRef.current = now - elapsed * 1000 // resume preserves elapsed
    phaseStartRef.current = now
    phaseRef.current = 'inhale'
    setPhase('inhale')
    setRunning(true)
    if (audioOnRef.current) audio().resume()
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

  function reset() {
    setRunning(false)
    setElapsed(0)
    setCycles(0)
    cyclesRef.current = 0
    setScale(MIN_SCALE)
    setPhase('inhale')
  }

  async function finish() {
    setRunning(false)
    audioRef.current?.stop()
    if (elapsed < 1) {
      reset()
      navigate('/')
      return
    }
    setError(null)
    setSaving(true)
    const { inhale, exhale } = phaseSeconds(bpm)
    try {
      await sessionService.create({
        type: 'resonance_breathing',
        duration_seconds: Math.round(elapsed),
        occurred_at: new Date().toISOString(),
        inhale_seconds: Math.round(inhale),
        exhale_seconds: Math.round(exhale),
        cycles_completed: cyclesRef.current,
      })
      navigate('/sessions')
    } catch (err) {
      setError(
        err instanceof ApiError ? 'Could not save the session.' : 'Something went wrong.',
      )
      setSaving(false)
    }
  }

  const mins = Math.floor(elapsed / 60)
  const secs = Math.floor(elapsed % 60)

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
          {mins}:{secs.toString().padStart(2, '0')}
        </span>
        <span>{cycles} cycles</span>
        <span>{bpm} bpm</span>
      </div>

      <label htmlFor="rate">Pace</label>
      <select
        id="rate"
        value={bpm}
        disabled={running}
        onChange={(e) => setBpm(Number(e.target.value))}
      >
        {PRESETS.map((p) => (
          <option key={p.bpm} value={p.bpm}>
            {p.label}
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
          Audio guide
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          disabled={!audioOn}
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
    </main>
  )
}
