import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Send, Sparkles, Trash2 } from 'lucide-react'
import { philosopherService } from '../services/philosophers'
import { dashboardService } from '../services/dashboard'
import { ApiError } from '../services/api'
import { Loading, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import { philosopherMeta } from '../lib/philosopherMeta'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'
import type { PhilosopherChatSummary, PhilosopherSummary, PhilosopherTurn } from '../types'

// How long a single message may be — mirrors the backend MAX_CONTENT_LEN so we validate
// before the request rather than surfacing a 422.
const MAX_LEN = 4000

// 'guestCap' — a guest hit their small trial cap (429); nudge toward a free account.
// 'guest' — the (rare) hard block if a deployment gates the whole feature behind a saved
// account; kept as a defensive fallback.
type Notice = { kind: 'error' | 'cap' | 'guest' | 'guestCap' } | null

export default function PhilosophersPage() {
  const { t } = useT()
  const { user } = useAuth()
  const isGuest = user?.is_guest ?? false
  const [searchParams] = useSearchParams()
  const [personas, setPersonas] = useState<PhilosopherSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const [selected, setSelected] = useState<PhilosopherSummary | null>(null)
  const [messages, setMessages] = useState<PhilosopherTurn[]>([])
  // The saved conversation the current chat threads onto (undefined = a fresh, not-yet-saved
  // conversation; set from the first reply's chat_id, or when reopening a saved one).
  const [chatId, setChatId] = useState<string | undefined>(undefined)
  // The user's saved conversations, shown on the picker to resume or delete. Non-blocking.
  const [conversations, setConversations] = useState<PhilosopherChatSummary[] | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  // Once the daily cap (429) or guest gate (403) is hit, further sends are disabled.
  const [capHit, setCapHit] = useState(false)
  const [guestBlocked, setGuestBlocked] = useState(false)
  // Today's practiced minutes (local day) — powers a personalized opener that seeds the
  // chat with the user's real sit. Non-blocking: null while loading or if the fetch fails.
  const [todayMinutes, setTodayMinutes] = useState<number | null>(null)

  const listEndRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

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

  // The saved conversations list — non-blocking; a failure just leaves the section absent.
  function loadConversations() {
    philosopherService
      .listConversations()
      .then(setConversations)
      .catch(() => {})
  }

  useEffect(() => {
    loadRoster()
    loadConversations()
    // Non-blocking: today's practice powers a personalized opener. A failure just omits
    // it — the persona's own starters still show, and the chat is unaffected.
    dashboardService
      .getStats()
      .then((s) => setTodayMinutes(s.today_minutes))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Deep-link preselect: /philosophers?guide=<id> opens straight into that guide (the dashboard
  // "reflect with a guide" card links here). Runs once the roster is loaded; ignores an unknown id.
  useEffect(() => {
    if (!personas || selected) return
    const wanted = searchParams.get('guide')
    if (!wanted) return
    const match = personas.find((p) => p.id === wanted)
    if (match) pickPersona(match)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personas])

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
    setChatId(undefined) // a fresh conversation
    setInput('')
    setNotice(null)
    setCapHit(false)
    setGuestBlocked(false)
  }

  function backToPicker() {
    setSelected(null)
    setMessages([])
    setChatId(undefined)
    setInput('')
    setNotice(null)
    loadConversations() // reflect the conversation we just had (or its updates)
  }

  // Reopen a saved conversation: load its turns and thread new messages onto it. Resolves the
  // guide from the roster; a stale row (guide gone / already deleted) just refreshes the list.
  async function reopenConversation(summary: PhilosopherChatSummary) {
    const persona = personas?.find((p) => p.id === summary.philosopher_id)
    if (!persona) return
    try {
      const detail = await philosopherService.getConversation(summary.id)
      setSelected(persona)
      setMessages(detail.messages)
      setChatId(detail.id)
      setInput('')
      setNotice(null)
      setCapHit(false)
      setGuestBlocked(false)
    } catch {
      loadConversations()
    }
  }

  async function removeConversation(id: string) {
    try {
      await philosopherService.deleteConversation(id)
    } catch {
      // Ignore — the reload below reconciles (e.g. it was already gone).
    }
    setConversations((prev) => prev?.filter((c) => c.id !== id) ?? null)
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
      const res = await philosopherService.chat(selected.id, history, chatId)
      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply }])
      setChatId(res.chat_id) // thread subsequent turns onto the now-saved conversation
    } catch (err) {
      // The send didn't land — roll the optimistic user turn back out and restore the
      // draft so the composer holds the words (a retry, or an edit before the gate copy).
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
      if (err instanceof ApiError && err.status === 429) {
        // A guest hit their small trial cap → nudge toward a free account; a saved account
        // hit the daily cap → the ordinary "enough for today" note.
        setCapHit(true)
        setNotice({ kind: isGuest ? 'guestCap' : 'cap' })
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

  // Tapping a starter drops it into the composer and focuses it — the user can send as
  // is or edit first (mirrors the Journal writing-prompt "use" behaviour). It never
  // auto-sends, so there's no surprise LLM call or accidental cap spend.
  function fillOpener(text: string) {
    setInput(text)
    setNotice(null)
    composerRef.current?.focus()
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
                const meta = philosopherMeta(p.id)
                const Icon = meta.icon
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="practice-card philo-card"
                    style={{
                      ['--card-fill' as string]: meta.light,
                      ['--card-fill-dark' as string]: meta.dark,
                    }}
                    aria-label={t('philosophers.choose', { name: p.name })}
                    onClick={() => pickPersona(p)}
                  >
                    <span className="practice-card-icon" aria-hidden="true">
                      <Icon size={20} strokeWidth={1.75} />
                    </span>
                    <span className="practice-card-body">
                      <span className="practice-card-name">{p.name}</span>
                      <span className="philo-card-meta">
                        <span className="philo-card-tradition">{p.tradition}</span>
                        {meta.era && <span className="philo-card-era">{meta.era}</span>}
                      </span>
                      <span className="practice-card-desc">{p.blurb}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="philo-disclaimer muted">{t('philosophers.disclaimer')}</p>

            {/* Saved conversations — resume where you left off, or delete. Newest first
                (the API orders them). Only shown once there's something to resume. */}
            {conversations && conversations.length > 0 && (
              <section className="philo-saved">
                <h2 className="philo-picker-heading">{t('philosophers.savedHeading')}</h2>
                <ul className="philo-saved-list">
                  {conversations.map((c) => {
                    const cMeta = philosopherMeta(c.philosopher_id)
                    const CIcon = cMeta.icon
                    const persona = personas.find((p) => p.id === c.philosopher_id)
                    return (
                      <li
                        key={c.id}
                        className="philo-saved-item"
                        style={{
                          ['--card-fill' as string]: cMeta.light,
                          ['--card-fill-dark' as string]: cMeta.dark,
                        }}
                      >
                        <button
                          type="button"
                          className="philo-saved-open"
                          onClick={() => reopenConversation(c)}
                        >
                          <span className="philo-saved-icon" aria-hidden="true">
                            <CIcon size={18} strokeWidth={1.75} />
                          </span>
                          <span className="philo-saved-body">
                            <span className="philo-saved-who">{persona?.name ?? c.philosopher_id}</span>
                            <span className="philo-saved-title">{c.title}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="philo-saved-delete"
                          aria-label={t('philosophers.deleteConvo', { title: c.title })}
                          onClick={() => removeConversation(c.id)}
                        >
                          <Trash2 size={16} strokeWidth={1.9} aria-hidden="true" />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    )
  }

  // ── Chat view ───────────────────────────────────────────────────────────────
  const meta = philosopherMeta(selected.id)
  const Icon = meta.icon
  // A personalized opener when the user has practiced today: it seeds the chat with their
  // real sit so the guide reflects on something true, not a generic prompt. English
  // content (the whole conversation is English), like the persona's own openers.
  const contextOpener =
    todayMinutes && todayMinutes > 0
      ? `I sat for ${todayMinutes} ${todayMinutes === 1 ? 'minute' : 'minutes'} today — I’d like to reflect on it.`
      : null
  // Starters shown on an empty chat: the personalized one first (when present), then the
  // persona's own. Hidden once a gate is hit (nothing to start) or the chat has begun.
  const openers = [...(contextOpener ? [contextOpener] : []), ...(selected.openers ?? [])]
  const showOpeners = messages.length === 0 && !sending && !capHit && !guestBlocked && openers.length > 0
  return (
    <main
      id="main-content"
      className="dashboard philosophers philosophers-chat"
      style={{
        ['--card-fill' as string]: meta.light,
        ['--card-fill-dark' as string]: meta.dark,
      }}
    >
      {/* A faint, accent-tinted emblem of the guide bleeding off the top-right corner — a quiet
          watermark that gives each chat a sense of place. Clipped by its own wrapper (never the
          page container) and confined to the header zone so it stays clear of the reading text. */}
      <span className="philo-emblem-wrap" aria-hidden="true">
        <Icon className="philo-emblem" size={300} strokeWidth={0.7} />
      </span>

      <button type="button" className="back-link philo-back" onClick={backToPicker}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden="true" /> {t('philosophers.change')}
      </button>

      <header className="page-head philo-chat-head">
        <span className="practice-card-icon philo-chat-avatar" aria-hidden="true">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <span>
          <h1>{selected.name}</h1>
          <p className="page-subtitle">
            {selected.tradition}
            {meta.era && <span className="philo-card-era"> · {meta.era}</span>}
          </p>
        </span>
      </header>

      {/* A practice in this guide's spirit — closes the loop from reflection back into the app.
          Deterministic per guide (not model-generated), so it's a stable, safe deep-link. */}
      <Link to={meta.practice.to} className="philo-practice">
        <span>{t('philosophers.practiceSuggestion', { name: selected.name })}</span>
        <span className="philo-practice-name">
          {t(meta.practice.nameKey)}
          <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
        </span>
      </Link>

      <div
        className={`philo-thread${messages.length === 0 ? ' philo-thread--empty' : ''}`}
        role="log"
        aria-live="polite"
      >
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

      {showOpeners && (
        <div className="philo-openers">
          <p className="philo-openers-heading muted">{t('philosophers.startersHeading')}</p>
          <div className="philo-openers-chips">
            {openers.map((o) => {
              const isContext = o === contextOpener
              return (
                <button
                  key={o}
                  type="button"
                  className={`philo-opener${isContext ? ' philo-opener--context' : ''}`}
                  aria-label={t('philosophers.openerAria', { text: o })}
                  onClick={() => fillOpener(o)}
                >
                  {isContext && <Sparkles size={13} strokeWidth={2} aria-hidden="true" />}
                  {o}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {notice && (
        <p className="philo-notice" role="status">
          {notice.kind === 'cap' ? (
            t('philosophers.capReached')
          ) : notice.kind === 'guestCap' ? (
            <>
              {t('philosophers.guestCapReached')}{' '}
              <Link to="/register">{t('philosophers.createAccount')}</Link>
            </>
          ) : notice.kind === 'guest' ? (
            t('philosophers.guestBlocked')
          ) : (
            t('philosophers.error')
          )}
        </p>
      )}

      <div className="philo-composer">
        <textarea
          ref={composerRef}
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

      {/* Gentle heads-up for guests so the trial cap isn't a surprise later — a quiet line,
          not a wall. Hidden once the cap note is showing (it carries the same sign-up link). */}
      {isGuest && !capHit && !guestBlocked && (
        <p className="philo-guest-note muted">
          {t('philosophers.guestNote')}{' '}
          <Link to="/register">{t('philosophers.createAccount')}</Link>
        </p>
      )}
    </main>
  )
}
