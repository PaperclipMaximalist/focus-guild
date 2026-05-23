/**
 * XP calculation engine.
 *
 * Formula (from FocusGuildInstructions.md):
 *   base       = round(estimatedMinutes / 5)
 *   × mentalBonus      = mentalLoad / 5          (load-10 → 2×, load-5 → 1×)
 *   × timePressureBonus = clamp(1 + timePressure / 20, 1, 1.5)
 *   × streakMultiplier  (1.0 – 2.5×, from streak.ts)
 */

export interface XPInput {
  estimatedMinutes: number;
  mentalLoad: number;       // 1–10
  timePressure: number;     // 0–10 (from computePriorityScore)
  streakMultiplier: number; // 1.0–2.5
}

export interface XPResult {
  xp: number;
  base: number;
  mentalBonus: number;
  timePressureBonus: number;
  streakMultiplier: number;
}

export function computeXP(input: XPInput): XPResult {
  const { estimatedMinutes, mentalLoad, timePressure, streakMultiplier } = input;

  const base = Math.round(estimatedMinutes / 5);
  const mentalBonus = mentalLoad / 5;
  // timePressure 0→10 maps to a bonus of 1.0→1.5
  const timePressureBonus = Math.min(1 + timePressure / 20, 1.5);
  const xp = Math.round(base * mentalBonus * timePressureBonus * streakMultiplier);

  return { xp, base, mentalBonus, timePressureBonus, streakMultiplier };
}
