import { Link, useNavigate } from 'react-router-dom'
import BiometricCapture from '../components/BiometricCapture'
import { useToast } from '../context/ToastContext'

/**
 * Standalone manual entry of a resting heart-rate (and optional HRV) reading —
 * a baseline not tied to any sit. A personal wellness signal, not a medical reading.
 */
export default function LogReadingPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  return (
    <main id="main-content" className="dashboard log-session">
      <Link to="/analytics" className="back-link">← Analytics</Link>
      <header className="page-head">
        <h1>Log a reading</h1>
        <p className="page-subtitle">
          Record a resting heart rate (and HRV if you know it) to track your trend.
        </p>
      </header>

      <BiometricCapture
        context="resting"
        title="Resting reading"
        intro="A baseline measure, taken while calm and still."
        inline
        onDone={() => {
          showToast('Noted — your heart, on the record.')
          navigate('/analytics')
        }}
      />
    </main>
  )
}
