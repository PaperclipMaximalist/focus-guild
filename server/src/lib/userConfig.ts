/**
 * Per-user scheduler config.
 *
 * User-tunable overrides live in `User.schedulerSettings` (JSON).
 * Shape is `Partial<SchedulerOverrides>` — only the fields the user has
 * actually changed are stored; everything else falls back to defaults.
 *
 * This module is the ONLY place where user settings turn into a usable
 * `UserConfig`. All schedule routes call `getUserConfig(user)`.
 */

import { CHRONOTYPE_CURVES, defaultConfig, type Chronotype } from './scheduler/config.js';
import type { UserConfig, Weights, ScoreWeights, BreakPolicy, WorkingHours } from './scheduler/index.js';

/**
 * The subset of UserConfig the user can override via the Settings page.
 * The energyCurve function stays as-is (the default two-peak curve);
 * exposing it as JSON would be ugly. We can add curve presets later.
 *
 * `weights` + `breakPolicy` are legacy fields from the pre-revamp 9-knob
 * scorer — accepted (so persisted overrides don't break) but no longer
 * consumed by the planner. `scoreWeights` is the live knob set.
 */
export interface SchedulerOverrides {
  /** @deprecated legacy 9-knob scorer weights — ignored by the planner. */
  weights?: Partial<Weights>;
  /** @deprecated auto-break insertion was removed — ignored by the planner. */
  breakPolicy?: Partial<BreakPolicy>;
  scoreWeights?: Partial<ScoreWeights>;
  workingHours?: Partial<WorkingHours>;
  horizonDays?: number;
  softMaxBlockMin?: number;
  /** When in the day the user is sharpest; picks the energy curve. */
  chronotype?: Chronotype;
  /**
   * When today's work ends (ISO), from the "available time" slider on the
   * Route and Today. Not a Settings field: POST /schedule/:id/available
   * writes it, a Settings save carries it over, and it lapses by itself the
   * next working day (see todayEndInForce).
   */
  availableUntil?: string;
  /** Minutes between two quests. Set from the Route's menu; default GAP_MIN. */
  gapMin?: number;
  /** Length of the long break, in minutes; 0 for none. Default BREAK_MIN. */
  breakMin?: number;
  /** Minutes of work between long breaks. Default BREAK_EVERY_MIN. */
  breakEveryMin?: number;
}

/**
 * The rest between two blocks, for everyone. The owner's rule (2026-10-11):
 * "always add 5 minutes between each quest", in place of the break policy.
 */
export const GAP_MIN = 5;
/** The long break, and how much work earns one (the owner, 2026-10-12: "a large 30 minute break every roughly 2 hours"). */
export const BREAK_MIN = 30;
export const BREAK_EVERY_MIN = 120;

/** What the Route's menu may set them to. */
export const REST_LIMITS = {
  gapMin: { min: 0, max: 30 },
  breakMin: { min: 0, max: 90 },
  breakEveryMin: { min: 60, max: 240 },
} as const;

/** The rests in force for a user: their own where set and sane, the defaults otherwise. */
export function restsFor(user: { schedulerSettings?: unknown }): { gapMin: number; breakMin: number; breakEveryMin: number } {
  const o = isOverrides(user.schedulerSettings) ? user.schedulerSettings : {};
  const within = (v: unknown, fallback: number, lim: { min: number; max: number }) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(lim.max, Math.max(lim.min, Math.round(v))) : fallback;
  return {
    gapMin: within(o.gapMin, GAP_MIN, REST_LIMITS.gapMin),
    breakMin: within(o.breakMin, BREAK_MIN, REST_LIMITS.breakMin),
    breakEveryMin: within(o.breakEveryMin, BREAK_EVERY_MIN, REST_LIMITS.breakEveryMin),
  };
}

/** Type-narrow helper for JSON-from-DB. */
function isOverrides(v: unknown): v is SchedulerOverrides {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Merge user overrides on top of `defaultConfig()`. Pass the User row
 * with its `schedulerSettings` JSON column.
 */
export function getUserConfig(
  user: { schedulerSettings?: unknown },
  tzOffsetMin?: number,
): UserConfig {
  const base = defaultConfig();
  const overrides = isOverrides(user.schedulerSettings) ? user.schedulerSettings : {};
  const until = typeof overrides.availableUntil === 'string' ? Date.parse(overrides.availableUntil) : NaN;

  return {
    ...base,
    weights: { ...base.weights, ...(overrides.weights ?? {}) },
    breakPolicy: { ...base.breakPolicy, ...(overrides.breakPolicy ?? {}) },
    scoreWeights: { ...base.scoreWeights, ...(overrides.scoreWeights ?? {}) },
    workingHours: { ...base.workingHours, ...(overrides.workingHours ?? {}) },
    horizonDays: overrides.horizonDays ?? base.horizonDays,
    softMaxBlockMin: overrides.softMaxBlockMin ?? base.softMaxBlockMin,
    energyCurve: CHRONOTYPE_CURVES[overrides.chronotype ?? 'standard'] ?? base.energyCurve,
    tzOffsetMin,
    // The same day: "always fill the time available". The scheduler library's
    // own default paces work toward its deadline; the app does not.
    ...restsFor(user),
    fillDays: true,
    ...(Number.isFinite(until) ? { todayEndsAt: until } : {}),
  };
}

/** Return just the overrides part (what the Settings page binds to). */
export function getOverrides(user: { schedulerSettings?: unknown }): SchedulerOverrides {
  if (!isOverrides(user.schedulerSettings)) return {};
  // The slider's end time is not the Settings page's to show or send back.
  // Nor are the rests, which the Route's menu owns.
  const { availableUntil: _slider, gapMin: _gap, breakMin: _break, breakEveryMin: _every, ...settings } = user.schedulerSettings;
  return settings;
}
