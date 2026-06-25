import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import AuthBrand from './AuthBrand'
import SiteFooter from './SiteFooter'

// Shared layout for the public legal pages (Privacy, Terms): the brand, a
// last-updated line, a clear "this is a template" notice, the body, and the footer.
export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main id="main-content" className="legal">
      <AuthBrand />
      <h1>{title}</h1>
      <p className="legal-meta muted">Last updated: {updated}</p>
      <p className="legal-template" role="note">
        <span aria-hidden="true">⚠️</span> This is a starting-point template, not legal advice. Review it with a
        qualified professional and fill in the bracketed details (company, contact,
        jurisdiction) before launch.
      </p>
      <div className="legal-body">{children}</div>
      <p className="legal-back">
        <Link to="/">← Back to home</Link>
      </p>
      <SiteFooter />
    </main>
  )
}
