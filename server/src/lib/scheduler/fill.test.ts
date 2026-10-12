/**
 * The two promises the owner asked for on 2026-10-11, and the slider that
 * goes with them: "make the scheduler always fill the time available, and
 * always add 5 minutes between each quest", with the available time set from
 * the Route. They are config (`gapMin`, `fillDays`, `todayEndsAt`), switched
 * on for everyone in lib/userConfig.ts; the tests elsewhere in this folder
 * run without them.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { applyEdit } from './edits.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 09:00 UTC, the start of working hours. */
const NOW = Date.UTC(2026, 4, 18, 9, 0, 0, 0);
const MIDNIGHT = Date.UTC(2026, 4, 18);
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

const cfg = (overrides: Partial<UserConfig> = {}): UserConfig => ({
  ...defaultConfig(),
  tzOffsetMin: 0,
  gapMin: 5,
  fillDays: true,
  mealGap: undefined,
  ...overrides,
});
const mins = (b: { start: number; end: number }) => (b.end - b.start) / MIN;
const dayOf = (t: number) => Math.floor((t - MIDNIGHT) / DAY);
const workOf = (schedule: Block[], day?: number) =>
  schedule.filter((b) => b.type === 'work' && b.taskId && (day === undefined || dayOf(b.start) === day)).sort((a, b) => a.start - b.start);
const gaps = (work: Block[]) => work.slice(1).map((b, i) => (b.start - work[i]!.end) / MIN);
const clock = (t: number) => new Date(t).toISOString().slice(11, 16);
/** Random days in the last test. Raise it by hand when changing pack.ts. */
const SEEDS = 80;

/** A week's worth: more than any one day holds, in mixed sizes and kinds. */
const pile = (): Task[] => [
  task('essay', { remainingMin: 300, totalMin: 300, cognitiveLoad: 0.8, maxChunkMin: 90, deadline: NOW + 6 * DAY }),
  task('report', { remainingMin: 240, totalMin: 240, cognitiveLoad: 0.7, maxChunkMin: 90, deadline: NOW + 4 * DAY }),
  task('reading', { remainingMin: 180, totalMin: 180, cognitiveLoad: 0.5, category: 'learning', deadline: NOW + 9 * DAY }),
  task('slides', { remainingMin: 150, totalMin: 150, cognitiveLoad: 0.6, category: 'creative', deadline: NOW + 5 * DAY }),
  task('email', { remainingMin: 20, totalMin: 20, cognitiveLoad: 0.2, category: 'comms', deadline: NOW + 2 * DAY }),
  task('forms', { remainingMin: 45, totalMin: 45, cognitiveLoad: 0.2, tediousness: 0.8, category: 'admin', deadline: NOW + 3 * DAY }),
  task('errand', { remainingMin: 30, totalMin: 30, cognitiveLoad: 0.2, category: 'admin', deadline: NOW + 12 * DAY }),
  task('practice', { remainingMin: 200, totalMin: 200, cognitiveLoad: 0.5, category: 'learning', deadline: NOW + 13 * DAY }),
];

function expectSound(schedule: Block[], tasks: Task[]) {
  const work = workOf(schedule);
  for (let i = 1; i < work.length; i += 1) expect(work[i]!.start).toBeGreaterThanOrEqual(work[i - 1]!.end);
  for (const t of tasks) {
    const placed = work.filter((b) => b.taskId === t.id).reduce((m, b) => m + mins(b), 0);
    expect(placed, `${t.id} placed`).toBeLessThanOrEqual(t.remainingMin + 0.5);
    for (const b of work.filter((x) => x.taskId === t.id)) expect(b.end, `${t.id} by its deadline`).toBeLessThanOrEqual(t.deadline);
  }
}

describe('a fixed gap between blocks', () => {
  it('puts exactly five minutes between every two blocks of a day', () => {
    const { schedule } = generateSchedule(pile(), [], cfg(), NOW);
    for (let d = 0; d < 4; d += 1) {
      const work = workOf(schedule, d);
      if (work.length < 2) continue;
      expect(gaps(work), `day ${d}: ${work.map((b) => `${clock(b.start)}-${clock(b.end)}`).join(' ')}`).toEqual(work.slice(1).map(() => 5));
    }
    expectSound(schedule, pile());
  });

  it('starts the day now', () => {
    const { schedule } = generateSchedule(pile(), [], cfg(), NOW);
    expect(workOf(schedule, 0)[0]!.start).toBe(NOW);
  });

  it('keeps the gap either side of a pinned block', () => {
    const first = generateSchedule(pile(), [], cfg(), NOW).schedule;
    const pin: Block = { id: 'pin', start: at(14), end: at(15), type: 'work', taskId: 'reading', locked: true, note: null };
    const { schedule } = replan([...first.filter((b) => b.end <= at(14) || b.start >= at(15)), pin], pile(), cfg(), NOW);
    const work = workOf(schedule, 0);
    const i = work.findIndex((b) => b.id === 'pin');
    expect(i).toBeGreaterThan(0);
    expect(work[i]!.start).toBe(at(14));
    expect((work[i]!.start - work[i - 1]!.end) / MIN).toBeGreaterThanOrEqual(5);
    expect((work[i + 1]!.start - work[i]!.end) / MIN).toBe(5);
  });
});

describe('filling the days in order', () => {
  it('fills today to the end of working hours when there is work for it', () => {
    const { schedule, feasibilityReport } = generateSchedule(pile(), [], cfg(), NOW);
    const today = workOf(schedule, 0);
    expect(today[0]!.start).toBe(NOW);
    const end = today[today.length - 1]!.end;
    expect(end, `ends ${clock(end)}`).toBeLessThanOrEqual(at(18));
    expect(end, `ends ${clock(end)}`).toBeGreaterThanOrEqual(at(18) - 15 * MIN);
    expect(feasibilityReport.issues).toEqual([]);
  });

  it('fills tomorrow too before touching the day after', () => {
    const { schedule } = generateSchedule(pile(), [], cfg(), NOW);
    const tomorrow = workOf(schedule, 1);
    expect(tomorrow[0]!.start).toBe(at(9, 1));
    const total = pile().reduce((m, t) => m + t.remainingMin, 0);
    const placed = workOf(schedule).reduce((m, b) => m + mins(b), 0);
    expect(placed).toBeGreaterThanOrEqual(total - 1);
    // All of it sits on as few days as it fits in: about eight working hours a day.
    const days = new Set(workOf(schedule).map((b) => dayOf(b.start)));
    expect([...days].sort()).toEqual([0, 1, 2]);
  });

  it('puts a small pile on today alone, even when nothing is due for days', () => {
    const tasks = [task('a', { remainingMin: 90, totalMin: 90 }), task('b', { remainingMin: 60 }), task('c', { remainingMin: 45, totalMin: 45, deadline: NOW + 12 * DAY })];
    const { schedule } = generateSchedule(tasks, [], cfg(), NOW);
    expect(workOf(schedule).every((b) => dayOf(b.start) === 0)).toBe(true);
    expect(workOf(schedule).reduce((m, b) => m + mins(b), 0)).toBe(195);
  });

  it('fills up to a fixed block and carries straight on after it', () => {
    const lunch: Block = { id: 'fx', start: at(12), end: at(13), type: 'fixed', taskId: null, locked: true, note: 'Lunch with Sam' };
    const { schedule } = generateSchedule(pile(), [lunch], cfg(), NOW);
    const today = workOf(schedule, 0);
    const before = today.filter((b) => b.end <= at(12));
    const after = today.filter((b) => b.start >= at(13));
    expect(before[before.length - 1]!.end).toBeGreaterThanOrEqual(at(12) - 15 * MIN);
    expect(after[0]!.start).toBe(at(13));
    expect(today.some((b) => b.start < at(13) && b.end > at(12))).toBe(false);
  });

  it('still keeps a lunch half hour when the config asks for one', () => {
    const { schedule } = generateSchedule(pile(), [], cfg({ mealGap: { fromHour: 11.5, toHour: 14, minutes: 30 } }), NOW);
    const today = workOf(schedule, 0);
    const rests = gaps(today);
    expect(rests.filter((g) => g >= 30).length).toBe(1);
    expect(rests.filter((g) => g !== 5 && g < 30)).toEqual([]);
  });
});

describe('available time', () => {
  it('ends today when the person said, not at the end of working hours', () => {
    const { schedule } = generateSchedule(pile(), [], cfg({ todayEndsAt: NOW + 3 * HOUR }), NOW);
    const today = workOf(schedule, 0);
    const end = today[today.length - 1]!.end;
    expect(end).toBeLessThanOrEqual(NOW + 3 * HOUR);
    expect(end).toBeGreaterThanOrEqual(NOW + 3 * HOUR - 15 * MIN);
    expect(workOf(schedule, 1)[0]!.start).toBe(at(9, 1));
  });

  it('can run past working hours, and start before them', () => {
    const early = at(7);
    const { schedule } = generateSchedule(pile(), [], cfg({ todayEndsAt: at(21) }), early);
    const today = workOf(schedule, 0);
    expect(today[0]!.start).toBe(early);
    const end = today[today.length - 1]!.end;
    expect(end).toBeLessThanOrEqual(at(21));
    expect(end).toBeGreaterThanOrEqual(at(21) - 15 * MIN);
  });

  it('is over for today once that time has passed', () => {
    const { schedule } = generateSchedule(pile(), [], cfg({ todayEndsAt: at(14) }), at(15));
    expect(workOf(schedule, 0)).toEqual([]);
    expect(workOf(schedule, 1)[0]!.start).toBe(at(9, 1));
  });

  it('is forgotten by the next working day', () => {
    const { schedule } = generateSchedule(pile(), [], cfg({ todayEndsAt: at(14) }), at(8, 1));
    const first = workOf(schedule)[0]!;
    expect(first.start).toBe(at(9, 1));
    const day = workOf(schedule, 1);
    expect(day[day.length - 1]!.end).toBeGreaterThanOrEqual(at(18, 1) - 15 * MIN);
  });

  it('set in the small hours, is an extra stretch: the working hours still open afterwards', () => {
    const night = at(1);
    const { schedule } = generateSchedule(pile(), [], cfg({ todayEndsAt: at(3) }), night);
    const today = workOf(schedule, 0);
    const early = today.filter((b) => b.end <= at(3));
    const hours = today.filter((b) => b.start >= at(9));
    expect(early[0]!.start).toBe(night);
    expect(early[early.length - 1]!.end).toBeGreaterThanOrEqual(at(3) - 15 * MIN);
    expect(today.filter((b) => b.start < at(9) && b.end > at(3))).toEqual([]);
    expect(hours[0]!.start).toBe(at(9));
    expect(hours[hours.length - 1]!.end).toBeGreaterThanOrEqual(at(18) - 15 * MIN);
  });

  it('none at all plans nothing today', () => {
    const { schedule } = generateSchedule(pile(), [], cfg({ todayEndsAt: at(11) }), at(11));
    expect(workOf(schedule, 0)).toEqual([]);
  });
});

describe('replanning a filled day', () => {
  it('uses the time a finished quest gives back, with tomorrow\'s work if need be', () => {
    const first = generateSchedule(pile(), [], cfg(), NOW).schedule;
    // An hour in, the first quest of the day is finished early.
    const done = workOf(first, 0)[0]!.taskId!;
    const later = at(10);
    const tasks = pile().map((t) => (t.id === done ? { ...t, status: 'done' as const, remainingMin: 0 } : t));
    const { schedule } = replan(first, tasks, cfg(), later);
    const ahead = workOf(schedule, 0).filter((b) => b.end > later);
    expect(ahead.every((b) => b.taskId !== done)).toBe(true);
    expect(ahead[0]!.start).toBeLessThanOrEqual(later + 5 * MIN);
    const end = ahead[ahead.length - 1]!.end;
    expect(end, `ends ${clock(end)}`).toBeGreaterThanOrEqual(at(18) - 15 * MIN);
    const fresh = ahead.filter((b) => b.start >= later);
    expect(gaps(fresh)).toEqual(fresh.slice(1).map(() => 5));
    expectSound(schedule.filter((b) => b.end > later), tasks);
  });

  it('gives the same plan twice running', () => {
    const first = generateSchedule(pile(), [], cfg(), NOW).schedule;
    const again = replan(first, pile(), cfg(), NOW).schedule;
    const shape = (s: Block[]) => workOf(s).map((b) => `${b.taskId} ${b.start} ${b.end}`);
    expect(shape(again)).toEqual(shape(first));
  });
});

/** Blocks of any kind on a day, in time order. */
const allOf = (schedule: Block[], day: number) => schedule.filter((b) => dayOf(b.start) === day).sort((a, b) => a.start - b.start);

/** Runs of work on a day: minutes worked between pauses of at least `pause` minutes. */
function runsOf(schedule: Block[], day: number, pause: number): number[] {
  const runs: number[] = [];
  let run = 0;
  let last = -Infinity;
  for (const b of workOf(schedule, day)) {
    if (b.start - last >= pause * MIN && run > 0) {
      runs.push(run);
      run = 0;
    }
    run += mins(b);
    last = b.end;
  }
  if (run > 0) runs.push(run);
  return runs;
}

describe('a long break about every two hours', () => {
  const withBreaks = (o: Partial<UserConfig> = {}) => cfg({ breakMin: 30, breakEveryMin: 120, ...o });

  it('is a block of its own, half an hour long, straight after one quest and straight before the next', () => {
    const { schedule } = generateSchedule(pile(), [], withBreaks(), NOW);
    const today = allOf(schedule, 0);
    const breaks = today.filter((b) => b.type === 'break');
    expect(breaks.length).toBeGreaterThanOrEqual(2);
    for (const br of breaks) {
      const i = today.indexOf(br);
      expect(mins(br)).toBe(30);
      expect(br.taskId).toBeNull();
      expect(today[i - 1]?.type).toBe('work');
      expect(today[i + 1]?.type).toBe('work');
      expect(today[i - 1]!.end).toBe(br.start);
      expect(today[i + 1]!.start).toBe(br.end);
    }
    expect(today[0]!.type).toBe('work');
    expect(today[today.length - 1]!.type).toBe('work');
  });

  it('comes after roughly two hours of work: never much less, never much more', () => {
    const { schedule } = generateSchedule(pile(), [], withBreaks(), NOW);
    for (let d = 0; d < 2; d += 1) {
      const runs = runsOf(schedule, d, 30);
      expect(runs.length, `day ${d}: ${runs.join(' ')}`).toBeGreaterThanOrEqual(3);
      for (const r of runs) expect(r, `day ${d}: ${runs.join(' ')}`).toBeLessThanOrEqual(150);
      for (const r of runs.slice(0, -1)) expect(r, `day ${d}: ${runs.join(' ')}`).toBeGreaterThanOrEqual(60);
    }
  });

  it('keeps five minutes between quests that have no break between them, and fills the day', () => {
    const { schedule, feasibilityReport } = generateSchedule(pile(), [], withBreaks(), NOW);
    const today = allOf(schedule, 0);
    for (let i = 1; i < today.length; i += 1) {
      if (today[i]!.type === 'work' && today[i - 1]!.type === 'work') expect((today[i]!.start - today[i - 1]!.end) / MIN).toBe(5);
    }
    expect(today[0]!.start).toBe(NOW);
    expect(today[today.length - 1]!.end).toBeGreaterThanOrEqual(at(18) - 15 * MIN);
    expect(feasibilityReport.issues).toEqual([]);
    expectSound(schedule, pile());
  });

  it('counts a routine or a lunch as the pause', () => {
    const gym: Block = { id: 'fx', start: at(10.5), end: at(11.5), type: 'fixed', taskId: null, locked: true, note: 'Daily: Gym' };
    const { schedule } = generateSchedule(pile(), [gym], withBreaks(), NOW);
    const morning = allOf(schedule, 0).filter((b) => b.end <= at(13));
    // Ninety minutes of work, an hour at the gym: no break is owed before noon.
    expect(morning.filter((b) => b.type === 'break' && b.start < at(12))).toEqual([]);
  });

  it('can be any length, or none, and the gap any length too', () => {
    const long = generateSchedule(pile(), [], withBreaks({ breakMin: 45, breakEveryMin: 90, gapMin: 10 }), NOW).schedule;
    expect(allOf(long, 0).filter((b) => b.type === 'break').every((b) => mins(b) === 45)).toBe(true);
    // Ninety minutes, give or take; the last run of the day may go on to the end rather than stop for a break.
    const runs = runsOf(long, 0, 45);
    for (const r of runs.slice(0, -1)) expect(r, runs.join(' ')).toBeLessThanOrEqual(120);
    expect(runs[runs.length - 1]!, runs.join(' ')).toBeLessThanOrEqual(180);
    const day = allOf(long, 0);
    for (let i = 1; i < day.length; i += 1) {
      if (day[i]!.type === 'work' && day[i - 1]!.type === 'work') expect((day[i]!.start - day[i - 1]!.end) / MIN).toBe(10);
    }
    const none = generateSchedule(pile(), [], withBreaks({ breakMin: 0, gapMin: 0 }), NOW).schedule;
    expect(none.filter((b) => b.type === 'break')).toEqual([]);
    expect(gaps(workOf(none, 0)).every((g) => g === 0)).toBe(true);
  });

  it('is measured from the work already done today, on a replan', () => {
    const first = generateSchedule(pile(), [], withBreaks(), NOW).schedule;
    // Ninety minutes in, nothing has changed: the first break is still about two hours from the start.
    const later = NOW + 90 * MIN;
    const { schedule } = replan(first, pile(), withBreaks(), later);
    const firstBreak = allOf(schedule, 0).find((b) => b.type === 'break' && b.end > later)!;
    expect(firstBreak.start).toBeLessThanOrEqual(NOW + 160 * MIN);
    expect(firstBreak.start).toBeGreaterThanOrEqual(NOW + 100 * MIN);
  });

  it('starts straight after a sitting that is under way, with no gap first', () => {
    const config = withBreaks({ breakEveryMin: 60, gapMin: 10 });
    const first = generateSchedule(pile(), [], config, NOW).schedule;
    // Ten minutes into the first block, which is long enough to earn the break by itself.
    const { schedule } = replan(first, pile(), config, NOW + 10 * MIN);
    const today = allOf(schedule, 0).filter((b) => b.end > NOW + 10 * MIN);
    const br = today.find((b) => b.type === 'break')!;
    const before = today[today.indexOf(br) - 1]!;
    expect(before.type).toBe('work');
    expect(br.start).toBe(before.end);
  });

  it('is left alone while it is under way', () => {
    const first = generateSchedule(pile(), [], withBreaks(), NOW).schedule;
    const br = allOf(first, 0).find((b) => b.type === 'break')!;
    const mid = br.start + 10 * MIN;
    const { schedule } = replan(first, pile(), withBreaks(), mid);
    const same = schedule.find((b) => b.id === br.id)!;
    expect([same.start, same.end]).toEqual([br.start, br.end]);
    const next = workOf(schedule, 0).find((b) => b.start >= mid)!;
    expect(next.start).toBe(br.end);
  });
});

describe('any amount of available time from an hour and a half up', () => {
  it('is filled to the end, with its breaks, whatever the amount', () => {
    const total = pile().reduce((m, t) => m + t.remainingMin, 0);
    for (let m = 90; m <= 24 * 60; m += 15) {
      const until = NOW + m * MIN;
      const config = cfg({ breakMin: 30, breakEveryMin: 120, todayEndsAt: until });
      const { schedule } = generateSchedule(pile(), [], config, NOW);
      const today = schedule.filter((b) => b.start < until && b.type !== 'fixed').sort((a, b) => a.start - b.start);
      const label = `${m} min: ${today.map((b) => `${b.type === 'break' ? '~' : ''}${clock(b.start)}-${clock(b.end)}`).join(' ')}`;
      expect(today[0]!.start, label).toBe(NOW);
      const end = today[today.length - 1]!.end;
      expect(end, label).toBeLessThanOrEqual(until);
      const placed = today.filter((b) => b.type === 'work').reduce((sum, b) => sum + mins(b), 0);
      // Filled to within a quarter of an hour of the end, unless the work ran out first.
      if (placed < total - 1) expect(end, label).toBeGreaterThanOrEqual(until - 15 * MIN);
      expect(today[today.length - 1]!.type, label).toBe('work');
      for (let i = 1; i < today.length; i += 1) expect(today[i]!.start, label).toBeGreaterThanOrEqual(today[i - 1]!.end);
      let run = 0;
      for (let i = 0; i < today.length; i += 1) {
        const b = today[i]!;
        if (b.type === 'break') run = 0;
        else {
          run += mins(b);
          // Two and a half hours at most, plus the last stretch of a day too short for a break and a quest.
          expect(run, label).toBeLessThanOrEqual(195);
        }
      }
    }
  }, 60_000);
});

describe('dragging a quest to a new place', () => {
  const config = () => cfg({ breakMin: 30, breakEveryMin: 120 });
  const order = (schedule: Block[]) => workOf(schedule, 0).map((b) => b.taskId);
  const minutesByTask = (schedule: Block[]) => {
    const m = new Map<string, number>();
    for (const b of workOf(schedule)) m.set(b.taskId!, (m.get(b.taskId!) ?? 0) + mins(b));
    return [...m].sort();
  };

  it('moves it there and lays the day out again round it, five minutes apart', () => {
    const first = generateSchedule(pile(), [], config(), NOW).schedule;
    const today = workOf(first, 0);
    const moved = today[4]!;
    const target = today[1]!;
    const edited = applyEdit(first, { kind: 'reorder_block', blockId: moved.id, beforeId: target.id });
    const { schedule } = replan(edited, pile(), config(), NOW);
    const after = workOf(schedule, 0);
    // The first block is under way and stays; the dragged one now comes straight after it.
    expect(after[0]!.id).toBe(today[0]!.id);
    expect(after[1]!.id).toBe(moved.id);
    expect(after[2]!.id).toBe(target.id);
    expect(after.find((b) => b.id === moved.id)!.locked).toBe(false);
    const day = allOf(schedule, 0);
    for (let i = 1; i < day.length; i += 1) {
      expect(day[i]!.start).toBeGreaterThanOrEqual(day[i - 1]!.end);
      if (day[i]!.type === 'work' && day[i - 1]!.type === 'work') expect((day[i]!.start - day[i - 1]!.end) / MIN).toBe(5);
    }
    expect(minutesByTask(schedule)).toEqual(minutesByTask(first));
  });

  it('changes the order and nothing else: no other quest is brought into the place it left', () => {
    const first = generateSchedule(pile(), [], config(), NOW).schedule;
    const before = workOf(first, 0).map((b) => b.id);
    const edited = applyEdit(first, { kind: 'reorder_block', blockId: before[3]!, beforeId: before[1]! });
    const after = workOf(replan(edited, pile(), config(), NOW).schedule, 0).map((b) => b.id);
    expect(after.slice(0, 5)).toEqual([before[0], before[3], before[1], before[2], before[4]]);
    // And dragged back, the day is as it was.
    const back = applyEdit(replan(edited, pile(), config(), NOW).schedule, { kind: 'reorder_block', blockId: before[3]!, afterId: before[2]! });
    expect(workOf(replan(back, pile(), config(), NOW).schedule, 0).map((b) => b.id).slice(0, 5)).toEqual(before.slice(0, 5));
  });

  it('a quest finished early is closed over by the ones behind it, in the same order', () => {
    const first = generateSchedule(pile(), [], config(), NOW).schedule;
    const today = workOf(first, 0);
    // The second quest of the day turns out to be done already.
    const gone = today[1]!.taskId!;
    const tasks = pile().map((t) => (t.id === gone ? { ...t, status: 'done' as const, remainingMin: 0 } : t));
    const after = workOf(replan(first, tasks, config(), NOW).schedule, 0);
    const kept = today.filter((b) => b.taskId !== gone).map((b) => b.id);
    expect(after.map((b) => b.id).slice(0, 4)).toEqual(kept.slice(0, 4));
  });

  it('moves it later too', () => {
    const first = generateSchedule(pile(), [], config(), NOW).schedule;
    const today = workOf(first, 0);
    const moved = today[1]!;
    const target = today[3]!;
    const { schedule } = replan(applyEdit(first, { kind: 'reorder_block', blockId: moved.id, afterId: target.id }), pile(), config(), NOW);
    const ids = workOf(schedule, 0).map((b) => b.id);
    expect(ids.indexOf(moved.id)).toBeGreaterThan(ids.indexOf(target.id));
    expect(ids.indexOf(moved.id) - ids.indexOf(target.id)).toBe(1);
    expect(minutesByTask(schedule)).toEqual(minutesByTask(first));
  });

  it('keeps the new order on the replans that follow', () => {
    const first = generateSchedule(pile(), [], config(), NOW).schedule;
    const today = workOf(first, 0);
    const edited = applyEdit(first, { kind: 'reorder_block', blockId: today[5]!.id, beforeId: today[2]!.id });
    const once = replan(edited, pile(), config(), NOW).schedule;
    expect(order(replan(once, pile(), config(), NOW).schedule)).toEqual(order(once));
    // Ten minutes on, the blocks that are still there are still in that order.
    const twice = replan(once, pile(), config(), NOW + 10 * MIN).schedule;
    const ids = (s: Block[]) => workOf(s, 0).slice(1).map((b) => b.id);
    const both = ids(once).filter((id) => ids(twice).includes(id));
    expect(both.length).toBeGreaterThanOrEqual(5);
    expect(ids(twice).filter((id) => both.includes(id))).toEqual(both);
  });

  it('can put a quest first in a day, ahead of the block that starts when the day opens', () => {
    const first = generateSchedule(pile(), [], config(), NOW).schedule;
    const tomorrow = workOf(first, 1);
    expect(tomorrow[0]!.start).toBe(at(9, 1));
    const moved = tomorrow[3]!;
    const { schedule } = replan(applyEdit(first, { kind: 'reorder_block', blockId: moved.id, beforeId: tomorrow[0]!.id }), pile(), config(), NOW);
    const after = workOf(schedule, 1);
    expect(after[0]!.id).toBe(moved.id);
    expect(after[0]!.start).toBe(at(9, 1));
    expect(after[1]!.id).toBe(tomorrow[0]!.id);
    expect(minutesByTask(schedule)).toEqual(minutesByTask(first));
  });

  it('dragged to the end of a day it no longer fits in, goes on where the day stops and carries over', () => {
    // Three hours today; the long block is dragged behind everything else.
    const short = () => cfg({ breakMin: 30, breakEveryMin: 120, todayEndsAt: NOW + 3 * HOUR });
    const first = generateSchedule(pile(), [], short(), NOW).schedule;
    const today = workOf(first, 0).filter((b) => b.end <= NOW + 3 * HOUR);
    const moved = today[1]!;
    const last = today[today.length - 1]!;
    const { schedule } = replan(applyEdit(first, { kind: 'reorder_block', blockId: moved.id, afterId: last.id }), pile(), short(), NOW);
    const all = workOf(schedule);
    // Nothing is lost, and nothing else jumped into its old place ahead of the blocks that were behind it.
    expect(minutesByTask(schedule)).toEqual(minutesByTask(first));
    const ids = all.map((b) => b.id);
    expect(ids.indexOf(moved.id)).toBeGreaterThan(ids.indexOf(today[2]!.id));
    for (const b of all.filter((x) => x.start < NOW + 3 * HOUR)) expect(b.end).toBeLessThanOrEqual(NOW + 3 * HOUR);
  });

  it('does not let a drag make a quest miss its deadline', () => {
    const tasks = [
      task('due-soon', { remainingMin: 60, totalMin: 60, deadline: NOW + 3 * HOUR }),
      task('a', { remainingMin: 90, totalMin: 90, maxChunkMin: 90 }),
      task('b', { remainingMin: 90, totalMin: 90, maxChunkMin: 90 }),
      task('c', { remainingMin: 90, totalMin: 90, maxChunkMin: 90 }),
    ];
    const first = generateSchedule(tasks, [], config(), NOW).schedule;
    const due = workOf(first).filter((b) => b.taskId === 'due-soon');
    const last = workOf(first, 0).filter((b) => b.taskId !== 'due-soon').pop()!;
    // Dragged to the very end of the day, hours past its deadline.
    let edited = first;
    for (const b of due) edited = applyEdit(edited, { kind: 'reorder_block', blockId: b.id, afterId: last.id });
    const { schedule, feasibilityReport } = replan(edited, tasks, config(), NOW);
    for (const b of workOf(schedule).filter((x) => x.taskId === 'due-soon')) expect(b.end).toBeLessThanOrEqual(NOW + 3 * HOUR);
    expect(workOf(schedule).filter((x) => x.taskId === 'due-soon').reduce((m, b) => m + mins(b), 0)).toBe(60);
    expect(feasibilityReport.issues).toEqual([]);
  });
});

describe('whatever it is given', () => {
  /** A small seeded generator, so a failure can be run again. */
  const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const CATEGORIES = ['deep_work', 'learning', 'creative', 'admin', 'comms'] as const;

  it('never overlaps, overruns a deadline, over-places a quest or crowds a gap, through a day of replans and drags', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const rnd = seeded(seed * 7919);
      const n = 3 + Math.floor(rnd() * 10);
      let tasks: Task[] = Array.from({ length: n }, (_, i) => {
        const size = [15, 20, 30, 45, 60, 90, 120, 180, 240, 300][Math.floor(rnd() * 10)]!;
        return task(`q${i}`, {
          remainingMin: size,
          totalMin: size,
          cognitiveLoad: 0.1 + rnd() * 0.8,
          tediousness: rnd(),
          maxChunkMin: rnd() < 0.5 ? 50 : 90,
          category: CATEGORIES[Math.floor(rnd() * CATEGORIES.length)]!,
          deadline: NOW + (0.4 + rnd() * 12) * DAY,
        });
      });
      const fixed: Block[] = rnd() < 0.6
        ? [{ id: 'fx-1', start: at(11 + Math.floor(rnd() * 4)), end: at(15.5), type: 'fixed', taskId: null, locked: true, note: 'Class' }]
        : [];
      if (fixed[0]) fixed[0].end = fixed[0].start + (30 + Math.floor(rnd() * 3) * 30) * MIN;
      const gapMin = [0, 5, 5, 10, 15][Math.floor(rnd() * 5)]!;
      const breakMin = [0, 15, 30, 30, 45][Math.floor(rnd() * 5)]!;
      const config = cfg({
        gapMin,
        breakMin,
        breakEveryMin: [60, 90, 120, 120, 180][Math.floor(rnd() * 5)]!,
        mealGap: rnd() < 0.5 ? { fromHour: 11.5, toHour: 14, minutes: 30 } : undefined,
        ...(rnd() < 0.5 ? { todayEndsAt: NOW + (1 + Math.floor(rnd() * 12)) * HOUR } : {}),
      });

      let now = NOW;
      let schedule = generateSchedule(tasks, fixed, config, now).schedule;
      for (let step = 0; step < 6; step += 1) {
        const label = `seed ${seed} step ${step}`;
        const ahead = schedule.filter((b) => b.end > now).sort((a, b) => a.start - b.start);
        const work = ahead.filter((b) => b.type === 'work');
        const ids = new Set<string>();
        for (const b of schedule) {
          expect(ids.has(b.id), `${label}: id ${b.id} twice`).toBe(false);
          ids.add(b.id);
        }
        // Nothing overlaps anything: quests, breaks, fixed blocks.
        for (let i = 1; i < ahead.length; i += 1) {
          expect(ahead[i]!.start, `${label}: ${ahead[i - 1]!.type} ${clock(ahead[i - 1]!.start)}-${clock(ahead[i - 1]!.end)} then ${ahead[i]!.type} ${clock(ahead[i]!.start)}`).toBeGreaterThanOrEqual(ahead[i - 1]!.end);
        }
        for (let i = 0; i < ahead.length; i += 1) {
          const b = ahead[i]!;
          if (b.type === 'break' && b.start > now) {
            expect(mins(b), `${label}: a break of ${mins(b)}`).toBe(breakMin);
            expect(ahead[i + 1]?.type, `${label}: a break with no quest after it`).toBe('work');
            expect(ahead[i + 1]!.start, `${label}: a break not followed at once`).toBe(b.end);
          }
          if (b.type !== 'work') continue;
          const t = tasks.find((x) => x.id === b.taskId)!;
          expect(b.end, `${label}: ${t.id} past its deadline`).toBeLessThanOrEqual(t.deadline);
          expect(mins(b), `${label}: a block of ${mins(b)} min`).toBeGreaterThanOrEqual(5);
          const prev = ahead[i - 1];
          if (prev?.type === 'work' && prev.start >= now) {
            expect((b.start - prev.end) / MIN, `${label}: ${clock(prev.end)} to ${clock(b.start)}`).toBeGreaterThanOrEqual(gapMin);
          }
        }
        for (const t of tasks) {
          const placed = work.filter((b) => b.taskId === t.id).reduce((m, b) => m + (b.end - Math.max(b.start, now)) / MIN, 0);
          expect(placed, `${label}: ${t.id} over-placed`).toBeLessThanOrEqual(t.remainingMin + 12);
        }
        // Time passes; a quest is dragged somewhere else; another is finished.
        now += (30 + Math.floor(rnd() * 5) * 20) * MIN;
        const movable = schedule.filter((b) => b.type === 'work' && !b.locked && b.start > now);
        if (movable.length > 2 && rnd() < 0.7) {
          const a = movable[Math.floor(rnd() * movable.length)]!;
          const b = movable[Math.floor(rnd() * movable.length)]!;
          if (a.id !== b.id) schedule = applyEdit(schedule, { kind: 'reorder_block', blockId: a.id, ...(rnd() < 0.5 ? { beforeId: b.id } : { afterId: b.id }) });
        }
        const open = tasks.filter((t) => t.status !== 'done');
        const finished = open[Math.floor(rnd() * open.length)];
        if (rnd() < 0.7) tasks = tasks.map((t) => (t === finished ? { ...t, status: 'done' as const, remainingMin: 0 } : t));
        schedule = replan(schedule, tasks, config, now).schedule;
      }
    }
  }, 120_000);
});
