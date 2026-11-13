import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import './index.css'
import App from './App.tsx'
import { initLine } from './lines/current'
import { isNativeApp } from './native/platform'
import { forgetSessionOnFirstLaunch, startNativeAuth } from './native/auth'
import { startShell } from './native/shell'
import { applyDevInsets } from './native/insets'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

// Conditional ClerkProvider: when the publishable key is set we wrap in the
// real provider (production / real-auth dev). When it's missing we render App
// directly so the dev-fallback X-Dev-Clerk-Id flow keeps working — handy
// during local development before keys are wired.
// The iOS app never mounts Clerk, key or no key: it cannot work in the
// WebView, and the app signs in with a device token instead (native/auth.ts).
const Root = PUBLISHABLE_KEY && !isNativeApp ? (
  <ClerkProvider
    publishableKey={PUBLISHABLE_KEY}
    afterSignOutUrl="/"
    appearance={{ variables: { colorPrimary: '#F2B33D' } }}
    // Clerk's default greets everyone with "Welcome back!", which tells a first-time visitor they are in the wrong place.
    localization={{
      signIn: {
        start: {
          subtitle: 'First time here? Choose Sign up at the bottom.',
          subtitleCombined: 'First time here? Enter your email to join.',
        },
      },
    }}
  >
    <App />
  </ClerkProvider>
) : (
  <App />
)

// Development only: ?inset=47,34 draws the page as a notched iPhone would.
if (import.meta.env.DEV) applyDevInsets()

if (isNativeApp) {
  // The app's shell first (html.native, status bar, launch screen, keyboard,
  // links), so the first paint is already the app's.
  startShell()
  // Then sign-in, in this order: a fresh install forgets any session the
  // Keychain kept from a deleted one, and only then is the Keychain read.
  // App shows "Opening the guild…" until it has answered.
  void forgetSessionOnFirstLaunch().then(startNativeAuth)
}

// The chosen line's colours are in place before anything is painted.
initLine().finally(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode>{Root}</StrictMode>)
})

// Service worker: offline shell + cached build assets (public/sw.js).
// Production only — in dev it would serve stale modules and confuse HMR.
// Never in the app: a service worker cannot run on capacitor://.
if (import.meta.env.PROD && !isNativeApp && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // No offline support then; the app works exactly as before.
    })
  })
}

