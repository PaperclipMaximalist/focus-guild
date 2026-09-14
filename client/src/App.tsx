import { Suspense, lazy, useEffect } from 'react';
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
import Trophies from './pages/Trophies';
// The tracker is its own world with its own screens; load it on first visit
// rather than making every Today-page load pay for it.
const Tracker = lazy(() => import('./pages/Tracker'));
const TrackerPresets = lazy(() => import('./pages/TrackerPresets'));
const TrackerMarkdown = lazy(() => import('./pages/TrackerMarkdown'));
const Chronicle = lazy(() => import('./pages/Chronicle'));
const Connections = lazy(() => import('./pages/Connections'));
import { ToastContainer } from './components/Toasts';
import { BottomNav } from './components/BottomNav';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { CommandPalette } from './components/CommandPalette';
import { RankThemeController } from './components/RankThemeController';
import { MascotDock } from './components/mascot/MascotDock';

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
      style={{ background: 'var(--color-bg)' }}
    >
      <div className="text-center">
        <h1 className="mb-2 text-4xl" style={{ color: 'var(--color-primary)' }}>
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
        <div className="mx-auto max-w-md rounded-lg border border-(--color-fire)/40 bg-(--color-fire)/10 p-6">
          <h2 className="text-xl font-bold text-(--color-fire)">Cannot reach Focus Guild API</h2>
          <p className="mt-2 text-sm text-(--color-muted)">{error}</p>
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
      <RankThemeController />
      <div className="min-h-screen pb-16">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/feed" element={<GuildFeed />} />
          <Route path="/rescue" element={<Rescue />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/trophies" element={<Trophies />} />
          <Route path="/tracker" element={<TrackerRoute><Tracker /></TrackerRoute>} />
          <Route path="/tracker/presets" element={<TrackerRoute><TrackerPresets /></TrackerRoute>} />
          <Route path="/tracker/markdown" element={<TrackerRoute><TrackerMarkdown /></TrackerRoute>} />
          <Route path="/chronicle" element={<TrackerRoute><Chronicle /></TrackerRoute>} />
          <Route path="/connections" element={<TrackerRoute><Connections /></TrackerRoute>} />
        </Routes>
        <ToastContainer />
        <KeyboardShortcuts />
        <CommandPalette />
        <MascotDock />
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

function TrackerRoute({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex max-w-2xl flex-col gap-3 p-4" aria-busy="true">
          <div className="h-8 w-32 animate-pulse rounded-lg bg-(--color-surface)" />
          <div className="h-32 animate-pulse rounded-(--radius-card) bg-(--color-surface)" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
