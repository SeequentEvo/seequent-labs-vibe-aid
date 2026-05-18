import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import './index.css'
import App from './App.tsx'

// Strict CSP forbids `unsafe-eval`. Zod's JIT validator probes `new Function("")`
// to decide whether to compile fast-path validators; the throw is caught but the
// attempt still fires a `securitypolicyviolation`. `jitless` skips the probe and
// uses the (slightly slower) interpreted path — negligible for API payloads.
z.config({ jitless: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
