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

describe('whatever it is given', () => {
  /** A small seeded generator, so a failure can be run again. */
  const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const CATEGORIES = ['deep_work', 'learning', 'creative', 'admin', 'comms'] as const;

  it('never overlaps, overruns a deadline, over-places a quest or crowds a gap, through a day of replans', () => {
    for (let seed = 1; seed <= 80; seed += 1) {
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
      const config = cfg({
        mealGap: rnd() < 0.5 ? { fromHour: 11.5, toHour: 14, minutes: 30 } : undefined,
        ...(rnd() < 0.5 ? { todayEndsAt: NOW + (1 + Math.floor(rnd() * 12)) * HOUR } : {}),
      });

      let now = NOW;
      let schedule = generateSchedule(tasks, fixed, config, now).schedule;
      for (let step = 0; step < 5; step += 1) {
        const label = `seed ${seed} step ${step}`;
        const work = workOf(schedule).filter((b) => b.end > now);
        const ids = new Set<string>();
        for (const b of schedule) {
          expect(ids.has(b.id), `${label}: id ${b.id} twice`).toBe(false);
          ids.add(b.id);
        }
        for (let i = 0; i < work.length; i += 1) {
          const b = work[i]!;
          const t = tasks.find((x) => x.id === b.taskId)!;
          expect(b.end, `${label}: ${t.id} past its deadline`).toBeLessThanOrEqual(t.deadline);
          expect(mins(b), `${label}: a block of ${mins(b)} min`).toBeGreaterThanOrEqual(5);
          for (const f of fixed) expect(b.end <= f.start || b.start >= f.end, `${label}: over a fixed block`).toBe(true);
          if (i === 0) continue;
          const rest = (b.start - work[i - 1]!.end) / MIN;
          expect(rest, `${label}: ${clock(work[i - 1]!.end)} to ${clock(b.start)}`).toBeGreaterThanOrEqual(work[i - 1]!.start < now ? 0 : 5);
        }
        for (const t of tasks) {
          const placed = work.filter((b) => b.taskId === t.id).reduce((m, b) => m + (b.end - Math.max(b.start, now)) / MIN, 0);
          expect(placed, `${label}: ${t.id} over-placed`).toBeLessThanOrEqual(t.remainingMin + 12);
        }
        // Time passes; one quest is finished.
        now += (30 + Math.floor(rnd() * 5) * 20) * MIN;
        const open = tasks.filter((t) => t.status !== 'done');
        const finished = open[Math.floor(rnd() * open.length)];
        tasks = tasks.map((t) => (t === finished ? { ...t, status: 'done' as const, remainingMin: 0 } : t));
        schedule = replan(schedule, tasks, config, now).schedule;
      }
    }
  }, 60_000);
});
