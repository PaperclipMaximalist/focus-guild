/**
 * Priority score engine.
 * Weights: urgency=0.40, mental_load=0.25, time_pressure=0.25, impact=0.10
 * On energy ≤ 2: mental_load weight rises to 0.40, urgency drops to 0.30
 * to surface easier wins during low-energy sessions.
 */

export interface PriorityInput {
  daysUntilDue: number | null;
  estimatedMinutes: number;
  availableMinutes: number;
  mentalLoad: number;
  impact: number;
  energyLevel: number;
}

export interface PriorityResult {
  score: number;
  urgency: number;
  timePressure: number;
  weights: {
    urgency: number;
    mentalLoad: number;
    timePressure: number;
    impact: number;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function computeUrgency(daysUntilDue: number | null): number {
  if (daysUntilDue === null) return 0;
  if (daysUntilDue <= 0) return 10;
  return clamp(10 / daysUntilDue, 0, 10);
}

function computeTimePressure(
  estimatedMinutes: number,
  availableMinutes: number,
): number {
  if (availableMinutes <= 0) return 10;
  return clamp((estimatedMinutes / availableMinutes) * 10, 0, 10);
}

const BASE_WEIGHTS = {
  urgency: 0.40,
  mentalLoad: 0.25,
  timePressure: 0.25,
  impact: 0.10,
} as const;

const LOW_ENERGY_WEIGHTS = {
  urgency: 0.30,
  mentalLoad: 0.40,
  timePressure: 0.20,
  impact: 0.10,
} as const;

export function computePriorityScore(input: PriorityInput): PriorityResult {
  const {
    daysUntilDue,
    estimatedMinutes,
    availableMinutes,
    mentalLoad,
    impact,
    energyLevel,
  } = input;

  const urgency = computeUrgency(daysUntilDue);
  const timePressure = computeTimePressure(estimatedMinutes, availableMinutes);

  // Mood modifier: low energy (≤2) shifts weight toward mental_load so easier
  // quests surface first — avoids cognitive overload when the member is drained.
  const weights = energyLevel <= 2 ? LOW_ENERGY_WEIGHTS : BASE_WEIGHTS;

  const score =
    urgency * weights.urgency +
    mentalLoad * weights.mentalLoad +
    timePressure * weights.timePressure +
    impact * weights.impact;

  return {
    score: Math.round(score * 100) / 100,
    urgency: Math.round(urgency * 100) / 100,
    timePressure: Math.round(timePressure * 100) / 100,
    weights,
  };
}
