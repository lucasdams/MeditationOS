import { useState, type FormEvent } from 'react'
import Modal from './Modal'
import { feedbackService, type FeedbackCategory } from '../services/feedback'
import { messageForError } from '../lib/errors'

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'idea', label: 'Idea' },
  { value: 'bug', label: 'Bug' },
  { value: 'praise', label: 'Praise' },
  { value: 'other', label: 'Other' },
]

const MAX = 2000

/** A calm "Send feedback" affordance: a button that opens a small modal to send the app
 * owner a categorized note. Prefills the current route for triage context. */
export default function FeedbackButton() {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<FeedbackCategory>('idea')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  function reset() {
    setCategory('idea')
    setMessage('')
    setError(null)
    setSent(false)
    setSubmitting(false)
  }
  function close() {
    setOpen(false)
    reset()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) {
      setError('Please write a short message.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await feedbackService.submit({
        category,
        message: trimmed,
        path: window.location.pathname,
      })
      setSent(true)
    } catch (err) {
      setError(messageForError(err, "Couldn't send your feedback. Please try again."))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
        Send feedback
      </button>

      {open && (
        <Modal onClose={close} ariaLabelledBy="feedback-title" closeOnBackdrop>
          <div className="feedback-modal">
            <h2 id="feedback-title">Send feedback</h2>
            {sent ? (
              <>
                <p className="muted">Thank you — your note is on its way. It helps a lot.</p>
                <button type="button" className="btn" onClick={close}>
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <label htmlFor="feedback-category">What kind of note?</label>
                <select
                  id="feedback-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>

                <label htmlFor="feedback-message">Your message</label>
                <textarea
                  id="feedback-message"
                  value={message}
                  maxLength={MAX}
                  rows={5}
                  placeholder="What's on your mind?"
                  onChange={(e) => setMessage(e.target.value)}
                />
                <p className="muted feedback-count">
                  {message.length}/{MAX}
                </p>

                {error && (
                  <p role="alert" className="error">
                    {error}
                  </p>
                )}
                <div className="feedback-actions">
                  <button type="button" className="btn btn--ghost" onClick={close}>
                    Cancel
                  </button>
                  <button type="submit" className="btn" disabled={submitting || !message.trim()}>
                    {submitting ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
