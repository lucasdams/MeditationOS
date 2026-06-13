import { Link } from 'react-router-dom'

// Public footer with the legal links every public site needs. Used on the landing
// page and the legal pages (kept out of the authenticated app, which has its own chrome).
export default function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <Link to="/privacy">Privacy</Link>
      <span aria-hidden="true">·</span>
      <Link to="/terms">Terms</Link>
      <span aria-hidden="true">·</span>
      <span className="muted">© {year} MeditationOS</span>
    </footer>
  )
}
