import { describe, it, expect } from 'vitest';
import { questToTask, questsToTasks } from './adapter.js';
import type { QuestLike } from './adapter.js';

const NOW = new Date(2026, 4, 17, 10, 0, 0, 0).getTime();
const MS_PER_DAY = 24 * 60 * 60_000;

function makeQuest(overrides: Partial<QuestLike> = {}): QuestLike {
  return {
    id: 'q1',
    title: 'Test Quest',
    estimatedMinutes: 60,
    mentalLoad: 5,
    impact: 5,
    deadline: new Date(NOW + 2 * MS_PER_DAY),
    status: 'ACTIVE',
    tags: [],
    createdAt: new Date(NOW - MS_PER_DAY),
    updatedAt: new Date(NOW - 2 * 60_000),
    ...overrides,
  };
}

describe('questToTask', () => {
  it('maps mentalLoad 1-10 → cognitiveLoad 0-1', () => {
    expect(questToTask(makeQuest({ mentalLoad: 5 }), {}, NOW).cognitiveLoad).toBeCloseTo(0.5);
    expect(questToTask(makeQuest({ mentalLoad: 10 }), {}, NOW).cognitiveLoad).toBe(1);
  });

  it('maps impact 1-10 → importance 0-1', () => {
    expect(questToTask(makeQuest({ impact: 8 }), {}, NOW).importance).toBeCloseTo(0.8);
  });

  it('subtracts actualMinutes from remaining', () => {
    const t = questToTask(makeQuest({ estimatedMinutes: 60, actualMinutes: 20 }), {}, NOW);
    expect(t.remainingMin).toBe(40);
    expect(t.totalMin).toBe(60);
  });

  it('falls back to a future deadline when none is set', () => {
    const t = questToTask(makeQuest({ deadline: null }), {}, NOW);
    expect(t.deadline).toBeGreaterThan(NOW + 7 * MS_PER_DAY);
  });

  it('maps COMPLETE → done, RESCUE → in_progress, ACTIVE/NOT_TODAY → pending', () => {
    expect(questToTask(makeQuest({ status: 'COMPLETE' }), {}, NOW).status).toBe('done');
    expect(questToTask(makeQuest({ status: 'RESCUE' }), {}, NOW).status).toBe('in_progress');
    expect(questToTask(makeQuest({ status: 'NOT_TODAY' }), {}, NOW).status).toBe('pending');
    expect(questToTask(makeQuest({ status: 'ACTIVE' }), {}, NOW).status).toBe('pending');
  });

  it('applies overrides for non-Quest fields', () => {
    const t = questToTask(
      makeQuest(),
      {
        tediousness: 0.9,
        setupCost: 0.8,
        minChunkMin: 25,
        maxChunkMin: 90,
        category: 'creative',
        preferredHour: 14,
        dependencies: ['dep1'],
      },
      NOW,
    );
    expect(t.tediousness).toBe(0.9);
    expect(t.setupCost).toBe(0.8);
    expect(t.minChunkMin).toBe(25);
    expect(t.maxChunkMin).toBe(90);
    expect(t.category).toBe('creative');
    expect(t.preferredHour).toBe(14);
    expect(t.dependencies).toEqual(['dep1']);
  });
});

describe('questsToTasks', () => {
  it('skips COMPLETE quests', () => {
    const tasks = questsToTasks(
      [makeQuest({ id: 'a' }), makeQuest({ id: 'b', status: 'COMPLETE' })],
      {},
      NOW,
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe('a');
  });

  it('threads overrides through by id', () => {
    const tasks = questsToTasks(
      [makeQuest({ id: 'a' }), makeQuest({ id: 'b' })],
      { b: { category: 'comms' } },
      NOW,
    );
    expect(tasks.find((t) => t.id === 'a')!.category).toBe('deep_work');
    expect(tasks.find((t) => t.id === 'b')!.category).toBe('comms');
  });
});
