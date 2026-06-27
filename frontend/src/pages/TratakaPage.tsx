import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import Modal from '../components/Modal'
import RatingChips from '../components/RatingChips'
import { ErrorBanner } from '../components/StateViews'
import { mmss } from '../lib/format'
import Stepper, { type StepperOption } from '../components/Stepper'
import SoundscapePicker from '../components/SoundscapePicker'
import Flame from '../components/Flame'
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
import {
  SoundscapeEngine,
  loadSoundscapePref,
  type SoundscapeName,
} from '../lib/soundscapes'
import type { DashboardStats, MeditationType, SessionCreate } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails,
// so buildXpBreakdown yields an all-zero breakdown rather than a crash. Mirrors MeditatePage.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// Trataka is a concentration (dharana) practice — a form of mindfulness. We log it under
// the EXISTING `mindfulness` session type rather than adding a new DB type, so it earns
// XP, completes the "meditate" quest, and feeds streaks like any sit — no migration.
const SESSION_TYPE: MeditationType = 'mindfulness'

const DRAFT_PAGE = 'trataka'

// Target length; 0 = open-ended (count up, finish manually). Trataka sits are usually
// short to start, so the steps lean shorter than the meditation timer's.
const DURATIONS: StepperOption<number>[] = [
  { value: 0, label: 'Open' },
  { value: 2, label: '2 min' },
  { value: 5, label: '5 min' },
  { value: 10, label: '10 min' },
  { value: 15, label: '15 min' },
  { value: 20, label: '20 min' },
]

export default function TratakaPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  // Respect the OS reduced-motion preference: the flame falls back to a still (or barely
  // moving) frame instead of the organic sway. Mirrors BreathePage's reduced-motion gate.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [targetMin, setTargetMin] = useState(5)
  const [soundscape, setSoundscape] = useState<SoundscapeName>(loadSoundscapePref)
  const [soundscapeVol, setSoundscapeVol] = useState(0.4)
  const soundscapeEngineRef = useRef<SoundscapeEngine | null>(null)
  const soundscapeRef = useRef(soundscape)
  const soundscapeVolRef = useRef(soundscapeVol)

  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  // A brief "where to look" cue shown at the start of a gaze, then faded out.
  const [guideVisible, setGuideVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    breakdown: XpLine[]
  } | null>(null)

  // Post-session reflection — shown after the reward overlay closes (focus/calm/notes).
  const savedSessionIdRef = useRef<string | null>(null)
  const [showReflection, setShowReflection] = useState(false)
  const [reflectFocus, setReflectFocus] = useState('')
  const [reflectCalm, setReflectCalm] = useState('')
  const [reflectNotes, setReflectNotes] = useState('')
  const [reflectSaving, setReflectSaving] = useState(false)
  const [reflectError, setReflectError] = useState<string | null>(null)

  // Recovery for an unsaved sit (same idempotent client_token machinery as MeditatePage).
  const [restorable, setRestorable] = useState<SessionDraft | null>(() =>
    readRestorableDraft(DRAFT_PAGE),
  )
  const tokenRef = useRef<string | null>(null)
  const startedAtRef = useRef('')
  const elapsedRef = useRef(0)
  const savedRef = useRef(false)

  // Timing in refs so the interval loop reads fresh values. elapsed = base + (now − start),
  // derived from absolute time so a backgrounded tab catches up rather than drifts.
  const baseElapsedRef = useRef(0)
  const startRef = useRef(0)
  const targetRef = useRef(targetMin)
  useEffect(() => {
    targetRef.current = targetMin
  }, [targetMin])

  useEffect(() => {
    soundscapeRef.current = soundscape
    soundscapeVolRef.current = soundscapeVol
  }, [soundscape, soundscapeVol])

  useEffect(() => {
    soundscapeEngineRef.current?.setVolume(soundscapeVol)
  }, [soundscapeVol])

  useEffect(() => {
    return () => {
      soundscapeEngineRef.current?.stop()
    }
  }, [])

  // Surface the focus cue when a gaze begins, then fade it after a few seconds so only
  // the flame remains. Re-shows on each start/resume; cleared on pause and unmount.
  useEffect(() => {
    if (!running) {
      setGuideVisible(false)
      return
    }
    setGuideVisible(true)
    const id = setTimeout(() => setGuideVisible(false), 5000)
    return () => clearTimeout(id)
  }, [running])

  function draftPayload(elapsedSec: number): SessionCreate | null {
    if (!tokenRef.current || elapsedSec < MIN_DRAFT_SECONDS) return null
    return {
      type: SESSION_TYPE,
      duration_seconds: Math.floor(elapsedSec),
      occurred_at: startedAtRef.current || new Date().toISOString(),
      client_token: tokenRef.current,
    }
  }

  function persistDraft(elapsedSec: number) {
    const payload = draftPayload(elapsedSec)
    if (!payload) return
    writeDraft(DRAFT_PAGE, {
      clientToken: payload.client_token as string,
      label: 'Candle gazing',
      elapsedSeconds: Math.floor(elapsedSec),
      payload,
      savedAt: Date.now(),
    })
  }

  // Best-effort save when the tab is actually closing (not a mere tab switch).
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

  // The clock runs on setInterval, which keeps firing in a background tab (unlike rAF),
  // so a timed sit still completes and saves even if the user switches away to gaze
  // elsewhere or the tab is hidden.
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
        stopSoundscape()
        void saveSession(targetSec)
      }
    }, 250)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  function startSoundscape(name: SoundscapeName = soundscapeRef.current) {
    if (name === 'silent') {
      // No ambient sound for this sit — stop any lingering preview.
      soundscapeEngineRef.current?.stop()
      return
    }
    if (!soundscapeEngineRef.current) soundscapeEngineRef.current = new SoundscapeEngine()
    // Reuse a matching preview without re-starting (shared engine → no double-play).
    if (soundscapeEngineRef.current.active !== name) {
      soundscapeEngineRef.current.start(name, soundscapeVolRef.current)
    }
  }

  function stopSoundscape() {
    soundscapeEngineRef.current?.stop()
  }

  function start() {
    startRef.current = performance.now()
    baseElapsedRef.current = elapsed
    setRunning(true)
    startSoundscape()
    if (elapsed < 1) {
      tokenRef.current = newClientToken()
      startedAtRef.current = new Date().toISOString()
      savedRef.current = false
      setRestorable(null)
    }
  }

  function pause() {
    baseElapsedRef.current += (performance.now() - startRef.current) / 1000
    setRunning(false)
    stopSoundscape()
    persistDraft(baseElapsedRef.current)
  }

  function reset() {
    setRunning(false)
    stopSoundscape()
    setElapsed(0)
    baseElapsedRef.current = 0
    elapsedRef.current = 0
    tokenRef.current = null
    clearDraft(DRAFT_PAGE)
    setError(null)
  }

  async function saveSession(durationSec: number) {
    setError(null)
    setSaving(true)
    const before = await dashboardService.getStats().catch(() => ZERO_STATS)

    let saved: { id: string }
    try {
      saved = await sessionService.create({
        type: SESSION_TYPE,
        duration_seconds: Math.floor(durationSec), // floor — never inflate logged time
        occurred_at: startedAtRef.current || new Date().toISOString(),
        client_token: tokenRef.current ?? undefined,
      })
    } catch (err) {
      setError(err instanceof ApiError ? "Couldn't save the session." : messageForError(err))
      setSaving(false)
      return
    }

    savedSessionIdRef.current = saved.id
    savedRef.current = true
    clearDraft(DRAFT_PAGE)

    const after = await dashboardService.getStats().catch(() => ZERO_STATS)
    const bd = buildXpBreakdown(before, after, '🕯️ Candle gazing')
    setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
  }

  function finish() {
    if (running) pause()
    stopSoundscape()
    if (elapsed < 1) {
      navigate('/')
      return
    }
    void saveSession(elapsed)
  }

  async function restoreSave() {
    if (!restorable) return
    setSaving(true)
    setError(null)
    try {
      await sessionService.create(restorable.payload)
      clearDraft(DRAFT_PAGE)
      setRestorable(null)
      showToast('That sit is yours.')
    } catch {
      setError("Couldn't save that session.")
    } finally {
      setSaving(false)
    }
  }

  function discardRestore() {
    clearDraft(DRAFT_PAGE)
    setRestorable(null)
  }

  // Patch the already-saved session with reflection data (no double-save), then leave.
  async function saveReflection() {
    const sid = savedSessionIdRef.current
    if (!sid) {
      navigate('/')
      return
    }
    const payload: Record<string, unknown> = {}
    if (reflectFocus) payload.focus = Number(reflectFocus)
    if (reflectCalm) payload.calm = Number(reflectCalm)
    const trimmedNotes = reflectNotes.trim()
    if (trimmedNotes) payload.notes = trimmedNotes
    if (Object.keys(payload).length === 0) {
      navigate('/')
      return
    }
    setReflectSaving(true)
    setReflectError(null)
    try {
      await sessionService.update(sid, payload)
      navigate('/')
    } catch (err) {
      setReflectError(
        err instanceof ApiError ? "Couldn't save reflection." : messageForError(err),
      )
      setReflectSaving(false)
    }
  }

  const targetSec = targetMin * 60
  const remaining = targetSec > 0 ? Math.max(0, targetSec - elapsed) : elapsed
  const started = running || elapsed > 0
  const settingsDisabled = started

  // Flame motion: still when reduced-motion is on (a single calm frame), otherwise a
  // slightly calmer sway while idle and a full gentle sway while gazing.
  const flameIntensity = prefersReducedMotion ? 0 : running ? 1 : 0.5

  return (
    <main
      id="main-content"
      className={`breathe trataka${running ? ' trataka-immersive' : ''}`}
    >
      <Link to="/" className="back-link">← Dashboard</Link>
      <header className="page-head">
        <h1>Candle gazing</h1>
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

      <div className="breathe-stage trataka-stage">
        <Flame intensity={flameIntensity} size={running ? 360 : 220} />
        {running && (
          <p className={`trataka-guide${guideVisible ? '' : ' is-hidden'}`}>
            Rest your gaze softly on the flame
          </p>
        )}
        {started && <span className="trataka-time">{mmss(remaining)}</span>}
        <div className="breathe-phase">
          {running ? 'Rest your gaze on the flame' : elapsed > 0 ? 'Paused' : 'Eyes open · gaze softly'}
        </div>
      </div>

      {started && (
        <div className="breathe-stats">
          <span>{mmss(elapsed)} elapsed</span>
          {targetMin > 0 && <span>{targetMin} min gaze</span>}
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

      <details className="meditate-disclosure">
        <summary className="meditate-disclosure-summary">Ambient sound</summary>
        <div className="meditate-disclosure-body">
          <SoundscapePicker
            value={soundscape}
            volume={soundscapeVol}
            previewEngineRef={soundscapeEngineRef}
            previewEnabled={!started}
            onSoundscapeChange={(name) => {
              setSoundscape(name)
              // Route through startSoundscape so the "don't restart a matching engine"
              // guard holds here too (state ref lags a render, so pass name explicitly).
              if (running) startSoundscape(name)
            }}
            onVolumeChange={setSoundscapeVol}
          />
        </div>
      </details>

      <ErrorBanner message={error} />

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

      {/* ── About: tucked into a collapsed disclosure so the practice stays the focus ── */}
      <details className="trataka-about">
        <summary className="trataka-about-summary">About candle gazing</summary>
        <div className="trataka-about-body">
        <p>
          Candle gazing — traditionally called <em>Trataka</em> — is a yogic concentration
          practice (a form of <em>dharana</em>): you rest your open gaze on a single point,
          classically a candle flame, and let your attention settle there. When the mind
          wanders, you gently bring it back to the flame.
        </p>
        <p>
          It's traditionally used to <strong>train sustained attention</strong> — the idea being
          that steadying your visual focus on one spot can carry over into steadier attention
          overall. Research into concentration practices is still emerging, so we hold this as a
          long-standing practice people find helpful, not a proven outcome.
        </p>
        <p>
          Some people with attention difficulties find single-point focus grounding. That said,
          candle gazing is <strong>not a treatment for ADHD or any condition</strong> and is no
          substitute for professional care — if you have medical concerns, please speak with a
          qualified professional.
        </p>
        <p className="trataka-about-note">
          A gentle, traditional focus practice — supportive, not clinical, and not a medical
          measurement or diagnosis.
        </p>
        </div>
      </details>

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          breakdown={reward.breakdown}
          onClose={() => {
            setReward(null)
            if (savedSessionIdRef.current) setShowReflection(true)
            else navigate('/')
          }}
        />
      )}

      {showReflection && (
        <Modal ariaLabel="Reflect on your gaze" cardClassName="biometric-card session-reflect-card">
          <h2>How was that?</h2>
          <p className="biometric-intro">
            Optional — rate it, or jot a quick note.
          </p>

          <div className="session-reflect-ratings">
            <div className="session-reflect-row">
              <span className="session-reflect-label">Focus</span>
              <RatingChips
                ariaLabel="Focus"
                notRatedLabel="—"
                value={reflectFocus}
                onChange={setReflectFocus}
              />
            </div>
            <div className="session-reflect-row">
              <span className="session-reflect-label">Calm</span>
              <RatingChips
                ariaLabel="Calm"
                notRatedLabel="—"
                value={reflectCalm}
                onChange={setReflectCalm}
              />
            </div>
          </div>

          <div className="session-reflect-notes">
            <label htmlFor="reflect-notes" className="session-reflect-notes-label">
              Notes (optional)
            </label>
            <textarea
              id="reflect-notes"
              rows={3}
              placeholder="Anything that arose…"
              value={reflectNotes}
              onChange={(e) => setReflectNotes(e.target.value)}
            />
          </div>

          <ErrorBanner message={reflectError} />

          <div className="biometric-actions">
            <button type="button" onClick={saveReflection} disabled={reflectSaving}>
              {reflectSaving ? 'Saving…' : 'Keep it'}
            </button>
            <button
              type="button"
              className="link-neutral"
              onClick={() => navigate('/')}
              disabled={reflectSaving}
            >
              Skip
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}
