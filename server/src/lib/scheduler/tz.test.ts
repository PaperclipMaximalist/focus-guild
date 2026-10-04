import { describe, it, expect } from 'vitest';
import {
  crossesMidnight,
  dayKey,
  windowHours,
  workDayEndUtc,
  workDayKey,
  workDayMidnightUtc,
  workDayStartUtc,
  workWindowUtc,
  workingHoursProblem,
} from './tz.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
/** Monday 18 May 2026, 00:00 UTC. */
const D0 = Date.UTC(2026, 4, 18);
const at = (day: number, hour: number) => D0 + day * DAY + hour * HOUR;

const OFFICE = { startHour: 9, endHour: 18 };
const NIGHT = { startHour: 22, endHour: 6 };
const OWL = { startHour: 14, endHour: 2 };

describe('working windows', () => {
  it('reads an end before the start as the next day', () => {
    expect(crossesMidnight(OFFICE)).toBe(false);
    expect(crossesMidnight(NIGHT)).toBe(true);
    expect(windowHours(OFFICE)).toBe(9);
    expect(windowHours(NIGHT)).toBe(8);
    expect(windowHours(OWL)).toBe(12);
    expect(workWindowUtc(D0, NIGHT)).toEqual({ start: at(0, 22), end: at(1, 6) });
    expect(workWindowUtc(D0, OFFICE)).toEqual({ start: at(0, 9), end: at(0, 18) });
  });

  it('treats an end at 00:00 as midnight, the same day as 24:00', () => {
    expect(windowHours({ startHour: 14, endHour: 0 })).toBe(10);
    expect(workWindowUtc(D0, { startHour: 14, endHour: 0 })).toEqual(workWindowUtc(D0, { startHour: 14, endHour: 24 }));
    // And the day still turns at midnight: there is no after-midnight tail.
    expect(workDayMidnightUtc(at(1, 0.5), 0, { startHour: 14, endHour: 0 })).toBe(at(1, 0));
  });
});

describe('the working day', () => {
  it('is the calendar day for ordinary hours', () => {
    expect(workDayMidnightUtc(at(2, 1), 0, OFFICE)).toBe(at(2, 0));
    expect(workDayStartUtc(at(2, 1), 0, OFFICE)).toBe(at(2, 0));
    expect(workDayEndUtc(at(2, 1), 0, OFFICE)).toBe(at(3, 0));
    expect(workDayKey(at(2, 1), 0, OFFICE)).toBe(dayKey(at(2, 0)));
  });

  it("still belongs to yesterday at 01:00 when the window runs to 06:00", () => {
    // 22–06, Tuesday 01:00: the person is mid-session; it is still Monday's day.
    expect(workDayMidnightUtc(at(1, 1), 0, NIGHT)).toBe(at(0, 0));
    expect(workDayKey(at(1, 1), 0, NIGHT)).toBe(dayKey(at(0, 12)));
    // The day turns over when the session ends, not at midnight.
    expect(workDayStartUtc(at(1, 1), 0, NIGHT)).toBe(at(0, 6));
    expect(workDayEndUtc(at(1, 1), 0, NIGHT)).toBe(at(1, 6));
    expect(workDayMidnightUtc(at(1, 6), 0, NIGHT)).toBe(at(1, 0));
    expect(workDayEndUtc(at(1, 7), 0, NIGHT)).toBe(at(2, 6));
  });

  it('follows the user timezone, not UTC', () => {
    // UTC+5:45 (Kathmandu, offset −345): 01:00 local on Tuesday is Monday 19:15 UTC.
    const tz = -345;
    const localTue1am = at(1, 1) + tz * MIN;
    expect(workDayMidnightUtc(localTue1am, tz, NIGHT)).toBe(at(0, 0) + tz * MIN);
    expect(workDayEndUtc(localTue1am, tz, NIGHT)).toBe(at(1, 6) + tz * MIN);
  });
});

describe('workingHoursProblem', () => {
  it('accepts ordinary and past-midnight hours', () => {
    expect(workingHoursProblem(OFFICE)).toBeNull();
    expect(workingHoursProblem(NIGHT)).toBeNull();
    expect(workingHoursProblem(OWL)).toBeNull();
    expect(workingHoursProblem({ startHour: 0, endHour: 24 })).toBeNull();
  });

  it('refuses a day that starts and ends at the same time, in words', () => {
    expect(workingHoursProblem({ startHour: 18, endHour: 18 })).toMatch(/start and end at the same time/i);
    expect(workingHoursProblem({ startHour: 0, endHour: 0 })).not.toBeNull();
  });

  it('refuses hours the planner cannot read', () => {
    expect(workingHoursProblem({ startHour: Number.NaN, endHour: 18 })).not.toBeNull();
    expect(workingHoursProblem({ startHour: 24, endHour: 6 })).not.toBeNull();
    expect(workingHoursProblem({ startHour: 9, endHour: 25 })).not.toBeNull();
    expect(workingHoursProblem({ startHour: -1, endHour: 6 })).not.toBeNull();
  });
});
