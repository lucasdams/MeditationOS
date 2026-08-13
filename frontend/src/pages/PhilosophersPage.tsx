import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Flower2,
  Landmark,
  MessageCircle,
  Send,
  Sparkles,
  Sun,
  Swords,
  Wind,
  type LucideIcon,
} from 'lucide-react'
import { philosopherService } from '../services/philosophers'
import { ApiError } from '../services/api'
import { Loading, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { useT } from '../i18n'
import type { PhilosopherSummary, PhilosopherTurn } from '../types'

// Per-persona line icon (lucide, not emoji), keyed on the stable backend id. A neutral
// MessageCircle covers any id we don't have a bespoke icon for.
const ICONS: Record<string, LucideIcon> = {
  'marcus-aurelius': Landmark,
  buddha: Flower2,
  confucius: BookOpen,
  laozi: Wind,
  'eckhart-tolle': Sun,
  'carl-jung': Sparkles,
  'miyamoto-musashi': Swords,
}

// How long a single message may be — mirrors the backend MAX_CONTENT_LEN so we validate
// before the request rather than surfacing a 422.
const MAX_LEN = 4000

type Notice = { kind: 'error' | 'cap' | 'guest' } | null

export default function PhilosophersPage() {
  const { t } = useT()
  const [personas, setPersonas] = useState<PhilosopherSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const [selected, setSelected] = useState<PhilosopherSummary | null>(null)
  const [messages, setMessages] = useState<PhilosopherTurn[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  // Once the daily cap (429) or guest gate (403) is hit, further sends are disabled.
  const [capHit, setCapHit] = useState(false)
  const [guestBlocked, setGuestBlocked] = useState(false)

  const listEndRef = useRef<HTMLDivElement | null>(null)

  function loadRoster() {
    philosopherService
      .list()
      .then((rows) => {
        setPersonas(rows)
        setLoadError(null)
      })
      .catch((err) => setLoadError(messageForError(err, t('philosophers.loadError'))))
      .finally(() => setRetrying(false))
  }

  useEffect(() => {
    loadRoster()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    // Optional-call scrollIntoView: jsdom (tests) doesn't implement it.
    listEndRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  function retryLoad() {
    setRetrying(true)
    loadRoster()
  }

  function pickPersona(persona: PhilosopherSummary) {
    setSelected(persona)
    setMessages([])
    setInput('')
    setNotice(null)
    setCapHit(false)
    setGuestBlocked(false)
  }

  function backToPicker() {
    setSelected(null)
    setMessages([])
    setInput('')
    setNotice(null)
  }

  async function send() {
    const text = input.trim()
    if (!selected || !text || sending || capHit || guestBlocked) return

    const userTurn: PhilosopherTurn = { role: 'user', content: text }
    const history = [...messages, userTurn]
    // Optimistically show the user's message and clear the composer.
    setMessages(history)
    setInput('')
    setNotice(null)
    setSending(true)
    try {
      const res = await philosopherService.chat(selected.id, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
    } catch (err) {
      // The send didn't land — roll the optimistic user turn back out and restore the
      // draft so the composer holds the words (a retry, or an edit before the gate copy).
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
      if (err instanceof ApiError && err.status === 429) {
        setCapHit(true)
        setNotice({ kind: 'cap' })
      } else if (err instanceof ApiError && err.status === 403) {
        // Guest account — chatting is for saved accounts. Gentle note, no retry.
        setGuestBlocked(true)
        setNotice({ kind: 'guest' })
      } else {
        setNotice({ kind: 'error' })
      }
    } finally {
      setSending(false)
    }
  }

  function onComposerKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline (familiar chat behaviour).
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // ── Picker ────────────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <main id="main-content" className="dashboard philosophers">
        <Link to="/" className="back-link">{t('common.backHome')}</Link>
        <header className="page-head">
          <h1>{t('philosophers.title')}</h1>
          <p className="page-subtitle">{t('philosophers.subtitle')}</p>
        </header>

        <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
        {!personas && !loadError && <Loading label={t('philosophers.loading')} />}
        {personas && personas.length === 0 && (
          <EmptyState>{t('philosophers.empty')}</EmptyState>
        )}
        {personas && personas.length > 0 && (
          <>
            <h2 className="philo-picker-heading">{t('philosophers.pickerHeading')}</h2>
            <div className="practices-grid">
              {personas.map((p) => {
                const Icon = ICONS[p.id] ?? MessageCircle
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="practice-card philo-card"
                    aria-label={t('philosophers.choose', { name: p.name })}
                    onClick={() => pickPersona(p)}
                  >
                    <span className="practice-card-icon" aria-hidden="true">
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <span className="practice-card-body">
                      <span className="practice-card-name">{p.name}</span>
                      <span className="philo-card-tradition">{p.tradition}</span>
                      <span className="practice-card-desc">{p.blurb}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="philo-disclaimer muted">{t('philosophers.disclaimer')}</p>
          </>
        )}
      </main>
    )
  }

  // ── Chat view ───────────────────────────────────────────────────────────────
  const Icon = ICONS[selected.id] ?? MessageCircle
  return (
    <main id="main-content" className="dashboard philosophers philosophers-chat">
      <button type="button" className="back-link philo-back" onClick={backToPicker}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> {t('philosophers.change')}
      </button>

      <header className="page-head philo-chat-head">
        <span className="practice-card-icon philo-chat-avatar" aria-hidden="true">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <span>
          <h1>{selected.name}</h1>
          <p className="page-subtitle">{selected.tradition}</p>
        </span>
      </header>

      <div className="philo-thread" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="philo-intro muted">
            {t('philosophers.intro', { name: selected.name, tradition: selected.tradition })}
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`philo-msg ${m.role === 'user' ? 'philo-msg--user' : 'philo-msg--guide'}`}
          >
            <span className="philo-msg-who">
              {m.role === 'user' ? t('philosophers.youLabel') : selected.name}
            </span>
            <p className="philo-msg-text">{m.content}</p>
          </div>
        ))}
        {sending && (
          <p className="philo-typing muted" role="status">
            {t('philosophers.thinking', { name: selected.name })}
          </p>
        )}
        <div ref={listEndRef} />
      </div>

      {notice && (
        <p className="philo-notice" role="status">
          {notice.kind === 'cap'
            ? t('philosophers.capReached')
            : notice.kind === 'guest'
              ? t('philosophers.guestBlocked')
              : t('philosophers.error')}
        </p>
      )}

      <div className="philo-composer">
        <textarea
          rows={2}
          value={input}
          maxLength={MAX_LEN}
          disabled={capHit || guestBlocked}
          aria-label={t('philosophers.composerAria')}
          placeholder={t('philosophers.composerPlaceholder')}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onComposerKeyDown}
        />
        <button
          type="button"
          className="btn btn--primary philo-send"
          onClick={send}
          disabled={sending || !input.trim() || capHit || guestBlocked}
        >
          <Send size={16} strokeWidth={2} aria-hidden="true" />
          {sending ? t('philosophers.sending') : t('philosophers.send')}
        </button>
      </div>
    </main>
  )
}
