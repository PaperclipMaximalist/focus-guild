import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// Conditional ClerkProvider: when the publishable key is set we wrap in the
// real provider (production / real-auth dev). When it's missing we render App
// directly so the dev-fallback X-Dev-Clerk-Id flow keeps working — handy
// during local development before keys are wired.
const Root = PUBLISHABLE_KEY ? (
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    afterSignOutUrl="/"
    appearance={{ variables: { colorPrimary: '#F2B33D' } }}
  >
    <App />
  </ClerkProvider>
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(<StrictMode>{Root}</StrictMode>)

// Service worker: offline shell + cached build assets (public/sw.js).
// Production only — in dev it would serve stale modules and confuse HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No offline support then; the app works exactly as before.
    })
  })
}

