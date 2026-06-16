import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { playBell } from '../lib/sfx'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import BiometricCapture from '../components/BiometricCapture'
import Stepper, { type StepperOption } from '../components/Stepper'
import { useToast } from '../context/ToastContext'
import {
  MIN_DRAFT_SECONDS,
  beaconSave,
  clearDraft,
  newClientToken,
  readRestorableDraft,
  writeDraft,
  type SessionDraft,
} from '../lib/sessionDraft'
import type { MeditationType, SessionCreate } from '../types'

const DRAFT_PAGE = 'meditate'

// Unguided meditation styles (existing session types). Resonance breathing has its
// own dedicated page, so it's intentionally not offered here.
// Unguided meditation sessions are all stored under one type — the style picker was
// dropped (it was descriptive-only metadata). Breathing keeps its own type, set by the
// Breathe page.
const MEDITATION_TYPE: MeditationType = 'mindfulness'

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

// One control for all bells. "Off" silences them; otherwise a soft bell rings at the
// start and end, and optionally on an interval. Replaces a separate on/off checkbox +
// interval dropdown that overlapped confusingly.
const BELL_MODES = [
  { value: 'off', label: 'Off' },
  { value: 'ends', label: 'At start & end' },
  { value: 'every5', label: 'Start, end & every 5 min' },
  { value: 'every10', label: 'Start, end & every 10 min' },
]

const mmss = (totalSec: number) => {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

export default function MeditatePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
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
    breakdown: XpLine[]
  } | null>(null)
  // The id of the just-saved sit, so an optional post-session reading can link to it.
  const savedSessionIdRef = useRef<string | null>(null)
  // After the reward overlay closes, offer a skippable "log a quick reading?".
  const [showReading, setShowReading] = useState(false)
  // Recovery for an unsaved sit: a leftover draft to offer on load, plus the live
  // bits the draft/beacon read at tab-close time (kept in refs so listeners see fresh
  // values). `tokenRef` ties a manual save and the auto-save to one row (idempotent).
  const [restorable, setRestorable] = useState<SessionDraft | null>(() =>
    readRestorableDraft(DRAFT_PAGE),
  )
  const tokenRef = useRef<string | null>(null)
  const startedAtRef = useRef('')
  const elapsedRef = useRef(0)
  const savedRef = useRef(false)

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

  // The session payload for the current sit (or null if there's nothing worth saving).
  function draftPayload(elapsedSec: number): SessionCreate | null {
    if (!tokenRef.current || elapsedSec < MIN_DRAFT_SECONDS) return null
    return {
      type: MEDITATION_TYPE,
      duration_seconds: Math.floor(elapsedSec),
      occurred_at: startedAtRef.current || new Date().toISOString(),
      client_token: tokenRef.current,
    }
  }

  // Stash the in-progress sit so it can be restored if the tab closes before saving.
  function persistDraft(elapsedSec: number) {
    const payload = draftPayload(elapsedSec)
    if (!payload) return
    writeDraft(DRAFT_PAGE, {
      clientToken: payload.client_token as string,
      label: 'Meditation',
      elapsedSeconds: Math.floor(elapsedSec),
      payload,
      savedAt: Date.now(),
    })
  }

  // Best-effort save when the tab is actually closing (not on a mere tab switch).
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

  // The clock + bell scheduling run on setInterval, which keeps firing in a
  // background tab (unlike requestAnimationFrame) — so a timed sit still completes.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      const now = performance.now()
      const total = baseElapsedRef.current + (now - startRef.current) / 1000
      setElapsed(total)
      elapsedRef.current = total
      persistDraft(total)

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
    if (elapsed < 1) {
      // Fresh sit: new idempotency token + start time, and clear any old restore offer.
      tokenRef.current = newClientToken()
      startedAtRef.current = new Date().toISOString()
      savedRef.current = false
      setRestorable(null)
      bell() // opening bell on a fresh sit, not on resume
    }
  }

  function pause() {
    baseElapsedRef.current += (performance.now() - startRef.current) / 1000
    setRunning(false)
    persistDraft(baseElapsedRef.current)
  }

  function reset() {
    setRunning(false)
    setElapsed(0)
    baseElapsedRef.current = 0
    elapsedRef.current = 0
    lastBellMarkRef.current = 0
    tokenRef.current = null
    clearDraft(DRAFT_PAGE)
    setError(null)
  }

  async function saveSession(durationSec: number) {
    setError(null)
    setSaving(true)
    try {
      const before = await dashboardService.getStats()
      const saved = await sessionService.create({
        type: MEDITATION_TYPE,
        duration_seconds: Math.floor(durationSec), // floor — never inflate the logged time
        occurred_at: startedAtRef.current || new Date().toISOString(),
        client_token: tokenRef.current ?? undefined,
      })
      savedSessionIdRef.current = saved.id
      // Saved — drop the recovery draft and stop any tab-close beacon from re-firing.
      savedRef.current = true
      clearDraft(DRAFT_PAGE)
      const after = await dashboardService.getStats()
      const bd = buildXpBreakdown(before, after, '🧘 Meditation')
      setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
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

  // Save an unsaved sit recovered from a previous visit. Idempotent on its token, so if
  // the tab-close beacon already saved it, this just no-ops server-side.
  async function restoreSave() {
    if (!restorable) return
    setSaving(true)
    setError(null)
    try {
      await sessionService.create(restorable.payload)
      clearDraft(DRAFT_PAGE)
      setRestorable(null)
      showToast('Session saved.')
    } catch {
      setError('Could not save that session.')
    } finally {
      setSaving(false)
    }
  }

  function discardRestore() {
    clearDraft(DRAFT_PAGE)
    setRestorable(null)
  }

  const targetSec = targetMin * 60
  const remaining = targetSec > 0 ? Math.max(0, targetSec - elapsed) : elapsed
  // A sit is "underway" once started (running) or partway (paused). Before that, the
  // session readouts (timer, elapsed, finish) are just noise over the setup form.
  const started = running || elapsed > 0
  const settingsDisabled = started

  // The single "Bells" control maps to the underlying on/off + interval cadence.
  const bellMode = !bellsOn ? 'off' : intervalMin === 5 ? 'every5' : intervalMin === 10 ? 'every10' : 'ends'
  function setBellMode(value: string) {
    if (value === 'off') {
      setBellsOn(false)
      return
    }
    setBellsOn(true)
    setIntervalMin(value === 'every5' ? 5 : value === 'every10' ? 10 : 0)
    playBell(volume) // preview the bell you just enabled
  }

  return (
    <main className="breathe">
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Meditate</h1>
      </header>

      {restorable && !started && (
        <div className="session-recover">
          <span>
            Unsaved {restorable.label.toLowerCase()} sit ·{' '}
            {Math.round(restorable.elapsedSeconds / 60)} min from earlier.
          </span>
          <div className="session-recover-actions">
            <button type="button" onClick={restoreSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save it'}
            </button>
            <button type="button" className="link-neutral" onClick={discardRestore}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="breathe-stage">
        <div className={`meditate-orb ${running ? 'running' : 'idle'}`}>
          {started && <span className="meditate-time">{mmss(remaining)}</span>}
        </div>
        <div className="breathe-phase">
          {running ? 'Be here' : elapsed > 0 ? 'Paused' : 'Ready when you are'}
        </div>
      </div>

      {started && (
        <div className="breathe-stats">
          <span>{mmss(elapsed)} elapsed</span>
          {targetMin > 0 && <span>{targetMin} min sit</span>}
        </div>
      )}

      <label>Duration</label>
      <Stepper
        options={DURATIONS}
        value={targetMin}
        disabled={settingsDisabled}
        ariaLabel="Duration"
        onChange={setTargetMin}
      />

      <label htmlFor="bells">Bells</label>
      <select id="bells" value={bellMode} onChange={(e) => setBellMode(e.target.value)}>
        {BELL_MODES.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>

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
        {started && (
          <button type="button" className="secondary" onClick={finish} disabled={saving}>
            {saving ? 'Saving…' : 'Finish & save'}
          </button>
        )}
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
          breakdown={reward.breakdown}
          onClose={() => {
            setReward(null)
            // Offer the optional reading once the reward is dismissed — never blocks.
            if (savedSessionIdRef.current) setShowReading(true)
            else navigate('/')
          }}
        />
      )}

      {showReading && savedSessionIdRef.current && (
        <BiometricCapture
          context="post"
          sessionId={savedSessionIdRef.current}
          title="Log a quick reading?"
          intro="Optional: your heart rate now, to see how a sit settles you over time."
          onDone={() => {
            showToast('Reading saved.')
            navigate('/')
          }}
          onSkip={() => navigate('/')}
        />
      )}
    </main>
  )
}
