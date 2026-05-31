import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, useAuth, useUser } from '@clerk/clerk-react';
import { useUserStore } from './store/useUserStore';
import { setAuthTokenGetter, setCurrentClerkId } from './lib/api';
import Today from './pages/Today';
import CheckIn from './pages/CheckIn';
import Quests from './pages/Quests';
import Stats from './pages/Stats';
import GuildFeed from './pages/GuildFeed';
import Rescue from './pages/Rescue';
import Settings from './pages/Settings';
import { ToastContainer } from './components/Toasts';
import { BottomNav } from './components/BottomNav';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

export default function App() {
  // When Clerk is configured, gate the entire app on sign-in state.
  if (CLERK_ENABLED) {
    return (
      <>
        <SignedIn>
          <AuthBridge>
            <AuthenticatedApp />
          </AuthBridge>
        </SignedIn>
        <SignedOut>
          <SignInLanding />
        </SignedOut>
      </>
    );
  }
  // Dev fallback: no Clerk key configured, run with the dev member id.
  return <AuthenticatedApp />;
}

/**
 * Connects Clerk's auth state to api.ts so subsequent fetches send
 * Authorization: Bearer <jwt> and the URL/body clerkIds match the signed-in user.
 */
function AuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();

  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);

  useEffect(() => {
    if (clerkUser?.id) setCurrentClerkId(clerkUser.id);
  }, [clerkUser?.id]);

  if (!authLoaded || !userLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-(--color-muted)">Loading auth…</div>
      </div>
    );
  }
  return <>{children}</>;
}

function SignInLanding() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6"
      style={{ background: 'linear-gradient(135deg, #1a0a3e 0%, #0d0d1a 60%, #0a1a2e 100%)' }}
    >
      <div className="text-center">
        <h1 className="mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-4xl font-extrabold text-transparent">
          Focus Guild
        </h1>
        <p className="text-sm text-(--color-muted)">Sign in to enter the guild.</p>
      </div>
      <SignIn
        routing="hash"
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'shadow-2xl',
          },
        }}
      />
    </div>
  );
}

function AuthenticatedApp() {
  const init = useUserStore((s) => s.init);
  const user = useUserStore((s) => s.user);
  const error = useUserStore((s) => s.error);

  useEffect(() => {
    init();
  }, [init]);

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="mx-auto max-w-md rounded-lg border border-red-500/40 bg-red-500/10 p-6">
          <h2 className="text-xl font-bold text-red-200">Cannot reach Focus Guild API</h2>
          <p className="mt-2 text-sm text-red-300/80">{error}</p>
          <p className="mt-4 text-sm text-(--color-muted)">
            Make sure the server is running: <code className="rounded bg-white/10 px-1.5 py-0.5">cd server &amp;&amp; npm run dev</code>
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-(--color-muted)">Loading the Guild…</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen pb-16">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/feed" element={<GuildFeed />} />
          <Route path="/rescue" element={<Rescue />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        <ToastContainer />
        <KeyboardShortcuts />
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}
