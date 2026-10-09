/**
 * Navigation, rendered once in App.tsx.
 *
 * Phones get a bottom bar with the five places you go every day. Wide
 * screens get a sidebar instead, which has room for the rest (Rescue,
 * Trophies, Chronicle, Settings), the rank, and a New quest button, so the
 * page itself stops being a phone layout stretched across a monitor.
 *
 * Both hide on /checkin, a focused full-screen flow.
 */

import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { useTrackerStore } from '../store/useTrackerStore';
import { useUserStore } from '../store/useUserStore';
import { api } from '../lib/api';
import { levelFromXP, nextLevel, progressToNextLevel } from '../lib/levels';
import {
  CalendarDays,
  ChartColumn,
  Drama,
  Flame,
  House,
  LifeBuoy,
  ListChecks,
  MapIcon,
  Plus,
  ScrollText,
  SettingsIcon,
  Trophy,
} from 'lucide-react';

interface Item {
  to: string;
  icon: LucideIcon;
  label: string;
}

/** The phone bar: five, because a sixth makes every target too small to hit. */
const PRIMARY: Item[] = [
  { to: '/', icon: House, label: 'Today' },
  { to: '/feed', icon: CalendarDays, label: 'Feed' },
  { to: '/quests', icon: ListChecks, label: 'Quests' },
  { to: '/tracker', icon: MapIcon, label: 'Tracker' },
  { to: '/stats', icon: ChartColumn, label: 'Stats' },
];

/** Sidebar only. On a phone these are reached from Today, Stats and the top bar. */
const SECONDARY: Item[] = [
  { to: '/rescue', icon: LifeBuoy, label: 'Rescue' },
  { to: '/trophies', icon: Trophy, label: 'Trophies' },
  { to: '/chronicle', icon: ScrollText, label: 'Chronicle' },
  { to: '/settings', icon: SettingsIcon, label: 'Settings' },
];

// Routes that should hide the bar (focused full-screen flows).
const HIDDEN_ROUTES = new Set(['/checkin']);

const isActive = (pathname: string, to: string) =>
  to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);

export function BottomNav() {
  const { pathname } = useLocation();
  // The CAS lens is a navigation-level state, so the tracker tab shows which
  // lens you'd be returning to rather than hiding it inside the page.
  const casMode = useTrackerStore((s) => s.casMode);
  if (HIDDEN_ROUTES.has(pathname)) return null;

  const iconFor = (item: Item) => (item.to === '/tracker' && casMode ? Drama : item.icon);
  const labelFor = (item: Item) => (item.to === '/tracker' && casMode ? 'CAS' : item.label);

  return (
    <>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-(--color-border) bg-(--color-surface) px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {PRIMARY.map((item) => {
          const active = isActive(pathname, item.to);
          const Icon = iconFor(item);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className="flex h-full flex-1 flex-col items-center justify-center gap-1 text-[11px] transition-colors"
              style={{
                color: active ? 'var(--color-primary)' : 'var(--color-muted)',
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
              {labelFor(item)}
            </Link>
          );
        })}
      </nav>

      <Sidebar pathname={pathname} iconFor={iconFor} labelFor={labelFor} />
    </>
  );
}

function Sidebar({
  pathname,
  iconFor,
  labelFor,
}: {
  pathname: string;
  iconFor: (i: Item) => LucideIcon;
  labelFor: (i: Item) => string;
}) {
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);
  const [overdue, setOverdue] = useState(0);

  useEffect(() => {
    api.quests.rescue().then((r) => setOverdue(r.length)).catch(() => {});
  }, [pathname]);

  // The quest editor lives on Today; go there first when we're elsewhere.
  const newQuest = () => {
    if (pathname !== '/') navigate('/');
    setTimeout(() => window.dispatchEvent(new CustomEvent('quest-modal:open')), pathname === '/' ? 0 : 80);
  };

  const row = (item: Item, badge?: number) => {
    const active = isActive(pathname, item.to);
    const Icon = iconFor(item);
    return (
      <Link
        key={item.to}
        to={item.to}
        aria-current={active ? 'page' : undefined}
        className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors hover:bg-(--color-surface2)"
        style={{
          background: active ? 'var(--color-surface2)' : undefined,
          color: active ? 'var(--color-text)' : 'var(--color-muted)',
          fontWeight: active ? 700 : 500,
        }}
      >
        <Icon
          size={17}
          strokeWidth={active ? 2.25 : 1.75}
          aria-hidden
          style={{ color: active ? 'var(--color-primary)' : undefined }}
        />
        <span className="flex-1">{labelFor(item)}</span>
        {badge ? (
          <span className="tnum text-[12px] font-semibold" style={{ color: 'var(--color-fire)' }}>
            {badge}
          </span>
        ) : null}
      </Link>
    );
  };

  const level = user ? levelFromXP(user.totalXP) : null;
  const next = user ? nextLevel(user.totalXP) : null;
  const progress = user ? progressToNextLevel(user.totalXP) : null;

  return (
    <aside
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-(--color-border) bg-(--color-surface) px-3 py-4 lg:flex"
    >
      <Link to="/" className="mb-4 flex items-center gap-2 px-2.5 text-[15px] font-bold tracking-tight">
        <span
          className="grid h-6 w-6 place-items-center rounded-md"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          aria-hidden
        >
          <ListChecks size={15} strokeWidth={2.5} />
        </span>
        Focus Guild
      </Link>

      <button type="button" onClick={newQuest} className="btn-strong mb-4 w-full">
        <Plus size={16} strokeWidth={2.5} aria-hidden /> New quest
        <span className="ml-auto rounded-[4px] px-1.5 py-px text-[11px] font-semibold opacity-60" aria-hidden>N</span>
      </button>

      <nav className="flex flex-col gap-0.5">{PRIMARY.map((i) => row(i))}</nav>

      <div className="section-label mb-1.5 mt-6 px-2.5">More</div>
      <nav className="flex flex-col gap-0.5">
        {SECONDARY.map((i) => row(i, i.to === '/rescue' ? overdue : undefined))}
      </nav>

      {/* Rank, and room underneath for the duck (see MascotDock). */}
      {level && progress && (
        <Link
          to="/stats"
          className="mt-auto mb-[76px] block rounded-md px-2.5 py-2 transition-colors hover:bg-(--color-surface2)"
          title={`Level ${level.level}: ${level.title}`}
        >
          <div className="flex items-center gap-2 text-[13px] font-semibold">
            <level.icon size={15} aria-hidden style={{ color: 'var(--color-rank)' }} />
            <span className="min-w-0 flex-1 truncate">{level.title}</span>
            <span className="flex items-center gap-1 text-[12px] font-medium text-(--color-muted)">
              <Flame size={12} aria-hidden /> <span className="tnum">{user!.currentStreak}</span>
            </span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-(--color-surface2)">
            <div className="h-full rounded-full" style={{ width: `${progress.pct}%`, background: 'var(--color-rank)' }} />
          </div>
          <div className="tnum mt-1.5 text-[11px] text-(--color-muted)">
            Level {level.level} · {next ? `${progress.earned} / ${progress.needed} XP` : 'top rank'}
          </div>
        </Link>
      )}
    </aside>
  );
}
