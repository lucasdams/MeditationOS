import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { playBell } from '../lib/sfx'
import { newlyCompletedQuests } from '../lib/quests'
import RewardOverlay from '../components/RewardOverlay'
import Stepper, { type StepperOption } from '../components/Stepper'
import type { MeditationType } from '../types'

// Unguided meditation styles (existing session types). Resonance breathing has its
// own dedicated page, so it's intentionally not offered here.
const TYPES: { value: MeditationType; label: string }[] = [
  { value: 'mindfulness', label: 'Mindfulness' },
  { value: 'body_scan', label: 'Body scan' },
  { value: 'walking', label: 'Walking' },
  { value: 'loving_kindness', label: 'Loving-kindness' },
  { value: 'other', label: 'Other' },
]

// Target length; 0 = open-ended (count up, finish manually). Stepped left→right,
// so "Open" sits at the low end and the increments grow as you step right.
const DURATIONS: StepperOption<number>[] = [
  { value: 0, label: 'Open' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '60 min' },
  { value: 90, label: '90 min' },
]

// Interval bell cadence; 0 = off.
const INTERVALS = [
  { label: 'Off', min: 0 },
  { label: 'Every 5 min', min: 5 },
  { label: 'Every 10 min', min: 10 },
]

const mmss = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export default function MeditatePage() {
  const navigate = useNavigate()
  const [type, setType] = useState<MeditationType>('mindfulness')
  const [targetMin, setTargetMin] = useState(10)
  const [intervalMin, setIntervalMin] = useState(0)
  const [bellsOn, setBellsOn] = useState(true)
  const [volume, setVolume] = useState(0.6)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    quests: string[]
  } | null>(null)

  // Timing in refs so the interval loop reads fresh values without re-subscribing.
  // `baseElapsedRef` accumulates active seconds across pauses; `startRef` marks the
  // start of the current run segment. elapsed = base + (now − start). This survives a
  // backgrounded tab because the math is from absolute time, not a per-frame counter.
  const baseElapsedRef = useRef(0)
  const startRef = useRef(0)
  // The last interval-bell mark already rung (so each mark rings exactly once).
  const lastBellMarkRef = useRef(0)
  const targetRef = useRef(targetMin)
  const intervalRef = useRef(intervalMin)
  const bellsOnRef = useRef(bellsOn)
  const volumeRef = useRef(volume)
  useEffect(() => {
    targetRef.current = targetMin
    intervalRef.current = intervalMin
    bellsOnRef.current = bellsOn
    volumeRef.current = volume
  }, [targetMin, intervalMin, bellsOn, volume])

  function bell() {
    if (bellsOnRef.current) {
      try {
        playBell(volumeRef.current)
      } catch (err) {
        console.warn('bell failed', err)
      }
    }
  }

  // The clock + bell scheduling run on setInterval, which keeps firing in a
  // background tab (unlike requestAnimationFrame) — so a timed sit still completes.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const now = performance.now()
      const total = baseElapsedRef.current + (now - startRef.current) / 1000
      setElapsed(total)

      const targetSec = targetRef.current * 60
      if (targetSec > 0 && total >= targetSec) {
        clearInterval(id)
        setElapsed(targetSec)
        setRunning(false)
        bell() // closing bell
        void saveSession(targetSec)
        return
      }

      // Ring on each new interval mark, but never within the final half-second
      // (the closing bell covers the end).
      const stepSec = intervalRef.current * 60
      if (stepSec > 0) {
        const mark = Math.floor(total / stepSec)
        const beforeEnd = targetSec === 0 || total < targetSec - 0.5
        if (mark > lastBellMarkRef.current && beforeEnd) {
          lastBellMarkRef.current = mark
          bell()
        }
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  function start() {
    startRef.current = performance.now()
    baseElapsedRef.current = elapsed
    setRunning(true)
    if (elapsed < 1) bell() // opening bell on a fresh sit, not on resume
  }

  function pause() {
    baseElapsedRef.current += (performance.now() - startRef.current) / 1000
    setRunning(false)
  }

  function reset() {
    setRunning(false)
    setElapsed(0)
    baseElapsedRef.current = 0
    lastBellMarkRef.current = 0
    setError(null)
  }

  async function saveSession(durationSec: number) {
    setError(null)
    setSaving(true)
    try {
      const before = await dashboardService.getStats()
      await sessionService.create({
        type,
        duration_seconds: Math.floor(durationSec), // floor — never inflate the logged time
        occurred_at: new Date().toISOString(),
      })
      const after = await dashboardService.getStats()
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
    if (running) pause()
    if (elapsed < 1) {
      navigate('/')
      return
    }
    bell() // closing bell
    void saveSession(elapsed)
  }

  const targetSec = targetMin * 60
  const remaining = targetSec > 0 ? Math.max(0, targetSec - elapsed) : elapsed
  const settingsDisabled = running || elapsed > 0

  return (
    <main className="breathe">
      <header>
        <h1>Meditate</h1>
        <Link to="/">← Dashboard</Link>
      </header>

      <div className="breathe-stage">
        <div className={`meditate-orb ${running ? 'running' : 'idle'}`}>
          <span className="meditate-time">{mmss(remaining)}</span>
        </div>
        <div className="breathe-phase">
          {running ? 'Be here' : elapsed > 0 ? 'Paused' : 'Ready'}
        </div>
      </div>

      <div className="breathe-stats">
        <span>{mmss(elapsed)} elapsed</span>
        {targetMin > 0 && <span>{targetMin} min sit</span>}
      </div>

      <label htmlFor="type">Type</label>
      <select
        id="type"
        value={type}
        disabled={settingsDisabled}
        onChange={(e) => setType(e.target.value as MeditationType)}
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <label>Duration</label>
      <Stepper
        options={DURATIONS}
        value={targetMin}
        disabled={settingsDisabled}
        ariaLabel="Duration"
        onChange={setTargetMin}
      />

      <label htmlFor="interval">Interval bell</label>
      <select
        id="interval"
        value={intervalMin}
        disabled={settingsDisabled}
        onChange={(e) => setIntervalMin(Number(e.target.value))}
      >
        {INTERVALS.map((i) => (
          <option key={i.min} value={i.min}>
            {i.label}
          </option>
        ))}
      </select>

      <label className="breathe-check">
        <input
          type="checkbox"
          checked={bellsOn}
          onChange={(e) => {
            setBellsOn(e.target.checked)
            if (e.target.checked) playBell(volume) // preview the bell you just enabled
          }}
        />
        Bells (at the start, each interval, and the end)
      </label>

      <label htmlFor="bell-volume">Volume</label>
      <input
        id="bell-volume"
        className="breathe-volume"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        disabled={!bellsOn}
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
        <button type="button" className="secondary" onClick={finish} disabled={saving}>
          {saving ? 'Saving…' : 'Finish & save'}
        </button>
      </div>

      {elapsed > 0 && !running && !saving && (
        <button type="button" className="meditate-reset" onClick={reset}>
          Reset
        </button>
      )}

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          questsCompleted={reward.quests}
          onClose={() => navigate('/')}
        />
      )}
    </main>
  )
}
