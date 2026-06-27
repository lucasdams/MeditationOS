import { Link } from 'react-router-dom'
import AuthBrand from '../components/AuthBrand'
import SiteFooter from '../components/SiteFooter'

export default function NotFoundPage() {
  return (
    <main id="main-content" className="auth-card">
      <AuthBrand />
      <h1>Page not found</h1>
      <p className="muted">This path leads nowhere — it’s gone or never was.</p>
      <p className="auth-aux">
        <Link to="/">← Back to home</Link>
      </p>
      <SiteFooter />
    </main>
  )
}
