/**
 * Header — the phone's top bar, rendered once in App.tsx.
 *
 * One slim row: the duck (see MascotDock, which sits in the left slot), the
 * rank with a thin XP line, the streak, and two quiet icon buttons. It used
 * to be a tall status block that only three pages rendered, so the app had a
 * header on some screens and none on others.
 *
 * Wide screens don't get it: the sidebar carries the same things.
 *
 * The rank colour (--color-rank) only tints the XP line, so levelling up is
 * visible without recolouring the rest of the app.
 */

import { Link } from 'react-router-dom';
import { SignedIn, UserButton } from '@clerk/clerk-react';
import { Flame, ScrollText, SettingsIcon } from 'lucide-react';
import { useUserStore } from '../store/useUserStore';
import { useMascotStore } from '../store/useMascotStore';
import { levelFromXP, progressToNextLevel } from '../lib/levels';

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

export function Header() {
  const user = useUserStore((s) => s.user);
  const duck = useMascotStore((s) => s.enabled);
  if (!user) return null;

  const level = levelFromXP(user.totalXP);
  const progress = progressToNextLevel(user.totalXP);

  return (
    <header className="sticky top-0 z-30 border-b border-(--color-border) bg-(--color-bg)/95 backdrop-blur lg:hidden">
      <div className="flex h-13 items-center gap-2.5 pl-4 pr-2">
        {/* Left slot: the duck floats here; without it, the rank's own icon. */}
        {duck ? (
          <span className="w-9 shrink-0" aria-hidden />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center" style={{ color: 'var(--color-rank)' }} aria-hidden>
            <level.icon size={20} strokeWidth={1.75} />
          </span>
        )}

        <Link to="/stats" className="min-w-0 flex-1" title={`Level ${level.level}: ${level.title}`}>
          <div className="flex items-baseline gap-1.5">
            <span className="truncate text-[13px] font-bold leading-tight">{level.title}</span>
            <span className="tnum shrink-0 text-[11px] text-(--color-muted)">Lv {level.level}</span>
          </div>
          <div
            className="mt-1.5 h-[3px] max-w-40 overflow-hidden rounded-full bg-(--color-surface2)"
            role="progressbar"
            aria-label="Progress to next rank"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.pct)}
          >
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${progress.pct}%`, background: 'var(--color-rank)' }}
            />
          </div>
        </Link>

        <span
          className="tnum flex shrink-0 items-center gap-1 px-1 text-[13px] font-semibold"
          title={`${user.currentStreak}-day streak`}
          style={{ color: user.currentStreak > 0 ? 'var(--color-gold)' : 'var(--color-muted)' }}
        >
          <Flame size={15} aria-hidden /> {user.currentStreak}
        </span>
        <Link to="/chronicle" className="icon-btn" title="Logbook" aria-label="Logbook">
          <ScrollText size={18} aria-hidden />
        </Link>
        <Link to="/settings" className="icon-btn" title="Settings" aria-label="Settings">
          <SettingsIcon size={18} aria-hidden />
        </Link>
        {CLERK_ENABLED && (
          <SignedIn>
            <div className="flex h-9 w-9 items-center justify-center">
              <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: 'h-7 w-7' } }} />
            </div>
          </SignedIn>
        )}
      </div>
    </header>
  );
}
