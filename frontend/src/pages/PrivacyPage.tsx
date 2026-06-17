import { Link } from 'react-router-dom'
import LegalPage from '../components/LegalPage'

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="June 17, 2026">
      <p>
        This Privacy Policy explains how MeditationOS (“we”, “us” — operated by an
        individual, not a registered company) collects, uses, and protects your
        information when you use our website and app. Questions: [contact@email].
      </p>

      <h2>Information we collect</h2>
      <ul>
        <li>
          <strong>Account information</strong> — your email address, an optional public
          username, and (for password accounts) a securely hashed password. If you sign
          in with Google, we receive your Google account email and a stable identifier.
        </li>
        <li>
          <strong>Practice data you create</strong> — meditation and breathing sessions,
          gratitude entries, journal reflections (including any optional mood tag), and
          goals. Journal and gratitude text can be personal; you control what you write.
        </li>
        <li>
          <strong>Biometric / HRV data you record</strong> — optional heart-rate and
          heart-rate-variability (HRV) readings you choose to log, each with its context
          (before/after a session, or resting) and how it was captured (manual or
          estimated). These readings are stored against your account only, used to show
          you your own HRV and pre/post-session trends, and are treated as a personal
          wellness signal — never a medical measurement or diagnosis. You choose whether
          to capture them; sessions and breathing work fully without them.
        </li>
        <li>
          <strong>Preferences</strong> — your timezone (synced from your browser so dates
          roll over at your local midnight), reminder settings, and quest selection.
        </li>
        <li>
          <strong>Technical data</strong> — limited request metadata (such as IP address)
          used for security and rate-limiting, and a single essential cookie that keeps
          you signed in.
        </li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To provide the service — your account, practice tracking, streaks, and stats.</li>
        <li>To show you your own HRV / heart-rate trends and pre/post-session changes, if you log readings.</li>
        <li>To send transactional and opt-in email (verification, password reset, practice reminders, and weekly summaries).</li>
        <li>To keep the service secure and prevent abuse.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>Cookies</h2>
      <p>
        We set one strictly-necessary, httpOnly cookie to maintain your signed-in
        session. We do not use third-party advertising or tracking cookies.
      </p>

      <h2>Third parties we share with (sub-processors)</h2>
      <ul>
        <li><strong>Google</strong> — only if you choose “Sign in with Google” (authentication).</li>
        <li><strong>Email provider</strong> — to deliver verification, reset, and reminder emails. [Provider, e.g. AWS SES]</li>
        <li><strong>Hosting / infrastructure</strong> — Amazon Web Services (AWS) hosts the application and database.</li>
        <li>
          <strong>AI provider</strong> — gratitude prompt suggestions use Anthropic;
          we send only the chosen category, never your journal text, in production.
        </li>
        <li>
          <strong>Web push delivery</strong> — if you opt in to browser push
          notifications, your browser's push service (e.g. Google, Mozilla, or Apple,
          depending on your browser) and our push library receive the encrypted
          notification payload and the push endpoint your browser issued. We send the
          reminder content; the push service delivers it to your device. No push data is
          sent unless you enable notifications.
        </li>
        <li>
          <strong>Error monitoring</strong> — Sentry receives application error and
          performance diagnostics so we can fix problems. Events are scrubbed of personal
          information before they leave our servers, and this is active only when error
          monitoring is configured.
        </li>
      </ul>

      <h2>Data retention</h2>
      <p>
        We keep your data while your account is active. When you delete your account, all
        of your data is permanently removed (see “Your rights” below). Residual copies may
        persist in encrypted operational backups for up to <strong>30 days</strong> after
        deletion, after which they are overwritten on the normal backup rotation; this is
        our operational backup-retention window.
      </p>

      <h2>Your rights</h2>
      <p>
        You can <strong>export</strong> all of your data as JSON and{' '}
        <strong>permanently delete</strong> your account at any time from{' '}
        <Link to="/settings">Settings</Link>. Depending on where you live (e.g. EEA/UK
        under GDPR, or California under CCPA), you may also have rights to access,
        correct, or restrict processing of your data — contact us at [contact@email].
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed (argon2), sessions use httpOnly cookies, and traffic is
        served over HTTPS in production. No system is perfectly secure, but we take
        reasonable measures to protect your data.
      </p>

      <h2>Children</h2>
      <p>
        MeditationOS is not directed to children under 13, and we do not knowingly
        collect their personal information.
      </p>

      <h2>International transfers</h2>
      <p>
        Your data may be processed in [country/region]. Where required, we rely on
        appropriate safeguards for international transfers.
      </p>

      <h2>Changes</h2>
      <p>
        We may update this policy; we’ll revise the “Last updated” date above and, for
        material changes, notify you.
      </p>

      <p>
        See also our <Link to="/terms">Terms of Service</Link>.
      </p>
    </LegalPage>
  )
}
