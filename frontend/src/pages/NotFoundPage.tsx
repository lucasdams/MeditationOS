import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main id="main-content" className="auth-card">
      <h1>Page not found</h1>
      <p className="muted">The page you’re looking for doesn’t exist or has moved.</p>
      <p className="auth-aux">
        <Link to="/">← Back to home</Link>
      </p>
    </main>
  )
}
