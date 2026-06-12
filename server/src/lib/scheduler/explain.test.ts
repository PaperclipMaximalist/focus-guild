/**
 * Explain integration test: the constructor stashes a dominant-term note,
 * and explainBlock() turns it into a human-readable sentence.
 */

import { describe, it, expect } from 'vitest';
import { generateSchedule } from './replan.js';
import { explainBlock } from './explain.js';
import { defaultConfig } from './config.js';
import type { Task, UserConfig } from './types.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

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

describe('explainBlock', () => {
  it('returns a non-empty sentence for a placed work block', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a', { name: 'Ship feature' })];
    const { schedule } = generateSchedule(tasks, [], cfg(), now);
    const blk = schedule.find((b) => b.type === 'work' && b.taskId === 'a')!;
    const msg = explainBlock(blk.id, schedule, tasks);
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
    // The dominant-term sentence should always be informative, never the
    // fallback "Working on this quest." when a note exists.
    expect(msg).not.toBe('Working on this quest.');
  });

  it('references the task name when one is available', () => {
    const now = nowAt9amUtc();
    const tasks = [task('a', { name: 'Ship the PR' })];
    const { schedule } = generateSchedule(tasks, [], cfg(), now);
    const blk = schedule.find((b) => b.type === 'work' && b.taskId === 'a')!;
    const msg = explainBlock(blk.id, schedule, tasks);
    // Most term sentences mention the task by name; energy/urgency definitely do.
    // We don't pin the exact wording, but the name should appear in most cases.
    expect(msg.includes('Ship the PR') || msg.startsWith('Best fit')).toBe(true);
  });

  it('returns the not-found message for an unknown id', () => {
    const now = nowAt9amUtc();
    const { schedule } = generateSchedule([task('a')], [], cfg(), now);
    expect(explainBlock('does-not-exist', schedule, [])).toMatch(/not found/);
  });
});
