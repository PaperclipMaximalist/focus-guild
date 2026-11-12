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
import { sfxStart } from '../lib/sfx';
import type { ScheduleBlock } from '../lib/api';
import { formatDayAndTime } from '../lib/formatters';
import { AddTimeNow } from './AddTimeNow';
import { CalendarDays, ChevronRight, Play, Timer } from 'lucide-react';

interface Props {
  /** No longer needed for the timer (the app-wide timer screen completes quests itself); kept so callers need no change. */
  onCompleteQuest?: (questId: string) => Promise<void> | void;
  /** Render nothing while there is no block to show (the welcome guide already points at the route). */
  hideWhenEmpty?: boolean;
}

function fmtClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 60_000));
  if (total >= 60) return `${Math.floor(total / 60)}h ${total % 60}m`;
  return `${total}m`;
}

export function UpNextCard({ hideWhenEmpty }: Props) {
  const { schedule, blockQuests, fetch: fetchSchedule } = useScheduleStore();
  const quests = useQuestStore((s) => s.quests);
  const completed = useQuestStore((s) => s.completed);
  const startTimer = useTimerStore((s) => s.start);
  const timerActive = useTimerStore((s) => s.active);
  const showTimer = useTimerStore((s) => s.show);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    // Fetch (never generate) — Today should reflect the plan, not create one.
    if (schedule.length === 0) void fetchSchedule();
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { block, isActive, later } = useMemo((): {
    block: ScheduleBlock | null;
    isActive: boolean;
    /** The first stop after today, for when today has none left. */
    later: ScheduleBlock | null;
  } => {
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    // The saved plan still holds a quest ticked since it was made: skip those, or
    // the card names as "next stop" something that is already done.
    const done = new Set(completed.map((q) => q.id));
    const work = schedule
      .filter((b) => b.type === 'work' && b.taskId && !done.has(b.taskId) && blockQuests[b.taskId]?.status !== 'COMPLETE')
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const later = work.find((b) => new Date(b.start).getTime() > endOfDay.getTime()) ?? null;
    const active = work.find(
      (b) => new Date(b.start).getTime() <= now && new Date(b.end).getTime() > now,
    );
    if (active) return { block: active, isActive: true, later };
    const next = work.find(
      (b) => new Date(b.start).getTime() > now && new Date(b.start).getTime() <= endOfDay.getTime(),
    );
    return { block: next ?? null, isActive: false, later };
  }, [schedule, now, completed, blockQuests]);

  // A step or a straggler is not in the quest list; the plan carries its own.
  const questFor = (b: ScheduleBlock | null) =>
    b?.taskId ? quests.find((q) => q.id === b.taskId) ?? blockQuests[b.taskId] ?? null : null;
  const quest = questFor(block);

  // Nothing planned (or nothing left today): a quiet pointer to the feed.
  if (!block || !quest) {
    if (hideWhenEmpty) return null;
    // Today is done but the route goes on (an evening, or a day already full): say when, not "plot the day".
    const laterQuest = questFor(later);
    if (later && laterQuest) {
      return (
        // Buttons cannot sit inside a link, so the link is the top of the card and the buttons sit under it.
        <div className="panel">
          <Link to="/feed" className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-(--color-surface2)">
            <CalendarDays size={18} className="shrink-0 text-(--color-muted)" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Nothing more planned today</span>
              <span className="block text-xs text-(--color-muted)">
                Next stop {formatDayAndTime(later.start)}: {laterQuest.title}
              </span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-(--color-muted)" aria-hidden />
          </Link>
          <AddTimeNow className="px-3.5 pb-3.5" />
        </div>
      );
    }
    // Nothing on the list: the jot box below is the next step, not an empty route.
    if (quests.length === 0) return null;
    // With quests waiting and no plan yet (a new member, or a new day), say what the Route will do with them.
    const waiting = quests.length > 0 && schedule.length === 0;
    return (
      <Link to="/feed" className="panel flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-(--color-surface2)">
        <CalendarDays size={18} className="shrink-0 text-(--color-muted)" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {/* Not "for today": in the evening the route starts on the next working day. */}
            {waiting ? 'Plot your route' : 'Nothing planned for the rest of today'}
          </span>
          <span className="block text-xs text-(--color-muted)">
            {waiting
              ? `Put your ${quests.length} ${quests.length === 1 ? 'quest' : 'quests'} in order, each with a time`
              : 'Open the Route to plot the day'}
          </span>
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
      daily: quest.isRecurring,
    });
  };

  return (
    <>
      {/* The one thing on the page that is allowed to be loud. */}
      <div
        className="panel next-card p-4"
        style={isActive ? { boxShadow: 'inset 0 0 0 1.5px var(--color-primary)' } : undefined}
      >
        <p className="section-label" style={{ color: 'var(--color-primary)' }}>
          {isActive ? 'Now boarding' : 'Next stop'}
        </p>
        <p className="mt-1.5 text-[17px] font-bold leading-snug">{quest.title}</p>
        <p className="tnum mt-0.5 text-[13px] text-(--color-muted)">{subtitle}</p>
        <div className="mt-3.5 flex items-center gap-2">
          {timerActive?.questId === quest.id ? (
            <button type="button" onClick={showTimer} className="btn-primary">
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
    </>
  );
}
