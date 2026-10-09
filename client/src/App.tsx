import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
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
const Share = lazy(() => import('./pages/Share'));
const QuestImport = lazy(() => import('./pages/QuestImport'));
import { ToastContainer } from './components/Toasts';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
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
      <div className="grid min-h-screen place-items-center p-6">
        <div className="panel w-full max-w-sm p-6 text-center">
          <h1 className="text-xl font-bold">Can’t reach the Guild</h1>
          <p className="mt-2 text-sm text-(--color-muted)">
            Your quests are safe. This is usually a dropped connection, or the server waking up.
          </p>
          <button type="button" onClick={() => init()} className="btn-primary mt-5 w-full">
            Try again
          </button>
          {/* The raw error is for whoever is debugging, not the headline. */}
          <p className="mt-4 break-words font-mono text-[11px] text-(--color-muted)">{error}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      // The shape of the page that is about to appear, so nothing jumps when it does.
      <div className="page" aria-busy="true" aria-label="Loading">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton mt-2 h-9 w-48" />
        <div className="skeleton mt-6 h-24" />
        <div className="skeleton mt-3 h-12" />
        <div className="skeleton mt-8 h-64" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <RankThemeController />
      <Shell>
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
          {/* Android share-sheet target; see share_target in the manifest. */}
          <Route path="/share" element={<TrackerRoute><Share /></TrackerRoute>} />
          <Route path="/quests/import" element={<TrackerRoute><QuestImport /></TrackerRoute>} />
        </Routes>
        <ToastContainer />
        <KeyboardShortcuts />
        <CommandPalette />
        <MascotDock />
        <BottomNav />
      </Shell>
    </BrowserRouter>
  );
}

const PAGE_NAMES: Record<string, string> = {
  '/': 'Today',
  '/feed': 'Route',
  '/quests': 'Quests',
  '/quests/import': 'Import quests',
  '/rescue': 'Stragglers',
  '/checkin': 'Fuel check',
  '/stats': 'Mileage',
  '/trophies': 'Trophy Room',
  '/tracker': 'Expeditions',
  '/chronicle': 'Logbook',
  '/connections': 'Connections',
  '/settings': 'Settings',
};

/** Leaves room for whichever navigation is showing: top bar and bottom bar on a phone, sidebar on a wide screen. */
function Shell({ children }: { children: React.ReactNode }) {
  // /checkin is a focused full-screen flow: no navigation, so no room left for it.
  const { pathname } = useLocation();
  const nav = pathname !== '/checkin';
  // The tab says where you are, so a second tab or the history list is usable.
  useEffect(() => {
    const first = `/${pathname.split('/')[1] ?? ''}`;
    const name = PAGE_NAMES[pathname] ?? PAGE_NAMES[first];
    document.title = name ? `${name} · Focus Guild` : 'Focus Guild';
  }, [pathname]);
  return (
    <div className={nav ? 'min-h-screen pb-16 lg:pb-0 lg:pl-60' : 'min-h-screen'}>
      {nav && <Header />}
      {children}
    </div>
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
