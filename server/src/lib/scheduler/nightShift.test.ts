/**
 * Working hours that run past midnight (22–06, 14–02).
 *
 * Settings takes the start and end hour independently, and with the end
 * before the start every day's window came out empty: the planner planned
 * nothing, placed no routines, and said nothing. Each case here is a way
 * that night can go wrong.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { buildDayInfo, isToday, todayCap } from './budget.js';
import { focusWindow } from './constructor.js';
import { defaultConfig } from './config.js';
import { questToTask, type QuestLike } from './adapter.js';
import { inferPreferredHour, placeDailyFillers } from './dailyFiller.js';
import { computeInsights, suggestWorkingHours } from './insights.js';
import { dayKey } from './tz.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 18 May 2026, 00:00 UTC; configs here have no tzOffsetMin, so hours are UTC hours. */
const D0 = Date.UTC(2026, 4, 18);
const at = (day: number, hour: number) => D0 + day * DAY + hour * HOUR;

const NIGHT = { startHour: 22, endHour: 6 };
const OWL = { startHour: 14, endHour: 2 };

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

const cfg = (over: Partial<UserConfig> = {}): UserConfig => ({ ...defaultConfig(), workingHours: NIGHT, ...over });
const fixed = (id: string, start: number, end: number, note = 'Calendar: busy'): Block => ({
  id, start, end, type: 'fixed', taskId: null, locked: true, note,
});
const work = (schedule: Block[], id?: string) =>
  schedule.filter((b) => b.type === 'work' && (id === undefined || b.taskId === id)).sort((a, b) => a.start - b.start);
const minutes = (blocks: Block[]) => blocks.reduce((m, b) => m + (b.end - b.start) / MIN, 0);

/** Inside one night's 22–06 window: starts at or after 22:00, ends by 06:00 the next morning. */
function insideNight(b: Block): boolean {
  const sinceTen = (((b.start - D0) / HOUR - 22) % 24 + 24) % 24;
  return sinceTen + (b.end - b.start) / HOUR <= 8 + 1e-6;
}

describe('a working window that runs past midnight', () => {
  it('gives every night of the horizon a day, on the date it starts', () => {
    // Monday 15:00, hours 22–06. This used to return no days at all.
    const days = buildDayInfo(cfg({ horizonDays: 3 }), at(0, 15), []);
    expect(days).toHaveLength(3);
    expect(days.map((d) => [d.workStart, d.workEnd])).toEqual([
      [at(0, 22), at(1, 6)],
      [at(1, 22), at(2, 6)],
      [at(2, 22), at(3, 6)],
    ]);
    expect(days.map((d) => d.key)).toEqual([dayKey(at(0, 12)), dayKey(at(1, 12)), dayKey(at(2, 12))]);
    expect(days.every((d) => d.freeMinutes === 480)).toBe(true);
  });

  it('plans the work, with blocks on both sides of midnight', () => {
    const tasks = [
      task('report', { remainingMin: 200, totalMin: 200, deadline: at(1, 5) }),
      task('essay', { remainingMin: 180, totalMin: 180, deadline: at(2, 5.5), cognitiveLoad: 0.8 }),
    ];
    const { schedule, feasibilityReport } = generateSchedule(tasks, [], cfg({ horizonDays: 3 }), at(0, 15));
    expect(feasibilityReport.issues).toEqual([]);
    expect(minutes(work(schedule, 'report'))).toBeGreaterThanOrEqual(199.5);
    expect(minutes(work(schedule, 'essay'))).toBeGreaterThanOrEqual(179.5);
    // 200 minutes before Tuesday 05:00 can't all sit before midnight.
    expect(work(schedule, 'report').some((b) => b.start >= at(1, 0))).toBe(true);
    for (const b of work(schedule)) {
      expect(insideNight(b)).toBe(true);
      expect(b.end).toBeLessThanOrEqual(tasks.find((t) => t.id === b.taskId)!.deadline);
    }
  });

  it('routes around a meeting that itself crosses midnight', () => {
    const night = fixed('class', at(0, 23.5), at(1, 0.75));
    const { schedule } = generateSchedule(
      [task('report', { remainingMin: 240, totalMin: 240, deadline: at(1, 6) })],
      [night],
      cfg({ horizonDays: 2 }),
      at(0, 15),
    );
    const blocks = work(schedule);
    expect(minutes(blocks)).toBeGreaterThanOrEqual(239.5);
    for (const b of blocks) expect(b.end <= night.start || b.start >= night.end).toBe(true);
  });

  it('does the same for an afternoon that runs into the night (14–02)', () => {
    const c = cfg({ workingHours: OWL, horizonDays: 2 });
    const days = buildDayInfo(c, at(0, 9), []);
    expect(days.map((d) => [d.workStart, d.workEnd])).toEqual([
      [at(0, 14), at(1, 2)],
      [at(1, 14), at(2, 2)],
    ]);
    // 13 hours of work due at 01:30: needs the hours after midnight.
    const { schedule } = generateSchedule(
      [task('thesis', { remainingMin: 480, totalMin: 480, deadline: at(1, 1.5), maxChunkMin: 90 })],
      [],
      c,
      at(0, 9),
    );
    expect(minutes(work(schedule, 'thesis').filter((b) => b.end <= at(1, 1.5)))).toBeGreaterThanOrEqual(479.5);
  });
});

describe('01:00, mid-session: it is still last night', () => {
  const now = at(1, 1); // Tuesday 01:00, inside Monday's 22–06

  it("starts with the rest of tonight's window, as yesterday's day", () => {
    const days = buildDayInfo(cfg({ horizonDays: 3 }), now, []);
    expect(days).toHaveLength(3);
    expect([days[0]!.workStart, days[0]!.workEnd]).toEqual([now, at(1, 6)]);
    expect(days[0]!.key).toBe(dayKey(at(0, 12)));
    expect(days[0]!.midnightUtc).toBe(at(0, 0));
    expect([days[1]!.workStart, days[1]!.workEnd]).toEqual([at(1, 22), at(2, 6)]);
    expect(isToday(days[0]!, now, 0)).toBe(true);
    expect(isToday(days[1]!, now, 0)).toBe(true); // tonight's session is on today's date
    expect(isToday(days[2]!, now, 0)).toBe(false);
  });

  it('puts work due at 05:00 into the hours that are left tonight', () => {
    const { schedule, feasibilityReport } = generateSchedule(
      [task('handover', { remainingMin: 120, totalMin: 120, deadline: at(1, 5) })],
      [],
      cfg({ horizonDays: 3 }),
      now,
    );
    expect(feasibilityReport.issues).toEqual([]);
    const blocks = work(schedule, 'handover');
    expect(minutes(blocks)).toBeGreaterThanOrEqual(119.5);
    expect(blocks[0]!.start).toBeGreaterThanOrEqual(now);
    expect(blocks[blocks.length - 1]!.end).toBeLessThanOrEqual(at(1, 5));
  });

  it("holds the check-in's minutes to this session, not the next", () => {
    const c = cfg({ horizonDays: 3, todayCapMin: 60 });
    const days = buildDayInfo(c, now, []);
    expect(todayCap(days, now, c)).toBe(60);
    const { schedule } = generateSchedule(
      [task('big', { remainingMin: 600, totalMin: 600, deadline: at(3, 5), maxChunkMin: 90 })],
      [],
      c,
      now,
    );
    const tonight = work(schedule).filter((b) => b.start < at(1, 6));
    const nextNight = work(schedule).filter((b) => b.start >= at(1, 22) && b.start < at(2, 6));
    expect(minutes(tonight)).toBeGreaterThan(0);
    expect(minutes(tonight)).toBeLessThanOrEqual(60);
    expect(minutes(nextNight)).toBeGreaterThan(60);
  });

  it('caps the session ahead when the check-in comes before it (07:00)', () => {
    const c = cfg({ horizonDays: 3, todayCapMin: 60 });
    const morning = at(1, 7);
    expect(todayCap(buildDayInfo(c, morning, []), morning, c)).toBe(60);
  });

  it("keeps momentum: tonight's work starts now, not at a better hour", () => {
    // A curve that is sharpest at 04:00–06:00. A future night may wait for
    // it; the session the person is sitting in may not.
    const c = cfg({ horizonDays: 3, energyCurve: (h) => (h >= 4 && h < 6 ? 0.95 : 0.3) });
    const heavy = task('heavy', { cognitiveLoad: 0.9 });
    const tonight = buildDayInfo(c, now, [])[0]!;
    expect(focusWindow({ day: tonight, quotas: [{ task: heavy, targetMin: 60 }] }, c, now)).toBeNull();
  });
});

describe('the focus window on a night that crosses midnight', () => {
  it('reads the energy curve at 03:00, not at "hour 27"', () => {
    // Sharpest 02:00–05:00. Without wrapping the hour, the after-midnight
    // half of the window was sampled at 26–30, which no curve has energy for,
    // and the work stayed at 22:00.
    const c = cfg({ horizonDays: 3, energyCurve: (h) => (h >= 2 && h < 5 ? 0.95 : 0.3) });
    const heavy = task('heavy', { cognitiveLoad: 0.9 });
    const now = at(0, 15);
    const tomorrowNight = buildDayInfo(c, now, [])[1]!;
    const window = focusWindow({ day: tomorrowNight, quotas: [{ task: heavy, targetMin: 100 }] }, c, now);
    expect(window).not.toBeNull();
    expect(window![0]!.start).toBeGreaterThanOrEqual(at(2, 0));
    expect(window![0]!.start).toBeLessThan(at(2, 6));
  });
});

describe('Not Today for someone who works 22–06', () => {
  const quest = (over: Partial<QuestLike> = {}): QuestLike => ({
    id: 'q', title: 'Inventory count', estimatedMinutes: 60, mentalLoad: 5, impact: 5,
    deadline: new Date(at(3, 5)), status: 'NOT_TODAY', tags: [],
    createdAt: new Date(D0 - DAY), updatedAt: new Date(D0),
    ...over,
  });

  it('waved off at 23:00, it waits for the next session, not for midnight', () => {
    const now = at(0, 23);
    const t = questToTask(quest(), {}, now, 0, null, NIGHT);
    expect(t.notBefore).toBe(at(1, 6));
    const { schedule } = generateSchedule([t], [], cfg({ horizonDays: 3 }), now);
    const blocks = work(schedule, 'q');
    expect(minutes(blocks)).toBeGreaterThanOrEqual(59.5);
    // Nothing in the rest of tonight (it used to come back at 00:00)…
    expect(blocks.every((b) => b.start >= at(1, 22))).toBe(true);
  });

  it('waved off at 01:00, it is back the same evening at 22:00', () => {
    // The next local midnight is 23 hours away and would skip that session.
    const now = at(1, 1);
    const t = questToTask(quest(), {}, now, 0, null, NIGHT);
    expect(t.notBefore).toBe(at(1, 6));
    const { schedule } = generateSchedule([t], [], cfg({ horizonDays: 3 }), now);
    const blocks = work(schedule, 'q');
    expect(blocks[0]!.start).toBeGreaterThanOrEqual(at(1, 22));
    expect(blocks[0]!.start).toBeLessThan(at(2, 6));
  });

  it('still means the next local midnight for ordinary hours, and when no hours are passed', () => {
    const now = at(0, 15);
    expect(questToTask(quest(), {}, now, 0, null, { startHour: 9, endHour: 18 }).notBefore).toBe(at(1, 0));
    expect(questToTask(quest(), {}, now, 0).notBefore).toBe(at(1, 0));
  });
});

describe('replanning a night', () => {
  it('moves nothing when nothing changed', () => {
    const c = cfg({ horizonDays: 3 });
    const tasks = [
      task('report', { remainingMin: 200, totalMin: 200, deadline: at(2, 5) }),
      task('chores', { remainingMin: 40, totalMin: 40, cognitiveLoad: 0.2, deadline: at(3, 5) }),
    ];
    const now = at(0, 23);
    const first = generateSchedule(tasks, [], c, now).schedule;
    const again = replan(first, tasks, c, now).schedule;
    const key = (b: Block) => `${b.taskId}|${b.start}|${b.end}`;
    expect(work(again).map(key)).toEqual(work(first).map(key));
  });
});

describe('routines on a night shift', () => {
  const place = (now: number, fillers: Array<{ id: string; name: string; durationMin: number; preferredHour: number | null }>, horizonDays = 2) =>
    placeDailyFillers({ fillers, now, horizonDays, workingHours: NIGHT, existingFixed: [] });

  it('places them at all (every day used to be skipped)', () => {
    const placed = place(at(0, 15), [{ id: 'stretch', name: 'Stretch', durationMin: 10, preferredHour: null }]);
    expect(placed).toHaveLength(2);
    expect(placed[0]!.start).toBeGreaterThanOrEqual(at(0, 22));
    expect(placed[0]!.end).toBeLessThanOrEqual(at(1, 6));
    expect(placed[1]!.start).toBeGreaterThanOrEqual(at(1, 22));
  });

  it('spreads untimed routines across the whole night, past midnight', () => {
    const placed = place(at(0, 15), [
      { id: 'a', name: 'Stretch', durationMin: 10, preferredHour: null },
      { id: 'b', name: 'Water', durationMin: 10, preferredHour: null },
      { id: 'c', name: 'Log', durationMin: 10, preferredHour: null },
    ], 1);
    // Thirds of 22:00–06:00: 22:00, 00:40, 03:20 (it used to stop at 24:00).
    expect(placed.map((b) => b.start)).toEqual([at(0, 22), at(1, 0) + 40 * MIN, at(1, 3) + 20 * MIN]);
  });

  it('reads 02:00 as tonight after midnight, and 08:00 as the morning before the shift', () => {
    const placed = place(at(0, 15), [
      { id: 'meal', name: 'Shift meal', durationMin: 30, preferredHour: 2 },
      { id: 'meds', name: 'Meds', durationMin: 5, preferredHour: 8 },
    ]);
    const starts = (id: string) => placed.filter((b) => b.note === `Daily: ${id}`).map((b) => b.start);
    expect(starts('Shift meal')).toEqual([at(1, 2), at(2, 2)]);
    // Monday 08:00 is long gone at 15:00; Tuesday's stands.
    expect(starts('Meds')).toEqual([at(1, 8)]);
  });

  it('opened at 01:00, tonight still gets its 02:00 meal', () => {
    const placed = place(at(1, 1), [{ id: 'meal', name: 'Shift meal', durationMin: 30, preferredHour: 2 }]);
    expect(placed.map((b) => b.start)).toEqual([at(1, 2), at(2, 2)]);
  });

  it('puts an "end of day" routine at the end of the night', () => {
    expect(inferPreferredHour('End of day handover', NIGHT)).toBe(5);
    expect(inferPreferredHour('End of day handover', OWL)).toBe(1);
    expect(inferPreferredHour('End of day handover', { startHour: 9, endHour: 18 })).toBe(17);
    const placed = place(at(0, 15), [{ id: 'h', name: 'End of day handover', durationMin: 15, preferredHour: null }], 1);
    expect(placed[0]!.start).toBe(at(1, 5));
  });
});

describe('insights for hours that run past midnight', () => {
  const now = at(0, 15);
  const base = { schedule: [], tasks: [], quests: [], calendarBlocks: [], now, calibration: null };

  it('counts an 8-hour night as 8 hours, and says when routines crowd it', () => {
    const c = cfg({ tzOffsetMin: 0 });
    // Five hours of routines inside every night.
    const routineBlocks = Array.from({ length: c.horizonDays }, (_, d) => fixed(`r${d}`, at(d, 23), at(d + 1, 4), 'Daily: Rounds'));
    const r = computeInsights({ ...base, routineBlocks, config: c });
    expect(r.capacity.working).toBe(480);
    expect(r.capacity.routines).toBe(300);
    expect(r.notes.join(' ')).toMatch(/Daily routines take 5h of your 8h day/);
  });

  it('does not invent a suggestion from a negative day length', () => {
    // A daytime job, wholly outside 22–06. "60% of −16 hours" was true of every day.
    const job = Array.from({ length: 5 }, (_, d) => fixed(`j${d}`, at(d, 9), at(d, 17)));
    expect(suggestWorkingHours(job, cfg({ tzOffsetMin: 0 }), now)).toBeNull();
  });

  it('moves a late start later but keeps the night: 14–02 with a job until 21:30', () => {
    const c = cfg({ tzOffsetMin: 0, workingHours: OWL });
    const job = Array.from({ length: 5 }, (_, d) => fixed(`j${d}`, at(d, 14), at(d, 21.5)));
    const s = suggestWorkingHours(job, c, now)!;
    expect(s).not.toBeNull();
    expect(s.startHour).toBe(22);
    expect(s.endHour).toBe(2);
  });

  it('says why nothing is planned when the hours are empty', () => {
    const c = cfg({ tzOffsetMin: 0, workingHours: { startHour: 18, endHour: 18 } });
    expect(generateSchedule([task('a')], [], c, now).schedule.filter((b) => b.type === 'work')).toEqual([]);
    const r = computeInsights({ ...base, routineBlocks: [], config: c });
    expect(r.notes[0]).toMatch(/start and end at the same time/);
    expect(r.hoursSuggestion).toBeNull();
  });
});
