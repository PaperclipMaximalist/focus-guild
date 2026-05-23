import { describe, it, expect } from 'vitest';
import { generateSchedule, replan } from './replan.js';
import { applyEdit } from './edits.js';
import { defaultConfig } from './config.js';
import type { Task, UserConfig } from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function nowAt9am(): number {
  return new Date(2026, 4, 18, 9, 0, 0, 0).getTime();
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

function cfg(): UserConfig {
  return { ...defaultConfig(), horizonDays: 1 };
}

describe('replan — idempotence', () => {
  it('replanning an untouched schedule produces the same schedule', () => {
    const now = nowAt9am();
    const tasks = [task('a'), task('b')];
    const first = generateSchedule(tasks, [], cfg(), now);
    const second = replan(first.schedule, tasks, cfg(), now);
    expect(JSON.stringify(second.schedule)).toBe(JSON.stringify(first.schedule));
  });
});

describe('replan — locked preservation', () => {
  it('locked block stays at its exact start/end across replan', () => {
    const now = nowAt9am();
    const tasks = [task('a', { remainingMin: 60 }), task('b', { remainingMin: 60 })];
    const first = generateSchedule(tasks, [], cfg(), now);
    const work = first.schedule.find((b) => b.type === 'work' && b.taskId);
    expect(work).toBeTruthy();

    // User pins a block.
    const pinned = applyEdit(first.schedule, { kind: 'pin_block', blockId: work!.id });
    const after = replan(pinned, tasks, cfg(), now);

    const stillThere = after.schedule.find((b) => b.id === work!.id);
    expect(stillThere).toBeTruthy();
    expect(stillThere!.start).toBe(work!.start);
    expect(stillThere!.end).toBe(work!.end);
    expect(stillThere!.locked).toBe(true);
    expect(stillThere!.taskId).toBe(work!.taskId);
  });

  it('move_block survives replan at its new start', () => {
    const now = nowAt9am();
    const tasks = [task('a', { remainingMin: 60 })];
    const first = generateSchedule(tasks, [], cfg(), now);
    const work = first.schedule.find((b) => b.type === 'work' && b.taskId)!;

    const newStart = now + 4 * MS_PER_HOUR;
    const moved = applyEdit(first.schedule, {
      kind: 'move_block',
      blockId: work.id,
      newStart,
    });
    const after = replan(moved, tasks, cfg(), now);
    const movedBlock = after.schedule.find((b) => b.id === work.id);
    expect(movedBlock!.start).toBe(newStart);
    expect(movedBlock!.locked).toBe(true);
  });
});

describe('replan — past blocks untouched', () => {
  it('never alters blocks that end before now', () => {
    const now = nowAt9am();
    // Construct a schedule with a "past" block manually.
    const pastBlock = {
      id: 'past-1',
      start: now - 2 * MS_PER_HOUR,
      end: now - MS_PER_HOUR,
      type: 'work' as const,
      taskId: 'a',
      locked: false,
      note: null,
    };
    const tasks = [task('a', { remainingMin: 30 })];
    const initial = generateSchedule(tasks, [], cfg(), now);
    const withPast = [pastBlock, ...initial.schedule];

    const after = replan(withPast, tasks, cfg(), now);
    const stillThere = after.schedule.find((b) => b.id === 'past-1');
    expect(stillThere).toEqual(pastBlock);
  });
});
