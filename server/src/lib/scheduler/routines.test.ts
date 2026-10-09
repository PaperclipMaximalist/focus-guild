/**
 * Routines with no hour of their own, found by the population lab
 * (`routine-drifts-today`, `routine-blocks-deadline`): they keep one time of
 * day, and they step aside for a deadline the plan is short on.
 */
import { describe, it, expect } from 'vitest';
import { placeDailyFillers, routinesAside, type DailyFiller } from './dailyFiller.js';
import { generateSchedule, replan } from './replan.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Midnight UTC; no tzOffsetMin here, so hours are UTC hours. */
const D0 = Date.UTC(2026, 4, 18);
const at = (day: number, hour: number) => D0 + day * DAY + hour * HOUR;
const hours = { startHour: 9, endHour: 18 };

const piano: DailyFiller = { id: 'p', name: 'Practice piano', durationMin: 45, preferredHour: null };
const stretch: DailyFiller = { id: 's', name: 'Stretch', durationMin: 15, preferredHour: null };

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: over.remainingMin ?? 60,
    deadline: at(3, 23.99),
    tediousness: 0.3,
    cognitiveLoad: 0.6,
    importance: 0.6,
    setupCost: 0.3,
    minChunkMin: 15,
    maxChunkMin: 50,
    category: 'deep_work',
    preferredHour: null,
    dependencies: [],
    createdAt: D0 - 3 * DAY,
    lastWorkedAt: null,
    status: 'pending',
    urgencyMultiplier: 1,
    ...over,
  };
}

/** No meal gap: these days are about routines and one deadline. */
const cfg = (over: Partial<UserConfig> = {}): UserConfig => ({ ...defaultConfig(), workingHours: hours, horizonDays: 3, mealGap: undefined, ...over });
const place = (fillers: DailyFiller[], now: number, existingFixed: Block[] = []) =>
  placeDailyFillers({ fillers, now, horizonDays: 3, workingHours: hours, existingFixed, tzOffsetMin: 0 });
const timeOfDay = (b: Block) => (b.start - D0) % DAY;
const routine = (blocks: Block[], f: DailyFiller, day: number) =>
  blocks.find((b) => b.note === `Daily: ${f.name}` && b.start >= at(day, 0) && b.start < at(day + 1, 0));

describe('a routine with no hour keeps one time of day', () => {
  it('sits at the same time today as on the days after', () => {
    // Opened at 10:40: today's occurrences used to be spread over what was
    // left of the day (10:40 and 14:20), every other day's over the whole of it.
    const placed = place([stretch, piano], at(0, 10 + 40 / 60));
    expect(timeOfDay(routine(placed, piano, 0)!)).toBe(timeOfDay(routine(placed, piano, 1)!));
    expect(timeOfDay(routine(placed, piano, 1)!)).toBe(timeOfDay(routine(placed, piano, 2)!));
  });

  it('is at the same time whenever the plan is made', () => {
    const early = place([stretch, piano], at(0, 7));
    const later = place([stretch, piano], at(0, 12));
    expect(routine(later, piano, 0)!.start).toBe(routine(early, piano, 0)!.start);
  });

  it('is skipped today once its time is long gone, like any routine with a time', () => {
    // Stretch is the first of two: 09:00. Opened at 16:00 it used to land on
    // 16:00, in front of whatever was due that evening.
    const placed = place([stretch, piano], at(0, 16));
    expect(routine(placed, stretch, 0)).toBeUndefined();
    expect(routine(placed, stretch, 1)).toBeDefined();
  });
});

describe('a routine with no hour steps aside for a deadline', () => {
  const now = at(0, 9);
  // Piano at 13:30–14:15, in front of a report due at 15:00.
  const fixedFor = (fillers: DailyFiller[]) => place(fillers, now);

  it('moves out of the way when the plan is short, and the quest then fits', () => {
    const c = cfg();
    const fixed = fixedFor([stretch, piano]);
    const before = routine(fixed, piano, 0)!;
    expect(before.start).toBeLessThan(at(0, 15));
    const tasks = [task('report', { remainingMin: 290, totalMin: 290, deadline: at(0, 15) })];

    const plain = generateSchedule(tasks, fixed, c, now);
    expect(plain.feasibilityReport.issues.map((i) => i.taskId)).toContain('report');

    const r = generateSchedule(tasks, fixed, c, now, [stretch, piano]);
    const after = routine(r.schedule, piano, 0)!;
    expect(after.start).toBeGreaterThanOrEqual(at(0, 15));
    expect(after.start).toBeLessThan(at(1, 0));
    expect(after.end - after.start).toBe(45 * MIN);
    const short = (x: typeof r) => x.feasibilityReport.issues.reduce((m, i) => m + i.shortfallMin, 0);
    expect(short(r)).toBeLessThan(short(plain));
  });

  it('stays where it is when nothing is short', () => {
    const fixed = fixedFor([stretch, piano]);
    const r = generateSchedule([task('report', { remainingMin: 60, deadline: at(0, 15) })], fixed, cfg(), now, [stretch, piano]);
    expect(routine(r.schedule, piano, 0)!.start).toBe(routine(fixed, piano, 0)!.start);
  });

  it('never moves a routine that has a time of its own', () => {
    const lunch: DailyFiller = { id: 'l', name: 'Lunch walk', durationMin: 45, preferredHour: 13 };
    const fixed = fixedFor([lunch]);
    const tasks = [task('report', { remainingMin: 330, totalMin: 330, deadline: at(0, 15) })];
    const r = generateSchedule(tasks, fixed, cfg(), now, [lunch]);
    expect(routine(r.schedule, lunch, 0)!.start).toBe(at(0, 13));
  });

  it('does the same on a replan, keeping the block it moves', () => {
    const c = cfg();
    const fixed = fixedFor([stretch, piano]);
    const id = routine(fixed, piano, 0)!.id;
    const tasks = [task('report', { remainingMin: 290, totalMin: 290, deadline: at(0, 15) })];
    const first = generateSchedule(tasks, fixed, c, now);
    const r = replan(first.schedule, tasks, c, now, { routines: [stretch, piano] });
    const moved = r.schedule.find((b) => b.id === id)!;
    expect(moved.start).toBeGreaterThanOrEqual(at(0, 15));
    expect(r.schedule.filter((b) => b.note === 'Daily: Practice piano' && b.start < at(1, 0))).toHaveLength(1);
  });

  it('has nowhere to go when the quest can use the whole day: it stays', () => {
    // Quest hours run to midnight and so does the deadline.
    const late = { startHour: 9, endHour: 24 };
    const fixed = placeDailyFillers({ fillers: [piano], now, horizonDays: 1, workingHours: late, existingFixed: [], tzOffsetMin: 0 });
    const moved = routinesAside({
      blocks: fixed,
      shortfalls: [{ deadline: at(1, 0), shortMin: 120 }],
      fillers: [piano],
      now,
      workingHours: late,
      tzOffsetMin: 0,
    });
    expect(moved).toBeNull();
  });
});
