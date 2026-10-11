import { describe, expect, it } from 'vitest';
import { dayLabel, localDayKey, parseDuration } from './hours';

describe('parseDuration: a length of time as someone would jot it', () => {
  it('reads a small bare number as hours', () => {
    expect(parseDuration('2')).toBe(120);
    expect(parseDuration('1.5')).toBe(90);
    expect(parseDuration('0.25')).toBe(15);
    expect(parseDuration('1,5')).toBe(90);
  });

  it('reads a bare number from ten up as minutes', () => {
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('10')).toBe(10);
  });

  it('reads a clock time as hours and minutes', () => {
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('0:45')).toBe(45);
    expect(parseDuration('2:5')).toBe(125);
  });

  it('reads hours and minutes written out', () => {
    expect(parseDuration('1h 30')).toBe(90);
    expect(parseDuration('1h30m')).toBe(90);
    expect(parseDuration('1 h 30 min')).toBe(90);
    expect(parseDuration('2h')).toBe(120);
    expect(parseDuration('2 hours')).toBe(120);
    expect(parseDuration('1.5h')).toBe(90);
    expect(parseDuration('90m')).toBe(90);
    expect(parseDuration('25 min')).toBe(25);
    expect(parseDuration('40 minutes')).toBe(40);
  });

  it('gives nothing back rather than a guess', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('a while')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration('h')).toBeNull();
  });

  it('holds an entry to one day', () => {
    expect(parseDuration('24h')).toBe(1440);
    expect(parseDuration('25h')).toBeNull();
    expect(parseDuration('2000')).toBeNull();
  });
});

describe('dayLabel', () => {
  const now = new Date(2026, 9, 9, 21, 30); // Fri 9 Oct 2026, local

  it('names today and yesterday', () => {
    expect(dayLabel(localDayKey(now), now)).toBe('Today');
    expect(dayLabel('2026-10-08', now)).toBe('Yesterday');
  });

  it('dates anything older, with the year once it is not this one', () => {
    expect(dayLabel('2026-10-06', now)).toMatch(/6/);
    expect(dayLabel('2026-10-06', now)).not.toMatch(/2026/);
    expect(dayLabel('2025-12-31', now)).toMatch(/2025/);
  });
});
