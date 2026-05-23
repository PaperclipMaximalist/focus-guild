import { describe, it, expect } from 'vitest';
import { computeMultiplier, updateStreak, applyMidnightRollover } from './streak.js';

function utc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

describe('computeMultiplier', () => {
  it('returns 1.0 at streak=0', () => {
    expect(computeMultiplier(0)).toBe(1.0);
  });

  it('returns 1.0 at negative streak', () => {
    expect(computeMultiplier(-1)).toBe(1.0);
  });

  it('returns 2.5 at streak=7', () => {
    expect(computeMultiplier(7)).toBe(2.5);
  });

  it('caps at 2.5 beyond streak=7', () => {
    expect(computeMultiplier(30)).toBe(2.5);
    expect(computeMultiplier(100)).toBe(2.5);
  });

  it('is linear between 0 and 7 days', () => {
    // day 1 → 1.0 + 1/7*1.5 ≈ 1.214
    expect(computeMultiplier(1)).toBeCloseTo(1 + 1.5 / 7, 5);
    // day 3 → 1.0 + 3/7*1.5 ≈ 1.643
    expect(computeMultiplier(3)).toBeCloseTo(1 + (3 / 7) * 1.5, 5);
  });
});

describe('updateStreak', () => {
  describe('first-ever activity', () => {
    it('starts streak at 1 when completing first quest ever', () => {
      const result = updateStreak({
        currentStreak: 0,
        lastActivityDate: null,
        today: utc('2026-05-17'),
        completedQuestToday: true,
      });
      expect(result.newStreak).toBe(1);
      expect(result.event).toBe('started');
      expect(result.newMultiplier).toBeCloseTo(computeMultiplier(1), 5);
    });

    it('stays at 0 with no activity and no history', () => {
      const result = updateStreak({
        currentStreak: 0,
        lastActivityDate: null,
        today: utc('2026-05-17'),
        completedQuestToday: false,
      });
      expect(result.newStreak).toBe(0);
      expect(result.event).toBe('unchanged');
    });
  });

  describe('streak extension', () => {
    it('extends streak by 1 on consecutive day with activity', () => {
      const result = updateStreak({
        currentStreak: 3,
        lastActivityDate: utc('2026-05-16'),
        today: utc('2026-05-17'),
        completedQuestToday: true,
      });
      expect(result.newStreak).toBe(4);
      expect(result.event).toBe('extended');
      expect(result.newMultiplier).toBeCloseTo(computeMultiplier(4), 5);
    });

    it('does not extend when no quest completed on consecutive day', () => {
      const result = updateStreak({
        currentStreak: 3,
        lastActivityDate: utc('2026-05-16'),
        today: utc('2026-05-17'),
        completedQuestToday: false,
      });
      expect(result.event).toBe('paused');
      expect(result.newStreak).toBe(0);
      expect(result.newMultiplier).toBe(0.75);
    });
  });

  describe('streak pause (missed day)', () => {
    it('pauses streak and sets multiplier to 0.75 after missing 1 day', () => {
      const result = updateStreak({
        currentStreak: 5,
        lastActivityDate: utc('2026-05-15'),
        today: utc('2026-05-17'), // gap of 2 days
        completedQuestToday: true,
      });
      expect(result.event).toBe('paused');
      expect(result.newStreak).toBe(0);
      expect(result.newMultiplier).toBe(0.75);
    });

    it('pauses even with longer gaps', () => {
      const result = updateStreak({
        currentStreak: 7,
        lastActivityDate: utc('2026-05-01'),
        today: utc('2026-05-17'),
        completedQuestToday: false,
      });
      expect(result.event).toBe('paused');
      expect(result.newMultiplier).toBe(0.75);
    });

    it('multiplier never goes to 0 (no shame spirals)', () => {
      const result = updateStreak({
        currentStreak: 30,
        lastActivityDate: utc('2026-01-01'),
        today: utc('2026-05-17'),
        completedQuestToday: false,
      });
      expect(result.newMultiplier).toBeGreaterThan(0);
      expect(result.newMultiplier).toBe(0.75);
    });
  });

  describe('same-day idempotency', () => {
    it('returns unchanged when called twice on the same day', () => {
      const result = updateStreak({
        currentStreak: 4,
        lastActivityDate: utc('2026-05-17'),
        today: utc('2026-05-17'),
        completedQuestToday: true,
      });
      expect(result.event).toBe('unchanged');
      expect(result.newStreak).toBe(4);
    });
  });
});

describe('applyMidnightRollover', () => {
  it('pauses an active streak when no quest was completed', () => {
    const result = applyMidnightRollover({ currentStreak: 5, multiplier: 1.6 });
    expect(result.currentStreak).toBe(0);
    expect(result.multiplier).toBe(0.75);
  });

  it('leaves an already-paused streak unchanged', () => {
    const state = { currentStreak: 0, multiplier: 0.75 };
    const result = applyMidnightRollover(state);
    expect(result).toEqual(state);
  });
});
