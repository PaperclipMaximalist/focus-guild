import { describe, expect, it } from 'vitest';
import { rangeFill } from './rangeFill';

const fill = (v: number, min: number, max: number) => (rangeFill(v, min, max) as Record<string, string>)['--fill'];

describe('rangeFill: where a slider\'s track changes colour', () => {
  it('is a percentage of the way from min to max', () => {
    expect(fill(50, 0, 100)).toBe('50%');
    expect(fill(5, 1, 9)).toBe('50%');
    expect(fill(0.5, 0.5, 3)).toBe('0%');
    expect(fill(3, 0.5, 3)).toBe('100%');
  });

  it('is rounded to one decimal', () => {
    expect(fill(1, 0, 3)).toBe('33.3%');
    expect(fill(2, 0, 3)).toBe('66.7%');
  });

  it('stays within 0 and 100 when the value is out of range', () => {
    expect(fill(-5, 0, 10)).toBe('0%');
    expect(fill(99, 0, 10)).toBe('100%');
  });

  it('is 0% when there is no range, rather than NaN', () => {
    expect(fill(4, 4, 4)).toBe('0%');
    expect(fill(4, 5, 4)).toBe('0%');
    expect(fill(NaN, 0, 10)).toBe('0%');
  });
});
