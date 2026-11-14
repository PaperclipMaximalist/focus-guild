import { describe, expect, it } from 'vitest';
import { calendarDaysAgo, connectedLabel, lastUsedLabel } from './deviceTimes';

describe('lastUsedLabel', () => {
  const now = new Date(2026, 10, 13, 9, 30);

  it('speaks in calendar days, not hours', () => {
    expect(lastUsedLabel(new Date(2026, 10, 13, 0, 5).toISOString(), now)).toBe('Last used today');
    expect(lastUsedLabel(new Date(2026, 10, 12, 23, 55).toISOString(), now)).toBe('Last used yesterday');
    expect(lastUsedLabel(new Date(2026, 10, 10, 12, 0).toISOString(), now)).toBe('Last used 3 days ago');
    expect(lastUsedLabel(new Date(2026, 4, 17, 12, 0).toISOString(), now)).toBe('Last used 180 days ago');
  });

  it('treats a time ahead of the clock as today, and a missing one as unused', () => {
    expect(lastUsedLabel(new Date(2026, 10, 14, 8, 0).toISOString(), now)).toBe('Last used today');
    expect(lastUsedLabel(null, now)).toBe('Not used yet');
    expect(lastUsedLabel('not a date', now)).toBe('Not used yet');
  });

  it('counts a day across a clock change as one day', () => {
    // Whatever the zone, 2 Nov to 3 Nov local is one calendar day.
    expect(calendarDaysAgo(new Date(2026, 10, 1, 12), new Date(2026, 10, 2, 12))).toBe(1);
    expect(calendarDaysAgo(new Date(2026, 2, 7, 12), new Date(2026, 2, 9, 12))).toBe(2);
  });
});

describe('connectedLabel', () => {
  it('names the day the iPhone was connected, with its year', () => {
    expect(connectedLabel(new Date(2026, 10, 12, 12).toISOString())).toMatch(/^Connected .*2026/);
    expect(connectedLabel('nonsense')).toBe('Connected');
  });
});
