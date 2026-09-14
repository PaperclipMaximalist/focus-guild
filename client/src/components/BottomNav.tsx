/**
 * BottomNav — persistent bottom navigation rendered once in App.tsx.
 *
 * Highlights the active route via useLocation; renders nothing on the
 * /checkin page (a focused full-screen flow) so it doesn't interrupt
 * the prompt.
 */

import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useTrackerStore } from '../store/useTrackerStore';
import { CalendarDays, ChartColumn, Drama, House, LifeBuoy, MapIcon, Swords } from 'lucide-react';

interface Item {
  to: string;
  icon: LucideIcon;
  label: string;
}

const ITEMS: Item[] = [
  { to: '/', icon: House, label: 'Today' },
  { to: '/feed', icon: CalendarDays, label: 'Feed' },
  { to: '/rescue', icon: LifeBuoy, label: 'Rescue' },
  { to: '/quests', icon: Swords, label: 'Quests' },
  { to: '/tracker', icon: MapIcon, label: 'Tracker' },
  { to: '/stats', icon: ChartColumn, label: 'Stats' },
];

// Routes that should hide the bar (focused full-screen flows).
const HIDDEN_ROUTES = new Set(['/checkin']);

export function BottomNav() {
  const { pathname } = useLocation();
  // The CAS lens is a navigation-level state, so the tracker tab shows which
  // lens you'd be returning to rather than hiding it inside the page.
  const casMode = useTrackerStore((s) => s.casMode);
  if (HIDDEN_ROUTES.has(pathname)) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 flex items-stretch justify-around px-1 sm:px-4 z-40"
      style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
      }}
    >
      {ITEMS.map((item) => {
        const active = item.to === '/'
          ? pathname === '/'
          : pathname === item.to || pathname.startsWith(`${item.to}/`);
        return (
          <Link
            key={item.to}
            to={item.to}
            className="flex h-full flex-1 flex-col items-center justify-center gap-1 border-t-2 text-[11px] transition-colors sm:text-xs"
            aria-current={active ? 'page' : undefined}
            style={{
              color: active ? 'var(--color-text)' : 'var(--color-muted)',
              fontWeight: active ? 700 : 400,
              // Active tab: an amber rule on top, like an editor's open-file tab.
              borderTopColor: active ? 'var(--color-primary)' : 'transparent',
            }}
          >
            {(() => {
              const Icon = item.to === '/tracker' && casMode ? Drama : item.icon;
              return <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden />;
            })()}
            {item.to === '/tracker' && casMode ? 'CAS' : item.label}
          </Link>
        );
      })}
    </nav>
  );
}
