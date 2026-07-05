import { Link } from 'react-router-dom'
import { useT } from '../i18n'

/** App name + tagline shown above the auth cards, so a visitor knows what site this is. */
export default function AuthBrand() {
  const { t } = useT()
  return (
    <div className="auth-brand">
      <Link to="/" className="auth-brand-name">
        MeditationOS
      </Link>
      <p className="auth-brand-tagline">{t('auth.brand.tagline')}</p>
    </div>
  )
}
