import { describe, it, expect } from 'vitest';
import { placeDailyFillers } from './dailyFiller.js';
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
