import { describe, it, expect } from 'vitest';
import { describeRepeat, nextLabel, repeatsOn } from './repeat';

const DAY = 86_400_000;
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const dates = (from: string, n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10));

// The same cases as server/src/lib/scheduler/repeat.test.ts: the two copies must agree.
describe('repeatsOn', () => {
  it('with no rule, comes round every day', () => {
    for (const d of dates('2026-10-19', 10)) expect(repeatsOn(null, d)).toBe(true);
  });
  it('weekly: on the chosen weekdays only', () => {
    const rule = { kind: 'weekly' as const, days: [1, 3, 5] };
    for (const d of dates('2026-10-19', 21)) expect(repeatsOn(rule, d), d).toBe([1, 3, 5].includes(weekday(d)));
  });
  it('every second week, counted from the week of its start', () => {
    const rule = { kind: 'weekly' as const, days: [2], every: 2, from: '2026-10-21' };
    expect(dates('2026-10-19', 42).filter((d) => repeatsOn(rule, d))).toEqual(['2026-10-20', '2026-11-03', '2026-11-17']);
  });
  it('every N days from its start, and not before it', () => {
    const rule = { kind: 'interval' as const, every: 3, from: '2026-10-20' };
    expect(dates('2026-10-18', 10).filter((d) => repeatsOn(rule, d))).toEqual(['2026-10-20', '2026-10-23', '2026-10-26']);
  });
});

describe('describeRepeat and nextLabel', () => {
  it('says it the short way', () => {
    expect(describeRepeat(null)).toBe('Every day');
    expect(describeRepeat({ kind: 'weekly', days: [5, 1, 3] })).toBe('Mon, Wed, Fri');
    expect(describeRepeat({ kind: 'weekly', days: [1, 2, 3, 4, 5] })).toBe('Weekdays');
    expect(describeRepeat({ kind: 'weekly', days: [0, 6] })).toBe('Weekends');
    expect(describeRepeat({ kind: 'weekly', days: [2], every: 2, from: '2026-10-19' })).toBe('Every 2 weeks: Tue');
    expect(describeRepeat({ kind: 'interval', every: 3, from: '2026-10-19' })).toBe('Every 3 days');
  });
  it('names the next day it comes round', () => {
    // 2026-10-19 is a Monday.
    expect(nextLabel({ kind: 'weekly', days: [0] }, '2026-10-19')).toBe('Sun');
    expect(nextLabel({ kind: 'weekly', days: [2] }, '2026-10-19')).toBe('Tomorrow');
    expect(nextLabel({ kind: 'weekly', days: [1] }, '2026-10-19')).not.toBe('Mon');
  });
});
