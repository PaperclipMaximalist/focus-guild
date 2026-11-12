/**
 * Time added with the slider after the working hours are over, as the app
 * plans it (lib/userConfig.ts: gap, long breaks, filled days, rotation, the
 * slider's end). Found in the running app on 2026-11-11: at 19:34, with today
 * already over and a plan for the coming days in place, the member gave
 * themselves 30 minutes. The email due at 21:00 (10 minutes) was reported as
 * not fitting at all, and the 30 minutes went to the chemistry report due in
 * two days: tomorrow's first block, pulled forward.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Wednesday, midnight UTC. */
const MIDNIGHT = Date.UTC(2026, 10, 11);
const at = (hour: number, day = 0) => MIDNIGHT + day * DAY + hour * HOUR;

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: overrides.remainingMin ?? 60,
    deadline: at(23.99, 5),
    tediousness: 0.4,
    cognitiveLoad: 0.5,
    importance: 0.5,
    setupCost: 0.3,
    minChunkMin: 15,
    maxChunkMin: 50,
    category: 'deep_work',
    preferredHour: null,
    dependencies: [],
    createdAt: at(9, -3),
    lastWorkedAt: null,
    status: 'pending',
    urgencyMultiplier: 1.0,
    ...overrides,
  };
}

/** What the app runs with (lib/userConfig.ts), working hours 9:00–18:00. */
const cfg = (overrides: Partial<UserConfig> = {}): UserConfig => ({
  ...defaultConfig(),
  workingHours: { startHour: 9, endHour: 18 },
  tzOffsetMin: 0,
  gapMin: 5,
  breakMin: 30,
  breakEveryMin: 120,
  fillDays: true,
  rotate: true,
  ...overrides,
});

const HIGH = { importance: 0.9, urgencyMultiplier: 1.4 };

/** The member's quests that evening. */
const quests = (emailMin = 10): Task[] => [
  task('email', { remainingMin: emailMin, totalMin: emailMin, cognitiveLoad: 0.6, category: 'comms', deadline: at(21) }),
  task('math', { remainingMin: 75, totalMin: 75, cognitiveLoad: 0.8, maxChunkMin: 90, deadline: at(8.5, 1), ...HIGH }),
  task('chem', { remainingMin: 120, totalMin: 120, cognitiveLoad: 0.8, maxChunkMin: 90, deadline: at(23.99, 2), ...HIGH }),
  task('reading', { remainingMin: 90, totalMin: 90, category: 'learning', deadline: at(17, 3) }),
  task('slides', { remainingMin: 60, totalMin: 60, category: 'creative', deadline: at(12, 4) }),
  task('essay', { remainingMin: 180, totalMin: 180, cognitiveLoad: 0.7, maxChunkMin: 90, deadline: at(23.99, 5) }),
  // Already past its deadline.
  task('late', { remainingMin: 30, totalMin: 30, category: 'admin', deadline: at(12) }),
];

/** Two daily routines, each working day of the week. */
const routines = (): Block[] =>
  [1, 2, 3, 4, 5, 6].flatMap((d) => [
    { id: `walk-${d}`, start: at(12.5, d), end: at(13, d), type: 'fixed' as const, taskId: null, locked: true, note: 'Daily: Walk' },
    { id: `gym-${d}`, start: at(17, d), end: at(18, d), type: 'fixed' as const, taskId: null, locked: true, note: 'Daily: Gym' },
  ]);

const workOf = (schedule: Block[]) => schedule.filter((b) => b.type === 'work' && b.taskId).sort((a, b) => a.start - b.start);
const clock = (t: number) => `d${Math.floor((t - MIDNIGHT) / DAY)} ${new Date(t).toISOString().slice(11, 16)}`;
const show = (s: Block[], from: number) =>
  workOf(s)
    .filter((b) => b.end > from)
    .slice(0, 6)
    .map((b) => `${b.taskId} ${clock(b.start)}-${clock(b.end).slice(3)}`)
    .join(', ');
const minutesBy = (s: Block[], id: string, before: number) =>
  workOf(s).filter((b) => b.taskId === id && b.end <= before).reduce((m, b) => m + (b.end - b.start) / MIN, 0);

/** A plan made at `madeAt` with today over, then `minutes` added at `pressAt`. */
function addTime(minutes: number, emailMin = 10, madeAt = at(19.5), pressAt = at(19 + 34 / 60)) {
  const tasks = quests(emailMin);
  const first = generateSchedule(tasks, routines(), cfg(), madeAt).schedule;
  const config = cfg({ todayEndsAt: pressAt + minutes * MIN });
  const result = replan(first, tasks, config, pressAt);
  return { first, tasks, config, pressAt, ...result };
}

describe('time added after the working hours are over', () => {
  it('goes first to the quest due tonight that fits in it, not to work due on a later day', () => {
    const { first, schedule, feasibilityReport, pressAt } = addTime(30);
    const label = `before: ${show(first, pressAt)}\nafter: ${show(schedule, pressAt)}\nshort: ${JSON.stringify(feasibilityReport.issues.map((i) => [i.taskId, i.shortfallMin]))}`;
    const tonight = workOf(schedule).filter((b) => b.start < pressAt + 30 * MIN && b.end > pressAt);
    expect(minutesBy(schedule, 'email', at(21)), label).toBe(10);
    // The email comes ahead of everything due on a later day.
    expect(tonight[0]?.taskId, label).toBe('email');
    expect(feasibilityReport.issues.map((i) => i.taskId), label).not.toContain('email');
    for (const b of tonight) expect(b.end, label).toBeLessThanOrEqual(pressAt + 30 * MIN);
  });

  it('gives a quest due tonight that is longer than the time added what there is, as a first sitting', () => {
    const { first, schedule, feasibilityReport, pressAt } = addTime(30, 45);
    const label = `before: ${show(first, pressAt)}\nafter: ${show(schedule, pressAt)}\nshort: ${JSON.stringify(feasibilityReport.issues.map((i) => [i.taskId, i.shortfallMin]))}`;
    expect(workOf(schedule).find((b) => b.end > pressAt)?.taskId, label).toBe('email');
    expect(minutesBy(schedule, 'email', at(21)), label).toBeGreaterThanOrEqual(25);
    const short = feasibilityReport.issues.find((i) => i.taskId === 'email')?.shortfallMin ?? 0;
    expect(short, label).toBe(45 - minutesBy(schedule, 'email', at(21)));
  });

  it('a Reroute straight after, or a minute later, changes nothing', () => {
    const { schedule, tasks, config, pressAt } = addTime(30);
    const shape = (s: Block[], from: number) => workOf(s).filter((b) => b.end > from).map((b) => `${b.taskId} ${clock(Math.max(b.start, from))}-${clock(b.end)}`);
    expect(shape(replan(schedule, tasks, config, pressAt).schedule, pressAt)).toEqual(shape(schedule, pressAt));
    // A minute on, with that minute worked, the block under way has a minute less ahead of it and nothing else moves.
    const later = pressAt + MIN;
    const head = workOf(schedule).find((b) => b.end > pressAt)!;
    const worked = tasks.map((t) => (t.id === head.taskId ? { ...t, remainingMin: t.remainingMin - 1 } : t));
    expect(shape(replan(schedule, worked, config, later).schedule, later)).toEqual(shape(schedule, later));
  });

  it('going back to working hours after hours takes the unstarted blocks off today, and is stable', () => {
    const { schedule, tasks, pressAt } = addTime(30);
    const back = replan(schedule, tasks, cfg(), pressAt + 2 * MIN);
    expect(workOf(back.schedule).filter((b) => b.start >= pressAt + 2 * MIN && b.start < at(9, 1))).toEqual([]);
    const again = replan(back.schedule, tasks, cfg(), pressAt + 2 * MIN);
    const shape = (s: Block[]) => workOf(s).filter((b) => b.end > pressAt + 2 * MIN).map((b) => `${b.taskId} ${b.start}-${b.end}`);
    expect(shape(again.schedule)).toEqual(shape(back.schedule));
  });
});

describe('time added or taken away while today still has some left', () => {
  it('added at the end of the day, it goes to the quest due tonight before tomorrow\'s work', () => {
    // 17:00, an hour of working time left; the email is an hour and a half.
    const made = at(17);
    const tasks = quests(90);
    const first = generateSchedule(tasks, routines(), cfg(), made).schedule;
    const before = minutesBy(first, 'email', at(21));
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(90);
    // Five minutes in, the member gives themselves until 19:05.
    const press = made + 5 * MIN;
    const lived = tasks.map((t) => (t.id === 'email' ? { ...t, remainingMin: t.remainingMin - 5 } : t));
    const { schedule, feasibilityReport } = replan(first, lived, cfg({ todayEndsAt: at(19 + 5 / 60) }), press);
    const label = `before: ${show(first, made)}\nafter: ${show(schedule, press)}\nshort: ${JSON.stringify(feasibilityReport.issues.map((i) => [i.taskId, i.shortfallMin]))}`;
    const ahead = workOf(schedule).filter((b) => b.taskId === 'email' && b.end > press && b.end <= at(21));
    expect(ahead.reduce((m, b) => m + (b.end - Math.max(b.start, press)) / MIN, 0), label).toBe(85);
    expect(feasibilityReport.issues.map((i) => i.taskId), label).not.toContain('email');
  });

  it('taken away, today keeps the work due tonight and nothing runs past the new end', () => {
    const made = at(15);
    const tasks = quests();
    const first = generateSchedule(tasks, routines(), cfg(), made).schedule;
    expect(minutesBy(first, 'email', at(21))).toBe(10);
    const until = made + 30 * MIN;
    const { schedule, feasibilityReport } = replan(first, tasks, cfg({ todayEndsAt: until }), made);
    const label = `before: ${show(first, made)}\nafter: ${show(schedule, made)}`;
    expect(minutesBy(schedule, 'email', until), label).toBe(10);
    expect(workOf(schedule).filter((b) => b.start < at(9, 1) && b.end > until), label).toEqual([]);
    expect(feasibilityReport.issues.map((i) => i.taskId), label).not.toContain('email');
  });
});
