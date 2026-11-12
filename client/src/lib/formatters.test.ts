import { describe, expect, it } from 'vitest';
import { formatDayAndTime, formatDeadline, formatDeadlineExact } from './formatters';

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

// Wednesday 11 November 2026, 6:50 pm local.
const wed = new Date(2026, 10, 11, 18, 50);
const on = (month: number, day: number, hour: number, minute = 0, year = 2026) =>
  new Date(year, month, day, hour, minute);
const weekday = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short' });

describe('formatDeadline', () => {
  it('says no deadline for null', () => {
    expect(formatDeadline(null, wed)).toBe('no deadline');
  });

  it('says today with the time for later the same evening', () => {
    const d = on(10, 11, 21);
    expect(formatDeadline(d, wed)).toBe(`due today ${time(d)}`);
  });

  it('says tomorrow with the time', () => {
    const d = on(10, 12, 8, 30);
    expect(formatDeadline(d, wed)).toBe(`due tomorrow ${time(d)}`);
  });

  it('counts calendar days, not 24-hour periods, late at night two days out', () => {
    const d = on(10, 13, 23, 59);
    expect(formatDeadline(d, wed)).toBe(`due ${weekday(d)}`);
  });

  it('names the weekday up to six days out', () => {
    const d = on(10, 17, 9);
    expect(formatDeadline(d, wed)).toBe(`due ${weekday(d)}`);
  });

  it('gives the date for exactly seven days out', () => {
    const d = on(10, 18, 9);
    expect(formatDeadline(d, wed)).toBe(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
  });

  it('adds the year when it is not this one', () => {
    const d = on(0, 15, 9, 0, 2027);
    expect(formatDeadline(d, wed)).toBe(
      d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    );
  });

  it('says one minute late at minimum', () => {
    expect(formatDeadline(new Date(wed.getTime() - 20_000), wed)).toBe('1m late');
    expect(formatDeadline(on(10, 11, 18, 49), wed)).toBe('1m late');
  });

  it('says minutes late under an hour', () => {
    expect(formatDeadline(on(10, 11, 18, 30), wed)).toBe('20m late');
  });

  it('says hours late under a day', () => {
    expect(formatDeadline(on(10, 11, 13, 50), wed)).toBe('5h late');
  });

  it('says days late from a day on', () => {
    expect(formatDeadline(on(10, 8, 18, 50), wed)).toBe('3d late');
  });

  it('accepts an ISO string', () => {
    const d = on(10, 12, 8, 30);
    expect(formatDeadline(d.toISOString(), wed)).toBe(`due tomorrow ${time(d)}`);
  });
});

describe('formatDeadlineExact', () => {
  it('gives weekday, date and time', () => {
    const d = on(10, 13, 21);
    expect(formatDeadlineExact(d, wed)).toBe(
      `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time(d)}`,
    );
  });

  it('adds the year when it is not this one', () => {
    const d = on(0, 15, 9, 0, 2027);
    expect(formatDeadlineExact(d, wed)).toBe(
      `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} at ${time(d)}`,
    );
  });

  it('accepts an ISO string', () => {
    const d = on(10, 13, 21);
    expect(formatDeadlineExact(d.toISOString(), wed)).toBe(formatDeadlineExact(d, wed));
  });
});

// The editor gives a date with no time 23:59 of that day: a whole day, not a moment.
describe('a deadline that is a whole day', () => {
  it('needs no clock today or tomorrow', () => {
    expect(formatDeadline(on(10, 11, 23, 59), wed)).toBe('due today');
    expect(formatDeadline(on(10, 12, 23, 59), wed)).toBe('due tomorrow');
  });

  it('is written as the date alone where there is room', () => {
    const d = on(10, 13, 23, 59);
    expect(formatDeadlineExact(d, wed)).toBe(
      d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    );
  });

  it('still counts as late once the day is over', () => {
    expect(formatDeadline(on(10, 10, 23, 59), wed)).toBe('18h late');
  });
});
