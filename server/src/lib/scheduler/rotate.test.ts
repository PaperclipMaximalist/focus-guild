/**
 * The owner's rules of 2026-10-19: "make it progressively recalculate every
 * chunk so that everything will be somewhat covered" (no "back to back same
 * things"), and "an option for a task that must be done in one go". They are
 * `rotate` (config, on for everyone in lib/userConfig.ts) and `Task.oneGo`
 * (a quest's own setting). The app's other rules are on here too: a fixed
 * gap, long breaks, filled days.
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
  breakMin: 30,
  breakEveryMin: 120,
  fillDays: true,
  rotate: true,
  mealGap: undefined,
  ...overrides,
});
const mins = (b: { start: number; end: number }) => (b.end - b.start) / MIN;
const dayOf = (t: number) => Math.floor((t - MIDNIGHT) / DAY);
const workOf = (schedule: Block[], day?: number) =>
  schedule.filter((b) => b.type === 'work' && b.taskId && (day === undefined || dayOf(b.start) === day)).sort((a, b) => a.start - b.start);
/** How often a day's next block is the same quest as the one before it. */
const repeats = (work: Block[]) => work.slice(1).filter((b, i) => b.taskId === work[i]!.taskId).length;
/** ...counting only those with another quest still to come later that day, which could have gone there instead. */
const avoidableRepeats = (work: Block[]) =>
  work.slice(1).filter((b, i) => b.taskId === work[i]!.taskId && work.slice(i + 2).some((x) => x.taskId !== b.taskId)).length;
const clock = (t: number) => new Date(t).toISOString().slice(11, 16);
const listing = (work: Block[]) => work.map((b) => `${clock(b.start)} ${mins(b)}m ${b.taskId}`).join(', ');

/** Four big quests, none due soon: the day used to be two of them, a session each. */
const bigFour = (): Task[] => [
  task('essay', { remainingMin: 300, totalMin: 300, cognitiveLoad: 0.7, deadline: NOW + 9 * DAY }),
  task('report', { remainingMin: 300, totalMin: 300, cognitiveLoad: 0.6, deadline: NOW + 10 * DAY }),
  task('reading', { remainingMin: 240, totalMin: 240, category: 'learning', deadline: NOW + 11 * DAY }),
  task('slides', { remainingMin: 240, totalMin: 240, category: 'creative', deadline: NOW + 12 * DAY }),
];

describe('rotate: picking again after every block', () => {
  it('never puts a quest straight after itself while another quest is there to take the slot', () => {
    const { schedule } = generateSchedule(bigFour(), [], cfg(), NOW);
    for (let d = 0; d < 3; d += 1) {
      const work = workOf(schedule, d);
      expect(work.length, `day ${d}`).toBeGreaterThan(4);
      expect(avoidableRepeats(work), `day ${d}: ${listing(work)}`).toBe(0);
    }
  });

  it('gives every quest some of the day before any quest gets a third sitting', () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      task(`q${i}`, { remainingMin: 180, totalMin: 180, deadline: NOW + (8 + i) * DAY, category: ['deep_work', 'creative', 'learning', 'admin'][i % 4]! }),
    );
    const { schedule } = generateSchedule(many, [], cfg(), NOW);
    const today = workOf(schedule, 0);
    const touched = new Set(today.map((b) => b.taskId));
    expect(touched.size, listing(today)).toBe(7);
    const sittings = new Map<string, number>();
    for (const b of today) {
      sittings.set(b.taskId!, (sittings.get(b.taskId!) ?? 0) + 1);
      if ((sittings.get(b.taskId!) ?? 0) >= 3) {
        expect([...touched].every((id) => (sittings.get(id!) ?? 0) >= 1), listing(today)).toBe(true);
      }
    }
  });

  it('still lets a quest due within the day run on, when anything else first would cost it its deadline', () => {
    const tasks = [
      task('fix', { remainingMin: 120, totalMin: 120, deadline: at(12), cognitiveLoad: 0.6 }),
      ...bigFour(),
    ];
    const { schedule, feasibilityReport } = generateSchedule(tasks, [], cfg(), NOW);
    const fix = workOf(schedule).filter((b) => b.taskId === 'fix');
    expect(fix.reduce((m, b) => m + mins(b), 0), listing(workOf(schedule, 0))).toBe(120);
    for (const b of fix) expect(b.end).toBeLessThanOrEqual(at(12));
    expect(feasibilityReport.issues.find((r) => r.taskId === 'fix')).toBeUndefined();
  });

  it('keeps the order through a replan with nothing changed', () => {
    const first = generateSchedule(bigFour(), [], cfg(), NOW).schedule;
    const again = replan(first, bigFour(), cfg(), NOW).schedule;
    const sig = (s: Block[]) => workOf(s, 0).map((b) => `${b.taskId}@${clock(b.start)}+${mins(b)}`).join(' ');
    expect(sig(again)).toBe(sig(first));
  });

  it('turned off, a quest keeps the slot for a session (the library default is unchanged)', () => {
    const { schedule } = generateSchedule(bigFour(), [], cfg({ rotate: false }), NOW);
    expect(repeats(workOf(schedule, 0))).toBeGreaterThan(0);
  });
});

describe('a quest done in one go', () => {
  it('is one block of all of it, never cut by a break or the gap rhythm', () => {
    const tasks = [task('build', { remainingMin: 200, totalMin: 200, oneGo: true, deadline: NOW + 3 * DAY }), ...bigFour()];
    const { schedule } = generateSchedule(tasks, [], cfg(), NOW);
    const build = workOf(schedule).filter((b) => b.taskId === 'build');
    expect(build.length, listing(build)).toBe(1);
    expect(mins(build[0]!)).toBe(200);
    // Nothing else sits inside it: breaks and other quests go round it.
    for (const b of schedule) {
      if (b.id === build[0]!.id) continue;
      expect(b.end <= build[0]!.start || b.start >= build[0]!.end, `${b.type} ${clock(b.start)} inside it`).toBe(true);
    }
  });

  it('waits for a stretch that holds all of it, instead of splitting round a class', () => {
    const classes: Block[] = [
      { id: 'c1', start: at(10.5), end: at(11.5), type: 'fixed', taskId: null, locked: true, note: 'Class' },
      { id: 'c2', start: at(13), end: at(14), type: 'fixed', taskId: null, locked: true, note: 'Class' },
    ];
    const tasks = [task('exam', { remainingMin: 120, totalMin: 120, oneGo: true, deadline: NOW + 2 * DAY }), ...bigFour()];
    const { schedule } = generateSchedule(tasks, classes, cfg(), NOW);
    const exam = workOf(schedule).filter((b) => b.taskId === 'exam');
    expect(exam.length).toBe(1);
    expect(mins(exam[0]!)).toBe(120);
    for (const c of classes) expect(exam[0]!.end <= c.start || exam[0]!.start >= c.end).toBe(true);
  });

  it('is reported short, not split, when no stretch before its deadline holds it', () => {
    const classes: Block[] = [
      { id: 'c1', start: at(10), end: at(11), type: 'fixed', taskId: null, locked: true, note: 'Class' },
      { id: 'c2', start: at(12), end: at(13), type: 'fixed', taskId: null, locked: true, note: 'Class' },
    ];
    const tasks = [task('exam', { remainingMin: 90, totalMin: 90, oneGo: true, deadline: at(14) }), task('other')];
    const { schedule, feasibilityReport } = generateSchedule(tasks, classes, cfg(), NOW);
    expect(workOf(schedule).filter((b) => b.taskId === 'exam')).toHaveLength(0);
    expect(feasibilityReport.issues.find((r) => r.taskId === 'exam')?.shortfallMin).toBe(90);
  });

  it('is never spread over two days, even when it is too big for a sitting anywhere else', () => {
    const tasks = [task('marathon', { remainingMin: 360, totalMin: 360, oneGo: true, deadline: NOW + 4 * DAY }), ...bigFour()];
    const { schedule } = generateSchedule(tasks, [], cfg(), NOW);
    const blocks = workOf(schedule).filter((b) => b.taskId === 'marathon');
    expect(blocks.length, listing(blocks)).toBe(1);
    expect(mins(blocks[0]!)).toBe(360);
  });
});

describe('whatever it is given, rotating', () => {
  const seeded = (seed: number) => () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const CATEGORIES = ['deep_work', 'learning', 'creative', 'admin', 'comms'] as const;

  it('never overlaps, overruns a deadline, over-places a quest or splits a one-go quest, through a day of replans and drags', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rnd = seeded(seed * 104729);
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
          ...(rnd() < 0.25 && size <= 240 ? { oneGo: true } : {}),
        });
      });
      const fixed: Block[] = rnd() < 0.6
        ? [{ id: 'fx-1', start: at(11 + Math.floor(rnd() * 4)), end: at(15.5), type: 'fixed', taskId: null, locked: true, note: 'Class' }]
        : [];
      if (fixed[0]) fixed[0].end = fixed[0].start + (30 + Math.floor(rnd() * 3) * 30) * MIN;
      const config = cfg({
        gapMin: [0, 5, 5, 10][Math.floor(rnd() * 4)]!,
        breakMin: [0, 15, 30, 30][Math.floor(rnd() * 4)]!,
        breakEveryMin: [60, 90, 120, 180][Math.floor(rnd() * 4)]!,
        mealGap: rnd() < 0.5 ? { fromHour: 11.5, toHour: 14, minutes: 30 } : undefined,
        ...(rnd() < 0.5 ? { todayEndsAt: NOW + (1 + Math.floor(rnd() * 12)) * HOUR } : {}),
      });

      let now = NOW;
      let schedule = generateSchedule(tasks, fixed, config, now).schedule;
      for (let step = 0; step < 6; step += 1) {
        const label = `seed ${seed} step ${step}`;
        const ahead = schedule.filter((b) => b.end > now).sort((a, b) => a.start - b.start);
        const work = ahead.filter((b) => b.type === 'work');
        for (let i = 1; i < ahead.length; i += 1) {
          expect(ahead[i]!.start, `${label}: overlap at ${clock(ahead[i]!.start)}`).toBeGreaterThanOrEqual(ahead[i - 1]!.end);
        }
        for (const b of work) {
          const t = tasks.find((x) => x.id === b.taskId)!;
          expect(b.end, `${label}: ${t.id} past its deadline`).toBeLessThanOrEqual(t.deadline);
        }
        for (const t of tasks) {
          const own = work.filter((b) => b.taskId === t.id);
          const placed = own.reduce((m, b) => m + (b.end - Math.max(b.start, now)) / MIN, 0);
          expect(placed, `${label}: ${t.id} over-placed`).toBeLessThanOrEqual(t.remainingMin + 12);
          // In one go: one block ahead at most, and none still to come beside one under way.
          if (t.oneGo && t.status !== 'done') {
            expect(own.length, `${label}: ${t.id} (one go) in ${own.length} pieces: ${listing(own)}`).toBeLessThanOrEqual(1);
          }
        }
        now += (30 + Math.floor(rnd() * 5) * 20) * MIN;
        const movable = schedule.filter((b) => b.type === 'work' && !b.locked && b.start > now);
        if (movable.length > 2 && rnd() < 0.7) {
          const a = movable[Math.floor(rnd() * movable.length)]!;
          const b = movable[Math.floor(rnd() * movable.length)]!;
          if (a.id !== b.id) schedule = applyEdit(schedule, { kind: 'reorder_block', blockId: a.id, ...(rnd() < 0.5 ? { beforeId: b.id } : { afterId: b.id }) });
        }
        const open = tasks.filter((t) => t.status !== 'done');
        const finished = open[Math.floor(rnd() * open.length)];
        if (rnd() < 0.5) tasks = tasks.map((t) => (t === finished ? { ...t, status: 'done' as const, remainingMin: 0 } : t));
        schedule = replan(schedule, tasks, config, now).schedule;
      }
    }
  }, 120_000);
});
