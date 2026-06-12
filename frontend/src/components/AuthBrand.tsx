import { Link } from 'react-router-dom'

/** App name + tagline shown above the auth cards, so a visitor knows what site this is. */
export default function AuthBrand() {
  return (
    <div className="auth-brand">
      <Link to="/" className="auth-brand-name">
        MeditationOS
      </Link>
      <p className="auth-brand-tagline">Your meditation practice, tracked.</p>
    </div>
  )
}
