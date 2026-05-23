/**
 * BottomNav — persistent bottom navigation rendered once in App.tsx.
 *
 * Highlights the active route via useLocation; renders nothing on the
 * /checkin page (a focused full-screen flow) so it doesn't interrupt
 * the prompt.
 */

import { Link, useLocation } from 'react-router-dom';

interface Item {
  to: string;
  icon: string;
  label: string;
}

const ITEMS: Item[] = [
  { to: '/', icon: '🏠', label: 'Today' },
  { to: '/feed', icon: '📅', label: 'Feed' },
  { to: '/rescue', icon: '🚑', label: 'Rescue' },
  { to: '/quests', icon: '⚔️', label: 'Quests' },
  { to: '/stats', icon: '📊', label: 'Stats' },
];

// Routes that should hide the bar (focused full-screen flows).
const HIDDEN_ROUTES = new Set(['/checkin']);

export function BottomNav() {
  const { pathname } = useLocation();
  if (HIDDEN_ROUTES.has(pathname)) return null;

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 flex items-center justify-around px-4 z-40"
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
            className="flex flex-col items-center gap-0.5 text-xs transition-colors"
            style={{
              color: active ? 'var(--color-primary)' : 'var(--color-muted)',
            }}
          >
            <span className="text-xl">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
