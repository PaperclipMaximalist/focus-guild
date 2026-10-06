/** The block sheet's "Why this?": facts the tile doesn't show. */
import { describe, expect, it } from 'vitest';
import { blockDetail } from './blockDetail';
import type { Quest, ScheduleBlock } from './api';

const MIN = 60_000;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 9, 5, 9, 0, 0);

const block = (id: string, startH: number, min: number, taskId = 'q1'): ScheduleBlock => ({
  id, start: new Date(T0 + startH * HOUR).toISOString(), end: new Date(T0 + startH * HOUR + min * MIN).toISOString(),
  durationMin: min, type: 'work', taskId, locked: false, note: null, reason: 'Due tomorrow · high priority',
});
const quest = { id: 'q1', title: 'Essay', deadline: new Date(T0 + 30 * HOUR).toISOString() } as Quest;

describe('blockDetail', () => {
  it('adds the deadline and what is planned after this block, never the tile sentence', () => {
    const plan = [block('a', 0, 50), block('b', 2, 40), block('c', 5, 30), block('x', 3, 60, 'q2')];
    const text = blockDetail(plan[0]!, quest, plan);
    expect(text).toMatch(/^Due .+\. After this, 1h 10m more of it is planned; next /);
    expect(text).not.toContain(plan[0]!.reason!);
  });

  it('says so on the last block, and for a quest with no deadline', () => {
    const plan = [block('a', 0, 50), block('b', 2, 40)];
    expect(blockDetail(plan[1]!, { ...quest, deadline: null } as Quest, plan)).toBe('No deadline. This is the last block planned for it.');
  });
});
