import { describe, it, expect } from 'vitest';
import { inferPreferredHour, placeDailyFillers } from './dailyFiller.js';
import type { Block } from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;

function nowAt9am(): number {
  return new Date(2026, 4, 18, 9, 0, 0, 0).getTime();
}

describe('placeDailyFillers', () => {
  it('places one occurrence per filler per day', () => {
    const now = nowAt9am();
    const placed = placeDailyFillers({
      fillers: [{ id: 'meds', name: 'Meds', durationMin: 5, preferredHour: 9 }],
      now,
      horizonDays: 3,
      workingHours: { startHour: 9, endHour: 18 },
      existingFixed: [],
    });
    expect(placed).toHaveLength(3);
    placed.forEach((b) => {
      expect(b.type).toBe('fixed');
      expect(b.locked).toBe(true);
      expect(b.end - b.start).toBe(5 * MS_PER_MIN);
    });
  });

  it('routes around an existing fixed block', () => {
    const now = nowAt9am();
    const meeting: Block = {
      id: 'meet',
      start: now,
      end: now + MS_PER_HOUR,
      type: 'fixed',
      taskId: null,
      locked: true,
      note: null,
    };
    const placed = placeDailyFillers({
      fillers: [{ id: 'meds', name: 'Meds', durationMin: 10, preferredHour: 9 }],
      now,
      horizonDays: 1,
      workingHours: { startHour: 9, endHour: 18 },
      existingFixed: [meeting],
    });
    // Should land after the meeting, not overlap it.
    expect(placed[0]!.start).toBeGreaterThanOrEqual(meeting.end);
  });

  it('skips disabled fillers', () => {
    const placed = placeDailyFillers({
      fillers: [
        { id: 'a', name: 'A', durationMin: 5, preferredHour: null, enabled: false },
      ],
      now: nowAt9am(),
      horizonDays: 1,
      workingHours: { startHour: 9, endHour: 18 },
      existingFixed: [],
    });
    expect(placed).toHaveLength(0);
  });

  it('spreads multiple fillers without preferredHour across the working window', () => {
    const placed = placeDailyFillers({
      fillers: [
        { id: 'a', name: 'A', durationMin: 5, preferredHour: null },
        { id: 'b', name: 'B', durationMin: 5, preferredHour: null },
        { id: 'c', name: 'C', durationMin: 5, preferredHour: null },
      ],
      now: nowAt9am(),
      horizonDays: 1,
      workingHours: { startHour: 9, endHour: 18 },
      existingFixed: [],
    });
    expect(placed).toHaveLength(3);
    // No two of them at the same time.
    const starts = placed.map((b) => b.start).sort();
    expect(new Set(starts).size).toBe(3);
  });
});

describe('daily fillers — time hints and breathing room', () => {
  const hours = { startHour: 9, endHour: 18 };

  it('reads unambiguous time words from the name', () => {
    expect(inferPreferredHour('Bake morning sourdough', hours)).toBe(9);
    expect(inferPreferredHour('End of day gym walkthrough', hours)).toBe(17);
    expect(inferPreferredHour('Evening walk', hours)).toBe(17);
    expect(inferPreferredHour('Lunch stretch', hours)).toBe(12);
    expect(inferPreferredHour('Afternoon email sweep', hours)).toBe(14);
    expect(inferPreferredHour('Duolingo', hours)).toBeNull();
    // Words inside other words don't count.
    expect(inferPreferredHour('Mornington report', hours)).toBeNull();
  });

  it('places fillers by their hint and leaves gaps between them', () => {
    const now = Date.UTC(2026, 4, 18, 8, 0);
    const blocks = placeDailyFillers({
      fillers: [
        { id: 'a', name: 'Morning meds', durationMin: 10, preferredHour: null, enabled: true },
        { id: 'b', name: 'Evening walk', durationMin: 30, preferredHour: null, enabled: true },
        { id: 'c', name: 'Duolingo', durationMin: 15, preferredHour: null, enabled: true },
      ],
      now,
      horizonDays: 1,
      workingHours: hours,
      existingFixed: [],
      tzOffsetMin: 0,
    }).sort((x, y) => x.start - y.start);
    const hourOf = (t: number) => new Date(t).getUTCHours();
    expect(hourOf(blocks.find((b) => b.note === 'Daily: Morning meds')!.start)).toBe(9);
    expect(hourOf(blocks.find((b) => b.note === 'Daily: Evening walk')!.start)).toBe(17);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]!.start - blocks[i - 1]!.end).toBeGreaterThanOrEqual(10 * 60_000);
    }
  });
});
