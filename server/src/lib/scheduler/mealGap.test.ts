/**
 * The meal gap, found by the population lab (`no-meal-gap`): a day of quests
 * from 9 to 6 was planned straight through midday.
 */
import { describe, it, expect } from 'vitest';
import { buildDayInfo } from './budget.js';
import { generateSchedule, replan } from './replan.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Midnight UTC; no tzOffsetMin here, so hours are UTC hours. */
const D0 = Date.UTC(2026, 4, 18);
const at = (day: number, hour: number) => D0 + day * DAY + hour * HOUR;

const cfg = (over: Partial<UserConfig> = {}): UserConfig => ({
  ...defaultConfig(),
  workingHours: { startHour: 9, endHour: 18 },
  horizonDays: 2,
  ...over,
});
const fixed = (id: string, start: number, end: number, note = 'Calendar: class'): Block => ({
  id, start, end, type: 'fixed', taskId: null, locked: true, note,
});
const essay: Task = {
  id: 'essay',
  name: 'essay',
  remainingMin: 900,
  totalMin: 900,
  deadline: at(1, 23.99),
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
};

/** The longest stretch between 11:30 and 14:00 on `day` with no quest in it, in minutes. */
function pause(schedule: Block[], day: number): number {
  const from = at(day, 11.5);
  const to = at(day, 14);
  let cursor = from;
  let gap = 0;
  for (const b of schedule.filter((x) => x.type === 'work' && x.end > from && x.start < to).sort((a, c) => a.start - c.start)) {
    gap = Math.max(gap, b.start - cursor);
    cursor = Math.max(cursor, b.end);
  }
  return Math.max(gap, to - cursor) / MIN;
}

describe('a meal on a day worked through', () => {
  it('keeps half an hour around midday free, even on a day that is full', () => {
    const r = generateSchedule([essay], [], cfg(), at(0, 8));
    expect(pause(r.schedule, 0)).toBeGreaterThanOrEqual(30);
    expect(pause(r.schedule, 1)).toBeGreaterThanOrEqual(30);
    // Without it, the same two days run through lunch.
    const none = generateSchedule([essay], [], cfg({ mealGap: undefined }), at(0, 8));
    expect(Math.min(pause(none.schedule, 0), pause(none.schedule, 1))).toBeLessThan(30);
  });

  it('is the same half hour after a replan', () => {
    const c = cfg();
    const first = generateSchedule([essay], [], c, at(0, 8));
    const again = replan(first.schedule, [essay], c, at(0, 8));
    expect(pause(again.schedule, 0)).toBeGreaterThanOrEqual(30);
    expect(pause(again.schedule, 1)).toBeGreaterThanOrEqual(30);
  });

  it('takes nothing when a class or a lunch date already breaks the span', () => {
    const lunchDate = fixed('cal:lunch', at(0, 12), at(0, 13), 'Calendar: Lunch with Sam');
    const [day] = buildDayInfo(cfg(), at(0, 8), [lunchDate]);
    // 9–12 and 13–18, whole.
    expect(day!.freeMinutes).toBe(480);
  });

  it('takes nothing from a day that starts after lunch or ends before it', () => {
    const evening = cfg({ workingHours: { startHour: 15, endHour: 22 } });
    expect(buildDayInfo(evening, at(0, 8), [])[0]!.freeMinutes).toBe(420);
    const morning = cfg({ workingHours: { startHour: 6, endHour: 12 } });
    expect(buildDayInfo(morning, at(0, 5), [])[0]!.freeMinutes).toBe(360);
  });

  it('takes 30 minutes at 12:30 from an open day', () => {
    const [day] = buildDayInfo(cfg(), at(0, 8), []);
    expect(day!.freeMinutes).toBe(510);
    expect(day!.freeIntervals.map((iv) => [(iv.start - D0) / HOUR, (iv.end - D0) / HOUR])).toEqual([[9, 12.5], [13, 18]]);
  });
});
