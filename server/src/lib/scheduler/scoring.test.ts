/**
 * Unit tests for the Phase A scoring terms: each term is tested in
 * isolation so a regression points at exactly one helper.
 *
 * The integration behavior (which task wins a given slot) is covered by
 * planner.test.ts; this file pins the math of the individual primitives.
 */

import { describe, it, expect } from 'vitest';
import {
  energyFit,
  urgencyFit,
  monotonyPenalty,
  tediumClash,
  cooldownClash,
  batchBonus,
  sessionSizePenalty,
  idealSessionRange,
  taskMode,
} from './planner.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function nowAt9amUtc(): number {
  // 2026-05-18 09:00 UTC. Tests pin tzOffsetMin=0 so all hour math is UTC.
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

function block(taskId: string, startMs: number, durMin: number): Block {
  return {
    id: `b-${startMs}`,
    start: startMs,
    end: startMs + durMin * MIN,
    type: 'work',
    taskId,
    locked: false,
    note: null,
  };
}

const cfg: UserConfig = { ...defaultConfig(), tzOffsetMin: 0 };

describe('energyFit', () => {
  it('is ~1 when cognitive load matches capacity at the hour', () => {
    // Default curve at 10am ≈ 0.925 (between 0.9 at 9 and 0.95 at 11)
    const t = task('t', { cognitiveLoad: 0.925 });
    const start = Date.UTC(2026, 4, 18, 10, 0, 0, 0);
    expect(energyFit(t, start, cfg)).toBeGreaterThan(0.95);
  });

  it('is low when cognitive load mismatches capacity', () => {
    // High-load task at the 2pm dip (curve ~0.4).
    const t = task('t', { cognitiveLoad: 0.9 });
    const start = Date.UTC(2026, 4, 18, 14, 0, 0, 0);
    expect(energyFit(t, start, cfg)).toBeLessThan(0.6);
  });

  it('is in [0, 1]', () => {
    const t = task('t', { cognitiveLoad: 1 });
    for (let h = 0; h < 24; h += 1) {
      const v = energyFit(t, Date.UTC(2026, 4, 18, h, 0, 0, 0), cfg);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('urgencyFit (slack-gated)', () => {
  it('returns ~1 when deadline is at or past now', () => {
    const t = task('t', { deadline: nowAt9amUtc() - HOUR });
    expect(urgencyFit(t, nowAt9amUtc())).toBe(1);
  });

  it('returns ~1 when slack is zero (must place now)', () => {
    const t = task('t', { remainingMin: 60, deadline: nowAt9amUtc() + HOUR });
    expect(urgencyFit(t, nowAt9amUtc())).toBeGreaterThan(0.95);
  });

  it('decays as slack grows beyond remainingMin', () => {
    const t = task('t', { remainingMin: 60, deadline: nowAt9amUtc() + 5 * HOUR });
    // 5h to deadline - 60min remaining = 4h slack > 60min remaining
    const v = urgencyFit(t, nowAt9amUtc());
    expect(v).toBeLessThan(0.3);
    expect(v).toBeGreaterThan(0);
  });

  it('high urgencyMultiplier lifts a relaxed task above baseline', () => {
    const relaxed = task('a', { remainingMin: 60, deadline: nowAt9amUtc() + 24 * HOUR, urgencyMultiplier: 1.0 });
    const boosted = task('b', { remainingMin: 60, deadline: nowAt9amUtc() + 24 * HOUR, urgencyMultiplier: 1.4 });
    expect(urgencyFit(boosted, nowAt9amUtc())).toBeGreaterThan(urgencyFit(relaxed, nowAt9amUtc()));
  });
});

describe('monotonyPenalty (mode-based)', () => {
  it('is 0 with no prior placements', () => {
    const t = task('t');
    expect(monotonyPenalty(t, nowAt9amUtc(), [])).toBe(0);
  });

  it('is 0 with one same-mode predecessor (single repeat is fine)', () => {
    const t = task('t', { cognitiveLoad: 0.8, tediousness: 0.2, category: 'deep_work' });
    const prevTask = task('p', { cognitiveLoad: 0.8, tediousness: 0.2, category: 'deep_work' });
    const placed = [{ block: block('p', nowAt9amUtc(), 30), task: prevTask }];
    expect(monotonyPenalty(t, nowAt9amUtc() + 31 * MIN, placed)).toBe(0);
  });

  it('grows quadratically with the same-mode run', () => {
    const same = (id: string) => task(id, { cognitiveLoad: 0.8, tediousness: 0.2, category: 'deep_work' });
    const placed = [0, 30, 60].map((m) => ({ block: block(`p${m}`, nowAt9amUtc() + m * MIN, 30), task: same(`p${m}`) }));
    // 3 same-mode predecessors → (3-1)²/4 = 1 → capped
    const pen = monotonyPenalty(same('next'), nowAt9amUtc() + 95 * MIN, placed);
    expect(pen).toBe(1);
  });

  it('is 0 if predecessor has different mode (different category)', () => {
    const t = task('t', { category: 'deep_work', cognitiveLoad: 0.8, tediousness: 0.2 });
    const prevTask = task('p', { category: 'admin', cognitiveLoad: 0.8, tediousness: 0.2 });
    const placed = [{ block: block('p', nowAt9amUtc(), 30), task: prevTask }];
    expect(monotonyPenalty(t, nowAt9amUtc() + 31 * MIN, placed)).toBe(0);
  });
});

describe('tediumClash + cooldownClash', () => {
  it('tediumClash is 1 only for back-to-back high-tedium', () => {
    const t = task('t', { tediousness: 0.8 });
    expect(tediumClash(t, task('p', { tediousness: 0.8 }))).toBe(1);
    expect(tediumClash(t, task('p', { tediousness: 0.3 }))).toBe(0);
    expect(tediumClash(t, null)).toBe(0);
  });

  it('cooldownClash is 1 only for back-to-back high-load', () => {
    const t = task('t', { cognitiveLoad: 0.9 });
    expect(cooldownClash(t, task('p', { cognitiveLoad: 0.9 }))).toBe(1);
    expect(cooldownClash(t, task('p', { cognitiveLoad: 0.5 }))).toBe(0);
  });
});

describe('batchBonus', () => {
  it('rewards short admin/comms after same-category prev', () => {
    const t = task('t', { category: 'admin' });
    const p = task('p', { category: 'admin' });
    expect(batchBonus(t, 20, p)).toBeGreaterThan(0);
  });

  it('does not reward long chunks', () => {
    const t = task('t', { category: 'admin' });
    const p = task('p', { category: 'admin' });
    expect(batchBonus(t, 45, p)).toBe(0);
  });

  it('does not reward deep_work chains (clustering restricted to admin)', () => {
    const t = task('t', { category: 'deep_work' });
    const p = task('p', { category: 'deep_work' });
    expect(batchBonus(t, 20, p)).toBe(0);
  });
});

describe('idealSessionRange', () => {
  it('shrinks ideal range for small tasks', () => {
    const small = task('t', { remainingMin: 30 });
    const [lo, hi] = idealSessionRange(small);
    expect(hi).toBeLessThanOrEqual(30);
    expect(lo).toBeLessThanOrEqual(hi);
  });

  it('uses 20..60 for medium tasks', () => {
    const med = task('t', { remainingMin: 90, minChunkMin: 1, maxChunkMin: 240 });
    const [lo, hi] = idealSessionRange(med);
    expect(lo).toBe(20);
    expect(hi).toBe(60);
  });

  it('uses 30..90 for big tasks', () => {
    const big = task('t', { remainingMin: 240, minChunkMin: 1, maxChunkMin: 240 });
    const [lo, hi] = idealSessionRange(big);
    expect(lo).toBe(30);
    expect(hi).toBe(90);
  });

  it('respects per-task minChunkMin as outer floor', () => {
    const t = task('t', { remainingMin: 30, minChunkMin: 25 });
    const [lo] = idealSessionRange(t);
    expect(lo).toBeGreaterThanOrEqual(25);
  });
});

describe('sessionSizePenalty', () => {
  it('is 0 for chunks inside ideal range', () => {
    const t = task('t', { remainingMin: 120 });
    expect(sessionSizePenalty(45, t)).toBe(0); // inside 20..60
  });

  it('penalizes too-small chunks', () => {
    const t = task('t', { remainingMin: 120 });
    expect(sessionSizePenalty(10, t)).toBeGreaterThan(0);
  });

  it('penalizes too-large chunks', () => {
    const t = task('t', { remainingMin: 120 });
    expect(sessionSizePenalty(90, t)).toBeGreaterThan(0);
  });
});

describe('taskMode', () => {
  it('buckets load + tedium correctly', () => {
    const t = task('t', { cognitiveLoad: 0.85, tediousness: 0.1, category: 'creative' });
    const m = taskMode(t);
    expect(m).toEqual({ category: 'creative', load: 'high', tedium: 'low' });
  });

  it('low-load low-tedium maps cleanly', () => {
    const t = task('t', { cognitiveLoad: 0.2, tediousness: 0.2, category: 'admin' });
    expect(taskMode(t)).toEqual({ category: 'admin', load: 'low', tedium: 'low' });
  });
});
