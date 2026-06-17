import { useRef, useState, type FormEvent } from 'react'
import { biometricsService } from '../services/biometrics'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { newClientToken } from '../lib/sessionDraft'
import Modal from './Modal'
import { ErrorBanner } from './StateViews'
import type { BiometricReading, ReadingContext } from '../types'

/**
 * A calm, optional heart-rate (and optional HRV) capture. Used two ways:
 *  - as a skippable post-session prompt (`context="post"`, linked to the sit), and
 *  - as a standalone resting reading (`context="resting"`, no session).
 *
 * Fully optional — "Skip" / "Done" never blocks the surrounding flow. Values are a
 * personal wellness signal, not a medical measurement (made explicit in the copy).
 */
export default function BiometricCapture({
  context,
  sessionId,
  title,
  intro,
  onDone,
  onSkip,
  inline = false,
}: {
  context: ReadingContext
  sessionId?: string | null
  title: string
  intro: string
  // Called after a successful save (with the created reading) or, for standalone use,
  // when the user is finished. For the post-session prompt this advances the flow.
  onDone: (reading?: BiometricReading) => void
  // Shown as a "Skip" affordance for the post-session prompt; omit for standalone.
  onSkip?: () => void
  // Render as a plain in-page card (LogReadingPage) rather than a modal overlay.
  inline?: boolean
}) {
  const [bpm, setBpm] = useState('')
  const [hrv, setHrv] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Stable per-capture idempotency key so a double-click / retry of this same reading
  // dedups server-side instead of creating a duplicate row.
  const clientToken = useRef(newClientToken())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const bpmNum = Number(bpm)
    if (!Number.isFinite(bpmNum) || bpmNum < 30 || bpmNum > 220) {
      setError('Enter a heart rate between 30 and 220 bpm.')
      return
    }
    let hrvNum: number | null = null
    if (hrv.trim() !== '') {
      hrvNum = Number(hrv)
      if (!Number.isFinite(hrvNum) || hrvNum < 0) {
        setError('HRV must be 0 or more (leave blank if unknown).')
        return
      }
    }

    setSaving(true)
    try {
      const reading = await biometricsService.create({
        context,
        bpm: bpmNum,
        hrv_ms: hrvNum,
        source: 'manual',
        measured_at: new Date().toISOString(),
        session_id: sessionId ?? null,
        client_token: clientToken.current,
      })
      onDone(reading)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Could not save the reading. Please try again.'
          : messageForError(err),
      )
      setSaving(false)
    }
  }

  const body = (
    <>
      <h2>{title}</h2>
      <p className="biometric-intro">{intro}</p>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="bio-bpm">Heart rate (bpm)</label>
        <input
          id="bio-bpm"
          type="number"
          inputMode="numeric"
          min="30"
          max="220"
          placeholder="e.g. 68"
          aria-describedby="bio-bpm-hint"
          value={bpm}
          onChange={(e) => setBpm(e.target.value)}
          autoFocus
        />
        <p id="bio-bpm-hint" className="muted field-hint">
          Between 30 and 220 bpm
        </p>

        <label htmlFor="bio-hrv">HRV in ms (optional, if you know it)</label>
        <input
          id="bio-hrv"
          type="number"
          inputMode="numeric"
          min="0"
          placeholder="e.g. 45"
          value={hrv}
          onChange={(e) => setHrv(e.target.value)}
        />

        <ErrorBanner message={error} />

        <p className="biometric-disclaimer">
          A personal wellness signal you enter yourself — not a medical measurement
          or diagnosis.
        </p>

        <div className="biometric-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save reading'}
          </button>
          {onSkip && (
            <button
              type="button"
              className="link-neutral"
              onClick={onSkip}
              disabled={saving}
            >
              Skip
            </button>
          )}
        </div>
      </form>
    </>
  )

  // Standalone (LogReadingPage): a plain in-page card, not a modal overlay.
  if (inline) {
    return <div className="biometric-card biometric-card--inline">{body}</div>
  }

  // Post-session prompt: a focus-trapped modal overlay.
  return (
    <Modal ariaLabel={title} cardClassName="biometric-card">
      {body}
    </Modal>
  )
}
