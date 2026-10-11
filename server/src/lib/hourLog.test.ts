import { describe, it, expect } from 'vitest';
import {
  LogHoursSchema,
  entryInstant,
  formatDuration,
  hourTotals,
  hoursLine,
  isOpenEnded,
  localDay,
  minutesOf,
  weekStart,
} from './hourLog.js';

// Toronto in October: UTC-4, so getTimezoneOffset() is 240.
const TZ = 240;
// Friday 2026-10-09, 21:30 local (01:30 UTC on the 10th).
const NOW = new Date('2026-10-10T01:30:00.000Z');

describe('isOpenEnded', () => {
  it('is a quest with no estimate, and only that', () => {
    expect(isOpenEnded({ estimatedMinutes: 0 })).toBe(true);
    expect(isOpenEnded({ estimatedMinutes: 30 })).toBe(false);
  });
});

describe('what may be logged', () => {
  it('takes a whole number of minutes up to a day', () => {
    expect(LogHoursSchema.safeParse({ minutes: 90 }).success).toBe(true);
    expect(LogHoursSchema.safeParse({ minutes: 0 }).success).toBe(false);
    expect(LogHoursSchema.safeParse({ minutes: 1441 }).success).toBe(false);
    expect(LogHoursSchema.safeParse({ minutes: 12.5 }).success).toBe(false);
  });

  it('wants a real-looking day when one is given', () => {
    expect(LogHoursSchema.safeParse({ minutes: 30, date: '2026-10-08' }).success).toBe(true);
    expect(LogHoursSchema.safeParse({ minutes: 30, date: 'yesterday' }).success).toBe(false);
  });
});

describe('entryInstant — when an entry happened', () => {
  it('is now for today, by the local calendar', () => {
    expect(localDay(NOW, TZ)).toBe('2026-10-09');
    expect(entryInstant(undefined, TZ, NOW)).toEqual(NOW);
    expect(entryInstant('2026-10-09', TZ, NOW)).toEqual(NOW);
  });

  it('is local noon for an earlier day, so it sorts inside that day', () => {
    const at = entryInstant('2026-10-07', TZ, NOW)!;
    expect(at.toISOString()).toBe('2026-10-07T16:00:00.000Z');
    expect(localDay(at, TZ)).toBe('2026-10-07');
  });

  it('refuses a day that has not happened', () => {
    // The 10th has started in UTC but not for this person.
    expect(entryInstant('2026-10-10', TZ, NOW)).toBeNull();
  });

  it('refuses a day that does not exist', () => {
    expect(entryInstant('2026-13-40', TZ, NOW)).toBeNull();
    expect(entryInstant('2026-02-30', TZ, NOW)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('reads like a note in a margin', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(95)).toBe('1 h 35');
    expect(formatDuration(65)).toBe('1 h 05');
  });
});

describe('hoursLine', () => {
  it('is a finished sentence, with the note when there is one', () => {
    expect(hoursLine('Piano', 90)).toBe('Logged 1 h 30 on "Piano"');
    expect(hoursLine('Piano', 30, 'scales')).toBe('Logged 30 min on "Piano": scales');
  });
});

describe('minutesOf', () => {
  it('reads the minutes a row carries and nothing else', () => {
    expect(minutesOf({ minutes: 25 })).toBe(25);
    expect(minutesOf({ minutes: '25' })).toBe(0);
    expect(minutesOf(null)).toBe(0);
    expect(minutesOf({})).toBe(0);
  });
});

describe('hourTotals', () => {
  it('starts the week on the local Monday', () => {
    // Monday 2026-10-05 00:00 in Toronto is 04:00 UTC.
    expect(weekStart(NOW, TZ).toISOString()).toBe('2026-10-05T04:00:00.000Z');
  });

  it('adds up today and this week, and remembers the last entry', () => {
    const entries = [
      { at: new Date('2026-10-10T00:10:00.000Z'), minutes: 40 }, // today, 20:10 local
      { at: new Date('2026-10-07T16:00:00.000Z'), minutes: 60 }, // Wednesday
      { at: new Date('2026-10-04T16:00:00.000Z'), minutes: 90 }, // last Sunday
    ];
    const t = hourTotals(entries, NOW, TZ);
    expect(t.todayMinutes).toBe(40);
    expect(t.weekMinutes).toBe(100);
    expect(t.lastAt?.toISOString()).toBe('2026-10-10T00:10:00.000Z');
  });

  it('is all zeros for a log nobody has written in', () => {
    expect(hourTotals([], NOW, TZ)).toEqual({ todayMinutes: 0, weekMinutes: 0, lastAt: null });
  });
});
