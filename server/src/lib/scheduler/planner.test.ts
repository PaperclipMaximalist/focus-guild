import { describe, it, expect } from 'vitest';
import { generateSchedule } from './replan.js';
import { defaultConfig } from './config.js';
import type { Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Pin "now" to 9am local on a known date so working hours line up. */
function nowAt9am(): number {
  const d = new Date(2026, 4, 18, 9, 0, 0, 0);
  return d.getTime();
}

function task(id: string, overrides: Partial<Task> = {}): Task {
  const now = nowAt9am();
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: 60,
    deadline: now + 3 * MS_PER_DAY,
    tediousness: 0.3,
    cognitiveLoad: 0.5,
    importance: 0.5,
    setupCost: 0.3,
    minChunkMin: 15,
    maxChunkMin: 50,
    category: 'deep_work',
    preferredHour: null,
    dependencies: [],
    createdAt: now - MS_PER_DAY,
    lastWorkedAt: null,
    status: 'pending',
    urgencyMultiplier: 1.0,
    ...overrides,
  };
}

function shortHorizon(): UserConfig {
  return { ...defaultConfig(), horizonDays: 1 };
}

describe('generateSchedule — basic placement', () => {
  it('produces work blocks within working hours only', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    const { schedule } = generateSchedule([task('t1')], [], cfg, now);

    const dayStart = new Date(now);
    dayStart.setHours(cfg.workingHours.startHour, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(cfg.workingHours.endHour, 0, 0, 0);

    for (const b of schedule) {
      expect(b.start).toBeGreaterThanOrEqual(dayStart.getTime());
      expect(b.end).toBeLessThanOrEqual(dayEnd.getTime());
    }
  });

  it('places a single task in the first work slot', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    const { schedule } = generateSchedule([task('t1', { remainingMin: 30 })], [], cfg, now);
    const work = schedule.filter((b) => b.type === 'work' && b.taskId === 't1');
    expect(work.length).toBeGreaterThan(0);
    expect(work[0]!.start).toBe(now);
  });

  it('routes around a fixed block', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    const fixedStart = now + MS_PER_HOUR;
    const fixedEnd = fixedStart + MS_PER_HOUR;
    const fixed = [
      {
        id: 'fixed-1',
        start: fixedStart,
        end: fixedEnd,
        type: 'fixed' as const,
        taskId: null,
        locked: true,
        note: 'meeting',
      },
    ];
    const { schedule } = generateSchedule([task('t1')], fixed, cfg, now);
    const work = schedule.filter((b) => b.type === 'work' && b.taskId === 't1');
    for (const w of work) {
      const overlapsFixed = w.start < fixedEnd && fixedStart < w.end;
      expect(overlapsFixed).toBe(false);
    }
    // Fixed block must still be present.
    expect(schedule.some((b) => b.id === 'fixed-1')).toBe(true);
  });
});

describe('generateSchedule — chunking', () => {
  it('splits a task across multiple chunks when remaining > maxChunk', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    const t = task('t1', { remainingMin: 150, maxChunkMin: 50 });
    const { schedule } = generateSchedule([t], [], cfg, now);
    const work = schedule.filter((b) => b.type === 'work' && b.taskId === 't1');
    expect(work.length).toBeGreaterThanOrEqual(3);
    for (const w of work) {
      const mins = (w.end - w.start) / MS_PER_MIN;
      expect(mins).toBeLessThanOrEqual(50);
    }
  });

  it('excludes tasks whose minChunk exceeds the available block', () => {
    // 9–18 with breaks at 50min → first work block is 50min. min_chunk_min = 60 → exclude.
    const cfg = shortHorizon();
    const now = nowAt9am();
    const big = task('big', { minChunkMin: 60, maxChunkMin: 60, remainingMin: 60 });
    const small = task('small', { minChunkMin: 15, maxChunkMin: 30, remainingMin: 30 });
    const { schedule } = generateSchedule([big, small], [], cfg, now);
    const firstWork = schedule.find((b) => b.type === 'work' && b.taskId);
    expect(firstWork?.taskId).toBe('small');
  });
});

describe('generateSchedule — feasibility', () => {
  it('reports infeasibility when total available time is less than remaining before deadline', () => {
    const cfg = { ...defaultConfig(), horizonDays: 1 };
    const now = nowAt9am();
    // 9 hours of working time minus breaks — overcommit at 2000 minutes.
    const t = task('huge', { remainingMin: 2000, deadline: now + MS_PER_DAY });
    const { feasibilityReport } = generateSchedule([t], [], cfg, now);
    expect(feasibilityReport.ok).toBe(false);
    expect(feasibilityReport.issues[0]!.taskId).toBe('huge');
    expect(feasibilityReport.issues[0]!.shortfallMin).toBeGreaterThan(0);
  });

  it('reports ok when everything fits comfortably', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    const { feasibilityReport } = generateSchedule(
      [task('t1', { remainingMin: 30 })],
      [],
      cfg,
      now,
    );
    expect(feasibilityReport.ok).toBe(true);
  });
});

describe('generateSchedule — determinism', () => {
  it('produces identical schedules across runs with the same inputs', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    const tasks = [
      task('a', { importance: 0.6 }),
      task('b', { importance: 0.6 }),
      task('c', { importance: 0.6 }),
    ];
    const r1 = generateSchedule(tasks, [], cfg, now);
    const r2 = generateSchedule(tasks, [], cfg, now);
    expect(JSON.stringify(r1.schedule)).toBe(JSON.stringify(r2.schedule));
  });

  it('breaks ties by earliest deadline, then highest importance, then lex id', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    // Three identical tasks with different deadlines — earliest deadline wins first slot.
    const tasks = [
      task('c', { deadline: now + 5 * MS_PER_DAY, remainingMin: 30 }),
      task('a', { deadline: now + 3 * MS_PER_DAY, remainingMin: 30 }),
      task('b', { deadline: now + 4 * MS_PER_DAY, remainingMin: 30 }),
    ];
    const { schedule } = generateSchedule(tasks, [], cfg, now);
    const firstWorked = schedule.find((b) => b.type === 'work' && b.taskId);
    expect(firstWorked?.taskId).toBe('a');
  });
});

describe('generateSchedule — dependencies', () => {
  it('does not place a task whose dependency is not done', () => {
    const cfg = shortHorizon();
    const now = nowAt9am();
    const dep = task('dep', { remainingMin: 30, status: 'pending' });
    const t = task('child', { dependencies: ['dep'], remainingMin: 30 });
    const { schedule } = generateSchedule([dep, t], [], cfg, now);
    const childPlaced = schedule.some((b) => b.taskId === 'child');
    // Child should be excluded entirely because dep is not done.
    expect(childPlaced).toBe(false);
  });
});
