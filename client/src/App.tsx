import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useUserStore } from './store/useUserStore';
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

export default function App() {
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
