import { describe, it, expect } from 'vitest';
import { parseRepeat, repeatsOn } from './repeat.js';
import { placeDailyFillers } from './dailyFiller.js';
import { dayKey } from './tz.js';

const MIN = 60_000;
const DAY = 86_400_000;
/** The weekday JavaScript itself gives a calendar date (0 = Sunday). */
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const dates = (from: string, n: number) =>
  Array.from({ length: n }, (_, i) => new Date(Date.parse(`${from}T00:00:00Z`) + i * DAY).toISOString().slice(0, 10));

describe('repeatsOn', () => {
  it('with no rule, comes round every day', () => {
    for (const d of dates('2026-10-19', 10)) expect(repeatsOn(null, d)).toBe(true);
  });

  it('weekly: on the chosen weekdays only', () => {
    const rule = { kind: 'weekly' as const, days: [1, 3, 5] };
    for (const d of dates('2026-10-19', 21)) expect(repeatsOn(rule, d), d).toBe([1, 3, 5].includes(weekday(d)));
  });

  it('every second week, counted from the week of its start', () => {
    const rule = { kind: 'weekly' as const, days: [2], every: 2, from: '2026-10-21' }; // a Wednesday; Tuesdays
    const on = dates('2026-10-19', 42).filter((d) => repeatsOn(rule, d));
    expect(on).toEqual(['2026-10-20', '2026-11-03', '2026-11-17']);
  });

  it('every N days from its start, and not before it', () => {
    const rule = { kind: 'interval' as const, every: 3, from: '2026-10-20' };
    expect(dates('2026-10-18', 10).filter((d) => repeatsOn(rule, d))).toEqual(['2026-10-20', '2026-10-23', '2026-10-26']);
  });
});

describe('parseRepeat', () => {
  it('reads a stored rule, and anything malformed as every day', () => {
    expect(parseRepeat({ kind: 'weekly', days: [5, 1, 1, 9] })).toEqual({ kind: 'weekly', days: [1, 5] });
    expect(parseRepeat({ kind: 'interval', every: 2, from: '2026-10-19' })).toEqual({ kind: 'interval', every: 2, from: '2026-10-19' });
    expect(parseRepeat({ kind: 'weekly', days: [] })).toBeNull();
    expect(parseRepeat({ kind: 'weekly', days: [0, 1, 2, 3, 4, 5, 6] })).toBeNull();
    expect(parseRepeat({ kind: 'interval', every: 1, from: '2026-10-19' })).toBeNull();
    expect(parseRepeat({ kind: 'interval', every: 3 })).toBeNull();
    expect(parseRepeat('weekly')).toBeNull();
    expect(parseRepeat(null)).toBeNull();
  });
});

describe('routines that do not come round every day', () => {
  it('are placed on their own days only, by the user’s calendar, not UTC’s', () => {
    // Vancouver: a late-evening routine is the next day in UTC.
    const tz = 420;
    const now = Date.UTC(2026, 9, 19, 15, 0); // Monday 08:00 in Vancouver
    const placed = placeDailyFillers({
      fillers: [
        { id: 'laundry', name: 'Laundry', durationMin: 60, preferredHour: 20, repeat: { kind: 'weekly', days: [0, 3] } },
        { id: 'meds', name: 'Meds', durationMin: 5, preferredHour: 8 },
      ],
      now,
      horizonDays: 7,
      workingHours: { startHour: 8, endHour: 23 },
      existingFixed: [],
      tzOffsetMin: tz,
    });
    const laundry = placed.filter((b) => b.note === 'Daily: Laundry');
    expect(laundry.map((b) => weekday(dayKey(b.start, tz)))).toEqual([3, 0]);
    // 20:00 Vancouver, though that is the next day in UTC.
    for (const b of laundry) expect(new Date(b.start - tz * MIN).getUTCHours()).toBe(20);
    expect(placed.filter((b) => b.note === 'Daily: Meds')).toHaveLength(7);
  });

  it('do not move the everyday routines on the days they come round', () => {
    const now = Date.UTC(2026, 9, 19, 9, 0);
    const base = { now, horizonDays: 7, workingHours: { startHour: 9, endHour: 18 }, existingFixed: [] };
    const daily = [{ id: 'a', name: 'Stretch', durationMin: 15, preferredHour: null }, { id: 'b', name: 'Inbox', durationMin: 15, preferredHour: null }];
    const without = placeDailyFillers({ ...base, fillers: daily });
    const withWeekly = placeDailyFillers({ ...base, fillers: [...daily, { id: 'c', name: 'Plan the week', durationMin: 30, preferredHour: null, repeat: { kind: 'weekly', days: [1] } }] });
    const times = (bs: typeof without, note: string) => bs.filter((b) => b.note === note).map((b) => new Date(b.start).getUTCHours() * 60 + new Date(b.start).getUTCMinutes());
    // Each everyday routine keeps one time of day across the week (it doesn't jump on Mondays).
    for (const note of ['Daily: Stretch', 'Daily: Inbox']) expect(new Set(times(withWeekly, note)).size, note).toBe(1);
    expect(withWeekly.filter((b) => b.note === 'Daily: Plan the week')).toHaveLength(1);
    expect(without.length).toBe(14);
  });
});
