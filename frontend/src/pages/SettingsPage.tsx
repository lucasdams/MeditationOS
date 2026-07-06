import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authService } from '../services/auth'
import { ApiError } from '../services/api'
import { messageForError } from '../lib/errors'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import PushToggle from '../components/PushToggle'
import QuestPicker from '../components/QuestPicker'
import { SEASON_PREFS } from '../lib/theme'
import { getInterfaceSounds, setInterfaceSounds, playClick } from '../lib/sfx'
import { LOCALES, LOCALE_LABEL, setLocale, useT, fmtDate, fmtTime, type Locale } from '../i18n'
import { QUEST_FEATURES, MIN_QUEST_FEATURES } from '../types'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

function formatJoined(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : fmtDate(d, { year: 'numeric', month: 'long', day: 'numeric' })
}

const HOURS = Array.from({ length: 24 }, (_, h) => h)
// Reminder day-of-week options as indexes (0 = Monday … 6 = Sunday), matching the backend.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => i)
// Locale-aware label for a reminder hour ("8:00 AM" in en, "8:00" in ja).
function formatHour(h: number): string {
  return fmtTime(new Date(2024, 0, 1, h), { hour: 'numeric', minute: '2-digit' })
}
// Locale-aware weekday name for a summary-day index (0 = Monday). 2024-01-01 was a Monday.
function weekdayLabel(i: number): string {
  return fmtDate(new Date(2024, 0, 1 + i), { weekday: 'long' })
}

export default function SettingsPage() {
  const { user, refresh, logout } = useAuth()
  const { pref: seasonPref, setPref: setSeasonPref, season, dayPhase } = useTheme()
  const { t, locale } = useT()
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
      setUsernameError(t('settings.username.err.format'))
      return
    }
    if (username === user!.username) {
      setUsernameError(t('settings.username.err.same'))
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
          ? t('settings.username.err.taken')
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
      setPasswordError(t('settings.password.err.short'))
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.password.err.mismatch'))
      return
    }
    if (hasPassword && !currentPassword) {
      setPasswordError(t('settings.password.err.current'))
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
          ? t('settings.password.err.wrong')
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
      setEmailError(t('settings.email.err.enter'))
      return
    }
    if (newEmail.trim().toLowerCase() === user!.email.toLowerCase()) {
      setEmailError(t('settings.email.err.same'))
      return
    }
    if (!emailPassword) {
      setEmailError(t('settings.email.err.password'))
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
          ? t('settings.email.err.taken')
          : err instanceof ApiError && err.status === 401
            ? t('settings.email.err.wrong')
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
      setClaimError(t('settings.claim.err.email'))
      return
    }
    if (claimPassword.length < 8) {
      setClaimError(t('settings.claim.err.short'))
      return
    }
    if (claimPassword !== claimConfirm) {
      setClaimError(t('settings.claim.err.mismatch'))
      return
    }
    setSavingClaim(true)
    try {
      await authService.claim(claimEmail, claimPassword)
      await refresh() // is_guest flips to false — this section + the guest banner disappear
    } catch (err) {
      setClaimError(
        err instanceof ApiError && err.status === 409
          ? t('settings.claim.err.taken')
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
      setDataError(t('settings.data.err.export'))
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
      setDataError(t('settings.data.err.delete'))
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
      setQuestError(t('settings.missions.tooFew', { min: MIN_QUEST_FEATURES }))
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
          ? t('settings.reminders.err.partial')
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
      <Link to="/" className="back-link">{t('common.backDashboard')}</Link>
      <h1>{t('settings.title')}</h1>

      {user.is_guest && (
        <section className="settings-section">
          <h2>{t('settings.claim.heading')}</h2>
          <p className="muted">
            {t('settings.claim.desc')}
          </p>
          <form onSubmit={handleClaim} noValidate>
            <label htmlFor="claim-email">{t('settings.claim.email')}</label>
            <input
              id="claim-email"
              type="email"
              autoComplete="email"
              value={claimEmail}
              onChange={(e) => setClaimEmail(e.target.value)}
            />
            <label htmlFor="claim-password">{t('settings.claim.password')}</label>
            <input
              id="claim-password"
              type="password"
              autoComplete="new-password"
              value={claimPassword}
              onChange={(e) => setClaimPassword(e.target.value)}
            />
            <label htmlFor="claim-confirm">{t('settings.claim.confirm')}</label>
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
              {savingClaim ? t('common.saving') : t('settings.claim.submit')}
            </button>
          </form>
        </section>
      )}

      {/* Account — the read-only details (email, joined) and the editable username share ONE
          section: the info lines alone don't earn their own divider. */}
      <section className="settings-section">
        <h2>{t('settings.account.heading')}</h2>
        <dl className="settings-info">
          <dt>{t('settings.account.email')}</dt>
          <dd>{user.is_guest ? t('settings.account.guest') : user.email}</dd>
          <dt>{t('settings.account.memberSince')}</dt>
          <dd>{formatJoined(user.created_at)}</dd>
        </dl>
        <p className="muted">{t('settings.username.desc')}</p>
        <form onSubmit={handleUsername} noValidate>
          <label htmlFor="username">{t('settings.username.label')}</label>
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
          {usernameOk && <p role="status" className="success">{t('settings.username.ok')}</p>}
          <button type="submit" disabled={savingUsername}>
            {savingUsername ? t('common.saving') : t('settings.username.submit')}
          </button>
        </form>
      </section>

      {!user.is_guest && hasPassword && (
        <section className="settings-section">
          <h2>{t('settings.email.heading')}</h2>
          <p className="muted">
            {t('settings.email.desc')}
          </p>
          <form onSubmit={handleEmail} noValidate>
            <label htmlFor="new-email">{t('settings.email.new')}</label>
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
            <label htmlFor="email-password">{t('settings.email.current')}</label>
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
              <p role="status" className="success">{t('settings.email.ok')}</p>
            )}
            <button type="submit" disabled={savingEmail}>
              {savingEmail ? t('common.saving') : t('settings.email.submit')}
            </button>
          </form>
        </section>
      )}

      {!user.is_guest && (
      <section className="settings-section">
        <h2>{hasPassword ? t('settings.password.headingChange') : t('settings.password.headingSet')}</h2>
        {!hasPassword && (
          <p className="muted">
            {t('settings.password.googleNote')}
          </p>
        )}
        <form onSubmit={handlePassword} noValidate>
          {hasPassword && (
            <>
              <label htmlFor="current-password">{t('settings.password.current')}</label>
              <input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </>
          )}
          <label htmlFor="new-password">{t('settings.password.new')}</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <label htmlFor="confirm-password">{t('settings.password.confirm')}</label>
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
            <p role="status" className="success">{hasPassword ? t('settings.password.okChanged') : t('settings.password.okSet')}</p>
          )}
          <button type="submit" disabled={savingPassword}>
            {savingPassword ? t('common.saving') : hasPassword ? t('settings.password.submitChange') : t('settings.password.submitSet')}
          </button>
        </form>
      </section>
      )}

      <section className="settings-section">
        <h2>{t('settings.missions.heading')}</h2>
        <p className="muted">
          {t('settings.missions.desc', { min: MIN_QUEST_FEATURES })}
        </p>
        <form onSubmit={handleQuests} noValidate>
          <QuestPicker
            selected={questFeatures}
            onToggle={toggleQuest}
            optionClassName="settings-check"
            legend={t('settings.missions.legend')}
          />
          {questError && (
            <p role="alert" className="error">
              {questError}
            </p>
          )}
          {questOk && <p role="status" className="success">{t('settings.missions.ok')}</p>}
          <button type="submit" disabled={savingQuests}>
            {savingQuests ? t('common.saving') : t('settings.missions.submit')}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>{t('settings.reminders.heading')}</h2>
        <p className="muted">
          {t('settings.reminders.desc')}
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
            {t('settings.reminders.enable')}
          </label>
          {remindersEnabled && (
            <>
              <label htmlFor="reminder-hour">{t('settings.reminders.time')}</label>
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
                {t('settings.reminders.streakSave')}
              </label>
            </>
          )}
          {reminderError && (
            <p role="alert" className="error">
              {reminderError}
            </p>
          )}
          {reminderOk && <p role="status" className="success">{t('settings.reminders.ok')}</p>}
          <button type="submit" disabled={savingReminder}>
            {savingReminder ? t('common.saving') : t('settings.reminders.submit')}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>{t('settings.summary.heading')}</h2>
        <p className="muted">
          {t('settings.summary.desc')}
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
            {t('settings.summary.enable')}
          </label>
          {summaryEnabled && (
            <>
              <label htmlFor="summary-day">{t('settings.summary.day')}</label>
              <select
                id="summary-day"
                value={summaryDay}
                onChange={(e) => {
                  setSummaryDay(Number(e.target.value))
                  setSummaryOk(false)
                }}
              >
                {WEEKDAYS.map((i) => (
                  <option key={i} value={i}>
                    {weekdayLabel(i)}
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
          {summaryOk && <p role="status" className="success">{t('settings.summary.ok')}</p>}
          <button type="submit" disabled={savingSummary}>
            {savingSummary ? t('common.saving') : t('settings.summary.submit')}
          </button>
        </form>
      </section>

      <PushToggle />

      <section className="settings-section">
        <h2>{t('settings.timezone.heading')}</h2>
        <p className="muted">
          {t('settings.timezone.desc')}
        </p>
        <p className="settings-tz">{user.timezone}</p>
      </section>

      <section className="settings-section">
        <h2>{t('settings.appearance.heading')}</h2>

        {/* Language (i18n) — persisted locally like the theme; setLocale re-renders live via
            useT subscribers and flips <html lang> (which switches in the CJK font stack). */}
        <label htmlFor="ui-language">{t('settings.language')}</label>
        <select
          id="ui-language"
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {LOCALE_LABEL[l]}
            </option>
          ))}
        </select>
        <p className="muted settings-section-note">{t('settings.language.note')}</p>

        <p className="muted settings-section-note">
          {t('settings.season.desc')}
        </p>
        <label htmlFor="season">{t('settings.season.label')}</label>
        <select
          id="season"
          value={seasonPref}
          onChange={(e) => setSeasonPref(e.target.value as typeof seasonPref)}
        >
          {SEASON_PREFS.map((s) => (
            <option key={s.value} value={s.value}>
              {t(`settings.season.${s.value}`)}
            </option>
          ))}
        </select>
        <p className="muted settings-theme-now">
          {t('settings.season.now', { season: t(`settings.season.${season}`) })}
          {seasonPref === 'auto' && t('settings.season.autoSuffix')} · {t(`settings.phase.${dayPhase}`)}
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
          {t('settings.sounds')}
        </label>
      </section>

      <section className="settings-section">
        <h2>{t('settings.data.heading')}</h2>
        <p className="muted">
          {t('settings.data.desc')}
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
            {exporting ? t('settings.data.exporting') : t('settings.data.export')}
          </button>

          {!confirmingDelete ? (
            <button
              type="button"
              className="settings-danger"
              onClick={() => setConfirmingDelete(true)}
            >
              {t('settings.data.delete')}
            </button>
          ) : (
            <div className="settings-confirm">
              <p>
                {t('settings.data.confirm')}
              </p>
              <div className="settings-data-actions">
                <button
                  type="button"
                  className="settings-secondary"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="settings-danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? t('settings.data.deleting') : t('settings.data.deletePermanently')}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
