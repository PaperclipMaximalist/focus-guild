/**
 * A crowded week, as the app plans it (fixed gap, filled days, breaks, a
 * meal). What `npm run lab:week` (scripts/intense-week.ts) found on
 * 2026-10-15, each pinned down here: a two-hour fix arriving mid-afternoon,
 * due at the end of it, got nothing; a replan of a plan it had just made
 * moved half the week; the same block came back twice under one id; a quest
 * a few minutes over its estimated room was given up altogether.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { applyEdit } from './edits.js';
import { buildDayInfo, triage } from './budget.js';
import { defaultConfig, restPolicy } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 08:00 UTC, the start of working hours. */
const NOW = Date.UTC(2026, 9, 19, 8, 0, 0, 0);
const MIDNIGHT = Date.UTC(2026, 9, 19);
const at = (hour: number, day = 0) => MIDNIGHT + day * DAY + hour * HOUR;

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: overrides.remainingMin ?? 60,
    deadline: NOW + 5 * DAY,
    tediousness: 0.4,
    cognitiveLoad: 0.5,
    importance: 0.5,
    setupCost: 0.3,
    minChunkMin: 15,
    maxChunkMin: 50,
    category: 'deep_work',
    preferredHour: null,
    dependencies: [],
    createdAt: NOW - DAY,
    lastWorkedAt: null,
    status: 'pending',
    urgencyMultiplier: 1.0,
    ...overrides,
  };
}

/** What the app runs with: 5-minute gaps, a half-hour break about every two hours, the days filled, lunch kept. */
const cfg = (overrides: Partial<UserConfig> = {}): UserConfig => ({
  ...defaultConfig(),
  workingHours: { startHour: 8, endHour: 23 },
  tzOffsetMin: 0,
  gapMin: 5,
  breakMin: 30,
  breakEveryMin: 120,
  fillDays: true,
  ...overrides,
});

/** More than the week holds, due all through it, a few small ones among them. */
const week = (): Task[] => [
  task('lab', { remainingMin: 240, totalMin: 240, cognitiveLoad: 0.8, deadline: at(23.99, 1) }),
  task('budget', { remainingMin: 120, totalMin: 120, cognitiveLoad: 0.8, deadline: at(23.99, 2) }),
  task('narrative', { remainingMin: 240, totalMin: 240, cognitiveLoad: 0.8, importance: 0.8, urgencyMultiplier: 1.4, deadline: at(23.99, 2) }),
  task('slides', { remainingMin: 150, totalMin: 150, category: 'creative', deadline: at(17, 2) }),
  task('stats', { remainingMin: 480, totalMin: 480, cognitiveLoad: 0.8, importance: 0.8, urgencyMultiplier: 1.4, deadline: at(9, 3) }),
  task('thesis', { remainingMin: 300, totalMin: 300, cognitiveLoad: 0.8, deadline: at(17, 4) }),
  task('client', { remainingMin: 360, totalMin: 360, cognitiveLoad: 0.7, deadline: at(12, 5) }),
  task('review', { remainingMin: 180, totalMin: 180, cognitiveLoad: 0.7, deadline: at(18, 0) }),
  task('reply', { remainingMin: 20, totalMin: 20, cognitiveLoad: 0.2, category: 'comms', deadline: at(12, 0) }),
  task('ink', { remainingMin: 10, totalMin: 10, cognitiveLoad: 0.2, category: 'admin', deadline: at(20, 3) }),
  task('cv', { remainingMin: 45, totalMin: 45, cognitiveLoad: 0.4, category: 'admin', deadline: at(20, 4) }),
  task('rent', { remainingMin: 10, totalMin: 10, cognitiveLoad: 0.2, category: 'admin', deadline: at(20, 1) }),
  task('reading', { remainingMin: 90, totalMin: 90, category: 'learning', deadline: at(16, 3) }),
];

/** Classes, a walk and a dinner: the week's fixed points. */
const calendar = (): Block[] => [
  { id: 'lecture-0', start: at(10, 0), end: at(11.5, 0), type: 'fixed', taskId: null, locked: true },
  { id: 'lab-1', start: at(13, 1), end: at(16, 1), type: 'fixed', taskId: null, locked: true },
  { id: 'lecture-2', start: at(10, 2), end: at(11.5, 2), type: 'fixed', taskId: null, locked: true },
  { id: 'walk-0', start: at(18, 0), end: at(18.5, 0), type: 'fixed', taskId: null, locked: true },
  { id: 'walk-1', start: at(18, 1), end: at(18.5, 1), type: 'fixed', taskId: null, locked: true },
  { id: 'walk-2', start: at(18, 2), end: at(18.5, 2), type: 'fixed', taskId: null, locked: true },
];

const workOf = (schedule: Block[]) => schedule.filter((b) => b.type === 'work' && b.taskId).sort((a, b) => a.start - b.start);
/** The blocks ahead of `now`, where they are. */
const shape = (schedule: Block[], now: number) =>
  schedule
    .filter((b) => b.end > now && (b.type === 'work' || b.type === 'break'))
    .map((b) => `${b.type}:${b.taskId}@${b.start}-${b.end}`)
    .sort()
    .join('|');

/** The quests as they stand at `clock`, if the person did every block of `schedule` that has ended by then. */
function lived(tasks: Task[], schedule: Block[], clock: number): Task[] {
  return tasks.map((t) => {
    const done = workOf(schedule)
      .filter((b) => b.taskId === t.id && b.start < clock)
      .reduce((m, b) => m + (Math.min(b.end, clock) - b.start) / MIN, 0);
    const left = Math.max(0, t.remainingMin - done);
    return left < 1 ? { ...t, remainingMin: 0, status: 'done' } : { ...t, remainingMin: left };
  });
}

describe('a crowded week', () => {
  it('a replan of the plan it just made changes nothing, all through the day', () => {
    const tasks = week();
    let schedule = generateSchedule(tasks, calendar(), cfg(), NOW).schedule;
    // The person follows the plan; the app replans as each sitting ends.
    for (const hour of [8.75, 9.5, 12.25, 12.5, 14.2, 15.75, 17.1, 19.5, 21.4]) {
      const clock = at(hour);
      const now = lived(tasks, schedule, clock);
      schedule = replan(schedule, now, cfg(), clock).schedule;
      const again = replan(schedule, now, cfg(), clock).schedule;
      expect(shape(again, clock), `replanned twice at ${hour}`).toBe(shape(schedule, clock));
    }
  });

  it('never has two blocks with one id, a sitting finished in the last seconds of its block included', () => {
    const tasks = week();
    const first = generateSchedule(tasks, calendar(), cfg(), NOW).schedule;
    const b = workOf(first).find((x) => x.start >= at(12) && x.end - x.start >= 25 * MIN)!;
    // Its quest is done 50 seconds before the block ends.
    const clock = b.end - 50_000;
    const now = lived(tasks, first, clock).map((t) => (t.id === b.taskId ? { ...t, remainingMin: 0, status: 'done' as const } : t));
    let schedule = first;
    for (let k = 0; k < 3; k += 1) {
      schedule = replan(schedule, now, cfg(), clock).schedule;
      const ids = schedule.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('a two-hour fix that arrives mid-afternoon, due three hours later, gets its two hours first', () => {
    const tasks = week();
    let schedule = generateSchedule(tasks, calendar(), cfg(), NOW).schedule;
    const clock = at(16.75, 1);
    for (const hour of [9, 12, 16.5]) schedule = replan(schedule, lived(tasks, schedule, at(hour, 1)), cfg(), at(hour, 1)).schedule;
    const fix = task('fix', { remainingMin: 120, totalMin: 120, cognitiveLoad: 0.8, importance: 0.9, urgencyMultiplier: 1.4, deadline: at(20, 1), createdAt: clock });
    const now = [...lived(tasks, schedule, clock), fix];
    const { schedule: next, feasibilityReport } = replan(schedule, now, cfg(), clock, { addTaskIds: ['fix'] });
    const placed = workOf(next).filter((b) => b.taskId === 'fix' && b.end <= fix.deadline).reduce((m, b) => m + (b.end - b.start) / MIN, 0);
    expect(placed).toBe(120);
    expect(feasibilityReport.issues.map((i) => i.taskId)).not.toContain('fix');
  });

  it('keeps a quest dragged to the top of today there, though a quest due days later is short', () => {
    const tasks = week();
    const first = generateSchedule(tasks, calendar(), cfg(), NOW).schedule;
    const today = workOf(first).filter((b) => b.start > NOW && b.end <= at(23));
    // A short one, so it fits the first stretch of the morning.
    const moved = today.find((b, i) => i >= 2 && b.end - b.start <= 20 * MIN && b.taskId !== today[0]!.taskId)!;
    expect(moved).toBeDefined();
    const { schedule } = replan(applyEdit(first, { kind: 'reorder_block', blockId: moved.id, beforeId: today[0]!.id }), tasks, cfg(), NOW);
    const after = workOf(schedule).filter((b) => b.start > NOW);
    expect(after[0]!.taskId).toBe(moved.taskId);
  });

  it('keeps the meal free between kept blocks, so the day after it stays where it was', () => {
    const tasks = week();
    let schedule = generateSchedule(tasks, calendar(), cfg(), NOW).schedule;
    // Just as the sitting before lunch begins.
    const clock = workOf(schedule).find((b) => b.start >= at(12) && b.start < at(13))?.start ?? at(12.5);
    const now = lived(tasks, schedule, clock);
    schedule = replan(schedule, now, cfg(), clock).schedule;
    const pause = (s: Block[]) => {
      const midday = workOf(s).filter((b) => b.end > at(11.5) && b.start < at(14));
      return Math.max(...midday.slice(1).map((b, i) => (b.start - midday[i]!.end) / MIN));
    };
    expect(pause(schedule)).toBeGreaterThanOrEqual(30);
    const again = replan(schedule, now, cfg(), clock).schedule;
    expect(shape(again, clock)).toBe(shape(schedule, clock));
  });
});

describe('triage near the line', () => {
  it('keeps a quest a few minutes over its estimated room: the room is an estimate on the low side', () => {
    const config = cfg({ mealGap: undefined });
    const now = at(14);
    // 14:00–16:10 free: 130 minutes, about 115 of them for work once the gaps are counted.
    const fixed: Block[] = [{ id: 'evening', start: at(16 + 10 / 60), end: at(23), type: 'fixed', taskId: null, locked: true }];
    const days = buildDayInfo(config, now, fixed);
    const fix = task('fix', { remainingMin: 120, totalMin: 120, deadline: at(16 + 10 / 60), urgencyMultiplier: 1.4 });
    expect(triage([fix], days, undefined, restPolicy(config)).has('fix')).toBe(false);
    // Well over it, it still goes.
    const big = task('big', { remainingMin: 150, totalMin: 150, deadline: at(16 + 10 / 60) });
    expect(triage([big], days, undefined, restPolicy(config)).has('big')).toBe(true);
  });
});
