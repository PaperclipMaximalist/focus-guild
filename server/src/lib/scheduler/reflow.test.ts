/**
 * Reflow / replan minimal-perturbation tests. The promise: an edit that
 * doesn't invalidate existing blocks should NOT shuffle them.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { defaultConfig } from './config.js';
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
    id, name: id, remainingMin: 60, totalMin: 60,
    deadline: now + 3 * DAY,
    tediousness: 0.3, cognitiveLoad: 0.5, importance: 0.5,
    setupCost: 0.3, minChunkMin: 15, maxChunkMin: 60,
    category: 'deep_work', preferredHour: null, dependencies: [],
    createdAt: now - DAY, lastWorkedAt: null,
    status: 'pending', urgencyMultiplier: 1.0,
    ...overrides,
  };
}

const cfg = (): UserConfig => ({ ...defaultConfig(), tzOffsetMin: 0, horizonDays: 1 });

describe('reflow — minimal perturbation', () => {
  it('adding a new quest does not move existing blocks', () => {
    const now = nowAt9amUtc();
    const original = [task('a'), task('b')];
    const first = generateSchedule(original, [], cfg(), now);
    const originalWork = first.schedule.filter((b) => b.type === 'work' && b.taskId);

    // User adds a third quest. Replan should keep a's and b's blocks where
    // they were, just slot c in around them.
    const expanded = [...original, task('c', { remainingMin: 30 })];
    const after = replan(first.schedule, expanded, cfg(), now);

    for (const orig of originalWork) {
      const stillThere = after.schedule.find((b) => b.id === orig.id);
      expect(stillThere).toBeTruthy();
      expect(stillThere!.start).toBe(orig.start);
      expect(stillThere!.end).toBe(orig.end);
      expect(stillThere!.taskId).toBe(orig.taskId);
    }
    // And c should have at least one block placed.
    expect(after.schedule.some((b) => b.taskId === 'c')).toBe(true);
  });

  it('deleting a quest frees its time but leaves siblings alone', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a'), task('b'), task('c')];
    const first = generateSchedule(tasks, [], cfg(), now);
    const aBlock = first.schedule.find((b) => b.taskId === 'a')!;
    const bBlocks = first.schedule.filter((b) => b.taskId === 'b');
    const cBlocks = first.schedule.filter((b) => b.taskId === 'c');

    // User deletes quest a. b + c should not move.
    const remaining = tasks.filter((t) => t.id !== 'a');
    const after = replan(first.schedule, remaining, cfg(), now);

    expect(after.schedule.find((b) => b.id === aBlock.id)).toBeUndefined();
    for (const orig of [...bBlocks, ...cBlocks]) {
      const stillThere = after.schedule.find((b) => b.id === orig.id);
      expect(stillThere).toBeTruthy();
      expect(stillThere!.start).toBe(orig.start);
    }
  });

  it('an idempotent replan with no changes produces an identical schedule', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a'), task('b'), task('c')];
    const first = generateSchedule(tasks, [], cfg(), now);
    const second = replan(first.schedule, tasks, cfg(), now);
    expect(JSON.stringify(second.schedule)).toBe(JSON.stringify(first.schedule));
  });

  it('a block whose task got marked done is dropped, others kept', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a'), task('b')];
    const first = generateSchedule(tasks, [], cfg(), now);
    const aBlock = first.schedule.find((b) => b.taskId === 'a');
    const bBlocks = first.schedule.filter((b) => b.taskId === 'b');

    const tasksAfter = tasks.map((t) => (t.id === 'a' ? { ...t, status: 'done' as const } : t));
    const after = replan(first.schedule, tasksAfter, cfg(), now);
    expect(after.schedule.find((b) => b.id === aBlock!.id)).toBeUndefined();
    for (const orig of bBlocks) {
      expect(after.schedule.find((b) => b.id === orig.id && b.start === orig.start)).toBeTruthy();
    }
  });

  it('past blocks are preserved untouched', () => {
    const now = nowAt9amUtc();
    const pastBlock = {
      id: 'past-1',
      start: now - 2 * HOUR,
      end: now - HOUR,
      type: 'work' as const,
      taskId: 'a',
      locked: false,
      note: null,
    };
    const tasks = [task('a', { remainingMin: 30 })];
    const initial = generateSchedule(tasks, [], cfg(), now);
    const withPast = [pastBlock, ...initial.schedule];
    const after = replan(withPast, tasks, cfg(), now);
    expect(after.schedule.find((b) => b.id === 'past-1')).toEqual(pastBlock);
  });

  it('an explicitly user-locked future block keeps its locked flag', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a')];
    const first = generateSchedule(tasks, [], cfg(), now);
    const aBlock = first.schedule.find((b) => b.taskId === 'a')!;
    const withLock = first.schedule.map((b) => (b.id === aBlock.id ? { ...b, locked: true } : b));
    const after = replan(withLock, tasks, cfg(), now);
    const stillThere = after.schedule.find((b) => b.id === aBlock.id);
    expect(stillThere!.locked).toBe(true);
  });
});
