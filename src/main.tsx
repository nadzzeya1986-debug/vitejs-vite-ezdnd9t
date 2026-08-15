import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Pulse2App from './Pulse2App.tsx'
import './profile-overrides.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Pulse2App />
  </StrictMode>,
)
