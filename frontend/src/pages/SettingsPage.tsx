import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import PushToggle from '../components/PushToggle'
import QuestPicker, { tooFewQuestsMessage } from '../components/QuestPicker'
import { SEASON_PREFS, SEASONS } from '../lib/theme'
import { getInterfaceSounds, setInterfaceSounds, playClick } from '../lib/sfx'
import { QUEST_FEATURES, MIN_QUEST_FEATURES } from '../types'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

function formatJoined(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display}:00 ${period}`
}

export default function SettingsPage() {
  const { user, refresh, logout } = useAuth()
  const { pref: seasonPref, setPref: setSeasonPref, season, dayPhase } = useTheme()
  const navigate = useNavigate()

  // Username section.
  const [username, setUsername] = useState(user?.username ?? '')
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameOk, setUsernameOk] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)

  // Password section.
  const hasPassword = user?.has_password ?? true
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordOk, setPasswordOk] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  // Email section.
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailOk, setEmailOk] = useState(false)
  const [savingEmail, setSavingEmail] = useState(false)

  // Daily quests section.
  const [questFeatures, setQuestFeatures] = useState<string[]>(
    user?.quest_features ?? QUEST_FEATURES.map((f) => f.key),
  )
  const [questError, setQuestError] = useState<string | null>(null)
  const [questOk, setQuestOk] = useState(false)
  const [savingQuests, setSavingQuests] = useState(false)

  // Reminders section.
  const [remindersEnabled, setRemindersEnabled] = useState(user?.reminder_enabled ?? false)
  const [streakSaveEnabled, setStreakSaveEnabled] = useState(user?.streak_save_enabled ?? true)
  const [soundsEnabled, setSoundsEnabled] = useState(getInterfaceSounds)
  const [reminderHour, setReminderHour] = useState(user?.reminder_hour ?? 8)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [reminderOk, setReminderOk] = useState(false)
  const [savingReminder, setSavingReminder] = useState(false)
  const [summaryEnabled, setSummaryEnabled] = useState(user?.weekly_summary_enabled ?? false)
  const [summaryDay, setSummaryDay] = useState(user?.weekly_summary_day ?? 1)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summaryOk, setSummaryOk] = useState(false)
  const [savingSummary, setSavingSummary] = useState(false)

  // Claim section (guest accounts only).
  const [claimEmail, setClaimEmail] = useState('')
  const [claimPassword, setClaimPassword] = useState('')
  const [claimConfirm, setClaimConfirm] = useState('')
  const [claimError, setClaimError] = useState<string | null>(null)
  const [savingClaim, setSavingClaim] = useState(false)

  // Data section (export / delete).
  const [dataError, setDataError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // The page only renders inside ProtectedRoute, so `user` is always present here,
  // but guard for type-safety.
  if (!user) return null

  async function handleUsername(e: FormEvent) {
    e.preventDefault()
    setUsernameError(null)
    setUsernameOk(false)
    if (!USERNAME_RE.test(username)) {
      setUsernameError('3–20 characters: letters, numbers, and underscores only.')
      return
    }
    if (username === user!.username) {
      setUsernameError('That’s already your username.')
      return
    }
    setSavingUsername(true)
    try {
      await authService.setUsername(username)
      await refresh()
      setUsernameOk(true)
    } catch (err) {
      setUsernameError(
        err instanceof ApiError && err.status === 409
          ? 'That username is taken.'
          : messageForError(err),
      )
    } finally {
      setSavingUsername(false)
    }
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault()
    setPasswordError(null)
    setPasswordOk(false)
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords don’t match.')
      return
    }
    if (hasPassword && !currentPassword) {
      setPasswordError('Enter your current password.')
      return
    }
    setSavingPassword(true)
    try {
      await authService.setPassword(newPassword, hasPassword ? currentPassword : undefined)
      await refresh()
      setPasswordOk(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(
        err instanceof ApiError && err.status === 401
          ? 'Your current password is incorrect.'
          : messageForError(err),
      )
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleEmail(e: FormEvent) {
    e.preventDefault()
    setEmailError(null)
    setEmailOk(false)
    if (!newEmail.trim()) {
      setEmailError('Enter a new email.')
      return
    }
    if (newEmail.trim().toLowerCase() === user!.email.toLowerCase()) {
      setEmailError('That’s already your email.')
      return
    }
    if (!emailPassword) {
      setEmailError('Enter your current password to confirm.')
      return
    }
    setSavingEmail(true)
    try {
      await authService.setEmail(newEmail.trim(), emailPassword)
      await refresh() // email + email_verified change; the verify banner reappears
      setEmailOk(true)
      setNewEmail('')
      setEmailPassword('')
    } catch (err) {
      setEmailError(
        err instanceof ApiError && err.status === 409
          ? 'That email already has an account.'
          : err instanceof ApiError && err.status === 401
            ? 'Your password is incorrect.'
            : messageForError(err),
      )
    } finally {
      setSavingEmail(false)
    }
  }

  async function handleClaim(e: FormEvent) {
    e.preventDefault()
    setClaimError(null)
    if (!claimEmail) {
      setClaimError('Enter an email.')
      return
    }
    if (claimPassword.length < 8) {
      setClaimError('Password must be at least 8 characters.')
      return
    }
    if (claimPassword !== claimConfirm) {
      setClaimError('The passwords don’t match.')
      return
    }
    setSavingClaim(true)
    try {
      await authService.claim(claimEmail, claimPassword)
      await refresh() // is_guest flips to false — this section + the guest banner disappear
    } catch (err) {
      setClaimError(
        err instanceof ApiError && err.status === 409
          ? 'That email already has an account.'
          : messageForError(err),
      )
    } finally {
      // Normally the section unmounts on success (is_guest flips false); reset anyway so
      // the button never stays stuck on 'Saving…' if the user object shape is unchanged.
      setSavingClaim(false)
    }
  }

  async function handleExport() {
    setDataError(null)
    setExporting(true)
    try {
      const data = await authService.exportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'meditationos-data.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setDataError("Couldn't export your data. Try again.")
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    setDataError(null)
    setDeleting(true)
    try {
      await authService.deleteAccount()
      await logout() // clears the (already-cleared) session + local user state
      navigate('/login')
    } catch {
      setDataError("Couldn't delete your account. Try again.")
      setDeleting(false)
    }
  }

  function toggleQuest(key: string, on: boolean) {
    setQuestFeatures((cur) => (on ? [...cur, key] : cur.filter((k) => k !== key)))
    setQuestOk(false)
  }

  async function handleQuests(e: FormEvent) {
    e.preventDefault()
    setQuestError(null)
    setQuestOk(false)
    if (questFeatures.length < MIN_QUEST_FEATURES) {
      setQuestError(tooFewQuestsMessage)
      return
    }
    setSavingQuests(true)
    try {
      await authService.setQuestFeatures(questFeatures)
      await refresh()
      setQuestOk(true)
    } catch (err) {
      setQuestError(messageForError(err))
    } finally {
      setSavingQuests(false)
    }
  }

  async function handleReminders(e: FormEvent) {
    e.preventDefault()
    setReminderError(null)
    setReminderOk(false)
    setSavingReminder(true)
    // Two separate endpoints: persist the reminder first, then the streak-save toggle.
    // Track whether the first write landed so a failure on the second can report the
    // partial state honestly instead of a blanket "nothing saved" error.
    let remindersSaved = false
    try {
      await authService.setReminders(remindersEnabled, remindersEnabled ? reminderHour : null)
      remindersSaved = true
      // The streak-save nudge only fires when reminders are on; persist its toggle too.
      await authService.setStreakSave(streakSaveEnabled)
      await refresh()
      setReminderOk(true)
    } catch (err) {
      await refresh() // reflect whatever did persist
      setReminderError(
        remindersSaved
          ? 'Your reminder time was saved, but the streak-save nudge couldn’t be updated. Please try again.'
          : messageForError(err),
      )
    } finally {
      setSavingReminder(false)
    }
  }

  async function handleWeeklySummary(e: FormEvent) {
    e.preventDefault()
    setSummaryError(null)
    setSummaryOk(false)
    setSavingSummary(true)
    try {
      await authService.setWeeklySummary(summaryEnabled, summaryEnabled ? summaryDay : null)
      await refresh()
      setSummaryOk(true)
    } catch (err) {
      setSummaryError(messageForError(err))
    } finally {
      setSavingSummary(false)
    }
  }

  return (
    <main id="main-content" className="settings">
      <Link to="/" className="back-link">← Dashboard</Link>
      <h1>Settings</h1>

      {user.is_guest && (
        <section className="settings-section">
          <h2>Save your account</h2>
          <p className="muted">
            Add an email and password so you can log back in and keep your progress.
          </p>
          <form onSubmit={handleClaim} noValidate>
            <label htmlFor="claim-email">Email</label>
            <input
              id="claim-email"
              type="email"
              autoComplete="email"
              value={claimEmail}
              onChange={(e) => setClaimEmail(e.target.value)}
            />
            <label htmlFor="claim-password">Password</label>
            <input
              id="claim-password"
              type="password"
              autoComplete="new-password"
              value={claimPassword}
              onChange={(e) => setClaimPassword(e.target.value)}
            />
            <label htmlFor="claim-confirm">Confirm password</label>
            <input
              id="claim-confirm"
              type="password"
              autoComplete="new-password"
              value={claimConfirm}
              onChange={(e) => setClaimConfirm(e.target.value)}
            />
            {claimError && (
              <p role="alert" className="error">
                {claimError}
              </p>
            )}
            <button type="submit" disabled={savingClaim}>
              {savingClaim ? 'Saving…' : 'Save account'}
            </button>
          </form>
        </section>
      )}

      <section className="settings-section">
        <h2>Account</h2>
        <dl className="settings-info">
          <dt>Email</dt>
          <dd>{user.is_guest ? 'Guest account (not saved)' : user.email}</dd>
          <dt>Member since</dt>
          <dd>{formatJoined(user.created_at)}</dd>
        </dl>
      </section>

      <section className="settings-section">
        <h2>Username</h2>
        <p className="muted">Your public name — shown instead of your email.</p>
        <form onSubmit={handleUsername} noValidate>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setUsernameOk(false)
            }}
          />
          {usernameError && (
            <p role="alert" className="error">
              {usernameError}
            </p>
          )}
          {usernameOk && <p role="status" className="success">Username updated.</p>}
          <button type="submit" disabled={savingUsername}>
            {savingUsername ? 'Saving…' : 'Save username'}
          </button>
        </form>
      </section>

      {!user.is_guest && hasPassword && (
        <section className="settings-section">
          <h2>Change email</h2>
          <p className="muted">
            You’ll need to confirm a verification link sent to the new address.
          </p>
          <form onSubmit={handleEmail} noValidate>
            <label htmlFor="new-email">New email</label>
            <input
              id="new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              placeholder={user.email}
              onChange={(e) => {
                setNewEmail(e.target.value)
                setEmailOk(false)
              }}
            />
            <label htmlFor="email-password">Current password</label>
            <input
              id="email-password"
              type="password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
            />
            {emailError && (
              <p role="alert" className="error">
                {emailError}
              </p>
            )}
            {emailOk && (
              <p role="status" className="success">Email updated — check your inbox to verify it.</p>
            )}
            <button type="submit" disabled={savingEmail}>
              {savingEmail ? 'Saving…' : 'Change email'}
            </button>
          </form>
        </section>
      )}

      {!user.is_guest && (
      <section className="settings-section">
        <h2>{hasPassword ? 'Change password' : 'Set a password'}</h2>
        {!hasPassword && (
          <p className="muted">
            Your account uses Sign in with Google. Set a password to also log in with
            your email.
          </p>
        )}
        <form onSubmit={handlePassword} noValidate>
          {hasPassword && (
            <>
              <label htmlFor="current-password">Current password</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </>
          )}
          <label htmlFor="new-password">New password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <label htmlFor="confirm-password">Confirm new password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          {passwordError && (
            <p role="alert" className="error">
              {passwordError}
            </p>
          )}
          {passwordOk && (
            <p role="status" className="success">{hasPassword ? 'Password changed.' : 'Password set.'}</p>
          )}
          <button type="submit" disabled={savingPassword}>
            {savingPassword ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
          </button>
        </form>
      </section>
      )}

      <section className="settings-section">
        <h2>Daily missions</h2>
        <p className="muted">
          Choose which practices you get daily missions for — at least {MIN_QUEST_FEATURES}.
        </p>
        <form onSubmit={handleQuests} noValidate>
          <QuestPicker
            selected={questFeatures}
            onToggle={toggleQuest}
            optionClassName="settings-check"
            legend="Daily mission practices"
          />
          {questError && (
            <p role="alert" className="error">
              {questError}
            </p>
          )}
          {questOk && <p role="status" className="success">Mission preferences saved.</p>}
          <button type="submit" disabled={savingQuests}>
            {savingQuests ? 'Saving…' : 'Save missions'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Practice reminders</h2>
        <p className="muted">
          A gentle daily email at your local time, skipped on days you’ve already practiced.
        </p>
        <form onSubmit={handleReminders} noValidate>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={remindersEnabled}
              onChange={(e) => {
                setRemindersEnabled(e.target.checked)
                setReminderOk(false)
              }}
            />
            Email me a daily reminder to practice
          </label>
          {remindersEnabled && (
            <>
              <label htmlFor="reminder-hour">Time of day</label>
              <select
                id="reminder-hour"
                value={reminderHour}
                onChange={(e) => {
                  setReminderHour(Number(e.target.value))
                  setReminderOk(false)
                }}
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
              <label className="settings-check">
                <input
                  type="checkbox"
                  checked={streakSaveEnabled}
                  onChange={(e) => {
                    setStreakSaveEnabled(e.target.checked)
                    setReminderOk(false)
                  }}
                />
                Also send a gentle evening nudge if my streak is at risk
              </label>
            </>
          )}
          {reminderError && (
            <p role="alert" className="error">
              {reminderError}
            </p>
          )}
          {reminderOk && <p role="status" className="success">Reminder preferences saved.</p>}
          <button type="submit" disabled={savingReminder}>
            {savingReminder ? 'Saving…' : 'Save reminders'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Weekly summary</h2>
        <p className="muted">
          A weekly email recap — minutes, streak, and your most-logged mood. Sent the morning
          of your chosen day.
        </p>
        <form onSubmit={handleWeeklySummary} noValidate>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={summaryEnabled}
              onChange={(e) => {
                setSummaryEnabled(e.target.checked)
                setSummaryOk(false)
              }}
            />
            Email me a weekly summary
          </label>
          {summaryEnabled && (
            <>
              <label htmlFor="summary-day">Day of week</label>
              <select
                id="summary-day"
                value={summaryDay}
                onChange={(e) => {
                  setSummaryDay(Number(e.target.value))
                  setSummaryOk(false)
                }}
              >
                {WEEKDAYS.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
          {summaryError && (
            <p role="alert" className="error">
              {summaryError}
            </p>
          )}
          {summaryOk && <p role="status" className="success">Weekly summary preferences saved.</p>}
          <button type="submit" disabled={savingSummary}>
            {savingSummary ? 'Saving…' : 'Save weekly summary'}
          </button>
        </form>
      </section>

      <PushToggle />

      <section className="settings-section">
        <h2>Timezone</h2>
        <p className="muted">
          Set from your browser, so streaks and quests roll over at your local midnight.
        </p>
        <p className="settings-tz">{user.timezone}</p>
      </section>

      <section className="settings-section">
        <h2>Appearance</h2>

        <p className="muted settings-section-note">
          A seasonal tint colors the background. Pick one, or let it follow the calendar.
        </p>
        <label htmlFor="season">Season</label>
        <select
          id="season"
          value={seasonPref}
          onChange={(e) => setSeasonPref(e.target.value as typeof seasonPref)}
        >
          {SEASON_PREFS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <p className="muted settings-theme-now">
          Now showing: {SEASONS.find((s) => s.value === season)?.label}
          {seasonPref === 'auto' && ' (auto)'} · {dayPhase}
        </p>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={soundsEnabled}
            onChange={(e) => {
              const on = e.target.checked
              setInterfaceSounds(on)
              setSoundsEnabled(on)
              // Play a tick as feedback when turning sounds on (so you hear what you
              // just enabled); stay silent when turning them off.
              if (on) playClick()
            }}
          />
          Interface sounds (a soft tick when you tap controls)
        </label>
      </section>

      <section className="settings-section">
        <h2>Your data</h2>
        <p className="muted">
          Download your account as JSON, or permanently delete it and all its data.
        </p>
        {dataError && (
          <p role="alert" className="error">
            {dataError}
          </p>
        )}
        <div className="settings-data-actions">
          <button
            type="button"
            className="settings-secondary"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? 'Preparing…' : 'Export my data'}
          </button>

          {!confirmingDelete ? (
            <button
              type="button"
              className="settings-danger"
              onClick={() => setConfirmingDelete(true)}
            >
              Delete account
            </button>
          ) : (
            <div className="settings-confirm">
              <p>This permanently deletes your account and all your data. This can’t be undone.</p>
              <div className="settings-data-actions">
                <button
                  type="button"
                  className="settings-secondary"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="settings-danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete permanently'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
