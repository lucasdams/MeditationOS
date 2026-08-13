import { Link, useNavigate } from 'react-router-dom'
import BiometricCapture from '../components/BiometricCapture'
import { useToast } from '../context/ToastContext'
import { useT } from '../i18n'

/**
 * Standalone manual entry of a resting heart-rate (and optional HRV) reading —
 * a baseline not tied to any sit. A personal wellness signal, not a medical reading.
 */
export default function LogReadingPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const { showToast } = useToast()

  return (
    <main id="main-content" className="dashboard log-session">
      <Link to="/analytics" className="back-link">{t('tracking.logReading.back')}</Link>
      <header className="page-head">
        <h1>{t('tracking.logReading.title')}</h1>
        <p className="page-subtitle">
          {t('tracking.logReading.subtitle')}
        </p>
      </header>

      <BiometricCapture
        context="resting"
        title={t('tracking.logReading.captureTitle')}
        intro={t('tracking.logReading.captureIntro')}
        inline
        onDone={() => {
          showToast(t('tracking.logReading.saved'))
          navigate('/analytics')
        }}
      />
    </main>
  )
}
