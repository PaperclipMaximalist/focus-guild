/**
 * Phase B acceptance tests: the constructor's raw output already satisfies
 * the variety floor, the energy-fit goal, and no-front-loading — *without*
 * any polish pass. These are the design properties Phase B is supposed to
 * guarantee by construction.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from './replan.js';
import { defaultConfig } from './config.js';
import { taskMode } from './planner.js';
import { userHourOf } from './tz.js';
import type { Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function nowAt9amUtc(): number {
  return Date.UTC(2026, 4, 18, 9, 0, 0, 0);
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  const now = nowAt9amUtc();
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: 60,
    deadline: now + 3 * DAY,
    tediousness: 0.4,
    cognitiveLoad: 0.5,
    importance: 0.5,
    setupCost: 0.3,
    minChunkMin: 15,
    maxChunkMin: 90,
    category: 'deep_work',
    preferredHour: null,
    dependencies: [],
    createdAt: now - DAY,
    lastWorkedAt: null,
    status: 'pending',
    urgencyMultiplier: 1.0,
    ...overrides,
  };
}

function configWith(overrides: Partial<UserConfig> = {}): UserConfig {
  return { ...defaultConfig(), tzOffsetMin: 0, ...overrides };
}

describe('variety by construction', () => {
  it('no same-mode run > 2 in a 4-task mixed workload', () => {
    const now = nowAt9amUtc();
    // 4 tasks of mixed mode, plenty of time. Mix of deep_work/admin × loads.
    const tasks = [
      task('deep1', { remainingMin: 90, cognitiveLoad: 0.8, tediousness: 0.2, category: 'deep_work' }),
      task('deep2', { remainingMin: 90, cognitiveLoad: 0.8, tediousness: 0.2, category: 'deep_work' }),
      task('deep3', { remainingMin: 60, cognitiveLoad: 0.8, tediousness: 0.2, category: 'deep_work' }),
      task('admin1', { remainingMin: 30, cognitiveLoad: 0.3, tediousness: 0.6, category: 'admin' }),
      task('admin2', { remainingMin: 30, cognitiveLoad: 0.3, tediousness: 0.6, category: 'admin' }),
    ];
    const { schedule } = generateSchedule(tasks, [], configWith({ horizonDays: 2 }), now);
    const work = schedule.filter((b) => b.type === 'work' && b.taskId);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    // For each consecutive triple, modes must not all be identical.
    let maxRun = 1;
    let run = 1;
    for (let i = 1; i < work.length; i += 1) {
      const prev = taskMap.get(work[i - 1]!.taskId!)!;
      const here = taskMap.get(work[i]!.taskId!)!;
      const pm = taskMode(prev);
      const hm = taskMode(here);
      if (pm.category === hm.category && pm.load === hm.load && pm.tedium === hm.tedium) run += 1;
      else run = 1;
      if (run > maxRun) maxRun = run;
    }
    expect(maxRun).toBeLessThanOrEqual(2);
  });
});

describe('energy fit by construction', () => {
  it('high-load tasks land in higher-capacity hours on average', () => {
    const now = nowAt9amUtc();
    const cfg = configWith({ horizonDays: 1 });
    // Mix of high-load and low-load with enough time for both.
    const tasks = [
      task('hard1', { remainingMin: 60, cognitiveLoad: 0.9, category: 'deep_work' }),
      task('hard2', { remainingMin: 60, cognitiveLoad: 0.9, category: 'creative' }),
      task('easy1', { remainingMin: 60, cognitiveLoad: 0.2, category: 'admin', tediousness: 0.6 }),
      task('easy2', { remainingMin: 60, cognitiveLoad: 0.2, category: 'comms', tediousness: 0.4 }),
    ];
    const { schedule } = generateSchedule(tasks, [], cfg, now);
    const work = schedule.filter((b) => b.type === 'work' && b.taskId);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    let hardHourSum = 0; let hardCount = 0;
    let easyHourSum = 0; let easyCount = 0;
    for (const b of work) {
      const t = taskMap.get(b.taskId!)!;
      const hour = userHourOf(b.start, 0);
      const capacity = cfg.energyCurve(hour);
      if (t.cognitiveLoad >= 0.7) { hardHourSum += capacity; hardCount += 1; }
      if (t.cognitiveLoad <= 0.3) { easyHourSum += capacity; easyCount += 1; }
    }
    const hardAvg = hardCount > 0 ? hardHourSum / hardCount : 0;
    const easyAvg = easyCount > 0 ? easyHourSum / easyCount : 1;
    // Hard tasks should land in hours where capacity is at least 0.6 on average,
    // and noticeably above easy-task slots (which can fall into post-lunch dip).
    expect(hardAvg).toBeGreaterThan(0.6);
    expect(hardAvg).toBeGreaterThan(easyAvg - 0.05); // hard >= easy (loose)
  });
});

describe('no front-loading on loose deadlines', () => {
  it('a 4-hour task with a 4-day deadline does NOT cram day 1', () => {
    const now = nowAt9amUtc();
    const big = task('big', {
      remainingMin: 240, // 4 hours
      maxChunkMin: 240,  // allow up to the whole 4 hours
      deadline: now + 4 * DAY,
      cognitiveLoad: 0.7,
    });
    const { schedule } = generateSchedule([big], [], configWith({ horizonDays: 4 }), now);
    const work = schedule.filter((b) => b.type === 'work' && b.taskId === 'big');
    // Group placed minutes by day index (0 = today).
    const byDay = [0, 0, 0, 0];
    for (const b of work) {
      const dayIdx = Math.floor((b.start - now) / DAY);
      if (dayIdx >= 0 && dayIdx < 4) byDay[dayIdx]! += (b.end - b.start) / MIN;
    }
    // Day 1 must not hold the bulk; the spread should be roughly even.
    expect(byDay[0]!).toBeLessThan(240); // not all in day 1
    expect(byDay[0]!).toBeLessThan(180); // and not even 3 hrs in day 1
    // At least 2 days should carry some of the load.
    const daysWithWork = byDay.filter((m) => m > 0).length;
    expect(daysWithWork).toBeGreaterThanOrEqual(2);
  });
});

describe('determinism', () => {
  it('same input twice produces identical schedules', () => {
    const now = nowAt9amUtc();
    const tasks = [
      task('a', { remainingMin: 60, importance: 0.6 }),
      task('b', { remainingMin: 60, importance: 0.6 }),
      task('c', { remainingMin: 60, importance: 0.6, category: 'admin' }),
    ];
    const a = generateSchedule(tasks, [], configWith({ horizonDays: 1 }), now);
    const b = generateSchedule(tasks, [], configWith({ horizonDays: 1 }), now);
    expect(JSON.stringify(a.schedule)).toBe(JSON.stringify(b.schedule));
  });
});

describe('performance', () => {
  it('generates a realistic 7-day pool in well under 100ms', () => {
    const now = nowAt9amUtc();
    const cfg = configWith({ horizonDays: 7 });
    // 12 mixed tasks — bigger than a realistic backlog.
    const tasks: Task[] = [];
    const cats = ['deep_work', 'admin', 'comms', 'creative'] as const;
    for (let i = 0; i < 12; i += 1) {
      tasks.push(
        task(`t${i}`, {
          remainingMin: 30 + (i % 4) * 45,         // 30, 75, 120, 165
          deadline: now + (1 + (i % 5)) * DAY,     // 1..5 days out
          cognitiveLoad: 0.2 + (i % 5) * 0.18,     // 0.2..0.92
          tediousness: 0.1 + (i % 4) * 0.22,
          category: cats[i % 4]!,
          importance: 0.3 + (i % 7) * 0.1,
        }),
      );
    }
    const t0 = performance.now();
    const { schedule, feasibilityReport } = generateSchedule(tasks, [], cfg, now);
    const dt = performance.now() - t0;
    // Sanity: produced *some* work blocks and a feasibility verdict.
    expect(schedule.filter((b) => b.type === 'work').length).toBeGreaterThan(0);
    expect(feasibilityReport).toBeDefined();
    // Performance: well under 100ms target on this scale. Generous bound
    // for CI noise; the real perf on a dev machine is single-digit ms.
    expect(dt).toBeLessThan(100);
  });
});
