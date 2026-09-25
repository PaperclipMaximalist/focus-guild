import { describe, expect, it } from 'vitest';
import { defaultConfig } from './config.js';
import { calibrateEstimates, computeInsights, multiplierFor, suggestWorkingHours } from './insights.js';
import type { Block, Task } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.UTC(2026, 8, 28, 7, 0); // Monday 07:00 UTC
const cfg = { ...defaultConfig(), tzOffsetMin: 0 };

const block = (start: number, mins: number, type: Block['type'], taskId: string | null = null): Block => ({
  id: `${type}-${start}`, start, end: start + mins * MIN, type, taskId, locked: type === 'fixed', note: null,
});

const task = (id: string, remainingMin: number): Task => ({
  id, name: id, remainingMin, totalMin: remainingMin, deadline: now + 14 * DAY, tediousness: 0.4, cognitiveLoad: 0.5,
  importance: 0.5, setupCost: 0.3, minChunkMin: 15, maxChunkMin: 90, category: 'deep_work', preferredHour: null,
  dependencies: [], createdAt: now - DAY, lastWorkedAt: null, status: 'pending', urgencyMultiplier: 1,
});

describe('calibrateEstimates', () => {
  const s = (category: string, est: number, act: number) => ({ category, estimatedMinutes: est, actualMinutes: act });

  it('trusts the user until there is enough data', () => {
    expect(calibrateEstimates([s('deep_work', 30, 60), s('deep_work', 30, 60)])).toBeNull();
  });

  it('learns a median rate, per category where it can', () => {
    const cal = calibrateEstimates([
      s('deep_work', 30, 45), s('deep_work', 60, 90), s('deep_work', 20, 30), s('deep_work', 40, 60),
      s('admin', 10, 10), s('admin', 20, 19), s('admin', 15, 16),
    ])!;
    expect(cal.byCategory['deep_work']).toBe(1.5);
    expect(cal.byCategory['admin']).toBe(1); // within the ±15% deadband
    expect(cal.sample).toBe(7);
    expect(multiplierFor(cal, 'deep_work')).toBe(1.5);
    expect(multiplierFor(cal, 'creative')).toBe(cal.global);
  });

  it('is not moved by one wild outlier and stays within bounds', () => {
    const cal = calibrateEstimates([
      s('deep_work', 30, 30), s('deep_work', 30, 33), s('deep_work', 30, 30), s('deep_work', 30, 31),
      s('deep_work', 30, 3000),
    ])!;
    expect(cal.global).toBe(1);
    const wild = calibrateEstimates(Array.from({ length: 6 }, () => s('deep_work', 10, 100)))!;
    expect(wild.global).toBe(2); // clamped
  });
});

describe('computeInsights', () => {
  it('names overdue quests that fell out of the plan', () => {
    const r = computeInsights({
      schedule: [], tasks: [], routineBlocks: [], calendarBlocks: [], config: cfg, now, calibration: null,
      quests: [{ id: 'a', title: 'Lab report', deadline: new Date(now - 2 * DAY) }],
    });
    expect(r.overdue).toEqual([{ id: 'a', title: 'Lab report', daysOverdue: 2 }]);
    expect(r.notes[0]).toMatch(/Lab report.*overdue/);
  });

  it('says when routines crowd out quest time', () => {
    const routineBlocks: Block[] = [];
    for (let d = 0; d < 7; d++) routineBlocks.push(block(now + d * DAY + 2 * HOUR, 6 * 60, 'fixed'));
    const r = computeInsights({
      schedule: [], tasks: [], quests: [], calendarBlocks: [], config: cfg, now, calibration: null, routineBlocks,
    });
    expect(r.capacity.routines).toBe(360);
    expect(r.notes.join(' ')).toMatch(/routines take 6h of your 9h day/);
  });

  it('turns an undated backlog into a pace', () => {
    const tasks = [task('big', 50 * 60)];
    const schedule = Array.from({ length: 7 }, (_, d) => block(now + d * DAY + 3 * HOUR, 60, 'work', 'big'));
    const r = computeInsights({
      schedule, tasks, routineBlocks: [], calendarBlocks: [], config: cfg, now, calibration: null,
      quests: [{ id: 'big', title: 'Novel', deadline: null }],
    });
    expect(r.backlog).toEqual({ undatedMin: 3000, plannedThisWeekMin: 420, weeksToClear: 8 });
    expect(r.notes.join(' ')).toMatch(/about 8 weeks/);
  });

  it('stays quiet on a healthy plan', () => {
    const r = computeInsights({
      schedule: [], tasks: [], quests: [], routineBlocks: [], calendarBlocks: [], config: cfg, now, calibration: null,
    });
    expect(r.notes).toEqual([]);
    expect(r.hoursSuggestion).toBeNull();
  });
});

describe('suggestWorkingHours', () => {
  it('suggests after-school hours when school fills the default day', () => {
    // School 08:40–15:10 on five days of the plan.
    const school = Array.from({ length: 5 }, (_, d) => block(now + d * DAY + 1 * HOUR + 40 * MIN, 390, 'fixed'));
    const s = suggestWorkingHours(school, cfg, now)!;
    expect(s.startHour).toBe(15.5);
    expect(s.endHour).toBe(22);
    expect(s.reason).toMatch(/9:00–18:00 on 5 days/);
  });

  it('does not suggest anything for a normal calendar', () => {
    const meetings = Array.from({ length: 5 }, (_, d) => block(now + d * DAY + 3 * HOUR, 60, 'fixed'));
    expect(suggestWorkingHours(meetings, cfg, now)).toBeNull();
  });
});
