import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, Flame } from 'lucide-react'
import { friendsService } from '../services/friends'
import { ApiError } from '../services/api'
import { useToast } from '../context/ToastContext'
import { Loading, ErrorBanner, RetryableError, EmptyState } from '../components/StateViews'
import { messageForError } from '../lib/errors'
import type { Friend, FriendRequests } from '../types'

// Public-username shape, mirrored from the backend schema (3–20 chars, letters/digits/_).
const USERNAME_RE = /^[a-zA-Z0-9_]+$/

// A calm, non-competitive recent-activity line for a friend. No ranking, no "beat them" —
// just a gentle sense of how they're doing lately.
function activityLine(f: Friend): string {
  if (f.sessions_this_week > 0) {
    const n = f.sessions_this_week
    return `${n} ${n === 1 ? 'practice' : 'practices'} this week`
  }
  if (f.last_practiced_on) return `Last practiced ${f.last_practiced_on}`
  return 'No practice yet — cheer them on'
}

export default function FriendsPage() {
  const { showToast } = useToast()
  const [friends, setFriends] = useState<Friend[] | null>(null)
  const [requests, setRequests] = useState<FriendRequests | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Add-friend form.
  const [username, setUsername] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function load(ignored?: () => boolean) {
    setFriends(null)
    setRequests(null)
    Promise.all([friendsService.list(), friendsService.requests()])
      .then(([fs, rs]) => {
        if (ignored?.()) return
        setFriends(fs)
        setRequests(rs)
        setLoadError(null)
      })
      .catch((err) => {
        if (!ignored?.()) setLoadError(messageForError(err, "Couldn't load your friends."))
      })
      .finally(() => {
        if (!ignored?.()) setRetrying(false)
      })
  }

  useEffect(() => {
    let ignore = false
    load(() => ignore)
    return () => {
      ignore = true
    }
  }, [])

  function retryLoad() {
    setRetrying(true)
    load()
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setAddError(null)
    const name = username.trim()
    if (!USERNAME_RE.test(name) || name.length < 3 || name.length > 20) {
      setAddError('Enter a username: 3–20 letters, numbers, or underscores.')
      return
    }
    setSubmitting(true)
    try {
      await friendsService.sendRequest(name)
      showToast('Request sent. They can accept when they’re ready.')
      setUsername('')
      // Refresh so the new outgoing request shows immediately.
      const rs = await friendsService.requests()
      setRequests(rs)
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setAddError('No one goes by that username.')
      } else if (err instanceof ApiError && err.status === 400) {
        setAddError('That’s you! Try a friend’s username.')
      } else if (err instanceof ApiError && err.status === 409) {
        setAddError('You’re already connected or have a pending request.')
      } else if (err instanceof ApiError && err.status === 429) {
        setAddError('That’s a lot of requests for one day — try again tomorrow.')
      } else {
        setAddError(messageForError(err, "Couldn't send that request."))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function accept(req: { id: string; username: string }) {
    setActionError(null)
    try {
      await friendsService.accept(req.id)
      showToast(`You and ${req.username} are now friends.`)
      // Move from incoming into the friends list — reload both.
      const [fs, rs] = await Promise.all([friendsService.list(), friendsService.requests()])
      setFriends(fs)
      setRequests(rs)
    } catch (err) {
      setActionError(messageForError(err, "Couldn't accept that request."))
    }
  }

  async function decline(req: { id: string; username: string }) {
    setActionError(null)
    try {
      await friendsService.decline(req.id)
      setRequests((prev) =>
        prev
          ? { ...prev, incoming: prev.incoming.filter((r) => r.id !== req.id) }
          : prev,
      )
      showToast('Declined — no hard feelings.')
    } catch (err) {
      setActionError(messageForError(err, "Couldn't decline that request."))
    }
  }

  async function remove(f: Friend) {
    setActionError(null)
    try {
      await friendsService.remove(f.user_id)
      setFriends((prev) => prev?.filter((x) => x.user_id !== f.user_id) ?? null)
      showToast(`Removed ${f.username}.`)
    } catch (err) {
      setActionError(messageForError(err, "Couldn't remove that friend."))
    }
  }

  const incoming = requests?.incoming ?? []
  const outgoing = requests?.outgoing ?? []

  return (
    <main id="main-content" className="dashboard">
      <Link to="/" className="back-link">
        ← Dashboard
      </Link>
      <header className="page-head">
        <h1>Friends</h1>
        <p className="page-subtitle">
          Add a friend by username to cheer each other on. You’ll see their level, streak,
          and recent activity — nothing more. Gentle company, not a leaderboard.
        </p>
      </header>

      <section className="friend-compose">
        <form onSubmit={handleAdd} noValidate>
          <label htmlFor="friend-username">Add a friend by username</label>
          <div className="friend-add-row">
            <input
              id="friend-username"
              type="text"
              value={username}
              maxLength={20}
              placeholder="their username"
              autoComplete="off"
              onChange={(e) => setUsername(e.target.value)}
            />
            <button type="submit" className="btn btn--primary" disabled={submitting}>
              <UserPlus size={16} strokeWidth={1.75} aria-hidden="true" />
              {submitting ? 'Sending…' : 'Add friend'}
            </button>
          </div>
          <ErrorBanner message={addError} />
        </form>
      </section>

      <RetryableError message={loadError} onRetry={retryLoad} retrying={retrying} />
      <ErrorBanner message={actionError} />

      {friends === null && requests === null && !loadError && <Loading />}

      {/* Incoming requests — the only actionable request list (accept / decline). */}
      {incoming.length > 0 && (
        <section className="friend-section">
          <h2 className="friend-section-title">Requests</h2>
          <ul className="friend-list">
            {incoming.map((req) => (
              <li key={req.id} className="friend-card">
                <div className="friend-card-main">
                  <strong className="friend-name">{req.username}</strong>
                  <span className="friend-activity muted">wants to be friends</span>
                </div>
                <div className="friend-card-actions">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => accept(req)}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => decline(req)}
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Outgoing pending — informational, awaiting their reply. */}
      {outgoing.length > 0 && (
        <section className="friend-section">
          <h2 className="friend-section-title">Pending</h2>
          <ul className="friend-list">
            {outgoing.map((req) => (
              <li key={req.id} className="friend-card">
                <div className="friend-card-main">
                  <strong className="friend-name">{req.username}</strong>
                  <span className="friend-activity muted">awaiting their reply…</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Accepted friends — username · level · streak · a calm activity line · remove. */}
      {friends !== null && (
        <section className="friend-section">
          <h2 className="friend-section-title">Your friends</h2>
          {friends.length === 0 ? (
            <EmptyState>
              No friends yet. Add someone by their username above — it’s nicer together.
            </EmptyState>
          ) : (
            <ul className="friend-list">
              {friends.map((f) => (
                <li key={f.friendship_id} className="friend-card">
                  <div className="friend-card-main">
                    <strong className="friend-name">{f.username}</strong>
                    <span className="friend-stats muted">
                      <span className="friend-level">Lv {f.level}</span>
                      <span className="friend-streak">
                        <Flame size={13} strokeWidth={1.9} aria-hidden="true" />
                        {f.current_streak}-day streak
                      </span>
                    </span>
                    <span className="friend-activity muted">{activityLine(f)}</span>
                  </div>
                  <div className="friend-card-actions">
                    <button
                      type="button"
                      className="link-danger"
                      onClick={() => remove(f)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}
