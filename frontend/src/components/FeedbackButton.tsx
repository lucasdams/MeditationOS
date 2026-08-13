import { useState, type FormEvent } from 'react'
import Modal from './Modal'
import { feedbackService, type FeedbackCategory } from '../services/feedback'
import { messageForError } from '../lib/errors'
import { useT } from '../i18n'

// Category values are the fixed backend set; labels resolve via i18n at render.
const CATEGORIES: { value: FeedbackCategory; labelKey: string }[] = [
  { value: 'idea', labelKey: 'settings.feedback.cat.idea' },
  { value: 'bug', labelKey: 'settings.feedback.cat.bug' },
  { value: 'praise', labelKey: 'settings.feedback.cat.praise' },
  { value: 'other', labelKey: 'settings.feedback.cat.other' },
]

const MAX = 2000

/** A calm "Send feedback" affordance: a button that opens a small modal to send the app
 * owner a categorized note. Prefills the current route for triage context. */
export default function FeedbackButton() {
  const { t } = useT()
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
      setError(t('settings.feedback.emptyErr'))
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
      setError(messageForError(err, t('settings.feedback.sendErr')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
        {t('settings.feedback.open')}
      </button>

      {open && (
        <Modal onClose={close} ariaLabelledBy="feedback-title" closeOnBackdrop>
          <div className="feedback-modal">
            <h2 id="feedback-title">{t('settings.feedback.title')}</h2>
            {sent ? (
              <>
                <p className="muted">{t('settings.feedback.sent')}</p>
                <button type="button" className="btn" onClick={close}>
                  {t('settings.feedback.close')}
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <label htmlFor="feedback-category">{t('settings.feedback.categoryLabel')}</label>
                <select
                  id="feedback-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {t(c.labelKey)}
                    </option>
                  ))}
                </select>

                <label htmlFor="feedback-message">{t('settings.feedback.messageLabel')}</label>
                <textarea
                  id="feedback-message"
                  value={message}
                  maxLength={MAX}
                  rows={5}
                  placeholder={t('settings.feedback.placeholder')}
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
                    {t('settings.feedback.cancel')}
                  </button>
                  <button type="submit" className="btn" disabled={submitting || !message.trim()}>
                    {submitting ? t('settings.feedback.sending') : t('settings.feedback.send')}
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
