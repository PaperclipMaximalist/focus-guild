/**
 * Default weights, energy curve, break policy, working hours.
 * All knobs the user can tune live here so the rest of the module
 * has no magic numbers.
 */

import type {
  BreakPolicy,
  EnergyCurve,
  ScoreWeights,
  UserConfig,
  Weights,
  WorkingHours,
} from './types.js';

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
 * Per-decision scoring weights for the new placementScore. Each term in
 * placementScore is normalized to ~[0,1] (penalties to [-1,0]) BEFORE
 * being multiplied by its weight, so these numbers are dimensionless
 * importance ratios — not raw magnitudes. Tuning recipe:
 *
 *   - energy=1.5, urgency=2.0 — main "where in the day this goes" forces.
 *   - monotony=1.5            — strong enough to fight clustering+batch
 *                               at default settings, so variety wins ties.
 *   - tedium=0.8, cooldown=0.8 — back-to-back penalties; matter mostly
 *                               when two same-flavored options are tied.
 *   - batch=0.5               — small positive nudge for chained admin.
 *   - session=0.5             — soft sizing penalty; rarely the deciding term.
 */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  energy: 1.5,
  urgency: 2.0,
  batch: 0.5,
  monotony: 1.5,
  tedium: 0.8,
  cooldown: 0.8,
  session: 0.5,
  // Preferred-hour pull. Soft by design: "I do my best writing at 10am"
  // should nudge, not override deadline pressure or energy fit.
  prefHour: 0.6,
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

/** Linear interpolation over [hour, energy] anchors; 0 outside 0–24. */
function anchorCurve(anchors: Array<[number, number]>): EnergyCurve {
  return (hour: number) => {
    if (hour < 0 || hour > 24) return 0;
    for (let i = 0; i < anchors.length - 1; i += 1) {
      const [h0, v0] = anchors[i]!;
      const [h1, v1] = anchors[i + 1]!;
      if (hour >= h0 && hour <= h1) return h1 === h0 ? v0 : v0 + ((v1 - v0) * (hour - h0)) / (h1 - h0);
    }
    return anchors[anchors.length - 1]![1];
  };
}

/**
 * When in the day someone is sharpest. The default curve is an office
 * worker's (peak 9–11); in the population lab, night owls got two thirds of
 * their heavy work in their slump with it. Until the curve is learned from
 * check-ins, people pick the one that fits.
 */
export type Chronotype = 'standard' | 'lark' | 'afternoon' | 'owl';

export const CHRONOTYPE_CURVES: Record<Chronotype, EnergyCurve> = {
  standard: DEFAULT_ENERGY_CURVE,
  lark: anchorCurve([[0, 0.05], [5, 0.3], [7, 0.85], [9, 0.95], [11, 0.85], [13, 0.55], [15, 0.5], [17, 0.45], [19, 0.3], [21, 0.15], [24, 0.05]]),
  afternoon: anchorCurve([[0, 0.1], [7, 0.3], [10, 0.6], [13, 0.85], [15, 0.95], [17, 0.9], [19, 0.7], [21, 0.5], [23, 0.25], [24, 0.15]]),
  owl: anchorCurve([[0, 0.7], [2, 0.4], [4, 0.1], [9, 0.2], [12, 0.45], [15, 0.6], [18, 0.75], [20, 0.9], [22, 0.95], [23, 0.9], [24, 0.8]]),
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

/** Half an hour for lunch, somewhere between 11:30 and 14:00. */
export const DEFAULT_MEAL_GAP = { fromHour: 11.5, toHour: 14, minutes: 30 };

export function defaultConfig(): UserConfig {
  return {
    weights: { ...DEFAULT_WEIGHTS },
    energyCurve: DEFAULT_ENERGY_CURVE,
    breakPolicy: { ...DEFAULT_BREAK_POLICY },
    workingHours: { ...DEFAULT_WORKING_HOURS },
    horizonDays: DEFAULT_HORIZON_DAYS,
    softMaxBlockMin: DEFAULT_SOFT_MAX_BLOCK_MIN,
    scoreWeights: { ...DEFAULT_SCORE_WEIGHTS },
    mealGap: { ...DEFAULT_MEAL_GAP },
  };
}

export const EPSILON = 1e-6;
