/**
 * Default weights, energy curve, break policy, working hours.
 * All knobs the user can tune live here so the rest of the module
 * has no magic numbers.
 */

import type { BreakPolicy, EnergyCurve, UserConfig, Weights, WorkingHours } from './types.js';

export const DEFAULT_WEIGHTS: Weights = {
  urgency: 3.0,
  staleness: 0.4,
  timeFit: 0.8,
  energyFit: 1.0,
  chunkFit: 1.0,
  adjacency: 1.5,
  switch: 0.5,
  fragmentation: 0.4,
  oversize: 1.2,
};

/**
 * Soft cap on block duration in minutes. Blocks longer than this incur a
 * graded penalty. 90 = 1.5 hours per user request.
 */
export const DEFAULT_SOFT_MAX_BLOCK_MIN = 90;

/**
 * Two-peak default: rise to high focus 9–11, dip 13–15, recovery 15–17,
 * decline after 19. Returns 0..1.
 */
export const DEFAULT_ENERGY_CURVE: EnergyCurve = (hour: number): number => {
  if (hour < 0 || hour > 23) return 0;
  // Piecewise smooth interpolation over anchor points.
  const anchors: Array<[number, number]> = [
    [0, 0.05],
    [6, 0.3],
    [9, 0.9],
    [11, 0.95],
    [12, 0.7],
    [13, 0.45],
    [14, 0.4],
    [15, 0.5],
    [16, 0.7],
    [17, 0.8],
    [18, 0.6],
    [19, 0.5],
    [21, 0.3],
    [23, 0.1],
  ];
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const [h0, v0] = anchors[i]!;
    const [h1, v1] = anchors[i + 1]!;
    if (hour >= h0 && hour <= h1) {
      if (h1 === h0) return v0;
      const t = (hour - h0) / (h1 - h0);
      return v0 + (v1 - v0) * t;
    }
  }
  return 0.3;
};

export const DEFAULT_BREAK_POLICY: BreakPolicy = {
  shortBreakAfterMin: 50,
  shortBreakDurationMin: 10,
  longBreakAfterMin: 180,
  longBreakDurationMin: 30,
};

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  startHour: 9,
  endHour: 18,
};

export const DEFAULT_HORIZON_DAYS = 7;

export function defaultConfig(): UserConfig {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    energyCurve: DEFAULT_ENERGY_CURVE,
    breakPolicy: { ...DEFAULT_BREAK_POLICY },
    workingHours: { ...DEFAULT_WORKING_HOURS },
    horizonDays: DEFAULT_HORIZON_DAYS,
    softMaxBlockMin: DEFAULT_SOFT_MAX_BLOCK_MIN,
  };
}

export const EPSILON = 1e-6;
