/**
 * The "won't finish" banner's lines: what fits, and what a tap would change.
 * `now` is injected; times are compared as instants, so these are
 * timezone-stable (only the weekday/time wording is local).
 */
import { describe, expect, it } from 'vitest';
import { shortfallLine } from './shortfall';
import type { Quest, ScheduleBlock } from './api';

const MIN = 60_000;
const HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 5, 9, 0, 0);

const quest = (over: Partial<Quest> = {}): Quest => ({
  id: 'q1', userId: 'u', title: 'Chem IA', estimatedMinutes: 240, mentalLoad: 8, impact: 5,
  deadline: new Date(NOW + 30 * HOUR).toISOString(), status: 'ACTIVE', tags: [], completedAt: null,
  createdAt: new Date(NOW).toISOString(), ...over,
} as Quest);

const block = (id: string, startH: number, min: number, taskId = 'q1'): ScheduleBlock => ({
  id, start: new Date(NOW + startH * HOUR).toISOString(), end: new Date(NOW + startH * HOUR + min * MIN).toISOString(),
  durationMin: min, type: 'work', taskId, locked: false, note: null,
});

const issue = { taskId: 'q1', shortfallMin: 100, suggestions: ['extend_deadline_by:100m'] };

describe('shortfallLine', () => {
  it('says how much fits before the deadline, counting only this quest before it', () => {
    const plan = [block('a', 1, 90), block('b', 4, 50), block('late', 40, 60), block('other', 2, 60, 'q2')];
    const line = shortfallLine(issue, quest(), plan, NOW);
    expect(line.fitsMin).toBe(140);
    expect(line.neededMin).toBe(240);
    expect(line.sentence).toMatch(/^2h 20m of 4h fits before /);
    expect(line.sentence).not.toMatch(/extend_deadline|100m$/);
  });

  it('offers a day more and a trim, each as the exact quest edit', () => {
    const line = shortfallLine(issue, quest(), [block('a', 1, 140)], NOW);
    expect(line.choices.map((c) => c.kind)).toEqual(['deadline', 'estimate']);
    const [later, trim] = line.choices;
    expect(new Date((later!.fields as { deadline: string }).deadline).getTime()).toBe(NOW + 54 * HOUR);
    expect(later!.label).toMatch(/^Due .+ instead$/);
    expect(trim!.fields).toEqual({ estimatedMinutes: 140 });
    expect(trim!.label).toBe('Trim it by 1h 40m');
  });

  it('a quest that got nothing says so and cannot be trimmed to nothing', () => {
    const line = shortfallLine({ ...issue, shortfallMin: 240 }, quest(), [], NOW);
    expect(line.sentence).toMatch(/^None of its 4h fits before /);
    expect(line.choices.map((c) => c.kind)).toEqual(['deadline']);
  });

  it('an unknown quest still gets a sentence and no actions', () => {
    const line = shortfallLine(issue, undefined, [block('a', 1, 30)], NOW);
    expect(line.sentence).toBe('30m of 2h 10m fits in this plan');
    expect(line.choices).toEqual([]);
  });
});
