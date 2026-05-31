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
    appearance={{ variables: { colorPrimary: '#8b5cf6' } }}
  >
    <App />
  </ClerkProvider>
) : (
  <App />
)

createRoot(document.getElementById('root')!).render(<StrictMode>{Root}</StrictMode>)
