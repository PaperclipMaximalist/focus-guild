/**
 * The shape of a day: a quest's sittings stay together, a day's share of a
 * quest is a real dose, the warm-up happens once, and nothing is a shard.
 * Each case here is one the population lab found people living with.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from './replan.js';
import { defaultConfig } from './config.js';
import { buildDayInfo, dayDose } from './budget.js';
import { constructDay } from './constructor.js';
import { reconcile } from './reconcile.js';
import { cooldownClash } from './planner.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 09:00 UTC. */
const NOW = Date.UTC(2026, 4, 18, 9, 0, 0, 0);
const MIDNIGHT = Date.UTC(2026, 4, 18);

function task(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: overrides.remainingMin ?? 60,
    deadline: NOW + 3 * DAY,
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

const cfg = (overrides: Partial<UserConfig> = {}): UserConfig => ({ ...defaultConfig(), tzOffsetMin: 0, ...overrides });
const mins = (b: { start: number; end: number }) => (b.end - b.start) / MIN;
const dayOf = (t: number) => Math.floor((t - MIDNIGHT) / DAY);
const workOf = (schedule: Block[]) => schedule.filter((b) => b.type === 'work' && b.taskId).sort((a, b) => a.start - b.start);

/** Times each quest is picked up on a day: A B A is two pickups of A. */
function pickups(work: Block[]): Map<string, number> {
  const n = new Map<string, number>();
  work.forEach((b, i) => {
    if (i === 0 || work[i - 1]!.taskId !== b.taskId) n.set(b.taskId!, (n.get(b.taskId!) ?? 0) + 1);
  });
  return n;
}

describe('a quest keeps its sittings together', () => {
  it('150 minutes of an essay among errands is at most two pickups, not one per sitting', () => {
    const tonight = MIDNIGHT + 23 * HOUR;
    const tasks = [
      task('essay', { remainingMin: 150, cognitiveLoad: 0.8, deadline: tonight }),
      task('inbox', { remainingMin: 25, cognitiveLoad: 0.3, category: 'admin', deadline: tonight }),
      task('notes', { remainingMin: 25, cognitiveLoad: 0.4, category: 'light', deadline: tonight }),
      task('receipts', { remainingMin: 20, cognitiveLoad: 0.2, category: 'admin', deadline: tonight }),
      task('portfolio', { remainingMin: 50, cognitiveLoad: 0.6, deadline: NOW + 3 * DAY }),
    ];
    // Scored block by block this day was: essay 25, portfolio 25, essay 50,
    // essay 50, notes 25, essay 25, inbox, receipts. Three pickups of the essay.
    const { schedule, feasibilityReport } = generateSchedule(tasks, [], cfg({ horizonDays: 1 }), NOW);
    expect(feasibilityReport.ok).toBe(true);
    const work = workOf(schedule);
    expect(pickups(work).get('essay')).toBeLessThanOrEqual(2);
    // Sessions, not a wall: the essay never runs past 150 minutes nearly straight.
    expect(work.filter((b) => b.taskId === 'essay').reduce((m, b) => m + mins(b), 0)).toBe(150);
  });

  it('a second sitting of the same heavy quest is not a brain-killer clash', () => {
    const essay = task('essay', { cognitiveLoad: 0.9 });
    expect(cooldownClash(essay, essay)).toBe(0);
    expect(cooldownClash(essay, task('other', { cognitiveLoad: 0.9 }))).toBe(1);
  });
});

describe("a day's share of a quest is a real dose", () => {
  it('dayDose: up to 90 minutes whole, a full sitting of anything bigger', () => {
    expect(dayDose(task('a', { remainingMin: 90 }), 90)).toBe(90);
    expect(dayDose(task('b', { remainingMin: 300 }), 300)).toBe(50);
  });

  it('a 90-minute quest due in five days is one day of work, not 25 minutes a day', () => {
    const t = task('reading', { remainingMin: 90, cognitiveLoad: 0.8, deadline: NOW + 5 * DAY });
    const { schedule } = generateSchedule([t], [], cfg({ horizonDays: 6 }), NOW);
    const work = workOf(schedule);
    expect(work.reduce((m, b) => m + mins(b), 0)).toBe(90);
    expect(new Set(work.map((b) => dayOf(b.start))).size).toBe(1);
  });

  it('a big quest with a loose deadline moves in full sittings on fewer days', () => {
    const t = task('thesis', { remainingMin: 300, cognitiveLoad: 0.8, deadline: NOW + 12 * DAY });
    const { schedule } = generateSchedule([t], [], cfg({ horizonDays: 7 }), NOW);
    const perDay = new Map<number, number>();
    for (const b of workOf(schedule)) perDay.set(dayOf(b.start), (perDay.get(dayOf(b.start)) ?? 0) + mins(b));
    expect(perDay.size).toBeGreaterThan(0);
    for (const m of perDay.values()) expect(m).toBeGreaterThanOrEqual(45);
  });
});

describe('the starter push happens once a day', () => {
  it("doesn't open with a 25-minute starter, or call it a first push, after work a replan kept", () => {
    const config = cfg({ horizonDays: 1 });
    const kept: Block = { id: 'kept', start: NOW, end: NOW + 50 * MIN, type: 'work', taskId: 'kept', locked: true, note: null };
    const tasks = [task('kept'), task('essay', { remainingMin: 100, cognitiveLoad: 0.8 })];
    const [day] = buildDayInfo(config, NOW, [kept]);
    const built = constructDay({ day: day!, quotas: [{ task: tasks[1]!, targetMin: 100 }] }, new Map(tasks.map((t) => [t.id, t])), config);
    const first = [...built.blocks].sort((a, b) => a.start - b.start)[0]!;
    expect(mins(first)).toBe(50);
    expect(first.note).not.toMatch(/first push|easy start/);
  });

  it('skips the starter when the share is under an hour: 50 minutes is one sitting, not 25 + 25', () => {
    const t = task('essay', { remainingMin: 50, cognitiveLoad: 0.8, deadline: MIDNIGHT + 23 * HOUR });
    const { schedule } = generateSchedule([t], [], cfg({ horizonDays: 1 }), NOW);
    expect(workOf(schedule).map(mins)).toEqual([50]);
  });
});

describe('no shards from reconcile', () => {
  it('7 minutes still owed lengthen the sitting the quest has, instead of a 7-minute block', () => {
    const config = cfg({ horizonDays: 1 });
    const t = task('report', { remainingMin: 47, deadline: MIDNIGHT + 17 * HOUR });
    const days = buildDayInfo(config, NOW, []);
    const start = NOW + HOUR;
    const built = [{
      blocks: [{ start, end: start + 40 * MIN, type: 'work' as const, taskId: 'report', locked: false, note: null }],
      totalScore: 0,
      unfulfilledByTaskId: new Map([['report', 7]]),
    }];
    const out = reconcile([{ day: days[0]!, quotas: [{ task: t, targetMin: 47 }] }], built, [t], new Map([[t.id, t]]), config, new Set(), NOW);
    expect(out[0]!.blocks.map(mins)).toEqual([47]);
  });
});

describe('work due today goes first', () => {
  it('ahead of an equal quest that can wait', () => {
    const tasks = [
      task('a-later', { remainingMin: 50, deadline: NOW + 4 * DAY }),
      task('b-today', { remainingMin: 50, deadline: MIDNIGHT + 23 * HOUR }),
    ];
    const { schedule } = generateSchedule(tasks, [], cfg({ horizonDays: 5 }), NOW);
    const today = workOf(schedule).filter((b) => dayOf(b.start) === 0);
    expect(today[0]!.taskId).toBe('b-today');
  });
});
