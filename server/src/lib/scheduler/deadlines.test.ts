/**
 * Deadline safety, found by the population lab (scripts/population-lab.ts):
 * each case here is a simulated person whose plan was wrong before the fix.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { buildDayInfo, workableMin } from './budget.js';
import { focusWindow } from './constructor.js';
import { CHRONOTYPE_CURVES, defaultConfig } from './config.js';
import { remainingFor } from './adapter.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Midnight UTC; configs here have no tzOffsetMin, so hours are UTC hours. */
const D0 = Date.UTC(2026, 4, 18);
const at = (day: number, hour: number) => D0 + day * DAY + hour * HOUR;

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

const cfg = (over: Partial<UserConfig> = {}): UserConfig => ({ ...defaultConfig(), ...over });
const fixed = (id: string, start: number, end: number, note = 'Calendar: busy'): Block => ({
  id, start, end, type: 'fixed', taskId: null, locked: true, note,
});
const minutesFor = (schedule: Block[], id: string, before = Infinity) =>
  schedule
    .filter((b) => b.type === 'work' && b.taskId === id && b.end <= before)
    .reduce((m, b) => m + (b.end - b.start) / MIN, 0);

describe('deadline work gets the time the day really has', () => {
  it('finishes a quest due tomorrow before work due in weeks keeps its slots', () => {
    // Two 5-hour evenings. The budget granted the portfolio its 300 minutes,
    // the constructor fit 250 of them, and the essays kept 200 minutes.
    const c = cfg({ workingHours: { startHour: 16, endHour: 21 }, horizonDays: 3 });
    const tasks = [
      task('portfolio', { remainingMin: 300, totalMin: 300, deadline: at(1, 23.99) }),
      task('essay', { remainingMin: 300, totalMin: 300, deadline: at(23, 23.99), cognitiveLoad: 0.7 }),
      task('grant', { remainingMin: 600, totalMin: 600, deadline: at(8, 23.99) }),
    ];
    const { schedule, feasibilityReport } = generateSchedule(tasks, [], c, at(0, 16));
    expect(minutesFor(schedule, 'portfolio', at(1, 23.99))).toBeGreaterThanOrEqual(299.5);
    expect(feasibilityReport.issues.find((i) => i.taskId === 'portfolio')).toBeUndefined();
  });

  it("doesn't let a hopeless quest take the only slot a small one could finish in", () => {
    // 16:18 on a day ending at 18:00, routines until 17:39: 21 free minutes.
    // A 300-min problem set due at 20:00 can't make it; the 10-min task can.
    const now = at(0, 16.3);
    const routines = [
      fixed('r1', now, now + 37 * MIN, 'Daily: Piano'),
      fixed('r2', now + 37 * MIN, now + 66 * MIN, 'Daily: Flashcards'),
      fixed('r3', now + 68 * MIN, now + 81 * MIN, 'Daily: Journal'),
    ];
    const tasks = [
      task('pset', { remainingMin: 300, totalMin: 300, deadline: at(0, 20), cognitiveLoad: 0.7 }),
      task('design', { remainingMin: 90, totalMin: 90, deadline: at(0, 23.98) }),
      task('receipts', { remainingMin: 10, totalMin: 10, deadline: at(0, 23.98), cognitiveLoad: 0.3, category: 'admin' }),
    ];
    const { schedule } = generateSchedule(tasks, routines, cfg({ horizonDays: 1 }), now);
    expect(minutesFor(schedule, 'receipts')).toBe(10);
  });

  it('gives up on MED quests before a HIGH one when not everything fits', () => {
    // 16 hours due within 48 with ~10 free: finish the HIGH chem IA.
    const c = cfg({ workingHours: { startHour: 15.5, endHour: 21.5 }, horizonDays: 3 });
    const tasks = [
      task('chem', { remainingMin: 420, totalMin: 420, deadline: at(1, 23.99), importance: 0.9, urgencyMultiplier: 1.4, cognitiveLoad: 0.9 }),
      task('physics', { remainingMin: 300, totalMin: 300, deadline: at(2, 23.99), importance: 0.8, cognitiveLoad: 0.8 }),
      task('spanish', { remainingMin: 240, totalMin: 240, deadline: at(2, 23.99), importance: 0.7 }),
    ];
    const { schedule, feasibilityReport } = generateSchedule(tasks, [], c, at(0, 15.5));
    expect(minutesFor(schedule, 'chem', at(1, 23.99))).toBeGreaterThanOrEqual(419.5);
    expect(feasibilityReport.issues.map((i) => i.taskId)).not.toContain('chem');
    expect(feasibilityReport.issues.length).toBeGreaterThan(0);
  });

  it('keeps a quest due at 17:00 ahead of work due later the same day', () => {
    const c = cfg({ horizonDays: 1 });
    const tasks = [
      task('portfolio', { remainingMin: 60, totalMin: 90, deadline: at(0, 17), cognitiveLoad: 0.8 }),
      task('receipts', { remainingMin: 10, totalMin: 10, deadline: at(0, 17), cognitiveLoad: 0.4, category: 'admin' }),
      task('dentist', { remainingMin: 30, totalMin: 30, deadline: at(14, 23.99), cognitiveLoad: 0.2, category: 'admin' }),
      task('landlord', { remainingMin: 20, totalMin: 20, deadline: at(14, 23.99), cognitiveLoad: 0.4, category: 'admin' }),
    ];
    const { schedule } = generateSchedule(tasks, [], c, at(0, 15.2));
    expect(minutesFor(schedule, 'receipts', at(0, 17))).toBe(10);
    expect(minutesFor(schedule, 'portfolio', at(0, 17))).toBe(60);
  });
});

describe('check-in cap', () => {
  it("caps today, not tomorrow, when the plan is made after today's hours", () => {
    // Monday 22:52, "2 hours available": Tuesday used to get the cap.
    const c = cfg({ horizonDays: 2, todayCapMin: 120 });
    const tasks = [task('report', { remainingMin: 300, totalMin: 300, deadline: at(1, 23.99) })];
    const { schedule } = generateSchedule(tasks, [], c, at(0, 22.87));
    expect(minutesFor(schedule, 'report', at(1, 23.99))).toBeGreaterThanOrEqual(299.5);
  });
});

describe('replan after a skipped block', () => {
  it('moves stable work due later aside for a quest due today', () => {
    // The evening is full of next week's essay; the lab report due tonight
    // lost its block to a skip. Reflow used to fill only gaps (there were none).
    const c = cfg({ workingHours: { startHour: 16, endHour: 21 }, horizonDays: 2 });
    const now = at(0, 16);
    const essayBlocks: Block[] = [0, 1, 2, 3, 4].map((k) => ({
      id: `blk-${k + 1}`, start: now + k * 60 * MIN, end: now + (k * 60 + 50) * MIN,
      type: 'work', taskId: 'essay', locked: false, note: null,
    }));
    const tasks = [
      task('lab', { remainingMin: 60, totalMin: 60, deadline: at(0, 23.99) }),
      task('essay', { remainingMin: 400, totalMin: 400, deadline: at(9, 23.99) }),
    ];
    const { schedule, feasibilityReport } = replan(essayBlocks, tasks, c, now);
    expect(minutesFor(schedule, 'lab', at(0, 23.99))).toBe(60);
    expect(feasibilityReport.issues).toHaveLength(0);
  });

  it('still moves nothing when nothing changed', () => {
    const c = cfg({ workingHours: { startHour: 16, endHour: 21 }, horizonDays: 3 });
    const now = at(0, 16);
    const tasks = [
      task('lab', { remainingMin: 120, totalMin: 120, deadline: at(1, 23.99) }),
      task('essay', { remainingMin: 400, totalMin: 400, deadline: at(9, 23.99) }),
    ];
    const first = generateSchedule(tasks, [], c, now).schedule;
    const again = replan(first, tasks, c, now).schedule;
    const key = (s: Block[]) => s.filter((b) => b.type === 'work').map((b) => `${b.taskId}@${b.start}-${b.end}`).join(',');
    expect(key(again)).toBe(key(first));
  });
});

describe('light days go in their best hours', () => {
  const owl = cfg({ workingHours: { startHour: 12, endHour: 24 }, energyCurve: CHRONOTYPE_CURVES.owl, horizonDays: 3 });
  const heavy = task('code', { remainingMin: 100, totalMin: 100, cognitiveLoad: 0.8 });

  it("puts a night owl's heavy work in the evening on a future day", () => {
    const now = at(0, 10);
    const tomorrow = buildDayInfo(owl, now, [])[1]!;
    const window = focusWindow({ day: tomorrow, quotas: [{ task: heavy, targetMin: 100 }] }, owl, now);
    expect(window).not.toBeNull();
    expect(window![0]!.start).toBeGreaterThanOrEqual(at(1, 18));
  });

  it("leaves today alone: today's work starts now", () => {
    const now = at(0, 12);
    const today = buildDayInfo(owl, now, [])[0]!;
    expect(focusWindow({ day: today, quotas: [{ task: heavy, targetMin: 100 }] }, owl, now)).toBeNull();
  });
});

describe('a quest short by less than a minute', () => {
  it('is planned, not thrown on', () => {
    // A learned estimate leaves fractions: 60.6 minutes left, 60 placed. The
    // 0.6 still owed went looking for a donor, settled the day, took nothing
    // (under a whole minute), and the rebuild then read a receiver that was
    // never set: "Cannot read properties of undefined", and no plan at all.
    const c = cfg({ workingHours: { startHour: 9, endHour: 17 }, horizonDays: 3 });
    const tasks = [
      task('report', { remainingMin: 60.6, totalMin: 60.6, deadline: at(0, 16) }),
      task('essay', { remainingMin: 240, totalMin: 240, deadline: at(2, 23.99) }),
    ];
    const r = generateSchedule(tasks, [], c, at(0, 9));
    expect(minutesFor(r.schedule, 'report', at(0, 16))).toBeGreaterThanOrEqual(60);
    expect(minutesFor(r.schedule, 'essay')).toBeGreaterThanOrEqual(239);
  });
});

describe('capacity and estimates', () => {
  it('counts the long break in a long free stretch', () => {
    const p = defaultConfig().breakPolicy;
    expect(workableMin(120, p)).toBe(100);
    // 8 short breaks leave 430; two of them are long ones (+20 each).
    expect(workableMin(510, p)).toBe(390);
  });

  it('keeps an overrunning quest in the plan until it is marked done', () => {
    expect(remainingFor(60, 20)).toBe(40);
    expect(remainingFor(60, 60)).toBe(15);
    expect(remainingFor(240, 300)).toBe(60);
    expect(remainingFor(900, 900)).toBe(120);
  });
});
