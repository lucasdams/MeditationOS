import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sessionService } from '../services/sessions'
import { dashboardService } from '../services/dashboard'
import { biometricsService } from '../services/biometrics'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { playBell } from '../lib/sfx'
import { buildXpBreakdown, type XpLine } from '../lib/xpBreakdown'
import RewardOverlay from '../components/RewardOverlay'
import BiometricCapture from '../components/BiometricCapture'
import Modal from '../components/Modal'
import RatingChips from '../components/RatingChips'
import { ErrorBanner } from '../components/StateViews'
import { mmss } from '../lib/format'
import GuidedCues from '../components/GuidedCues'
import Stepper, { type StepperOption } from '../components/Stepper'
import SoundscapePicker from '../components/SoundscapePicker'
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
import { dailySuggestion } from '../lib/intentionPrompts'
import { GUIDED_STRUCTURES, type GuidedStructureId } from '../lib/guidedSessions'
import {
  SoundscapeEngine,
  loadSoundscapePref,
  type SoundscapeName,
} from '../lib/soundscapes'
import type { DashboardStats, MeditationType, SessionCreate } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
// Passing it to buildXpBreakdown yields an all-zero breakdown rather than a crash.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

// localStorage key for the Sound & bells disclosure open/closed state.
const SOUND_DISCLOSURE_KEY = 'meditate:sound-disclosure-open'

function readSoundDisclosureOpen(): boolean {
  try {
    return localStorage.getItem(SOUND_DISCLOSURE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeSoundDisclosureOpen(open: boolean) {
  try {
    localStorage.setItem(SOUND_DISCLOSURE_KEY, String(open))
  } catch {
    // ignore
  }
}

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

// Persist the last-chosen guided structure across sessions.
const GUIDED_STRUCTURE_KEY = 'meditate:guided-structure'
type GuidedChoice = GuidedStructureId | 'none'

function readGuidedChoice(): GuidedChoice {
  try {
    const v = localStorage.getItem(GUIDED_STRUCTURE_KEY)
    if (v === 'body-scan' || v === 'loving-kindness') return v
    return 'none'
  } catch {
    return 'none'
  }
}

function writeGuidedChoice(choice: GuidedChoice) {
  try {
    localStorage.setItem(GUIDED_STRUCTURE_KEY, choice)
  } catch {
    // ignore — preference simply won't persist
  }
}

export default function MeditatePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [targetMin, setTargetMin] = useState(10)
  const [intervalMin, setIntervalMin] = useState(0)
  const [bellsOn, setBellsOn] = useState(true)
  const [volume, setVolume] = useState(0.6)
  const [guidedChoice, setGuidedChoiceState] = useState<GuidedChoice>(readGuidedChoice)
  const [soundDisclosureOpen, setSoundDisclosureOpen] = useState(readSoundDisclosureOpen)
  const [soundscape, setSoundscape] = useState<SoundscapeName>(loadSoundscapePref)
  const [soundscapeVol, setSoundscapeVol] = useState(0.4)
  const soundscapeEngineRef = useRef<SoundscapeEngine | null>(null)
  const soundscapeRef = useRef(soundscape)
  const soundscapeVolRef = useRef(soundscapeVol)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [reward, setReward] = useState<{
    afterXp: number
    xpGained: number
    breakdown: XpLine[]
  } | null>(null)

  // Pre-session intention — optional, skippable, max 140 chars.
  const [intention, setIntention] = useState('')

  // Post-session reflection — shown after the reward overlay closes.
  const [showReflection, setShowReflection] = useState(false)
  const [reflectFocus, setReflectFocus] = useState('')
  const [reflectCalm, setReflectCalm] = useState('')
  const [reflectNotes, setReflectNotes] = useState('')
  const [reflectSaving, setReflectSaving] = useState(false)
  const [reflectError, setReflectError] = useState<string | null>(null)

  // The id of the just-saved sit, so the reflection and optional reading can link to it.
  const savedSessionIdRef = useRef<string | null>(null)
  // After the reflection step, offer a skippable "log a quick reading?".
  const [showReading, setShowReading] = useState(false)

  // Optional pre-session HRV reading: captured before the sit (so it has no session
  // yet), then linked to the saved session afterwards so the pre/post delta can pair
  // them. `showPreReading` toggles the capture modal; the ref holds the saved id.
  const [showPreReading, setShowPreReading] = useState(false)
  const preReadingIdRef = useRef<string | null>(null)

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

  useEffect(() => {
    soundscapeRef.current = soundscape
    soundscapeVolRef.current = soundscapeVol
  }, [soundscape, soundscapeVol])

  // Keep soundscape engine in sync with live volume changes.
  useEffect(() => {
    soundscapeEngineRef.current?.setVolume(soundscapeVol)
  }, [soundscapeVol])

  // Stop and clean up the soundscape engine on unmount.
  useEffect(() => {
    return () => {
      soundscapeEngineRef.current?.stop()
    }
  }, [])

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
        stopSoundscape()
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

  function startSoundscape() {
    const name = soundscapeRef.current
    if (name === 'silent') {
      // No ambient sound for this sit — stop any lingering preview.
      soundscapeEngineRef.current?.stop()
      return
    }
    if (!soundscapeEngineRef.current) soundscapeEngineRef.current = new SoundscapeEngine()
    // Hand off from a matching preview without re-starting: the pre-session preview and
    // the session share one engine, so if it's already playing this exact soundscape we
    // leave it running (no double-play). Otherwise start/switch it.
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
    stopSoundscape()
    persistDraft(baseElapsedRef.current)
  }

  function reset() {
    setRunning(false)
    stopSoundscape()
    setElapsed(0)
    baseElapsedRef.current = 0
    elapsedRef.current = 0
    lastBellMarkRef.current = 0
    tokenRef.current = null
    clearDraft(DRAFT_PAGE)
    setError(null)
    setIntention('')
    // Drop any captured-but-unlinked pre-reading reference for the abandoned sit.
    preReadingIdRef.current = null
  }

  async function saveSession(durationSec: number) {
    setError(null)
    setSaving(true)
    const trimmedIntention = intention.trim() || undefined

    // Fetch pre-save stats outside the save try/catch so a getStats failure before
    // the create does not silently swallow the real save error. If the pre-fetch fails
    // we still save; XP breakdown will show zeros.
    const before = await dashboardService.getStats().catch(() => ZERO_STATS)

    // The save itself — this is the one step that must succeed.
    let saved: { id: string }
    try {
      saved = await sessionService.create({
        type: MEDITATION_TYPE,
        duration_seconds: Math.floor(durationSec), // floor — never inflate the logged time
        occurred_at: startedAtRef.current || new Date().toISOString(),
        client_token: tokenRef.current ?? undefined,
        // Include intention when set; beacon path doesn't carry it (fine — it's
        // optional and the reflection step can patch it via PATCH later if needed).
        intention: trimmedIntention ?? null,
      })
    } catch (err) {
      setError(err instanceof ApiError ? 'Could not save the session.' : messageForError(err))
      setSaving(false)
      return
    }

    savedSessionIdRef.current = saved.id
    // Saved — drop the recovery draft and stop any tab-close beacon from re-firing.
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

    // Post-save stats are best-effort: if getStats throws the session is still saved
    // and the reward overlay still fires (with a zero/minimal breakdown). The user
    // must not see "Could not save the session." when only the stats fetch failed.
    const after = await dashboardService.getStats().catch(() => ZERO_STATS)
    const bd = buildXpBreakdown(before, after, '🧘 Meditation')
    setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
  }

  function finish() {
    if (running) pause()
    stopSoundscape()
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

  // Patch the already-saved session with reflection data, then move to biometric offer.
  async function saveReflection() {
    const sid = savedSessionIdRef.current
    if (!sid) {
      advanceToReading()
      return
    }
    const payload: Record<string, unknown> = {}
    if (reflectFocus) payload.focus = Number(reflectFocus)
    if (reflectCalm) payload.calm = Number(reflectCalm)
    const trimmedNotes = reflectNotes.trim()
    if (trimmedNotes) payload.notes = trimmedNotes
    // Nothing to patch — skip straight to the reading offer.
    if (Object.keys(payload).length === 0) {
      advanceToReading()
      return
    }
    setReflectSaving(true)
    setReflectError(null)
    try {
      await sessionService.update(sid, payload)
      advanceToReading()
    } catch (err) {
      setReflectError(
        err instanceof ApiError ? 'Could not save reflection.' : messageForError(err),
      )
      setReflectSaving(false)
    }
  }

  function advanceToReading() {
    setShowReflection(false)
    if (savedSessionIdRef.current) setShowReading(true)
    else navigate('/')
  }

  function setGuidedChoice(choice: GuidedChoice) {
    setGuidedChoiceState(choice)
    writeGuidedChoice(choice)
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

  // Stable daily suggestion for the intention placeholder.
  const intentionPlaceholder = dailySuggestion(new Date())

  return (
    <main id="main-content" className="breathe">
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
          {running ? (
            intention.trim() ? (
              <span className="breathe-phase-intention">{intention.trim()}</span>
            ) : (
              'Be here'
            )
          ) : elapsed > 0 ? (
            'Paused'
          ) : (
            'Ready when you are'
          )}
        </div>
      </div>

      {started && guidedChoice !== 'none' && (
        <GuidedCues
          structureId={guidedChoice}
          elapsed={elapsed}
          durationSec={targetSec}
          volume={volume}
          bellsOn={bellsOn}
        />
      )}

      {started && (
        <div className="breathe-stats">
          <span>{mmss(elapsed)} elapsed</span>
          {targetMin > 0 && <span>{targetMin} min sit</span>}
        </div>
      )}

      {/* ── Primary setup: the practice-meaningful choices always visible ───────
          Wrapped in a flex column so every block keeps one even vertical rhythm;
          the wrapper's `gap` owns the spacing (inner block margins are zeroed in CSS). */}
      <div className="meditate-setup">
      <div className="meditate-setup-field">
        <label>Duration</label>
        <Stepper
          options={DURATIONS}
          value={targetMin}
          disabled={settingsDisabled}
          ariaLabel="Duration"
          onChange={setTargetMin}
        />
      </div>

      <div className="meditate-setup-field">
        <label htmlFor="guided-structure">Guided structure</label>
        <select
          id="guided-structure"
          value={guidedChoice}
          disabled={settingsDisabled}
          onChange={(e) => setGuidedChoice(e.target.value as GuidedChoice)}
        >
          <option value="none">None — plain timer</option>
          {GUIDED_STRUCTURES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} — {s.description}
            </option>
          ))}
        </select>
      </div>

      {/* Pre-session intention — optional, skippable, hidden once the sit has started. */}
      {!started && (
        <div className="session-intention">
          <label htmlFor="intention" className="session-intention-label">
            Intention <span className="session-intention-opt">(optional)</span>
          </label>
          <textarea
            id="intention"
            className="session-intention-input"
            rows={2}
            maxLength={140}
            placeholder={intentionPlaceholder}
            value={intention}
            onChange={(e) => setIntention(e.target.value)}
            aria-describedby="intention-hint"
          />
          <p id="intention-hint" className="session-intention-hint">
            A quiet phrase to carry into your sit.
          </p>
        </div>
      )}

      {/* Optional pre-session reading — calm, skippable; captured now and linked to the
          sit afterwards so the pre/post calming delta can pair them. */}
      {!started && (
        <div className="session-prereading">
          {preReadingIdRef.current ? (
            <p className="session-prereading-done" aria-live="polite">
              <span aria-hidden="true">✓</span> Pre-sit reading logged.
            </p>
          ) : (
            <button
              type="button"
              className="link-neutral session-prereading-btn"
              onClick={() => setShowPreReading(true)}
            >
              Log a reading first (optional)
            </button>
          )}
        </div>
      )}

      {/* ── Secondary: Sound & bells — tucked behind a quiet disclosure ───────── */}
      {/* Soundscape stays live-adjustable during a sit (open the disclosure to change). */}
      <details
        className="meditate-disclosure"
        open={soundDisclosureOpen}
        onToggle={(e) => {
          const open = (e.currentTarget as HTMLDetailsElement).open
          setSoundDisclosureOpen(open)
          writeSoundDisclosureOpen(open)
        }}
      >
        <summary
          className="meditate-disclosure-summary"
          aria-expanded={soundDisclosureOpen}
        >
          Sound &amp; bells
        </summary>

        <div className="meditate-disclosure-body">
          <label>Ambient sound</label>
          <SoundscapePicker
            value={soundscape}
            volume={soundscapeVol}
            previewEngineRef={soundscapeEngineRef}
            previewEnabled={!started}
            onSoundscapeChange={(name) => {
              setSoundscape(name)
              if (running) {
                // Live switch during a sit: restart soundscape with the new choice
                // (the picker only previews before the sit starts).
                soundscapeEngineRef.current?.stop()
                if (name !== 'silent') {
                  if (!soundscapeEngineRef.current) soundscapeEngineRef.current = new SoundscapeEngine()
                  soundscapeEngineRef.current.start(name, soundscapeVolRef.current)
                }
              }
            }}
            onVolumeChange={setSoundscapeVol}
          />

          <label htmlFor="bells">Bells</label>
          <select id="bells" value={bellMode} disabled={settingsDisabled} onChange={(e) => setBellMode(e.target.value)}>
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
        </div>
      </details>
      </div>

      {/* Show the locked-in intention quietly during the sit. */}
      {started && intention.trim() && (
        <p className="session-intention-locked" aria-label="Your intention for this sit">
          <span className="session-intention-locked-icon" aria-hidden="true">✦</span>{' '}
          {intention.trim()}
        </p>
      )}

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

      {/* Optional pre-session reading capture — shown before the sit starts. Saved with
          no session id; linked to the sit in saveSession once the session exists. */}
      {showPreReading && (
        <BiometricCapture
          context="pre"
          sessionId={null}
          title="Log a reading first?"
          intro="Optional: your heart rate now, so you can see how a sit settles you over time."
          onDone={(reading) => {
            if (reading) preReadingIdRef.current = reading.id
            setShowPreReading(false)
            showToast('Reading saved.')
          }}
          onSkip={() => setShowPreReading(false)}
        />
      )}

      {reward && (
        <RewardOverlay
          afterXp={reward.afterXp}
          xpGained={reward.xpGained}
          breakdown={reward.breakdown}
          onClose={() => {
            setReward(null)
            // After XP is shown, offer the optional reflection — never blocks.
            if (savedSessionIdRef.current) setShowReflection(true)
            else navigate('/')
          }}
        />
      )}

      {/* Post-session reflection — shown after the reward overlay, before biometrics.
          Patches focus/calm/notes onto the already-saved session (no double-save). */}
      {showReflection && (
        <Modal ariaLabel="Reflect on your sit" cardClassName="biometric-card session-reflect-card">
          <h2>How was that?</h2>
          {intention.trim() && (
            <p className="session-reflect-intention">
              Your intention: <em>{intention.trim()}</em>
            </p>
          )}
          <p className="biometric-intro">
            Optional — rate how your sit felt, or jot a quick note.
          </p>

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

          <ErrorBanner message={reflectError} />

          <div className="biometric-actions">
            <button type="button" onClick={saveReflection} disabled={reflectSaving}>
              {reflectSaving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="link-neutral"
              onClick={advanceToReading}
              disabled={reflectSaving}
            >
              Skip
            </button>
          </div>
        </Modal>
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
