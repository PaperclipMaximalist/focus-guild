/**
 * Replanning through a real day. The first plan is tidy; the plan a replan
 * starts from, after sessions that ran over, skipped blocks, a check-in and
 * a few edits, is not. Each case here was a violation the population lab
 * counted once `liveWeek` started checking every plan of the week.
 */
import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { applyEdit } from './edits.js';
import { defaultConfig } from './config.js';
import type { Block, Task, UserConfig } from './types.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Midnight UTC; configs here have no tzOffsetMin, so hours are UTC hours (9–17). */
const D0 = Date.UTC(2026, 4, 18);
const at = (day: number, hour: number) => D0 + day * DAY + hour * HOUR;

function task(id: string, over: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    remainingMin: 60,
    totalMin: over.remainingMin ?? 60,
    deadline: at(1, 23.99),
    tediousness: 0.3,
    cognitiveLoad: 0.5,
    importance: 0.5,
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

const cfg = (over: Partial<UserConfig> = {}): UserConfig => ({ ...defaultConfig(), horizonDays: 3, ...over });
const work = (id: string, taskId: string, start: number, min: number, locked = false): Block => ({
  id, start, end: start + min * MIN, type: 'work', taskId, locked, note: null,
});
const isWork = (b: Block) => b.type === 'work' && !!b.taskId;
const mins = (b: Block) => (b.end - b.start) / MIN;
const onDay = (schedule: Block[], day: number) => schedule.filter((b) => isWork(b) && b.start >= at(day, 0) && b.start < at(day + 1, 0));
const total = (blocks: Block[]) => blocks.reduce((m, b) => m + mins(b), 0);
const aheadFor = (schedule: Block[], id: string, now: number) =>
  total(schedule.filter((b) => b.taskId === id && b.end > now).map((b) => ({ ...b, start: Math.max(b.start, now) })));
const noOverlap = (schedule: Block[]) => {
  const w = schedule.filter(isWork).sort((a, b) => a.start - b.start);
  return w.every((b, i) => i === 0 || b.start >= w[i - 1]!.end);
};

describe("the check-in's minutes hold all day", () => {
  it('counts the blocks of today that are already behind us', () => {
    // "2 hours today", 8 hours due tomorrow. The cap bounded only what each
    // replan added, so by mid-afternoon the day held four hours.
    const c = cfg({ todayCapMin: 120 });
    const tasks = [task('a', { remainingMin: 240 }), task('b', { remainingMin: 240 })];
    const first = generateSchedule(tasks, [], c, at(0, 9)).schedule;
    const later = at(0, 15);
    const again = replan(first, tasks, c, later).schedule;
    expect(total(onDay(again, 0))).toBeLessThanOrEqual(125);
  });

  it('shrinks today to a check-in made after the plan, keeping what is due soonest', () => {
    const now = at(0, 9);
    const tasks = [
      task('soon', { remainingMin: 50, deadline: at(0, 23.99) }),
      task('later', { remainingMin: 150, deadline: at(2, 23.99) }),
    ];
    const blocks = [work('blk-1', 'later', at(0, 9), 50), work('blk-2', 'later', at(0, 10), 50), work('blk-3', 'soon', at(0, 11), 50), work('blk-4', 'later', at(0, 13), 50)];
    const { schedule } = replan(blocks, tasks, cfg({ todayCapMin: 60 }), now);
    expect(total(onDay(schedule, 0))).toBeLessThanOrEqual(65);
    expect(schedule.find((b) => b.id === 'blk-3')?.start).toBe(at(0, 11));
    // The essay's minutes are still owed, on another day.
    expect(aheadFor(schedule, 'later', now)).toBe(150);
  });
});

describe('a block that began before now', () => {
  it('keeps only the part still ahead, and replans the minutes that went by', () => {
    // The last quest ran 20 minutes over. "a" read 14:00–14:50 and counted
    // for 50 minutes, so 20 of them were never planned again.
    const now = at(0, 14) + 20 * MIN;
    const tasks = [task('a', { remainingMin: 50 })];
    const { schedule } = replan([work('blk-1', 'a', at(0, 14), 50)], tasks, cfg(), now);
    const kept = schedule.find((b) => b.id === 'blk-1')!;
    expect(kept.start).toBe(now);
    expect(kept.end).toBe(at(0, 14) + 50 * MIN);
    expect(schedule.filter((b) => isWork(b) && b.end > now).every((b) => b.start >= now)).toBe(true);
    expect(aheadFor(schedule, 'a', now)).toBe(50);
    expect(noOverlap(schedule)).toBe(true);
  });

  it('lets go of a block with only a few minutes left in it', () => {
    const now = at(0, 14) + 42 * MIN;
    const tasks = [task('a', { remainingMin: 50 })];
    const { schedule } = replan([work('blk-1', 'a', at(0, 14), 50)], tasks, cfg(), now);
    // Eight minutes aren't a sitting: the quest is planned afresh from now.
    expect(schedule.filter(isWork).every((b) => b.start >= now)).toBe(true);
    expect(aheadFor(schedule, 'a', now)).toBe(50);
  });
});

describe('a quest never holds more than it has left', () => {
  it('gives up the latest surplus when the quest got shorter', () => {
    // 100 minutes planned, then a session logged more than its block: 40 left.
    const now = at(0, 9);
    const tasks = [task('a', { remainingMin: 40, totalMin: 150 })];
    const blocks = [work('blk-1', 'a', at(0, 10), 50), work('blk-2', 'a', at(0, 13), 50)];
    const { schedule } = replan(blocks, tasks, cfg(), now);
    expect(aheadFor(schedule, 'a', now)).toBe(40);
    const first = schedule.find((b) => b.id === 'blk-1')!;
    expect(first.start).toBe(at(0, 10));
    expect(mins(first)).toBe(40);
    expect(schedule.find((b) => b.id === 'blk-2')).toBeUndefined();
  });

  it('leaves a block alone over a couple of minutes', () => {
    const tasks = [task('a', { remainingMin: 47 })];
    const { schedule } = replan([work('blk-1', 'a', at(0, 10), 50)], tasks, cfg(), at(0, 9));
    expect(mins(schedule.find((b) => b.id === 'blk-1')!)).toBe(50);
  });
});

describe('blocks the plan can no longer stand on', () => {
  it('"Not Today" takes the quest\'s blocks off today', () => {
    const now = at(0, 9);
    const tasks = [task('a', { remainingMin: 100, deadline: at(2, 23.99) })];
    const blocks = [work('blk-1', 'a', at(0, 10), 50), work('blk-2', 'a', at(1, 10), 50)];
    const deferred = tasks.map((t) => ({ ...t, notBefore: at(1, 0) }));
    const { schedule } = replan(blocks, deferred, cfg(), now);
    expect(onDay(schedule, 0)).toHaveLength(0);
    expect(schedule.find((b) => b.id === 'blk-2')?.start).toBe(at(1, 10));
    expect(aheadFor(schedule, 'a', now)).toBe(100);
  });

  it('moves unpinned work that fell outside changed hours, and leaves a pinned block', () => {
    const now = at(0, 8);
    const tasks = [task('a', { remainingMin: 50 }), task('b', { remainingMin: 50 })];
    const blocks = [work('blk-1', 'a', at(0, 9), 50), work('blk-2', 'b', at(0, 10), 50, true)];
    const { schedule } = replan(blocks, tasks, cfg({ workingHours: { startHour: 13, endHour: 18 } }), now);
    const a = schedule.filter((b) => b.taskId === 'a');
    expect(total(a)).toBe(50);
    expect(a.every((b) => b.start >= at(0, 13))).toBe(true);
    expect(schedule.find((b) => b.id === 'blk-2')?.start).toBe(at(0, 10));
  });

  it('makes room when the user drags a block onto another', () => {
    const now = at(0, 9);
    const tasks = [task('a', { remainingMin: 50 }), task('b', { remainingMin: 50 })];
    const blocks = [work('blk-1', 'a', at(0, 10), 50), work('blk-2', 'b', at(0, 14), 50)];
    const moved = applyEdit(blocks, { kind: 'move_block', blockId: 'blk-2', newStart: at(0, 10) + 20 * MIN });
    const { schedule } = replan(moved, tasks, cfg(), now);
    expect(noOverlap(schedule)).toBe(true);
    expect(aheadFor(schedule, 'a', now)).toBe(50);
    expect(schedule.find((b) => b.id === 'blk-2')?.start).toBe(at(0, 10) + 20 * MIN);
  });
});

describe('done for today means done', () => {
  // Monday's plan: one block of the essay (due next week), now finished.
  const essay = task('essay', { remainingMin: 250, totalMin: 300, deadline: at(9, 23.99) });
  const done = work('blk-1', 'essay', at(0, 10), 50);
  const rest = [work('blk-2', 'essay', at(1, 10), 50), work('blk-3', 'essay', at(2, 10), 50)];
  const now = at(0, 10) + 50 * MIN;

  it("doesn't answer the day's last block with more work that could wait", () => {
    // The notes skipped this morning are owed again, and due on Friday.
    const notes = task('notes', { remainingMin: 60, deadline: at(4, 23.99) });
    const skipped = work('blk-0', 'notes', at(0, 9), 50);
    const { schedule } = replan([skipped, done, ...rest], [essay, notes], cfg(), now);
    expect(onDay(schedule, 0).filter((b) => b.end > now)).toHaveLength(0);
    expect(aheadFor(schedule, 'notes', now)).toBe(60);
  });

  it('still brings in work due tomorrow', () => {
    const report = task('report', { remainingMin: 45, deadline: at(1, 12) });
    const { schedule } = replan([done, ...rest], [essay, report], cfg(), now);
    const today = onDay(schedule, 0).filter((b) => b.end > now);
    expect(today.map((b) => b.taskId)).toEqual(['report']);
  });

  it('plans a quest the user just added, today, whatever its deadline', () => {
    const errand = task('errand', { remainingMin: 30, deadline: at(9, 23.99), cognitiveLoad: 0.3 });
    const without = replan([done, ...rest], [essay, errand], cfg(), now).schedule;
    expect(onDay(without, 0).filter((b) => b.end > now)).toHaveLength(0);
    const asked = replan([done, ...rest], [essay, errand], cfg(), now, { addTaskIds: ['errand'] }).schedule;
    expect(onDay(asked, 0).filter((b) => b.taskId === 'errand')).toHaveLength(1);
  });

  it('refills time a quest finished early gave back, while the day still has work ahead', () => {
    // 10:00 finished after 20 minutes; the 13:00 block is still to come.
    const early = at(0, 10) + 20 * MIN;
    const other = task('other', { remainingMin: 50, totalMin: 100, deadline: at(9, 23.99) });
    const chore = task('chore', { remainingMin: 25, totalMin: 25, deadline: at(2, 23.99), cognitiveLoad: 0.3 });
    const blocks = [work('blk-1', 'gone', at(0, 10), 50), work('blk-2', 'other', at(0, 13), 50)];
    const { schedule } = replan(blocks, [other, chore], cfg(), early);
    const today = onDay(schedule, 0).filter((b) => b.end > early);
    expect(schedule.find((b) => b.id === 'blk-2')?.start).toBe(at(0, 13));
    // Today held 80 minutes ahead (30 of the finished block, 50 at 13:00): it may hold that again, no more.
    expect(total(today)).toBeGreaterThan(50);
    expect(total(today)).toBeLessThanOrEqual(80);
  });
});

describe('skipped work is spread, not stacked on tomorrow', () => {
  it('puts a waiting quest on the lightest day it can use', () => {
    // Monday evening. Tuesday already holds three blocks, Wednesday one, and
    // the reading skipped today is owed again.
    const now = at(0, 18);
    const x = task('x', { remainingMin: 200, totalMin: 200, deadline: at(6, 23.99) });
    const reading = task('reading', { remainingMin: 50, totalMin: 50, deadline: at(3, 23.99) });
    const blocks = [
      work('blk-0', 'reading', at(0, 10), 50),
      work('blk-1', 'x', at(1, 9), 50), work('blk-2', 'x', at(1, 10), 50), work('blk-3', 'x', at(1, 11), 50),
      work('blk-4', 'x', at(2, 9), 50),
    ];
    const { schedule } = replan(blocks, [x, reading], cfg({ horizonDays: 4 }), now);
    const again = schedule.filter((b) => b.taskId === 'reading' && b.end > now);
    expect(total(again)).toBe(50);
    expect(again.every((b) => b.start >= at(2, 0))).toBe(true);
  });
});
