import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Flame as FlameIcon } from 'lucide-react'
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
import { useT } from '../i18n'
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
// short to start, so the steps lean shorter than the meditation timer's. The label is a
// catalog key resolved at render (so it re-labels on locale change); 0 → "Untimed".
const DURATION_VALUES: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'practice.duration.untimed' },
  { value: 2, labelKey: 'practice.mins.2' },
  { value: 5, labelKey: 'practice.mins.5' },
  { value: 10, labelKey: 'practice.mins.10' },
  { value: 15, labelKey: 'practice.mins.15' },
  { value: 20, labelKey: 'practice.mins.20' },
]

export default function TratakaPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t } = useT()
  // Duration options with labels resolved from the catalog (re-labels on locale change).
  const DURATIONS: StepperOption<number>[] = DURATION_VALUES.map((d) => ({
    value: d.value,
    label: t(d.labelKey),
  }))
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
      label: t('practice.trataka.recover.label'),
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
      setError(err instanceof ApiError ? t('practice.error.saveSession') : messageForError(err))
      setSaving(false)
      return
    }

    savedSessionIdRef.current = saved.id
    savedRef.current = true
    clearDraft(DRAFT_PAGE)

    const after = await dashboardService.getStats().catch(() => ZERO_STATS)
    const bd = buildXpBreakdown(before, after, t('practice.trataka.recover.label'), FlameIcon)
    setReward({ afterXp: after.xp, xpGained: bd.total, breakdown: bd.lines })
  }

  function finish() {
    if (running) pause()
    stopSoundscape()
    // pause() above flushed the exact accumulated seconds into baseElapsedRef; save that
    // rather than the `elapsed` state, which can lag by up to the interval cadence (~250ms)
    // — the same precision fix MeditatePage carries.
    if (baseElapsedRef.current < 1) {
      navigate('/')
      return
    }
    void saveSession(baseElapsedRef.current)
  }

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
        err instanceof ApiError ? t('practice.error.saveReflection') : messageForError(err),
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
      <Link to="/" className="back-link">{t('practice.back.dashboard')}</Link>
      <header className="page-head">
        <h1>{t('practice.trataka.title')}</h1>
      </header>

      {/* Beginner-friendly intro — the same "what you'll do" card the meditate/breathe start
          screens show, so nobody is dropped cold in front of a flame. Hidden once underway. */}
      {!started && (
        <div className="practice-intro">
          <p className="practice-intro-what">
            {t('practice.trataka.intro.what')}
          </p>
          <p className="practice-intro-how">
            {t('practice.trataka.intro.how')}
          </p>
        </div>
      )}

      {restorable && !started && (
        <div className="session-recover">
          <span>
            {t('practice.recover.unsavedSit', {
              label: restorable.label.toLowerCase(),
              min: Math.round(restorable.elapsedSeconds / 60),
            })}
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

      <div className="breathe-stage trataka-stage">
        <Flame intensity={flameIntensity} size={running ? 360 : 220} />
        {running && (
          <p className={`trataka-guide${guideVisible ? '' : ' is-hidden'}`}>
            {t('practice.trataka.guide')}
          </p>
        )}
        {started && <span className="trataka-time">{mmss(remaining)}</span>}
        <div className="breathe-phase">
          {running
            ? t('practice.trataka.phase.gazing')
            : elapsed > 0
              ? t('practice.state.paused')
              : t('practice.trataka.phase.ready')}
        </div>
      </div>

      {started && (
        <div className="breathe-stats">
          <span>{t('practice.elapsed', { time: mmss(elapsed) })}</span>
          {targetMin > 0 && <span>{t('practice.trataka.minGaze', { min: targetMin })}</span>}
        </div>
      )}

      <label>{t('practice.duration.label')}</label>
      <Stepper
        options={DURATIONS}
        value={targetMin}
        disabled={settingsDisabled}
        ariaLabel={t('practice.duration.label')}
        onChange={setTargetMin}
      />

      <details className="meditate-disclosure">
        <summary className="meditate-disclosure-summary">{t('practice.trataka.sound.summary')}</summary>
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
            {elapsed > 0 ? t('practice.control.resume') : t('practice.control.start')}
          </button>
        ) : (
          <button type="button" onClick={pause}>
            {t('practice.control.pause')}
          </button>
        )}
        {started && (
          <button type="button" className="secondary" onClick={finish} disabled={saving}>
            {saving ? t('practice.recover.saving') : t('practice.control.finishSave')}
          </button>
        )}
      </div>

      {elapsed > 0 && !running && !saving && (
        <button type="button" className="meditate-reset" onClick={reset}>
          {t('practice.control.reset')}
        </button>
      )}

      {/* ── About: tucked into a collapsed disclosure so the practice stays the focus ── */}
      <details className="trataka-about">
        <summary className="trataka-about-summary">{t('practice.trataka.about.summary')}</summary>
        <div className="trataka-about-body">
        <p>
          {t('practice.trataka.about.p1intro')} <em>Trataka</em>{' '}
          {t('practice.trataka.about.p1mid')} <em>dharana</em>
          {t('practice.trataka.about.p1end')}
        </p>
        <p>
          {t('practice.trataka.about.p2intro')}{' '}
          <strong>{t('practice.trataka.about.p2emph')}</strong>{' '}
          {t('practice.trataka.about.p2end')}
        </p>
        <p>
          {t('practice.trataka.about.p3intro')}{' '}
          <strong>{t('practice.trataka.about.p3emph')}</strong>{' '}
          {t('practice.trataka.about.p3end')}
        </p>
        <p className="trataka-about-note">
          {t('practice.trataka.about.note')}
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
        <Modal ariaLabel={t('practice.trataka.reflect.aria')} cardClassName="biometric-card session-reflect-card">
          <h2>{t('practice.reflect.heading')}</h2>
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

          <div className="session-reflect-notes">
            <label htmlFor="reflect-notes" className="session-reflect-notes-label">
              {t('practice.reflect.notesLabel')}
            </label>
            <textarea
              id="reflect-notes"
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
              onClick={() => navigate('/')}
              disabled={reflectSaving}
            >
              {t('practice.reflect.skip')}
            </button>
          </div>
        </Modal>
      )}
    </main>
  )
}
