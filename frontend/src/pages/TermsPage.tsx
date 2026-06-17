import { Link } from 'react-router-dom'
import LegalPage from '../components/LegalPage'

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="June 17, 2026">
      <p>
        These Terms govern your use of MeditationOS (operated by an individual, not a registered company).
        By creating an account or using the service, you agree to these Terms.
      </p>

      <h2>Not medical advice</h2>
      <p>
        MeditationOS provides wellness and mindfulness tools for general informational
        purposes only. It is <strong>not medical, psychological, or health advice</strong>{' '}
        and is not a substitute for professional care. Breathing exercises can cause
        lightheadedness — practice seated or lying down, never while driving or in/near
        water, and stop if you feel unwell. Consult a qualified professional before
        starting any new practice, especially if you have a medical condition. By using
        the service you accept these risks.
      </p>

      <h2>Eligibility</h2>
      <p>You must be at least 13 years old to use MeditationOS.</p>

      <h2>Your account</h2>
      <p>
        You’re responsible for keeping your credentials secure and for activity under
        your account. Provide accurate information and keep it up to date.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don’t misuse, disrupt, or attempt to gain unauthorized access to the service.</li>
        <li>Don’t use it for unlawful purposes or to infringe others’ rights.</li>
        <li>Don’t scrape, overload, or circumvent rate limits and security controls.</li>
      </ul>

      <h2>Your content</h2>
      <p>
        You own the content you create (journal entries, gratitude notes, goals). You
        grant us only the limited license needed to store and display it back to you and
        operate the service. You can export or delete it at any time from{' '}
        <Link to="/settings">Settings</Link>.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The MeditationOS software, design, and branding are owned by us and provided to
        you under a limited, revocable, non-transferable license to use the service.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the service and delete your account at any time. We may suspend
        or terminate access for violations of these Terms or to protect the service.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The service is provided “as is” and “as available”, without warranties of any
        kind to the fullest extent permitted by law.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, we are not liable for indirect,
        incidental, or consequential damages arising from your use of the service. [Add
        any liability cap.]
      </p>

      <h2>Changes</h2>
      <p>
        We may update these Terms; we’ll revise the “Last updated” date above and, for
        material changes, notify you. Continued use means you accept the updated Terms.
      </p>

      <h2>Governing law</h2>
      <p>These Terms are governed by the laws of [jurisdiction], without regard to conflict-of-laws rules.</p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms: [contact@email]. See also our{' '}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </LegalPage>
  )
}
