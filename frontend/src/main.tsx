import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import ErrorBoundary from './components/ErrorBoundary'
import { initSentry } from './lib/observability'
import { installButtonClickSfx } from './lib/sfx'
import './index.css'

// Initialise Sentry before the app renders.  No-op when VITE_SENTRY_DSN is unset.
initSentry()

// One global listener gives every button the same soft click tick, so the sound is
// consistent app-wide instead of each component opting in. Honours the interface-sounds
// preference (Settings → Appearance) via playClick().
installButtonClickSfx()

// Register the service worker (PWA install + offline + push) in production only — in
// dev it would intercept Vite's module requests and break HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Non-fatal: the app still works without offline support.
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
