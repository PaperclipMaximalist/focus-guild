import { describe, expect, it } from 'vitest';
import { formatDayAndTime } from './formatters';

// Sunday 8 November 2026, 8:20 pm local.
const now = new Date(2026, 10, 8, 20, 20);
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0);
const time = (d: Date) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

describe('formatDayAndTime', () => {
  it('says today for later today', () => {
    expect(formatDayAndTime(at(8, 22), now)).toBe(`today at ${time(at(8, 22))}`);
  });

  it('says tomorrow for the next day', () => {
    expect(formatDayAndTime(at(9, 9), now)).toBe(`tomorrow at ${time(at(9, 9))}`);
  });

  it('names the weekday within a week', () => {
    const d = at(12, 9);
    expect(formatDayAndTime(d, now)).toBe(`${d.toLocaleDateString(undefined, { weekday: 'long' })} at ${time(d)}`);
  });

  it('gives the date a week or more out', () => {
    const d = at(20, 9);
    expect(formatDayAndTime(d, now)).toBe(`${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time(d)}`);
  });

  it('accepts an ISO string, as schedule blocks carry', () => {
    expect(formatDayAndTime(at(9, 9).toISOString(), now)).toBe(`tomorrow at ${time(at(9, 9))}`);
  });
});
