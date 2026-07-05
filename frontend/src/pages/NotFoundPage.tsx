import { Link } from 'react-router-dom'
import AuthBrand from '../components/AuthBrand'
import SiteFooter from '../components/SiteFooter'
import { useT } from '../i18n'

export default function NotFoundPage() {
  const { t } = useT()
  return (
    <main id="main-content" className="auth-card">
      <AuthBrand />
      <h1>{t('notFound.title')}</h1>
      <p className="muted">{t('notFound.body')}</p>
      <p className="auth-aux">
        <Link to="/">{t('notFound.back')}</Link>
      </p>
      <SiteFooter />
    </main>
  )
}
