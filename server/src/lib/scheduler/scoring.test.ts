import { describe, it, expect } from 'vitest';
import {
  adjacencyPenalty,
  chunkFitScore,
  energyFitScore,
  fragmentationPenalty,
  oversizePenalty,
  scoreTask,
  slackMin,
  stalenessScore,
  switchPenalty,
  timeFitScore,
  urgencyScore,
} from './scoring.js';
import { defaultConfig } from './config.js';
import type { ScheduleContext, Task } from './types.js';

const MS_PER_MIN = 60_000;
// Pinned to 10:00 local — energyCurve & timeFit read local hours.
const NOW = new Date(2026, 4, 17, 10, 0, 0, 0).getTime();

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    name: 'Task 1',
    remainingMin: 60,
    totalMin: 60,
    deadline: NOW + 24 * 60 * MS_PER_MIN, // 1 day away
    tediousness: 0.5,
    cognitiveLoad: 0.5,
    importance: 0.5,
    setupCost: 0.5,
    minChunkMin: 15,
    maxChunkMin: 60,
    category: 'deep_work',
    preferredHour: null,
    dependencies: [],
    createdAt: NOW - 24 * 60 * MS_PER_MIN,
    lastWorkedAt: null,
    status: 'pending',
    urgencyMultiplier: 1.0,
    ...overrides,
  };
}

function makeContext(overrides: Partial<ScheduleContext> = {}): ScheduleContext {
  return {
    prevTask: null,
    recentWorkTasks: [],
    chunksTodayByTaskId: {},
    blockStart: NOW,
    blockEnd: NOW + 60 * MS_PER_MIN,
    ...overrides,
  };
}

describe('urgencyScore', () => {
  it('is higher when slack is smaller (monotonic in remaining vs available time)', () => {
    const tight = makeTask({ remainingMin: 50, deadline: NOW + 60 * MS_PER_MIN });
    const loose = makeTask({ remainingMin: 50, deadline: NOW + 600 * MS_PER_MIN });
    expect(urgencyScore(tight, NOW)).toBeGreaterThan(urgencyScore(loose, NOW));
  });

  it('is amplified by importance', () => {
    const lowImp = makeTask({ importance: 0 });
    const highImp = makeTask({ importance: 1 });
    expect(urgencyScore(highImp, NOW)).toBeGreaterThan(urgencyScore(lowImp, NOW));
  });

  it('caps at ~1 when urgencyMultiplier=1.0 (load² capped at 5, × 1.0 importance max)', () => {
    const t = makeTask({ remainingMin: 10_000, deadline: NOW + 60 * MS_PER_MIN, importance: 1 });
    expect(urgencyScore(t, NOW)).toBeLessThanOrEqual(1);
  });

  it('is amplified by per-task urgencyMultiplier', () => {
    const base = makeTask({ urgencyMultiplier: 1.0 });
    const boosted = makeTask({ urgencyMultiplier: 2.0 });
    expect(urgencyScore(boosted, NOW)).toBeCloseTo(urgencyScore(base, NOW) * 2, 5);
  });
});

describe('slackMin', () => {
  it('is negative when remaining exceeds time to deadline', () => {
    const t = makeTask({ remainingMin: 120, deadline: NOW + 60 * MS_PER_MIN });
    expect(slackMin(t, NOW)).toBeLessThan(0);
  });
});

describe('stalenessScore', () => {
  it('is 0 for a brand-new task', () => {
    const t = makeTask({ createdAt: NOW });
    expect(stalenessScore(t, NOW)).toBeCloseTo(0, 5);
  });

  it('saturates near 1 by 30 days', () => {
    const t = makeTask({ createdAt: NOW - 30 * 24 * 60 * MS_PER_MIN });
    expect(stalenessScore(t, NOW)).toBeCloseTo(1, 5);
  });
});

describe('timeFitScore', () => {
  it('is 1 when no preferred hour', () => {
    expect(timeFitScore(makeTask({ preferredHour: null }), NOW)).toBe(1);
  });

  it('peaks at the preferred hour', () => {
    const hour = new Date(NOW).getHours();
    const onPeak = timeFitScore(makeTask({ preferredHour: hour }), NOW);
    const offPeak = timeFitScore(makeTask({ preferredHour: (hour + 6) % 24 }), NOW);
    expect(onPeak).toBeGreaterThan(offPeak);
    expect(onPeak).toBeCloseTo(1, 5);
  });
});

describe('energyFitScore', () => {
  it('rewards matching cognitive load to the energy curve', () => {
    const cfg = defaultConfig();
    // At hour 10 (NOW), default curve is high (~0.93). High-load task fits.
    const lowLoad = makeTask({ cognitiveLoad: 0.1 });
    const highLoad = makeTask({ cognitiveLoad: 0.9 });
    expect(energyFitScore(highLoad, NOW, cfg)).toBeGreaterThan(
      energyFitScore(lowLoad, NOW, cfg),
    );
  });
});

describe('chunkFitScore', () => {
  it('rises with block duration up to maxChunk', () => {
    const t = makeTask({ maxChunkMin: 60, setupCost: 0.5 });
    expect(chunkFitScore(t, 60)).toBeGreaterThan(chunkFitScore(t, 15));
  });
});

describe('adjacencyPenalty', () => {
  it('is higher for tedious-after-tedious than tedious-after-easy', () => {
    const tedious = makeTask({ tediousness: 1 });
    const easy = makeTask({ tediousness: 0 });
    const t = makeTask({ tediousness: 1 });
    const afterTedious = adjacencyPenalty(t, [tedious]);
    const afterEasy = adjacencyPenalty(t, [easy]);
    expect(afterTedious).toBeGreaterThan(afterEasy);
  });

  it('is 0 with no history', () => {
    expect(adjacencyPenalty(makeTask({ tediousness: 1 }), [])).toBe(0);
  });
});

describe('switchPenalty', () => {
  it('is 0 when category matches, 1 otherwise', () => {
    const a = makeTask({ category: 'deep_work' });
    const b = makeTask({ category: 'comms' });
    expect(switchPenalty(a, a)).toBe(0);
    expect(switchPenalty(b, a)).toBe(1);
  });

  it('is 0 when no previous task', () => {
    expect(switchPenalty(makeTask(), null)).toBe(0);
  });
});

describe('fragmentationPenalty', () => {
  it('is 0 at 2 chunks/day when slack is comfortable (static fallback)', () => {
    expect(fragmentationPenalty(makeTask(), 2)).toBe(0);
  });

  it('grows quadratically away from 2 with comfortable slack', () => {
    // Plenty of slack → dynamic target stays at 2.
    const easyTask = makeTask({
      remainingMin: 60,
      deadline: NOW + 7 * 24 * 60 * MS_PER_MIN,
    });
    expect(fragmentationPenalty(easyTask, 4, NOW)).toBeGreaterThan(
      fragmentationPenalty(easyTask, 3, NOW),
    );
  });

  it('raises target when many hours remain and deadline closes in', () => {
    // 600 minutes to do, 2 days left → needPerDay = 300, /60 = 5 → target 5
    const tight = makeTask({
      remainingMin: 600,
      deadline: NOW + 2 * 24 * 60 * MS_PER_MIN,
    });
    // 5 chunks today should now be the target → penalty zero.
    expect(fragmentationPenalty(tight, 5, NOW)).toBe(0);
    // 2 chunks should be penalized when target is high.
    expect(fragmentationPenalty(tight, 2, NOW)).toBeGreaterThan(0);
  });
});

describe('oversizePenalty', () => {
  it('is 0 below the soft cap', () => {
    const t = makeTask();
    expect(oversizePenalty(t, 60, 90)).toBe(0);
    expect(oversizePenalty(t, 90, 90)).toBe(0);
  });

  it('grows above the soft cap', () => {
    const t = makeTask();
    expect(oversizePenalty(t, 120, 90)).toBeGreaterThan(0);
    expect(oversizePenalty(t, 180, 90)).toBeGreaterThan(
      oversizePenalty(t, 120, 90),
    );
  });

  it('is mitigated by high setupCost (special circumstance)', () => {
    const normal = makeTask({ setupCost: 0.2 });
    const longSetup = makeTask({ setupCost: 0.9 });
    expect(oversizePenalty(longSetup, 150, 90)).toBeLessThan(
      oversizePenalty(normal, 150, 90),
    );
  });

  it('is mitigated by high urgencyMultiplier (rush)', () => {
    const normal = makeTask({ urgencyMultiplier: 1.0 });
    const rushed = makeTask({ urgencyMultiplier: 2.0 });
    expect(oversizePenalty(rushed, 150, 90)).toBeLessThan(
      oversizePenalty(normal, 150, 90),
    );
  });
});

describe('scoreTask integration', () => {
  it('produces deterministic results for identical inputs', () => {
    const cfg = defaultConfig();
    const t = makeTask();
    const ctx = makeContext();
    const a = scoreTask(t, ctx, cfg, NOW);
    const b = scoreTask(t, ctx, cfg, NOW);
    expect(a.total).toBe(b.total);
  });

  it('breakdown sums (with sign) to total', () => {
    const cfg = defaultConfig();
    const t = makeTask();
    const ctx = makeContext({
      prevTask: makeTask({ category: 'comms' }),
      recentWorkTasks: [makeTask({ tediousness: 1 })],
    });
    const r = scoreTask(t, ctx, cfg, NOW);
    const expected =
      r.breakdown.urgency +
      r.breakdown.staleness +
      r.breakdown.timeFit +
      r.breakdown.energyFit +
      r.breakdown.chunkFit -
      r.breakdown.adjacency -
      r.breakdown.switch -
      r.breakdown.fragmentation -
      r.breakdown.oversize;
    expect(r.total).toBeCloseTo(expected, 10);
  });
});
