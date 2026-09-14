/**
 * Header — a status bar, not a hero.
 *
 * One compact row: rank emblem, rank name, an XP bar, and a monospace stats
 * line, like a shell prompt showing where you are. It used to be a glowing
 * gradient avatar with stat pills; the information is the same, the chrome is
 * a quarter of the height, so the day's actual work starts higher up.
 *
 * The rank colour (--color-rank) only tints the emblem and the XP bar, so
 * levelling up is visible without recolouring the rest of the app.
 */

import { Link } from 'react-router-dom';
import { SignedIn, UserButton } from '@clerk/clerk-react';
import { SettingsIcon, Trophy } from 'lucide-react';
import { useUserStore } from '../store/useUserStore';
import { useQuestStore } from '../store/useQuestStore';
import { levelFromXP, nextLevel, progressToNextLevel } from '../lib/levels';
import { SoundToggle } from './SoundToggle';

const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);

const iconButton =
  'flex h-9 w-9 items-center justify-center rounded-md border border-(--color-border) text-(--color-muted) transition-colors hover:border-(--color-muted) hover:text-(--color-text)';

export function Header() {
  const user = useUserStore((s) => s.user);
  const completedCount = useQuestStore((s) => s.completed.length);
  if (!user) return null;

  const level = levelFromXP(user.totalXP);
  const next = nextLevel(user.totalXP);
  const progress = progressToNextLevel(user.totalXP);

  return (
    <header
      className="sticky top-0 z-50 border-b border-(--color-border) px-4 py-2.5 sm:px-6"
      style={{ background: 'var(--color-surface)' }}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        {/* Rank emblem, in the rank colour, with the level number */}
        <div
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-md border-2"
          style={{ borderColor: 'var(--color-rank)', color: 'var(--color-rank)' }}
          title={`Level ${level.level} — ${level.title}`}
        >
          <level.icon size={22} strokeWidth={1.75} aria-hidden />
          <span
            className="absolute -bottom-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-sm px-1 font-mono text-[10px] font-bold"
            style={{ background: 'var(--color-rank)', color: 'var(--color-on-primary)' }}
          >
            {level.level}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight">{level.title}</span>
          <div
            className="mt-1.5 h-1.5 overflow-hidden rounded-sm"
            style={{ background: 'var(--color-surface2)' }}
            role="progressbar"
            aria-label="Progress to next rank"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.pct)}
          >
            <div
              className="h-full transition-[width] duration-700"
              style={{ width: `${progress.pct}%`, background: 'var(--color-rank)' }}
            />
          </div>
          <div className="mt-1 truncate font-mono text-[11px] text-(--color-muted)">
            <span className="text-(--color-text)">{next ? `${progress.earned}/${progress.needed}` : 'max'}</span>xp
            <span className="mx-1 opacity-50">·</span>
            <span className="text-(--color-text)">{user.currentStreak}</span>d streak
            <span className="mx-1 opacity-50">·</span>
            <span className="text-(--color-text)">{completedCount}</span> done
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <SoundToggle />
          {/* Hidden on phones to give the stats line room; Stats and the command palette still reach it. */}
          <Link to="/trophies" className={`${iconButton} max-sm:hidden`} title="Trophy Room" aria-label="Trophy Room">
            <Trophy size={16} aria-hidden />
          </Link>
          <Link to="/settings" className={iconButton} title="Settings" aria-label="Settings">
            <SettingsIcon size={16} aria-hidden />
          </Link>
          {CLERK_ENABLED && (
            <SignedIn>
              <div className="flex h-9 w-9 items-center justify-center">
                <UserButton afterSignOutUrl="/" appearance={{ elements: { userButtonAvatarBox: 'h-8 w-8' } }} />
              </div>
            </SignedIn>
          )}
        </div>
      </div>
    </header>
  );
}
