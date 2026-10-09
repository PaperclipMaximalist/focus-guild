/**
 * UpNextCard — the scheduler's answer to "what should I do right now?",
 * surfaced on the Today page so the plan meets you where you land.
 *
 * Shows the ACTIVE work block (with time remaining) or the next upcoming
 * one today (with a countdown to its start), plus a Start button that
 * launches the FocusTimer right here. Completion runs through the parent's
 * handler so XP/streak/achievement celebration stays identical to the
 * quest-card path.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScheduleStore } from '../store/useScheduleStore';
import { useQuestStore } from '../store/useQuestStore';
import { useTimerStore } from '../store/useTimerStore';
import { FocusTimer } from './FocusTimer';
import { sfxStart } from '../lib/sfx';
import type { ScheduleBlock } from '../lib/api';
import { CalendarDays, ChevronRight, Play, Timer } from 'lucide-react';

interface Props {
  /** Same completion pipeline the Today quest cards use. */
  onCompleteQuest: (questId: string) => Promise<void> | void;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  if (total >= 60) return `${Math.floor(total / 60)}h ${total % 60}m`;
  return `${total}m`;
}

export function UpNextCard({ onCompleteQuest }: Props) {
  const { schedule, fetch: fetchSchedule } = useScheduleStore();
  const quests = useQuestStore((s) => s.quests);
  const startTimer = useTimerStore((s) => s.start);
  const timerActive = useTimerStore((s) => s.active);
  const [timerOpen, setTimerOpen] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Fetch (never generate) — Today should reflect the plan, not create one.
    if (schedule.length === 0) void fetchSchedule();
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { block, isActive } = useMemo((): { block: ScheduleBlock | null; isActive: boolean } => {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const work = schedule
      .filter((b) => b.type === 'work' && b.taskId)
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const active = work.find(
      (b) => new Date(b.start).getTime() <= now && new Date(b.end).getTime() > now,
    );
    if (active) return { block: active, isActive: true };
    const next = work.find(
      (b) => new Date(b.start).getTime() > now && new Date(b.start).getTime() <= endOfDay.getTime(),
    );
    return { block: next ?? null, isActive: false };
  }, [schedule, now]);

  const quest = block?.taskId ? quests.find((q) => q.id === block.taskId) ?? null : null;

  // Nothing planned (or nothing left today): a quiet pointer to the feed.
  if (!block || !quest) {
    return (
      <Link to="/feed" className="panel flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-(--color-surface2)">
        <CalendarDays size={18} className="shrink-0 text-(--color-muted)" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Nothing planned for the rest of today</span>
          <span className="block text-xs text-(--color-muted)">Open the Route to plot the day</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-(--color-muted)" aria-hidden />
      </Link>
    );
  }

  const startMs = new Date(block.start).getTime();
  const endMs = new Date(block.end).getTime();
  const subtitle = isActive
    ? `${fmtCountdown(endMs - now)} left in this block`
    : `${fmtClock(block.start)} · in ${fmtCountdown(startMs - now)}`;

  const handleStart = () => {
    sfxStart();
    startTimer({
      questId: quest.id,
      questTitle: quest.title,
      durationMin: block.durationMin,
    });
    setTimerOpen(true);
  };

  return (
    <>
      {/* The one thing on the page that is allowed to be loud. */}
      <div
        className="panel p-4"
        style={isActive ? { boxShadow: 'inset 0 0 0 1.5px var(--color-primary)' } : undefined}
      >
        <p className="section-label" style={{ color: 'var(--color-primary)' }}>
          {isActive ? 'Now boarding' : 'Next stop'}
        </p>
        <p className="mt-1.5 text-[17px] font-bold leading-snug">{quest.title}</p>
        <p className="tnum mt-0.5 text-[13px] text-(--color-muted)">{subtitle}</p>
        <div className="mt-3.5 flex items-center gap-2">
          {timerActive?.questId === quest.id ? (
            <button type="button" onClick={() => setTimerOpen(true)} className="btn-primary">
              <Timer size={15} aria-hidden /> Resume
            </button>
          ) : (
            <button type="button" onClick={handleStart} className="btn-primary">
              <Play size={15} aria-hidden /> Start
            </button>
          )}
          <Link to="/feed" className="btn-quiet min-h-10">
            See the route
          </Link>
        </div>
      </div>

      <FocusTimer
        open={timerOpen && !!timerActive}
        onClose={() => setTimerOpen(false)}
        onComplete={async (questId) => {
          await onCompleteQuest(questId);
        }}
      />
    </>
  );
}
