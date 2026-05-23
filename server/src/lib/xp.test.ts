import { describe, it, expect } from 'vitest';
import { computeXP } from './xp.js';

const base = {
  estimatedMinutes: 30,
  mentalLoad: 5,
  timePressure: 0,
  streakMultiplier: 1.0,
};

describe('computeXP', () => {
  describe('base XP', () => {
    it('base = round(estimatedMinutes / 5)', () => {
      const result = computeXP({ ...base, estimatedMinutes: 30 });
      expect(result.base).toBe(6); // 30/5 = 6
    });

    it('rounds base XP (e.g. 33min → round(6.6) = 7)', () => {
      const result = computeXP({ ...base, estimatedMinutes: 33 });
      expect(result.base).toBe(7);
    });

    it('minimum 1-minute quest gives base = 0 (round(0.2))', () => {
      const result = computeXP({ ...base, estimatedMinutes: 1 });
      expect(result.base).toBe(0);
    });
  });

  describe('mental load bonus', () => {
    it('mentalLoad=5 gives mentalBonus=1.0 (identity)', () => {
      const result = computeXP({ ...base, mentalLoad: 5 });
      expect(result.mentalBonus).toBe(1.0);
    });

    it('mentalLoad=10 gives mentalBonus=2.0 (doubles XP)', () => {
      const result = computeXP({ ...base, mentalLoad: 10 });
      expect(result.mentalBonus).toBe(2.0);
    });

    it('mentalLoad=1 gives mentalBonus=0.2', () => {
      const result = computeXP({ ...base, mentalLoad: 1 });
      expect(result.mentalBonus).toBe(0.2);
    });

    it('a load-10 quest earns ~2× XP vs a load-5 quest (same other inputs)', () => {
      const hard = computeXP({ ...base, mentalLoad: 10, streakMultiplier: 1.0 });
      const mid  = computeXP({ ...base, mentalLoad: 5,  streakMultiplier: 1.0 });
      expect(hard.xp).toBeCloseTo(mid.xp * 2, 0);
    });
  });

  describe('time pressure bonus', () => {
    it('timePressure=0 gives bonus=1.0 (no boost)', () => {
      const result = computeXP({ ...base, timePressure: 0 });
      expect(result.timePressureBonus).toBe(1.0);
    });

    it('timePressure=10 gives bonus=1.5 (max)', () => {
      const result = computeXP({ ...base, timePressure: 10 });
      expect(result.timePressureBonus).toBe(1.5);
    });

    it('timePressure above 10 is still capped at 1.5', () => {
      const result = computeXP({ ...base, timePressure: 20 });
      expect(result.timePressureBonus).toBe(1.5);
    });

    it('timePressure=5 gives bonus=1.25 (midpoint)', () => {
      const result = computeXP({ ...base, timePressure: 5 });
      expect(result.timePressureBonus).toBe(1.25);
    });
  });

  describe('streak multiplier', () => {
    it('streakMultiplier=1.0 has no effect', () => {
      const x1 = computeXP({ ...base, streakMultiplier: 1.0 });
      const x2 = computeXP({ ...base, streakMultiplier: 2.0 });
      expect(x2.xp).toBe(x1.xp * 2);
    });

    it('streakMultiplier=2.5 gives 2.5× XP vs multiplier=1.0', () => {
      const normal = computeXP({ ...base, estimatedMinutes: 60, mentalLoad: 10, timePressure: 0, streakMultiplier: 1.0 });
      const streak = computeXP({ ...base, estimatedMinutes: 60, mentalLoad: 10, timePressure: 0, streakMultiplier: 2.5 });
      expect(streak.xp).toBe(normal.xp * 2.5);
    });
  });

  describe('full formula', () => {
    it('computes XP for a known input', () => {
      // base=6, mental=5/5=1.0, timePressure=1.25, streak=1.0
      // xp = round(6 * 1.0 * 1.25 * 1.0) = round(7.5) = 8
      const result = computeXP({
        estimatedMinutes: 30,
        mentalLoad: 5,
        timePressure: 5,
        streakMultiplier: 1.0,
      });
      expect(result.xp).toBe(8);
    });

    it('brain-drain quest (load-10, high pressure, 7-day streak) earns max-style XP', () => {
      // base=12 (60/5), mental=2.0, timePressure=1.5, streak=2.5
      // xp = round(12 * 2.0 * 1.5 * 2.5) = round(90) = 90
      const result = computeXP({
        estimatedMinutes: 60,
        mentalLoad: 10,
        timePressure: 10,
        streakMultiplier: 2.5,
      });
      expect(result.xp).toBe(90);
    });
  });
});
