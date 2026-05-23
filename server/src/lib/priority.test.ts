import { describe, it, expect } from 'vitest';
import { computePriorityScore } from './priority.js';

const base = {
  daysUntilDue: 5,
  estimatedMinutes: 60,
  availableMinutes: 480,
  mentalLoad: 5,
  impact: 5,
  energyLevel: 3,
};

describe('computePriorityScore', () => {
  describe('urgency component', () => {
    it('returns urgency=10 when deadline is today (daysUntilDue=0)', () => {
      const result = computePriorityScore({ ...base, daysUntilDue: 0 });
      expect(result.urgency).toBe(10);
    });

    it('returns urgency=10 when deadline is overdue (daysUntilDue negative)', () => {
      const result = computePriorityScore({ ...base, daysUntilDue: -3 });
      expect(result.urgency).toBe(10);
    });

    it('returns urgency=0 when there is no deadline', () => {
      const result = computePriorityScore({ ...base, daysUntilDue: null });
      expect(result.urgency).toBe(0);
    });

    it('returns urgency=2 when due in 5 days (10/5=2)', () => {
      const result = computePriorityScore({ ...base, daysUntilDue: 5 });
      expect(result.urgency).toBe(2);
    });

    it('clamps urgency to 10 for same-day deadlines (daysUntilDue=1)', () => {
      const result = computePriorityScore({ ...base, daysUntilDue: 1 });
      expect(result.urgency).toBe(10);
    });
  });

  describe('time pressure component', () => {
    it('returns timePressure=10 when availableMinutes is zero', () => {
      const result = computePriorityScore({ ...base, availableMinutes: 0 });
      expect(result.timePressure).toBe(10);
    });

    it('returns timePressure=1.25 for 60min quest in 480min day', () => {
      const result = computePriorityScore({
        ...base,
        estimatedMinutes: 60,
        availableMinutes: 480,
      });
      expect(result.timePressure).toBe(1.25);
    });

    it('clamps timePressure to 10 when estimated exceeds available', () => {
      const result = computePriorityScore({
        ...base,
        estimatedMinutes: 600,
        availableMinutes: 60,
      });
      expect(result.timePressure).toBe(10);
    });
  });

  describe('mood modifier (energy level)', () => {
    it('uses base weights when energy is 3', () => {
      const result = computePriorityScore({ ...base, energyLevel: 3 });
      expect(result.weights.urgency).toBe(0.40);
      expect(result.weights.mentalLoad).toBe(0.25);
    });

    it('uses low-energy weights when energy is 2', () => {
      const result = computePriorityScore({ ...base, energyLevel: 2 });
      expect(result.weights.urgency).toBe(0.30);
      expect(result.weights.mentalLoad).toBe(0.40);
    });

    it('uses low-energy weights when energy is 1', () => {
      const result = computePriorityScore({ ...base, energyLevel: 1 });
      expect(result.weights.urgency).toBe(0.30);
      expect(result.weights.mentalLoad).toBe(0.40);
    });

    it('uses base weights at energy=5', () => {
      const result = computePriorityScore({ ...base, energyLevel: 5 });
      expect(result.weights.urgency).toBe(0.40);
      expect(result.weights.mentalLoad).toBe(0.25);
    });

    it('high mental-load quest scores higher at energy=1 than energy=5', () => {
      const highMentalLoad = { ...base, mentalLoad: 10, daysUntilDue: null };
      const lowEnergy = computePriorityScore({ ...highMentalLoad, energyLevel: 1 });
      const highEnergy = computePriorityScore({ ...highMentalLoad, energyLevel: 5 });
      // Low energy raises mental_load weight from 0.25 → 0.40, so score must be higher
      expect(lowEnergy.score).toBeGreaterThan(highEnergy.score);
    });

    it('at low energy the score gap between high and low mental-load widens', () => {
      // mental_load weight: 0.25 (normal) → 0.40 (low energy)
      // So a 9-point spread in mentalLoad (10 vs 1) has more impact at low energy.
      const shared = { ...base, daysUntilDue: null };
      const hardNormal  = computePriorityScore({ ...shared, mentalLoad: 10, energyLevel: 5 });
      const easyNormal  = computePriorityScore({ ...shared, mentalLoad: 1,  energyLevel: 5 });
      const hardLowE    = computePriorityScore({ ...shared, mentalLoad: 10, energyLevel: 1 });
      const easyLowE    = computePriorityScore({ ...shared, mentalLoad: 1,  energyLevel: 1 });
      const gapNormal   = hardNormal.score - easyNormal.score;
      const gapLowE     = hardLowE.score   - easyLowE.score;
      // The gap (10-1)*0.25 = 2.25 vs (10-1)*0.40 = 3.60 — wider at low energy
      expect(gapLowE).toBeGreaterThan(gapNormal);
    });
  });

  describe('score formula', () => {
    it('computes correct score for a known input at normal energy', () => {
      // urgency = 10/5 = 2, timePressure = (60/480)*10 = 1.25
      // score = 2*0.40 + 5*0.25 + 1.25*0.25 + 5*0.10
      //       = 0.80 + 1.25 + 0.3125 + 0.50 = 2.8625 → rounded 2.86
      const result = computePriorityScore({ ...base, energyLevel: 3 });
      expect(result.score).toBe(2.86);
    });

    it('computes correct score at energy=1 (low-energy weights)', () => {
      // urgency = 2, timePressure = 1.25
      // score = 2*0.30 + 5*0.40 + 1.25*0.20 + 5*0.10
      //       = 0.60 + 2.00 + 0.25 + 0.50 = 3.35
      const result = computePriorityScore({ ...base, energyLevel: 1 });
      expect(result.score).toBe(3.35);
    });

    it('score is 0 when all inputs are zero/null and available hours is non-zero', () => {
      const result = computePriorityScore({
        daysUntilDue: null,
        estimatedMinutes: 0,
        availableMinutes: 480,
        mentalLoad: 0,
        impact: 0,
        energyLevel: 3,
      });
      expect(result.score).toBe(0);
    });

    it('score is bounded (0..10 range components, weights sum to 1)', () => {
      const weights = computePriorityScore(base).weights;
      const sum = weights.urgency + weights.mentalLoad + weights.timePressure + weights.impact;
      expect(sum).toBeCloseTo(1.0);
    });
  });
});
