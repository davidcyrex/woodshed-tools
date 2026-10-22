import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fraunces/full.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import './index.css'
import App from './App.tsx'

// iOS 17+: declare the page's audio session as "playback" BEFORE any
// AudioContext is created. Web Audio inherits the session type at context
// creation, so setting it inside a useEffect can be too late if Tone.js
// has already touched its global context.
const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
if (audioSession) audioSession.type = 'playback'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
