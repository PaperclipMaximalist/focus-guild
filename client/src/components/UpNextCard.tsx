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

  // Nothing planned (or nothing left today) — gentle pointer to the feed.
  if (!block || !quest) {
    return (
      <Link
        to="/feed"
        className="mt-3 flex items-center gap-3 rounded-(--radius-card) border border-(--color-border) bg-(--color-surface) px-4 py-3 transition hover:bg-(--color-surface2)"
      >
        <span className="text-2xl">🧭</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            Nothing queued right now
          </p>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
            Open the Guild Feed to plan your day →
          </p>
        </div>
      </Link>
    );
  }

  const startMs = new Date(block.start).getTime();
  const endMs = new Date(block.end).getTime();
  const subtitle = isActive
    ? `In progress · ${fmtCountdown(endMs - now)} left in this block`
    : `Up next at ${fmtClock(block.start)} · in ${fmtCountdown(startMs - now)}`;

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
      <div
        className="mt-3 rounded-(--radius-card) border p-4"
        style={{
          borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
          background: isActive
            ? 'linear-gradient(135deg, rgba(139,92,246,0.16), rgba(139,92,246,0.04))'
            : 'var(--color-surface)',
          boxShadow: isActive ? '0 0 18px rgba(139,92,246,0.18)' : 'none',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{isActive ? '🎯' : '⏭️'}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
              {isActive ? 'Focus now' : 'Up next'}
            </p>
            <p className="truncate text-sm font-bold" style={{ color: 'var(--color-text)' }}>
              {quest.title}
            </p>
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {subtitle}
            </p>
          </div>
          {timerActive?.questId === quest.id ? (
            <button
              onClick={() => setTimerOpen(true)}
              className="shrink-0 rounded-full px-4 py-2 text-xs font-bold text-white"
              style={{ background: 'var(--color-primary)' }}
            >
              ⏱ Resume
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="shrink-0 rounded-full px-4 py-2 text-xs font-bold text-white transition hover:scale-105"
              style={{ background: isActive ? 'var(--color-green)' : 'var(--color-primary)' }}
            >
              ▶ Start
            </button>
          )}
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
