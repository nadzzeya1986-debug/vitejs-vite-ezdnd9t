import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Pulse2App from './Pulse2App.tsx'
import './profile-overrides.css'
import './username-enhancer'

const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('Pulse service worker registration failed:', error)
    })
  })
}

registerServiceWorker()

authenticateViewport()

function authenticateViewport() {
  const root = document.documentElement
  const setViewportState = () => {
    root.style.setProperty('--pulse-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`)
    root.classList.toggle('pulse-mobile', window.innerWidth < 760)
    root.classList.toggle('pulse-standalone', window.matchMedia('(display-mode: standalone)').matches)
  }
  setViewportState()
  window.addEventListener('resize', setViewportState, { passive: true })
  window.visualViewport?.addEventListener('resize', setViewportState, { passive: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pulse2App />
  </StrictMode>,
)
