import { useState, type FormEvent } from 'react'
import { biometricsService } from '../services/biometrics'
import { ApiError } from '../services/api'
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
}) {
  const [bpm, setBpm] = useState('')
  const [hrv, setHrv] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      })
      onDone(reading)
    } catch (err) {
      setError(
        err instanceof ApiError
          ? 'Could not save the reading. Please try again.'
          : 'Something went wrong.',
      )
      setSaving(false)
    }
  }

  return (
    <div className="biometric-capture" role="dialog" aria-modal="true" aria-label={title}>
      <div className="biometric-card">
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
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            autoFocus
          />

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

          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}

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
      </div>
    </div>
  )
}
