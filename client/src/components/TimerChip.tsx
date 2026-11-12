/**
 * TimerChip — a running focus session, visible on every page while the
 * timer's screen is closed. In the flow of the page (sidebar or top bar),
 * never floating. Tapping it reopens the screen.
 *
 * Not a live region: a clock that announces itself every second is unusable
 * with a screen reader, so the accessible name is read when focus lands.
 */

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { useTimerStore } from '../store/useTimerStore';

function mmss(ms: number): string {
  const total = Math.ceil(Math.abs(ms) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function TimerChip({ className = '' }: { className?: string }) {
  const active = useTimerStore((s) => s.active);
  const open = useTimerStore((s) => s.open);
  const show = useTimerStore((s) => s.show);
  const remainingMs = useTimerStore((s) => s.remainingMs);
  const [, tick] = useState(0);
  const visible = !!active && !open;

  // Only ticks while the chip is on screen.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  if (!active || open) return null;
  const ms = remainingMs();
  const paused = active.pausedAt !== null;
  const over = ms < 0;
  const left = paused ? 'Paused' : over ? `+${mmss(ms)}` : mmss(ms);
  const spoken = paused ? 'paused' : over ? `${mmss(ms)} over` : `${mmss(ms)} left`;

  return (
    <button
      type="button"
      data-timer-chip
      onClick={show}
      aria-label={`Focus timer: ${active.questTitle}, ${spoken}. Open the timer`}
      className={`flex min-h-11 w-full items-center gap-2 rounded-md border border-(--color-border) bg-(--color-surface2) px-3 text-left text-[13px] transition-colors hover:bg-(--color-surface) ${className}`}
    >
      <Timer size={16} className="shrink-0 text-(--color-muted)" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-semibold">{active.questTitle}</span>
      <span className="tnum shrink-0 font-semibold" style={{ color: 'var(--color-primary)' }}>{left}</span>
    </button>
  );
}
