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

import { defaultConfig } from './scheduler/index.js';
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

  return {
    ...base,
    weights: { ...base.weights, ...(overrides.weights ?? {}) },
    breakPolicy: { ...base.breakPolicy, ...(overrides.breakPolicy ?? {}) },
    scoreWeights: { ...base.scoreWeights, ...(overrides.scoreWeights ?? {}) },
    workingHours: { ...base.workingHours, ...(overrides.workingHours ?? {}) },
    horizonDays: overrides.horizonDays ?? base.horizonDays,
    softMaxBlockMin: overrides.softMaxBlockMin ?? base.softMaxBlockMin,
    tzOffsetMin,
  };
}

/** Return just the overrides part (what the Settings page binds to). */
export function getOverrides(user: { schedulerSettings?: unknown }): SchedulerOverrides {
  return isOverrides(user.schedulerSettings) ? user.schedulerSettings : {};
}
