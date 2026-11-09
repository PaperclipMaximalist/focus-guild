import { Suspense, lazy, useEffect, useRef } from 'react';
import { MotionConfig } from 'framer-motion';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { SignedIn, SignedOut, SignIn, useAuth, useUser } from '@clerk/clerk-react';
import { PenLine, Route as RouteIcon, Trophy } from 'lucide-react';
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
const Records = lazy(() => import('./pages/Records'));
const Connections = lazy(() => import('./pages/Connections'));
const Share = lazy(() => import('./pages/Share'));
const QuestImport = lazy(() => import('./pages/QuestImport'));
const Advanced = lazy(() => import('./pages/Advanced'));
const Quickstart = lazy(() => import('./pages/Quickstart'));
const AiConnections = lazy(() => import('./pages/AiConnections'));
import { ToastContainer } from './components/Toasts';
import { BottomNav } from './components/BottomNav';
import { Header } from './components/Header';
import { KeyboardShortcuts } from './components/KeyboardShortcuts';
import { CommandPalette } from './components/CommandPalette';
import { RankThemeController } from './components/RankThemeController';
import { MascotDock } from './components/mascot/MascotDock';
import { Backdrop } from './lines/Dressing';

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
      <div className="flex min-h-screen items-center justify-center" role="status">
        <div className="text-(--color-muted)">Opening the guild…</div>
      </div>
    );
  }
  return <>{children}</>;
}

/** What a stranger needs before signing in: what this is, in three lines. */
const PITCH = [
  { Icon: PenLine, text: 'Jot a quest down in one line. No forms, no folders.' },
  { Icon: RouteIcon, text: 'The guild puts your day in order by deadline, effort and how much energy you have.' },
  { Icon: Trophy, text: 'Every finished quest earns XP, streaks and trophies.' },
];

function SignInLanding() {
  useEffect(() => {
    document.title = 'Sign in · Focus Guild';
  }, []);
  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:gap-12">
      <div className="mx-auto max-w-md lg:mx-0">
        <h1 className="font-display text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>
          Focus Guild
        </h1>
        <p className="mt-2 text-lg">A to-do list that plays like a quest board, for brains that wander.</p>
        <ul className="mt-5 space-y-3">
          {PITCH.map(({ Icon, text }) => (
            <li key={text} className="flex gap-3 text-sm text-(--color-muted)">
              <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-(--color-primary)" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
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
    </main>
  );
}

function AuthenticatedApp() {
  const init = useUserStore((s) => s.init);
  const user = useUserStore((s) => s.user);
  const error = useUserStore((s) => s.error);

  useEffect(() => {
    init();
  }, [init]);

  if (error) return <CannotReach error={error} onRetry={() => init()} />;

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
    // reducedMotion="user": with the system's reduce-motion setting on, framer-motion skips movement and keeps fades.
    <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <RankThemeController />
      <Shell>
        <main id="main" tabIndex={-1} className="outline-none">
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
          {/* The Logbook's old tabs: activity log, permafile, Ask, AI bundle. */}
          <Route path="/advanced/records" element={<TrackerRoute><Records /></TrackerRoute>} />
          <Route path="/connections" element={<TrackerRoute><Connections /></TrackerRoute>} />
          {/* Android share-sheet target; see share_target in the manifest. */}
          <Route path="/share" element={<TrackerRoute><Share /></TrackerRoute>} />
          <Route path="/quests/import" element={<TrackerRoute><QuestImport /></TrackerRoute>} />
          <Route path="/advanced" element={<TrackerRoute><Advanced /></TrackerRoute>} />
          <Route path="/advanced/quickstart" element={<TrackerRoute><Quickstart /></TrackerRoute>} />
          <Route path="/advanced/ai" element={<TrackerRoute><AiConnections /></TrackerRoute>} />
        </Routes>
        </main>
        <ToastContainer />
        <KeyboardShortcuts />
        <CommandPalette />
        <Backdrop />
        <MascotDock />
        <BottomNav />
      </Shell>
    </BrowserRouter>
    </MotionConfig>
  );
}

/** The whole-app stop when the first load fails: says so, is announced, and offers the one way on. */
function CannotReach({ error, onRetry }: { error: string; onRetry: () => void }) {
  useEffect(() => {
    document.title = 'Can’t reach the Guild · Focus Guild';
  }, []);
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="panel w-full max-w-sm p-6 text-center">
        <div role="alert">
          <h1 className="text-xl font-bold">Can’t reach the Guild</h1>
          <p className="mt-2 text-sm text-(--color-muted)">
            Your quests are safe. This is usually a dropped connection, or the server waking up.
          </p>
        </div>
        <button type="button" onClick={onRetry} className="btn-primary mt-5 w-full">
          Try again
        </button>
        {/* The raw error is for whoever is debugging, not the headline. */}
        <p className="mt-4 break-words font-mono text-[11px] text-(--color-muted)">{error}</p>
      </div>
    </main>
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
  '/chronicle': 'Journal',
  '/advanced/records': 'Records',
  '/connections': 'Connections',
  '/advanced': 'Advanced',
  '/advanced/quickstart': 'Quickstart',
  '/advanced/ai': 'Your AI',
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
  // After a move to another page, start the keyboard and the screen reader at
  // the top of the new page rather than on a link that is no longer there.
  // Not on the first load, and not when something (a dialog) already took focus.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    const active = document.activeElement;
    if (active && active !== document.body && active.closest('[role="dialog"]')) return;
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);
  return (
    <div className={nav ? 'min-h-screen pb-16 lg:pb-0 lg:pl-60' : 'min-h-screen'}>
      <a
        href="#main"
        className="skip-link"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
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
