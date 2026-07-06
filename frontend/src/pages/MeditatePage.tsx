import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Brain } from 'lucide-react'
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
import ReflectionMood from '../components/ReflectionMood'
import { ErrorBanner } from '../components/StateViews'
import { mmss } from '../lib/format'
import GuidedCues from '../components/GuidedCues'
import Stepper, { type StepperOption } from '../components/Stepper'
import SoundscapePicker from '../components/SoundscapePicker'
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
import { moodLogService } from '../services/moodLogs'
import { dailySuggestion } from '../lib/intentionPrompts'
import {
  GUIDED_STRUCTURES,
  GUIDED_MIN_LEVEL,
  isGuidedUnlocked,
  type GuidedStructureId,
} from '../lib/guidedSessions'
import { speechAvailable, onVoicesReady, cancelSpeech } from '../lib/speech'
import {
  SoundscapeEngine,
  loadSoundscapePref,
  type SoundscapeName,
} from '../lib/soundscapes'
import type { DashboardStats, MeditationType, Mood, SessionCreate } from '../types'

// Zero-value stats snapshot used as a fallback when a best-effort getStats call fails.
// Passing it to buildXpBreakdown yields an all-zero breakdown rather than a crash.
const ZERO_STATS: DashboardStats = {
  xp: 0, level: 1, xp_into_level: 0, xp_for_next_level: 100,
  current_streak_days: 0, longest_streak_days: 0, rest_day_used: false,
  streak_bonus_xp: 0, total_seconds: 0, session_count: 0,
  gratitude_count: 0, this_week: [], daily_quests: [],
}

const DRAFT_PAGE = 'meditate'

// Unguided meditation styles (existing session types). Resonance breathing has its
// own dedicated page, so it's intentionally not offered here.
// Unguided meditation sessions are all stored under one type — the style picker was
// dropped (it was descriptive-only metadata). Breathing keeps its own type, set by the
// Breathe page.
const MEDITATION_TYPE: MeditationType = 'mindfulness'

// Target length; 0 = open-ended (count up, finish manually). Stepped left→right,
// so "Untimed" sits at the low end and the increments grow as you step right.
// ("Untimed", not "Open" — a first-timer read "Open" as a mode, not a duration.)
// Labels are catalog keys resolved at render (so they re-label on a locale switch); 0 →
// "Untimed", the rest reuse the shared minute keys.
const DURATION_VALUES: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'practice.duration.untimed' },
  { value: 5, labelKey: 'practice.mins.5' },
  { value: 10, labelKey: 'practice.mins.10' },
  { value: 15, labelKey: 'practice.mins.15' },
  { value: 20, labelKey: 'practice.mins.20' },
  { value: 30, labelKey: 'practice.mins.30' },
  { value: 45, labelKey: 'practice.mins.45' },
  { value: 60, labelKey: 'practice.mins.60' },
  { value: 90, labelKey: 'practice.mins.90' },
]

// One control for all bells. "Off" silences them; otherwise a soft bell rings at the
// start and end, and optionally on an interval. Replaces a separate on/off checkbox +
// interval dropdown that overlapped confusingly. Labels are catalog keys (resolved at render).
const BELL_MODES: { value: string; labelKey: string }[] = [
  { value: 'off', labelKey: 'practice.meditate.bells.off' },
  { value: 'ends', labelKey: 'practice.meditate.bells.ends' },
  { value: 'every5', labelKey: 'practice.meditate.bells.every5' },
  { value: 'every10', labelKey: 'practice.meditate.bells.every10' },
]

// Persist the last-chosen guided structure across sessions.
const GUIDED_STRUCTURE_KEY = 'meditate:guided-structure'
type GuidedChoice = GuidedStructureId | 'none'

// Recognised stored guided ids. A legacy 'acceptance' value (the old id) simply
// isn't matched, so it falls back to 'none' — fine.
const GUIDED_IDS: GuidedStructureId[] = GUIDED_STRUCTURES.map((s) => s.id)

function readGuidedChoice(): GuidedChoice {
  try {
    const v = localStorage.getItem(GUIDED_STRUCTURE_KEY)
    if (v != null && (GUIDED_IDS as string[]).includes(v)) return v as GuidedStructureId
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

// Deep-link support: map a `?guided=` / `?style=` query param to a guided choice, or
// null when there's no (recognised) param so the caller falls back to the stored
// preference. `guided=<any structure id>` pre-selects that structure;
// `guided=none` or `style=mindfulness` pre-selects plain unguided sitting.
//
// NOTE: this does NOT enforce level gates — a deep-link to a locked structure (e.g.
// chakra-om below level 5) still resolves to that id here. The page applies the gate
// after fetching the user's level (see the gate effect) and falls back to 'none' if
// the structure is locked, so the gate can't be bypassed via the URL.
export function guidedChoiceFromParams(params: URLSearchParams): GuidedChoice | null {
  const guided = params.get('guided')
  if (guided != null && (GUIDED_IDS as string[]).includes(guided)) {
    return guided as GuidedStructureId
  }
  if (guided === 'none') return 'none'
  if (params.get('style') === 'mindfulness') return 'none'
  return null
}

// Spoken guidance (Web Speech) preference for guided sits. On by default; the user
// can turn it off inline in the guided-session setup. Persisted across sessions.
const SPOKEN_GUIDANCE_KEY = 'meditate:spoken-guidance'

function readSpokenGuidance(): boolean {
  try {
    // Default ON: only an explicit "off" disables.
    return localStorage.getItem(SPOKEN_GUIDANCE_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeSpokenGuidance(on: boolean) {
  try {
    localStorage.setItem(SPOKEN_GUIDANCE_KEY, on ? 'on' : 'off')
  } catch {
    // ignore — preference simply won't persist
  }
}

export default function MeditatePage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { t } = useT()
  // Duration options with labels resolved from the catalog (re-labels on locale change).
  const DURATIONS: StepperOption<number>[] = DURATION_VALUES.map((d) => ({
    value: d.value,
    label: t(d.labelKey),
  }))
  const [searchParams] = useSearchParams()
  const [targetMin, setTargetMin] = useState(10)
  const [intervalMin, setIntervalMin] = useState(0)
  const [bellsOn, setBellsOn] = useState(true)
  const [volume, setVolume] = useState(0.6)
  // A `?guided=` deep-link (from the Practices hub) pre-selects that structure on this
  // visit, overriding the stored preference; without the param we fall back to it. Read
  // once at mount so a direct visit behaves exactly as before, and manual changes persist.
  const [guidedChoice, setGuidedChoiceState] = useState<GuidedChoice>(
    () => guidedChoiceFromParams(searchParams) ?? readGuidedChoice(),
  )
  // The user's level — drives the guided-structure gate (e.g. Chakra Om unlocks at
  // level 5). Fetched non-blocking like the header does; null until known, which the
  // gate treats as locked for gated structures (fail safe).
  const [level, setLevel] = useState<number | null>(null)
  // Spoken guidance toggle (user preference) + whether this device actually has a
  // usable TTS voice. Both must be true for the voice to replace the bell; if the
  // device has no voice we fall back to text + bell even with the toggle on.
  const [spokenPref, setSpokenPrefState] = useState<boolean>(readSpokenGuidance)
  const [speechSupported, setSpeechSupported] = useState<boolean>(speechAvailable)
  // Drives the summary's aria-expanded only; the <details> starts collapsed every
  // visit so the calm default view leads with the essentials + Start.
  const [soundDisclosureOpen, setSoundDisclosureOpen] = useState(false)
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
  const [reflectMood, setReflectMood] = useState<Mood | null>(null)
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

  // Stop the soundscape engine and cancel any in-progress / queued speech on
  // unmount. (GuidedCues also cancels speech on its own unmount; this covers
  // leaving the page while the cues overlay is hidden, e.g. before the first phase.)
  useEffect(() => {
    return () => {
      soundscapeEngineRef.current?.stop()
      cancelSpeech()
    }
  }, [])

  // Voices can load asynchronously after first paint, so an initial "unsupported"
  // reading may flip to supported once `voiceschanged` fires. Re-check then so the
  // toggle reflects reality and we don't silently fall back to the bell on a device
  // that does have a voice.
  useEffect(() => {
    const off = onVoicesReady(() => setSpeechSupported(speechAvailable()))
    return off
  }, [])

  // Fetch the user's level once, non-blocking (like the header). A failure leaves
  // level null — gated structures stay locked rather than erroneously unlocking.
  useEffect(() => {
    let ignore = false
    dashboardService
      .getStats()
      .then((s) => { if (!ignore) setLevel(s.level) })
      .catch(() => {})
    return () => { ignore = true }
  }, [])

  // Enforce the guided-structure level gate ONCE the level is known: if the current
  // choice is a locked structure (e.g. a `?guided=chakra-om` deep-link below level 5),
  // fall back to plain unguided sitting rather than offering a locked practice. We
  // wait for a non-null level so a deep-link to a gated structure isn't wrongly reset
  // to 'none' during the brief window before the level fetch resolves.
  useEffect(() => {
    if (level == null) return
    if (guidedChoice !== 'none' && !isGuidedUnlocked(guidedChoice, level)) {
      setGuidedChoiceState('none')
    }
  }, [guidedChoice, level])

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
      label: t('practice.meditate.recover.label'),
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
        cancelSpeech() // the sit is over — no spoken cue should trail past the end
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
      // Zero the interval-bell mark so a fresh sit always rings from mark 1 — even if
      // this start didn't come through reset() (which also clears it). Otherwise a
      // long previous sit could leave a high stale mark and swallow the early bells.
      lastBellMarkRef.current = 0
      setRestorable(null)
      bell() // opening bell on a fresh sit, not on resume
    }
  }

  function pause() {
    baseElapsedRef.current += (performance.now() - startRef.current) / 1000
    setRunning(false)
    stopSoundscape()
    cancelSpeech() // no spoken cue should keep playing while paused
    persistDraft(baseElapsedRef.current)
  }

  function reset() {
    setRunning(false)
    stopSoundscape()
    cancelSpeech()
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
    // we still save, but we suppress the XP reward (a confident "0 XP" would be a lie).
    let statsFailed = false
    const before = await dashboardService
      .getStats()
      .catch(() => {
        statsFailed = true
        return ZERO_STATS
      })

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
      setError(err instanceof ApiError ? t('practice.error.saveSession') : messageForError(err))
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

    // Post-save stats are best-effort: the session is already saved. The user must
    // not see "Could not save the session." when only the stats fetch failed.
    const after = await dashboardService.getStats().catch(() => {
      statsFailed = true
      return ZERO_STATS
    })

    // If either stats fetch fell back to zeros, the breakdown is meaningless (it
    // would render a confident "0 XP / level 1" after a real sit). Skip the reward
    // overlay and go straight to the reflection step rather than showing fake numbers.
    if (statsFailed) {
      setSaving(false)
      if (savedSessionIdRef.current) setShowReflection(true)
      else navigate('/')
      return
    }

    const bd = buildXpBreakdown(before, after, t('practice.meditate.recover.label'), Brain)
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
    // pause() above flushed the exact accumulated seconds into baseElapsedRef;
    // save that rather than the `elapsed` state, which can lag by up to the
    // interval cadence (~250ms) — matches the timed-completion path's precision.
    void saveSession(baseElapsedRef.current)
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

  // Log the optional post-session mood via the MoodLog path (the same one the standalone
  // check-in uses), so it feeds the identical mood trends on Analytics. Best-effort: a
  // failure here must never block the reflection flow — the sit is already saved.
  async function logReflectionMood() {
    if (!reflectMood) return
    try {
      await moodLogService.create(reflectMood)
    } catch {
      // Swallow — the mood is an optional extra; the session save already succeeded.
    }
  }

  // Patch the already-saved session with focus/calm/notes and log the optional mood, then
  // move to the biometric offer. Mood is a separate resource (MoodLog), not a session
  // field, so it's logged even when no session fields changed.
  async function saveReflection() {
    const sid = savedSessionIdRef.current
    if (!sid) {
      await logReflectionMood()
      advanceToReading()
      return
    }
    const payload: Record<string, unknown> = {}
    if (reflectFocus) payload.focus = Number(reflectFocus)
    if (reflectCalm) payload.calm = Number(reflectCalm)
    const trimmedNotes = reflectNotes.trim()
    if (trimmedNotes) payload.notes = trimmedNotes
    // Nothing to patch on the session — still log any chosen mood before moving on.
    if (Object.keys(payload).length === 0) {
      setReflectSaving(true)
      await logReflectionMood()
      advanceToReading()
      return
    }
    setReflectSaving(true)
    setReflectError(null)
    try {
      await sessionService.update(sid, payload)
      await logReflectionMood()
      advanceToReading()
    } catch (err) {
      setReflectError(
        err instanceof ApiError ? t('practice.error.saveReflection') : messageForError(err),
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

  function setSpokenPref(on: boolean) {
    setSpokenPrefState(on)
    writeSpokenGuidance(on)
    // Turning it off mid-thought: stop any speech already in flight.
    if (!on) cancelSpeech()
  }

  // Spoken guidance is actually active only on a guided sit, with the toggle on,
  // and a usable TTS voice present. Otherwise GuidedCues falls back to text + bell.
  const isGuided = guidedChoice !== 'none'
  const speechOn = isGuided && spokenPref && speechSupported

  // The <select>'s EFFECTIVE value: fall back to 'none' whenever the current choice
  // resolves to a locked option (e.g. a `?guided=chakra-om` deep-link while level is
  // still loading, or below the gate). The async gate effect above eventually resets
  // guidedChoice itself, but binding the control to this computed value means it never
  // points at a `disabled` <option> even transiently — which some browsers render
  // inconsistently. isGuidedUnlocked treats a null level as locked (fail safe).
  const selectedGuidedValue: GuidedChoice =
    guidedChoice !== 'none' && !isGuidedUnlocked(guidedChoice, level) ? 'none' : guidedChoice

  // The guided structure currently in play (null for a plain unguided timer). Drives the calm
  // beginner "what you'll do" intro shown before the sit starts.
  const activeGuided =
    selectedGuidedValue !== 'none'
      ? GUIDED_STRUCTURES.find((s) => s.id === selectedGuidedValue) ?? null
      : null

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
      <Link to="/" className="back-link">{t('practice.back.dashboard')}</Link>
      <header className="page-head">
        <h1>{activeGuided ? activeGuided.label : t('practice.meditate.title')}</h1>
      </header>

      {/* Beginner-friendly intro — a plain-language "what you'll do" shown before the sit starts, so
          nobody is dropped cold into a timer. Reassures newcomers that guided sits just need
          following along. Hidden once underway (then the cues + timer carry it). */}
      {!started && (
        <div className="practice-intro">
          <p className="practice-intro-what">
            {activeGuided
              ? activeGuided.description
              : t('practice.meditate.intro.whatUnguided')}
          </p>
          <p className="practice-intro-how">
            {activeGuided
              ? t('practice.meditate.intro.howGuided')
              : t('practice.meditate.intro.howUnguided')}
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

      <div className="breathe-stage">
        <div className={`meditate-orb ${running ? 'running' : 'idle'}`}>
          {started && <span className="meditate-time">{mmss(remaining)}</span>}
        </div>
        <div className="breathe-phase">
          {running ? (
            intention.trim() ? (
              <span className="breathe-phase-intention">{intention.trim()}</span>
            ) : (
              t('practice.meditate.phase.beHere')
            )
          ) : elapsed > 0 ? (
            t('practice.state.paused')
          ) : (
            t('practice.state.ready')
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
          speechOn={speechOn && running}
        />
      )}

      {started && (
        <div className="breathe-stats">
          <span>{t('practice.elapsed', { time: mmss(elapsed) })}</span>
          {targetMin > 0 && <span>{t('practice.meditate.minSit', { min: targetMin })}</span>}
        </div>
      )}

      {/* ── Primary setup: the practice-meaningful choices always visible ───────
          Wrapped in a flex column so every block keeps one even vertical rhythm;
          the wrapper's `gap` owns the spacing (inner block margins are zeroed in CSS). */}
      <div className="meditate-setup">
      <div className="meditate-setup-field">
        <label>{t('practice.duration.label')}</label>
        <Stepper
          options={DURATIONS}
          value={targetMin}
          disabled={settingsDisabled}
          ariaLabel={t('practice.duration.label')}
          onChange={setTargetMin}
        />
      </div>

      <div className="meditate-setup-field">
        <label htmlFor="guided-structure">{t('practice.meditate.guidedStructure')}</label>
        <select
          id="guided-structure"
          value={selectedGuidedValue}
          disabled={settingsDisabled}
          onChange={(e) => setGuidedChoice(e.target.value as GuidedChoice)}
        >
          <option value="none">{t('practice.meditate.guidedNone')}</option>
          {GUIDED_STRUCTURES.map((s) => {
            const locked = !isGuidedUnlocked(s.id, level)
            return (
              <option key={s.id} value={s.id} disabled={locked}>
                {locked
                  ? t('practice.meditate.guidedLocked', { label: s.label, level: GUIDED_MIN_LEVEL[s.id] ?? '' })
                  : t('practice.meditate.guidedOption', { label: s.label, desc: s.description })}
              </option>
            )
          })}
        </select>

      </div>

      {/* Session prep — the optional intention + pre-session reading, folded behind ONE quiet
          disclosure so the visible setup stays Duration → Guidance → Start. Hidden once the sit
          has started; values persist while collapsed. */}
      {!started && (
        <details className="meditate-disclosure">
          <summary className="meditate-disclosure-summary">
            {t('practice.prep.summary')}
          </summary>
          <div className="meditate-disclosure-body">
            <div className="session-intention">
              <label htmlFor="intention" className="session-intention-label">
                {t('practice.intention.label')} <span className="session-intention-opt">{t('practice.intention.optional')}</span>
              </label>
              <textarea
                id="intention"
                className="session-intention-input"
                rows={2}
                maxLength={140}
                placeholder={intentionPlaceholder}
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
              />
            </div>
            <div className="session-prereading">
              {preReadingIdRef.current ? (
                <p className="session-prereading-done" aria-live="polite">
                  <span aria-hidden="true">✓</span> {t('practice.breathe.preReadingDone.meditate')}
                </p>
              ) : (
                <button
                  type="button"
                  className="link-neutral session-prereading-btn"
                  onClick={() => setShowPreReading(true)}
                >
                  {t('practice.prereading.log')}
                </button>
              )}
            </div>
          </div>
        </details>
      )}

      {/* ── Secondary: Sound & bells — tucked behind a quiet disclosure ───────── */}
      {/* Soundscape stays live-adjustable during a sit (open the disclosure to change). */}
      <details
        className="meditate-disclosure"
        onToggle={(e) =>
          setSoundDisclosureOpen((e.currentTarget as HTMLDetailsElement).open)
        }
      >
        <summary
          className="meditate-disclosure-summary"
          aria-expanded={soundDisclosureOpen}
        >
          {t('practice.meditate.sound.summary')}
        </summary>

        <div className="meditate-disclosure-body">
          <label>{t('practice.meditate.sound.ambient')}</label>
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

          <label htmlFor="bells">{t('practice.meditate.bells.label')}</label>
          <select id="bells" value={bellMode} disabled={settingsDisabled} onChange={(e) => setBellMode(e.target.value)}>
            {BELL_MODES.map((b) => (
              <option key={b.value} value={b.value}>
                {t(b.labelKey)}
              </option>
            ))}
          </select>

          <label htmlFor="bell-volume">{t('practice.meditate.bellVolume')}</label>
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

          {/* Spoken guidance — only meaningful for a guided sit; lives here with the other
              audio controls (voice, bells, soundscape) rather than stacking under the
              structure picker. The voice reads each cue aloud so eyes can stay closed. */}
          {isGuided && (
            <div className="meditate-spoken">
              <label className="meditate-spoken-toggle" htmlFor="spoken-guidance">
                <input
                  id="spoken-guidance"
                  type="checkbox"
                  checked={spokenPref}
                  disabled={settingsDisabled || !speechSupported}
                  onChange={(e) => setSpokenPref(e.target.checked)}
                />
                <span>{t('practice.meditate.spoken.toggle')}</span>
              </label>
              <p className="meditate-spoken-hint">
                {!speechSupported
                  ? t('practice.meditate.spoken.unavailable')
                  : spokenPref
                    ? t('practice.meditate.spoken.on')
                    : t('practice.meditate.spoken.off')}
              </p>
            </div>
          )}
        </div>
      </details>
      </div>

      {/* Show the locked-in intention quietly during the sit. */}
      {started && intention.trim() && (
        <p className="session-intention-locked" aria-label={t('practice.meditate.intentionAria')}>
          <span className="session-intention-locked-icon" aria-hidden="true">✦</span>{' '}
          {intention.trim()}
        </p>
      )}

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

      {/* Optional pre-session reading capture — shown before the sit starts. Saved with
          no session id; linked to the sit in saveSession once the session exists. */}
      {showPreReading && (
        <BiometricCapture
          context="pre"
          sessionId={null}
          title={t('practice.prereading.title')}
          intro={t('practice.meditate.preReading.intro')}
          onDone={(reading) => {
            if (reading) preReadingIdRef.current = reading.id
            setShowPreReading(false)
            showToast(t('practice.reading.notedToast'))
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
        <Modal ariaLabel={t('practice.meditate.reflect.aria')} cardClassName="biometric-card session-reflect-card">
          <h2>{t('practice.reflect.heading')}</h2>
          {intention.trim() && (
            <p className="session-reflect-intention">
              {t('practice.meditate.reflect.intentionLabel')} <em>{intention.trim()}</em>
            </p>
          )}
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

          {/* Optional mood — logged via the MoodLog path so it feeds the mood trends. */}
          <div className="session-reflect-mood">
            <span className="session-reflect-label">{t('practice.reflect.moodLabel')}</span>
            <ReflectionMood value={reflectMood} onChange={setReflectMood} />
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
              onClick={advanceToReading}
              disabled={reflectSaving}
            >
              {t('practice.reflect.skip')}
            </button>
          </div>
        </Modal>
      )}

      {showReading && savedSessionIdRef.current && (
        <BiometricCapture
          context="post"
          sessionId={savedSessionIdRef.current}
          title={t('practice.reflect.readingTitle')}
          intro={t('practice.meditate.preReading.intro')}
          onDone={() => {
            showToast(t('practice.reading.notedToast'))
            navigate('/')
          }}
          onSkip={() => navigate('/')}
        />
      )}
    </main>
  )
}
