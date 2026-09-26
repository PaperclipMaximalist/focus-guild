import { describe, it, expect } from 'vitest';
import { inferPreferredHour, placeDailyFillers } from './dailyFiller.js';
import type { Block } from './types.js';

const MS_PER_MIN = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MIN;

/** 09:00 UTC: these tests place in UTC (no tzOffsetMin), whatever the machine's zone. */
function nowAt9am(): number {
  return Date.UTC(2026, 4, 18, 9, 0, 0, 0);
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

describe('daily fillers — routines keep their own time', () => {
  const student = { startHour: 15.5, endHour: 21.5 };
  const place = (fillers: Parameters<typeof placeDailyFillers>[0]['fillers'], now: number, existingFixed: Block[] = []) =>
    placeDailyFillers({ fillers, now, horizonDays: 1, workingHours: student, existingFixed, tzOffsetMin: 0 });

  it('puts a routine with a time outside quest hours at that time', () => {
    const [meds] = place([{ id: 'm', name: 'Morning meds', durationMin: 10, preferredHour: null }], Date.UTC(2026, 4, 18, 6, 0));
    expect(new Date(meds!.start).getUTCHours()).toBe(8);
  });

  it('skips a routine whose time is long gone today instead of running it late', () => {
    const placed = place([{ id: 'm', name: 'Morning meds', durationMin: 10, preferredHour: null }], Date.UTC(2026, 4, 18, 16, 30));
    expect(placed).toHaveLength(0);
  });

  it('finds the nearest free slot, earlier as well as later', () => {
    // Bedtime reading already sits at 21:00–21:25 and quest hours end at 21:30:
    // the evening walk (19:00 would clash with nothing) must not be lost.
    const reading: Block = {
      id: 'r', start: Date.UTC(2026, 4, 18, 20, 30), end: Date.UTC(2026, 4, 18, 21, 30),
      type: 'fixed', taskId: null, locked: true, note: 'Daily: Read before bed',
    };
    const [walk] = place([{ id: 'w', name: 'Walk', durationMin: 35, preferredHour: 21 }], Date.UTC(2026, 4, 18, 15, 0), [reading]);
    expect(walk).toBeDefined();
    expect(walk!.end).toBeLessThanOrEqual(reading.start);
  });
});

describe('daily fillers — time hints and breathing room', () => {
  const hours = { startHour: 9, endHour: 18 };

  it('reads unambiguous time words from the name', () => {
    // Routines are personal time: morning is morning even when quest hours start later.
    expect(inferPreferredHour('Bake morning sourdough', hours)).toBe(8);
    expect(inferPreferredHour('Morning meds', { startHour: 15.5, endHour: 21.5 })).toBe(8);
    expect(inferPreferredHour('End of day gym walkthrough', hours)).toBe(17);
    expect(inferPreferredHour('Evening walk', hours)).toBe(19);
    expect(inferPreferredHour('Read before bed', hours)).toBe(21);
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
    expect(hourOf(blocks.find((b) => b.note === 'Daily: Morning meds')!.start)).toBe(8);
    expect(hourOf(blocks.find((b) => b.note === 'Daily: Evening walk')!.start)).toBe(19);
    for (let i = 1; i < blocks.length; i++) {
      expect(blocks[i]!.start - blocks[i - 1]!.end).toBeGreaterThanOrEqual(10 * 60_000);
    }
  });
});
